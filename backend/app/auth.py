"""Authentication utilities: password hashing, JWT access tokens, refresh tokens."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import RefreshToken, User
from app.rate_limit import limiter
from app.schemas import LoginRequest, RefreshRequest, RefreshResponse, TokenResponse
from app.services.audit import log_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer()

settings = get_settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        # Opaque refresh tokens are not JWTs; reject non-access JWT types if present
        token_type = payload.get("type")
        if token_type is not None and token_type != "access":
            return None
        return payload
    except JWTError:
        return None


def _hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _issue_refresh_token(
    db: Session,
    user: User,
    *,
    request: Request | None = None,
) -> str:
    """Create an opaque refresh token, store only its SHA-256 hash, return the raw value."""
    raw = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    ip = None
    ua = None
    if request is not None:
        from app.services.audit import get_client_ip

        ip = get_client_ip(request)
        ua = (request.headers.get("User-Agent") or "")[:512] or None

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_refresh_token(raw),
            expires_at=expires_at,
            ip_address=ip,
            user_agent=ua,
        )
    )
    db.commit()
    return raw


def _revoke_refresh_token(db: Session, token_row: RefreshToken) -> None:
    if token_row.revoked_at is None:
        token_row.revoked_at = datetime.now(timezone.utc)
        db.commit()


def _revoke_all_user_refresh_tokens(db: Session, user_id: int) -> None:
    now = datetime.now(timezone.utc)
    (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .update({"revoked_at": now}, synchronize_session=False)
    )
    db.commit()


def _access_expires_in_seconds() -> int:
    return int(settings.access_token_expire_minutes * 60)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticate user and return access + refresh tokens (max 5 attempts/minute)."""
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        log_audit(
            db,
            action="LOGIN_FAILED",
            success=False,
            user_id=user.id if user else None,
            username=payload.username,
            object_type="user",
            object_id=user.id if user else None,
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        log_audit(
            db,
            action="LOGIN_FAILED",
            success=False,
            user=user,
            object_type="user",
            object_id=user.id,
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись заблокирована",
        )

    access_token = create_access_token(
        {
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.value,
        }
    )
    refresh_token = _issue_refresh_token(db, user, request=request)
    log_audit(
        db,
        action="LOGIN_SUCCESS",
        success=True,
        user=user,
        object_type="user",
        object_id=user.id,
        request=request,
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=_access_expires_in_seconds(),
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh_access_token(
    payload: RefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Validate a refresh token and issue a new access token."""
    token_hash = _hash_refresh_token(payload.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    now = datetime.now(timezone.utc)

    if row is None or row.revoked_at is not None:
        log_audit(
            db,
            action="LOGIN_FAILED",
            success=False,
            object_type="refresh_token",
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный refresh-токен",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now:
        _revoke_refresh_token(db, row)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Срок действия refresh-токена истёк",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None or not user.is_active:
        _revoke_refresh_token(db, row)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись заблокирована или не найдена",
        )

    access_token = create_access_token(
        {
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.value,
        }
    )
    return RefreshResponse(
        access_token=access_token,
        expires_in=_access_expires_in_seconds(),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    """Record logout and revoke all refresh tokens for the user."""
    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("sub") is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный или просроченный токен",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _revoke_all_user_refresh_tokens(db, user.id)

    log_audit(
        db,
        action="auth.logout",
        success=True,
        user=user,
        object_type="user",
        object_id=user.id,
        request=request,
    )
