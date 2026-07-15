"""Audit logging helpers: write events and purge by retention policy."""

from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuditLog, User


# Canonical action codes (also used for UI filters)
AUDIT_ACTIONS = (
    "auth.login",
    "auth.login_failed",
    "auth.logout",
    "user.create",
    "user.toggle_active",
    "user.delete",
    "template.upload",
    "template.delete",
    "knowledge.create",
    "knowledge.update",
    "knowledge.delete",
    "course.create",
    "course.update",
    "course.delete",
    "quiz.create",
    "quiz.update",
    "quiz.delete",
    "course.assign",
    "course.assign_bulk",
    "assignment.extend_deadline",
    "notification.send_deadline_warnings",
)


def get_client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return None


def log_audit(
    db: Session,
    *,
    action: str,
    success: bool = True,
    user: User | None = None,
    user_id: int | None = None,
    username: str | None = None,
    object_type: str | None = None,
    object_id: int | str | None = None,
    ip_address: str | None = None,
    request: Request | None = None,
    commit: bool = True,
) -> AuditLog:
    """Persist one audit event. Does not raise on write failure beyond DB errors."""
    resolved_user_id = user.id if user is not None else user_id
    resolved_username = username
    if resolved_username is None and user is not None:
        resolved_username = user.username

    entry = AuditLog(
        user_id=resolved_user_id,
        username=resolved_username,
        action=action,
        object_type=object_type,
        object_id=str(object_id) if object_id is not None else None,
        success=success,
        ip_address=ip_address if ip_address is not None else get_client_ip(request),
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    else:
        db.flush()
    return entry


def purge_expired_audit_logs(db: Session) -> int:
    """Delete audit rows older than configured retention. Returns deleted count."""
    months = get_settings().audit_retention_months
    if months <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)
    deleted = (
        db.query(AuditLog)
        .filter(AuditLog.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted
