"""Knowledge base / order documents endpoints with hybrid search."""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import DocumentCategory, DocumentStatus, OrderDocument, User, UserRole
from app.schemas import OrderDocumentResponse, OrderListResponse
from app.services.rag_common import get_vector_store

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _semantic_document_ids(db: Session, search: str, limit: int = 40) -> list[int]:
    """Resolve OrderDocument IDs via PGVector similarity on chunk metadata."""
    try:
        store = get_vector_store()
        docs = store.similarity_search(search, k=limit)
    except Exception:
        return []

    ids: list[int] = []
    seen: set[int] = set()
    source_files: list[str] = []

    for doc in docs:
        meta = doc.metadata or {}
        raw_id = meta.get("document_id")
        if raw_id is not None:
            try:
                doc_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if doc_id not in seen:
                seen.add(doc_id)
                ids.append(doc_id)
        sf = meta.get("source_file")
        if sf:
            source_files.append(str(sf))

    # Legacy chunks without document_id: map source_file → OrderDocument
    for sf in source_files:
        if not sf:
            continue
        matches = (
            db.query(OrderDocument.id)
            .filter(
                or_(
                    OrderDocument.file_path.ilike(f"%{sf}"),
                    OrderDocument.title.ilike(f"%{Path(sf).stem}%"),
                )
            )
            .limit(5)
            .all()
        )
        for (doc_id,) in matches:
            if doc_id not in seen:
                seen.add(doc_id)
                ids.append(doc_id)

    return ids


def _fuzzy_document_ids(db: Session, search: str, limit: int = 40) -> list[int]:
    """pg_trgm fuzzy match on title + content_text; falls back to ILIKE."""
    pattern = f"%{search}%"
    try:
        rows = db.execute(
            text(
                """
                SELECT id
                FROM order_documents
                WHERE title %% :q
                   OR content_text %% :q
                   OR title ILIKE :pattern
                   OR content_text ILIKE :pattern
                ORDER BY GREATEST(
                    similarity(COALESCE(title, ''), :q),
                    similarity(COALESCE(content_text, ''), :q)
                ) DESC
                LIMIT :lim
                """
            ),
            {"q": search, "pattern": pattern, "lim": limit},
        ).fetchall()
        return [int(r[0]) for r in rows]
    except Exception:
        # Extension missing or similarity unavailable — ILIKE fallback
        docs = (
            db.query(OrderDocument.id)
            .filter(
                or_(
                    OrderDocument.title.ilike(pattern),
                    OrderDocument.content_text.ilike(pattern),
                )
            )
            .limit(limit)
            .all()
        )
        return [d.id for d in docs]


@router.get("", response_model=OrderListResponse)
def list_orders(
    category: Optional[DocumentCategory] = None,
    status: Optional[DocumentStatus] = None,
    search: Optional[str] = Query(None, description="Hybrid search: semantic + pg_trgm fuzzy"),
    is_active: Optional[bool] = Query(
        True,
        description="Filter by is_active. Default true; set false for archived versions only; omit via include_inactive.",
    ),
    include_inactive: bool = Query(
        False,
        description="If true, return both active and archived versions (ignores is_active filter).",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List order documents with hybrid search.

    When ``search`` is provided:
      1. Semantic hits via PGVector (chunk → document_id / source_file)
      2. Fuzzy text via PostgreSQL ``pg_trgm`` (``%%`` / ``similarity``)
      3. Union of both, preserving semantic-first ordering
    """
    query = db.query(OrderDocument)

    if not include_inactive:
        # Non-admins cannot browse inactive/archived versions unless they ask for status=ARCHIVED
        if is_active is not None:
            query = query.filter(OrderDocument.is_active.is_(is_active))
        elif current_user.role != UserRole.ADMIN:
            query = query.filter(OrderDocument.is_active.is_(True))

    if category:
        query = query.filter(OrderDocument.category == category)
    if status:
        query = query.filter(OrderDocument.status == status)

    if search and search.strip():
        term = search.strip()
        semantic_ids = _semantic_document_ids(db, term)
        fuzzy_ids = _fuzzy_document_ids(db, term)

        # Preserve semantic ranking, then append fuzzy-only matches
        ordered_ids: list[int] = []
        seen: set[int] = set()
        for doc_id in semantic_ids + fuzzy_ids:
            if doc_id not in seen:
                seen.add(doc_id)
                ordered_ids.append(doc_id)

        if ordered_ids:
            query = query.filter(OrderDocument.id.in_(ordered_ids))
            # Keep hybrid ranking via CASE / array_position substitute
            order_map = {doc_id: idx for idx, doc_id in enumerate(ordered_ids)}
            total = query.count()
            items = query.all()
            items.sort(key=lambda d: order_map.get(d.id, 10_000))
            start = (page - 1) * page_size
            page_items = items[start : start + page_size]
            return OrderListResponse(
                items=[OrderDocumentResponse.model_validate(item) for item in page_items],
                total=total,
                page=page,
                page_size=page_size,
            )

        # No vector/trgm hits — fall back to ILIKE on the filtered query
        pattern = f"%{term}%"
        query = query.filter(
            or_(
                OrderDocument.title.ilike(pattern),
                OrderDocument.content_text.ilike(pattern),
            )
        )

    total = query.count()
    items = (
        query.order_by(
            OrderDocument.is_active.desc(),
            OrderDocument.issue_date.desc().nullslast(),
            OrderDocument.version.desc(),
            OrderDocument.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return OrderListResponse(
        items=[OrderDocumentResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
