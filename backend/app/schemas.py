"""Pydantic schemas for request/response validation."""

from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import (
    DocumentCategory,
    DocumentStatus,
    RequestStatus,
    RequestType,
    UserRole,
)


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── User / Profile ────────────────────────────────────────────────────────────

def _validate_email(value: str) -> str:
    email = value.strip()
    if "@" not in email or len(email) < 3:
        raise ValueError("Некорректный email")
    return email


class UserBase(BaseModel):
    email: str
    full_name: str
    role: UserRole
    department: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _validate_email(value)


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    department: Optional[str] = Field(None, max_length=128)
    bio: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=32)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _validate_email(value)


class AvatarUploadResponse(BaseModel):
    avatar_url: str


# ── Orders / Knowledge Base ───────────────────────────────────────────────────

class OrderDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category: DocumentCategory
    status: DocumentStatus
    issue_date: Optional[date] = None
    file_path: Optional[str] = None
    content_text: Optional[str] = None


class OrderListResponse(BaseModel):
    items: List[OrderDocumentResponse]
    total: int
    page: int
    page_size: int


# ── Training ──────────────────────────────────────────────────────────────────

class QuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    question: str
    options: List[str]


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    category: Optional[str] = None  # legacy training API
    is_mandatory: bool
    created_at: datetime
    quizzes: List[QuizResponse] = []


class QuizSubmitRequest(BaseModel):
    quiz_id: int
    answers: List[int] = Field(..., description="Selected option index per question, ordered by quiz_id")


class QuizSubmitResponse(BaseModel):
    score: int
    total: int
    percentage: float


# ── Service Desk ──────────────────────────────────────────────────────────────

class ServiceRequestCreate(BaseModel):
    request_type: RequestType
    description: Optional[str] = Field(None, max_length=2000)


class ServiceRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_type: RequestType
    status: RequestStatus
    description: Optional[str] = None
    created_at: datetime


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    status: str
    ai_reply: str


# ── Admin ─────────────────────────────────────────────────────────────────────

class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: UserRole
    department: Optional[str] = None
    is_active: bool


class AdminUserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=4, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole
    department: Optional[str] = Field(None, max_length=128)
    email: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _validate_email(value)


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    file_path: str
    created_at: datetime


class AdminKnowledgeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    category: DocumentCategory
    status: DocumentStatus = DocumentStatus.ACTIVE
    issue_date: Optional[date] = None


class AdminKnowledgeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=512)
    category: Optional[DocumentCategory] = None
    status: Optional[DocumentStatus] = None
    issue_date: Optional[date] = None


class AdminKnowledgeResponse(OrderDocumentResponse):
    created_at: datetime


# ── Audit log ─────────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    object_type: Optional[str] = None
    object_id: Optional[str] = None
    success: bool
    ip_address: Optional[str] = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    retention_months: int
