"""Pydantic schemas for LMS."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import AssignmentStatus, CourseCategory, NotificationType


class QuizBase(BaseModel):
    question: str = Field(..., min_length=1)
    options: List[str] = Field(..., min_length=4, max_length=4)
    correct_answer_index: int = Field(..., ge=0, le=3)
    explanation: Optional[str] = None

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: List[str]) -> List[str]:
        if any(not opt.strip() for opt in value):
            raise ValueError("Все варианты ответа должны быть заполнены")
        return value


class QuizCreate(QuizBase):
    pass


class QuizUpdate(BaseModel):
    question: Optional[str] = None
    options: Optional[List[str]] = Field(None, min_length=4, max_length=4)
    correct_answer_index: Optional[int] = Field(None, ge=0, le=3)
    explanation: Optional[str] = None


class QuizAdminResponse(QuizBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int


class QuizPublicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    options: List[str]


class CourseBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: CourseCategory
    is_mandatory: bool = False
    deadline_days: Optional[int] = Field(None, ge=1)
    passing_score: int = Field(80, ge=0, le=100)
    max_attempts: int = Field(-1, ge=-1)
    content_html: Optional[str] = None
    estimated_duration_minutes: int = Field(0, ge=0)


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[CourseCategory] = None
    is_mandatory: Optional[bool] = None
    deadline_days: Optional[int] = Field(None, ge=1)
    passing_score: Optional[int] = Field(None, ge=0, le=100)
    max_attempts: Optional[int] = Field(None, ge=-1)
    content_html: Optional[str] = None
    estimated_duration_minutes: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class CourseAdminResponse(CourseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_path: Optional[str] = None
    is_active: bool
    created_at: datetime
    quizzes: List[QuizAdminResponse] = []
    quiz_count: int = 0


class CourseListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    category: Optional[CourseCategory] = None
    is_mandatory: bool
    deadline_days: Optional[int] = None
    passing_score: int
    max_attempts: int
    estimated_duration_minutes: int
    is_active: bool
    created_at: datetime
    quiz_count: int = 0


class AssignCourseRequest(BaseModel):
    user_ids: List[int] = Field(..., min_length=1)


class BulkAssignRequest(BaseModel):
    course_ids: List[int] = Field(..., min_length=1)
    user_ids: List[int] = Field(..., min_length=1)


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    course_id: int
    username: str
    full_name: str
    assigned_at: datetime
    deadline_date: Optional[datetime] = None
    status: AssignmentStatus
    completed_at: Optional[datetime] = None
    attempts_count: int = 0
    best_score: Optional[int] = None


class ExtendDeadlineRequest(BaseModel):
    assignment_id: int
    new_deadline_date: datetime


class LmsOverviewStats(BaseModel):
    total_courses: int
    active_courses: int
    total_users: int
    completion_rate: float
    overdue_courses_count: int
    avg_score: Optional[float] = None
    recent_assignments: List[AssignmentResponse] = []


class CourseResultRow(BaseModel):
    user_id: int
    username: str
    full_name: str
    status: AssignmentStatus
    attempts_count: int
    best_score: Optional[int] = None
    last_attempt_at: Optional[datetime] = None
    deadline_date: Optional[datetime] = None


class UserProgressRow(BaseModel):
    course_id: int
    course_title: str
    category: Optional[CourseCategory] = None
    status: AssignmentStatus
    attempts_count: int
    best_score: Optional[int] = None
    deadline_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class UserCourseListItem(BaseModel):
    course_id: int
    title: str
    description: Optional[str] = None
    category: Optional[CourseCategory] = None
    is_mandatory: bool
    passing_score: int
    max_attempts: int
    estimated_duration_minutes: int
    assignment_id: int
    status: AssignmentStatus
    deadline_date: Optional[datetime] = None
    attempts_count: int
    best_score: Optional[int] = None
    completed_at: Optional[datetime] = None


class UserCourseDetail(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: Optional[CourseCategory] = None
    is_mandatory: bool
    passing_score: int
    max_attempts: int
    content_html: Optional[str] = None
    file_path: Optional[str] = None
    estimated_duration_minutes: int
    assignment_id: int
    status: AssignmentStatus
    deadline_date: Optional[datetime] = None
    attempts_count: int
    best_score: Optional[int] = None


class QuizSubmitLmsRequest(BaseModel):
    answers: dict[int, int] = Field(..., description="quiz_id -> selected option index")


class QuizAnswerReview(BaseModel):
    quiz_id: int
    question: str
    options: List[str]
    selected_index: int
    correct_index: int
    is_correct: bool
    explanation: Optional[str] = None


class QuizSubmitLmsResponse(BaseModel):
    score: int
    passed: bool
    correct_answers: int
    total_questions: int
    attempt_id: int
    reviews: List[QuizAnswerReview]


class QuizAttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    score: Optional[int] = None
    passed: Optional[bool] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    is_final: bool
    reviews: List[QuizAnswerReview] = []


class UserProgressStats(BaseModel):
    total_assigned: int
    completed: int
    in_progress: int
    overdue: int
    courses: List[UserCourseListItem] = []


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    title: str
    message: str
    course_id: Optional[int] = None
    is_read: bool
    created_at: datetime
    link: Optional[str] = None


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    total: int
    page: int
    page_size: int


class UnreadCountResponse(BaseModel):
    count: int
