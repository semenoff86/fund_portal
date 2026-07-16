"""Admin panel API: users, document templates, knowledge base, audit log."""

import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.config import get_settings
from app.database import get_db
from app.dependencies import require_admin
from app.models import AuditLog, OrderDocument, Template, User
from app.schemas import (
    AdminKnowledgeResponse,
    AdminUserCreate,
    AdminUserResponse,
    AuditLogListResponse,
    AuditLogResponse,
    TemplateResponse,
)
from app.services.audit import AUDIT_ACTIONS, log_audit, purge_expired_audit_logs
from app.utils.file_validator import validate_upload

router = APIRouter(prefix="/api/admin", tags=["admin"])

UPLOADS_ROOT = Path("uploads")
TEMPLATES_DIR = UPLOADS_ROOT / "templates"
KNOWLEDGE_DIR = UPLOADS_ROOT / "knowledge"
ALLOWED_TEMPLATE_EXTENSIONS = [".docx", ".pdf"]
ALLOWED_KNOWLEDGE_EXTENSIONS = [".docx", ".pdf"]
MAX_UPLOAD_SIZE_MB = 25


def _ensure_dirs() -> None:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)


async def _save_upload(file: UploadFile, directory: Path, allowed: list[str]) -> str:
    contents, ext = await validate_upload(
        file,
        allowed_extensions=allowed,
        max_size_mb=MAX_UPLOAD_SIZE_MB,
    )
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = directory / safe_name
    dest.write_bytes(contents)
    return f"/uploads/{directory.name}/{safe_name}"


# ── Users ─────────────────────────────────────────────────────────────────────


@router.get("/users", response_model=list[AdminUserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Логин уже занят")

    email = payload.email or f"{payload.username}@mkk.ru"
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже занят")

    user = User(
        username=payload.username,
        password_hash=get_password_hash(payload.password),
        email=email,
        full_name=payload.full_name,
        role=payload.role,
        department=payload.department,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit(
        db,
        action="user.create",
        user=admin,
        object_type="user",
        object_id=user.id,
        request=request,
    )
    return user


@router.patch("/users/{user_id}/toggle-active", response_model=AdminUserResponse)
def toggle_user_active(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя изменить свой статус")

    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    log_audit(
        db,
        action="user.toggle_active",
        user=admin,
        object_type="user",
        object_id=user.id,
        request=request,
    )
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить себя")

    db.delete(user)
    db.commit()
    log_audit(
        db,
        action="user.delete",
        user=admin,
        object_type="user",
        object_id=user_id,
        request=request,
    )


# ── Templates ─────────────────────────────────────────────────────────────────


@router.get("/templates", response_model=list[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(Template).order_by(Template.created_at.desc()).all()


@router.post("/templates/upload", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def upload_template(
    request: Request,
    name: str = Form(...),
    category: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    _ensure_dirs()
    file_path = await _save_upload(file, TEMPLATES_DIR, ALLOWED_TEMPLATE_EXTENSIONS)

    template = Template(name=name.strip(), category=category.strip(), file_path=file_path)
    db.add(template)
    db.commit()
    db.refresh(template)
    log_audit(
        db,
        action="template.upload",
        user=admin,
        object_type="template",
        object_id=template.id,
        request=request,
    )
    return template


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")

    disk_path = UPLOADS_ROOT / template.file_path.removeprefix("/uploads/")
    if disk_path.exists():
        disk_path.unlink()

    db.delete(template)
    db.commit()
    log_audit(
        db,
        action="template.delete",
        user=admin,
        object_type="template",
        object_id=template_id,
        request=request,
    )


# ── Knowledge (OrderDocument) ───────────────────────────────────────────────────


@router.get("/knowledge", response_model=list[AdminKnowledgeResponse])
def list_knowledge(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(OrderDocument).order_by(OrderDocument.created_at.desc()).all()


@router.post("/knowledge", response_model=AdminKnowledgeResponse, status_code=status.HTTP_201_CREATED)
async def create_knowledge(
    request: Request,
    title: str = Form(...),
    category: str = Form(...),
    status_value: str = Form("ACTIVE", alias="status"),
    issue_date: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from app.models import DocumentCategory, DocumentStatus
    from app.services.rag_ingestion import (
        extract_text_from_file,
        handle_document_versioning,
        ingest_document,
    )

    _ensure_dirs()
    original_name = file.filename or "document"
    file_path = await _save_upload(file, KNOWLEDGE_DIR, ALLOWED_KNOWLEDGE_EXTENSIONS)
    disk_path = UPLOADS_ROOT / file_path.removeprefix("/uploads/")

    parsed_date: date | None = None
    if issue_date:
        try:
            parsed_date = date.fromisoformat(issue_date)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректная дата") from exc

    try:
        doc_category = DocumentCategory(category)
        doc_status = DocumentStatus(status_value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректная категория или статус") from exc

    next_version = handle_document_versioning(
        db,
        filename=original_name,
        category=category,
        title=title.strip(),
    )
    if next_version > 1:
        doc_status = DocumentStatus.ACTIVE

    content_text: str | None = None
    try:
        content_text = extract_text_from_file(disk_path) or None
    except Exception:
        content_text = None

    doc = OrderDocument(
        title=title.strip(),
        category=doc_category,
        status=doc_status,
        issue_date=parsed_date,
        file_path=file_path,
        content_text=content_text,
        version=next_version,
        is_active=True,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        ingest_document(
            str(disk_path),
            category=category,
            uploaded_by=admin.id,
            version=next_version,
            source_file=original_name,
            document_id=doc.id,
        )
    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("RAG ingest failed for %s: %s", original_name, exc)

    log_audit(
        db,
        action="knowledge.create",
        user=admin,
        object_type="knowledge",
        object_id=doc.id,
        request=request,
    )
    return doc


@router.put("/knowledge/{doc_id}", response_model=AdminKnowledgeResponse)
async def update_knowledge(
    doc_id: int,
    request: Request,
    title: str | None = Form(None),
    category: str | None = Form(None),
    status_value: str | None = Form(None, alias="status"),
    issue_date: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from app.models import DocumentCategory, DocumentStatus

    doc = db.query(OrderDocument).filter(OrderDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ не найден")

    if title is not None:
        doc.title = title.strip()
    if category is not None:
        try:
            doc.category = DocumentCategory(category)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректная категория") from exc
    if status_value is not None:
        try:
            doc.status = DocumentStatus(status_value)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректный статус") from exc
    if issue_date is not None:
        if issue_date == "":
            doc.issue_date = None
        else:
            try:
                doc.issue_date = date.fromisoformat(issue_date)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректная дата") from exc

    if file and file.filename:
        from app.services.rag_ingestion import extract_text_from_file, ingest_document

        _ensure_dirs()
        original_name = file.filename
        if doc.file_path:
            old_path = UPLOADS_ROOT / doc.file_path.removeprefix("/uploads/")
            if old_path.exists():
                old_path.unlink()
        doc.file_path = await _save_upload(file, KNOWLEDGE_DIR, ALLOWED_KNOWLEDGE_EXTENSIONS)
        disk_path = UPLOADS_ROOT / doc.file_path.removeprefix("/uploads/")
        try:
            doc.content_text = extract_text_from_file(disk_path) or None
        except Exception:
            pass
        try:
            ingest_document(
                str(disk_path),
                category=doc.category.value,
                uploaded_by=admin.id,
                version=doc.version,
                source_file=original_name,
                document_id=doc.id,
            )
        except Exception as exc:
            import logging

            logging.getLogger(__name__).warning("RAG re-ingest failed: %s", exc)

    # Keep status / is_active in sync when admin toggles ARCHIVED
    if status_value is not None:
        doc.is_active = doc.status == DocumentStatus.ACTIVE

    db.commit()
    db.refresh(doc)
    log_audit(
        db,
        action="knowledge.update",
        user=admin,
        object_type="knowledge",
        object_id=doc.id,
        request=request,
    )
    return doc


@router.delete("/knowledge/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    doc = db.query(OrderDocument).filter(OrderDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ не найден")

    if doc.file_path:
        disk_path = UPLOADS_ROOT / doc.file_path.removeprefix("/uploads/")
        if disk_path.exists():
            disk_path.unlink()

    db.delete(doc)
    db.commit()
    log_audit(
        db,
        action="knowledge.delete",
        user=admin,
        object_type="knowledge",
        object_id=doc_id,
        request=request,
    )


# ── Audit log ─────────────────────────────────────────────────────────────────


@router.get("/audit", response_model=AuditLogListResponse)
def list_audit_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    purge_expired_audit_logs(db)

    query = db.query(AuditLog)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if date_from is not None:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to is not None:
        query = query.filter(AuditLog.created_at <= date_to)

    total = query.count()
    items = (
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        retention_months=get_settings().audit_retention_months,
    )


@router.get("/audit/actions", response_model=list[str])
def list_audit_actions(_: User = Depends(require_admin)):
    return list(AUDIT_ACTIONS)
