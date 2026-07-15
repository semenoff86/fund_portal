"""Knowledge base / order documents endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import DocumentCategory, DocumentStatus, OrderDocument, User
from app.schemas import OrderDocumentResponse, OrderListResponse

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("", response_model=OrderListResponse)
def list_orders(
    category: Optional[DocumentCategory] = None,
    status: Optional[DocumentStatus] = None,
    search: Optional[str] = Query(None, description="Text search across title and content"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    List order documents with optional filters.
    Semantic search is mocked: when `search` is provided, results are ranked
    by simple ILIKE matching (pgvector similarity will replace this later).
    """
    query = db.query(OrderDocument)

    if category:
        query = query.filter(OrderDocument.category == category)
    if status:
        query = query.filter(OrderDocument.status == status)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                OrderDocument.title.ilike(pattern),
                OrderDocument.content_text.ilike(pattern),
            )
        )

    total = query.count()
    items = (
        query.order_by(OrderDocument.issue_date.desc().nullslast(), OrderDocument.id.desc())
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
