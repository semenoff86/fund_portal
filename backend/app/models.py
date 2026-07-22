"""SQLAlchemy ORM models for the MKK corporate portal."""

import enum
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Persist Enum.value (e.g. admin), not Enum.name (ADMIN)."""
    return [member.value for member in enum_cls]


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ANALYST = "analyst"
    HR = "hr"
    ACCOUNTANT = "accountant"
    LEGAL = "legal"


class DocumentCategory(str, enum.Enum):
    HR = "HR"
    CREDIT = "CREDIT"
    GENERAL = "GENERAL"
    SAFETY = "SAFETY"


class DocumentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class RequestType(str, enum.Enum):
    NDFL_2 = "2_NDFL"
    EMPLOYMENT_CERT = "EMPLOYMENT_CERT"
    IT_SUPPORT = "IT_SUPPORT"
    LEAVE = "LEAVE"


class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"


class CourseCategory(str, enum.Enum):
    SAFETY = "SAFETY"
    CREDIT = "CREDIT"
    HR = "HR"
    GENERAL = "GENERAL"
    COMPLIANCE = "COMPLIANCE"


class AssignmentStatus(str, enum.Enum):
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"


class NotificationType(str, enum.Enum):
    COURSE_ASSIGNED = "COURSE_ASSIGNED"
    DEADLINE_WARNING = "DEADLINE_WARNING"
    DEADLINE_EXCEEDED = "DEADLINE_EXCEEDED"
    COURSE_COMPLETED = "COURSE_COMPLETED"
    TEST_FAILED = "TEST_FAILED"
    UNBLOCK_REQUEST = "UNBLOCK_REQUEST"


class TemplateCategory(str, enum.Enum):
    """Categories for DOCX templates used in Service Desk generation."""

    HR = "HR"
    FINANCE = "FINANCE"
    GENERAL = "GENERAL"


class ChatMessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=_enum_values), nullable=False
    )
    department: Mapped[str | None] = mapped_column(String(128))
    position: Mapped[str | None] = mapped_column(String(128))
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    bio: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    quiz_results: Mapped[list["QuizResult"]] = relationship(back_populates="user")
    service_requests: Mapped[list["ServiceRequest"]] = relationship(back_populates="user")
    course_assignments: Mapped[list["CourseAssignment"]] = relationship(
        back_populates="user",
        foreign_keys="CourseAssignment.user_id",
    )
    quiz_attempts: Mapped[list["QuizAttempt"]] = relationship(back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")
    chat_sessions: Mapped[list["ChatSession"]] = relationship(back_populates="user")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuditLog(Base):
    """Immutable trail of authenticated mutating operations and auth events.

    Field aliases (for API / docs compatibility):
      resource_type ↔ object_type, resource_id ↔ object_id, timestamp ↔ created_at
    Canonical action codes use dotted form (e.g. ``auth.login``); uppercase
    aliases like ``LOGIN_SUCCESS`` are accepted by the audit helper.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_action", "action"),
        Index("ix_audit_logs_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    object_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    object_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User | None"] = relationship(back_populates="audit_logs")

    # ── Aliases matching production naming conventions ─────────────────────────
    @property
    def resource_type(self) -> str | None:
        return self.object_type

    @resource_type.setter
    def resource_type(self, value: str | None) -> None:
        self.object_type = value

    @property
    def resource_id(self) -> str | None:
        return self.object_id

    @resource_id.setter
    def resource_id(self, value: str | int | None) -> None:
        self.object_id = str(value) if value is not None else None

    @property
    def timestamp(self) -> datetime:
        return self.created_at


class RefreshToken(Base):
    """Hashed refresh tokens for session revocation and rotation."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_user_id", "user_id"),
        Index("ix_refresh_tokens_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class Template(Base):
    """DOCX template for Service Desk dynamic generation (docxtpl / Jinja2).

    Also referred to as DocumentTemplate in API docs.
    """

    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true", index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Backwards-compatible alias for docs / imports
DocumentTemplate = Template


class OrderDocument(Base):
    __tablename__ = "order_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    category: Mapped[DocumentCategory] = mapped_column(
        Enum(DocumentCategory, name="document_category", values_callable=_enum_values),
        nullable=False,
        index=True,
    )
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status", values_callable=_enum_values),
        nullable=False,
        default=DocumentStatus.ACTIVE,
        index=True,
    )
    issue_date: Mapped[date | None] = mapped_column(Date)
    file_path: Mapped[str | None] = mapped_column(String(512))
    content_text: Mapped[str | None] = mapped_column(Text)
    # Document-level vector (optional); primary RAG store is LangChain PGVector collection.
    # Dimension kept at 1536 for backward compatibility with existing DBs.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true", index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[CourseCategory | None] = mapped_column(
        Enum(
            CourseCategory,
            name="course_category",
            native_enum=False,
            values_callable=_enum_values,
        ),
        nullable=True,
        index=True,
    )
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    deadline_days: Mapped[int | None] = mapped_column(Integer)
    passing_score: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=-1, nullable=False)
    content_html: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(512))
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    quizzes: Mapped[list["Quiz"]] = relationship(back_populates="course", cascade="all, delete-orphan")
    assignments: Mapped[list["CourseAssignment"]] = relationship(back_populates="course")


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSONB, nullable=False)
    correct_answer_index: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text)

    course: Mapped["Course"] = relationship(back_populates="quizzes")
    results: Mapped[list["QuizResult"]] = relationship(back_populates="quiz")
    attempts: Mapped[list["QuizAttempt"]] = relationship(back_populates="quiz")


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="quiz_results")
    quiz: Mapped["Quiz"] = relationship(back_populates="results")


class CourseAssignment(Base):
    __tablename__ = "course_assignments"
    __table_args__ = (
        Index("ix_course_assignments_user_course", "user_id", "course_id"),
        Index("ix_course_assignments_status", "status"),
        Index("ix_course_assignments_deadline", "deadline_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    deadline_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[AssignmentStatus] = mapped_column(
        Enum(
            AssignmentStatus,
            name="assignment_status",
            native_enum=False,
            values_callable=_enum_values,
        ),
        default=AssignmentStatus.ASSIGNED,
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="course_assignments", foreign_keys=[user_id])
    assigner: Mapped["User | None"] = relationship(foreign_keys=[assigned_by])
    course: Mapped["Course"] = relationship(back_populates="assignments")
    quiz_attempts: Mapped[list["QuizAttempt"]] = relationship(back_populates="course_assignment")
    deadline_extension_logs: Mapped[list["DeadlineExtensionLog"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan"
    )


class DeadlineExtensionLog(Base):
    __tablename__ = "deadline_extension_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("course_assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    old_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    new_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    changed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    assignment: Mapped["CourseAssignment"] = relationship(back_populates="deadline_extension_logs")
    changed_by: Mapped["User | None"] = relationship(foreign_keys=[changed_by_user_id])


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (
        Index("ix_quiz_attempts_user_course_assignment", "user_id", "course_assignment_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    quiz_id: Mapped[int | None] = mapped_column(ForeignKey("quizzes.id", ondelete="SET NULL"), nullable=True)
    course_assignment_id: Mapped[int] = mapped_column(
        ForeignKey("course_assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    score: Mapped[int | None] = mapped_column(Integer)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship(back_populates="quiz_attempts")
    quiz: Mapped["Quiz | None"] = relationship(back_populates="attempts")
    course_assignment: Mapped["CourseAssignment"] = relationship(back_populates="quiz_attempts")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "is_read"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[NotificationType] = mapped_column(
        Enum(
            NotificationType,
            name="notification_type",
            native_enum=False,
            values_callable=_enum_values,
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    link: Mapped[str | None] = mapped_column(String(512))

    user: Mapped["User"] = relationship(back_populates="notifications")
    course: Mapped["Course | None"] = relationship()


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Новый чат")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="chat_sessions")
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[ChatMessageRole] = mapped_column(
        Enum(
            ChatMessageRole,
            name="chat_message_role",
            native_enum=False,
            values_callable=_enum_values,
        ),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["ChatSession"] = relationship(back_populates="messages")


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    request_type: Mapped[RequestType] = mapped_column(
        Enum(RequestType, name="request_type", values_callable=_enum_values), nullable=False
    )
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status", values_callable=_enum_values),
        nullable=False,
        default=RequestStatus.PENDING,
    )
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="service_requests")
