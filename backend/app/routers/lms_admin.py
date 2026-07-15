"""LMS admin API: courses, quizzes, assignments, analytics."""

import csv
import io
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_lms_admin
from app.models import (
    AssignmentStatus,
    Course,
    CourseAssignment,
    DeadlineExtensionLog,
    Quiz,
    QuizAttempt,
    User,
)
from app.services.audit import log_audit
from app.lms_schemas import (
    ApproveUnblockResponse,
    AssignCourseRequest,
    AssignmentResponse,
    BulkAssignRequest,
    CompletionDynamicsItem,
    CourseAdminResponse,
    CourseCreate,
    CourseListItem,
    CourseResultRow,
    CourseUpdate,
    DeadlineExtensionLogResponse,
    ExtendAssignmentDeadlineRequest,
    ExtendDeadlineRequest,
    LmsOverviewStats,
    QuizAdminResponse,
    QuizCreate,
    QuizUpdate,
    ScoreDistributionItem,
    UserProgressRow,
)
from app.services.lms import (
    approve_assignment_unblock,
    assign_course_to_users,
    completion_dynamics,
    expire_overdue_assignments,
    extend_assignment_deadline,
    get_assignment_attempts_count,
    get_best_score,
    score_distribution,
    send_deadline_warnings,
)

router = APIRouter(prefix="/api/admin", tags=["lms-admin"])

UPLOADS_ROOT = Path("uploads")
COURSES_DIR = UPLOADS_ROOT / "courses"
ALLOWED_COURSE_EXTENSIONS = {".pdf", ".pptx", ".ppt"}
MAX_FILE_SIZE = 50 * 1024 * 1024


def _ensure_courses_dir() -> None:
    COURSES_DIR.mkdir(parents=True, exist_ok=True)


async def _save_course_file(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_COURSE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Разрешены только .pdf, .pptx, .ppt")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Максимальный размер файла — 50 МБ")
    _ensure_courses_dir()
    dest = COURSES_DIR / f"{uuid.uuid4().hex}{ext}"
    dest.write_bytes(content)
    return f"/uploads/courses/{dest.name}"


def _course_to_list_item(course: Course) -> CourseListItem:
    return CourseListItem(
        id=course.id,
        title=course.title,
        description=course.description,
        category=course.category,
        is_mandatory=course.is_mandatory,
        deadline_days=course.deadline_days,
        passing_score=course.passing_score,
        max_attempts=course.max_attempts,
        estimated_duration_minutes=course.estimated_duration_minutes,
        is_active=course.is_active,
        created_at=course.created_at,
        quiz_count=len(course.quizzes),
    )


def _assignment_response(db: Session, assignment: CourseAssignment) -> AssignmentResponse:
    user = db.query(User).filter(User.id == assignment.user_id).first()
    return AssignmentResponse(
        id=assignment.id,
        user_id=assignment.user_id,
        course_id=assignment.course_id,
        username=user.username if user else "",
        full_name=user.full_name if user else "",
        assigned_at=assignment.assigned_at,
        deadline_date=assignment.deadline_date,
        status=assignment.status,
        completed_at=assignment.completed_at,
        attempts_count=get_assignment_attempts_count(db, assignment.id),
        best_score=get_best_score(db, assignment.id),
    )


def _get_course_or_404(db: Session, course_id: int) -> Course:
    course = (
        db.query(Course)
        .options(joinedload(Course.quizzes))
        .filter(Course.id == course_id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    return course


# ── Courses ───────────────────────────────────────────────────────────────────


@router.get("/courses", response_model=list[CourseListItem])
def list_courses(
    category: str | None = None,
    is_mandatory: bool | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    query = db.query(Course).options(joinedload(Course.quizzes))
    if category:
        query = query.filter(Course.category == category)
    if is_mandatory is not None:
        query = query.filter(Course.is_mandatory == is_mandatory)
    if is_active is not None:
        query = query.filter(Course.is_active == is_active)
    if search:
        query = query.filter(Course.title.ilike(f"%{search}%"))
    courses = query.order_by(Course.created_at.desc()).all()
    return [_course_to_list_item(c) for c in courses]


@router.post("/courses", response_model=CourseAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    request: Request,
    title: str = Form(...),
    description: str | None = Form(None),
    category: str = Form(...),
    is_mandatory: bool = Form(False),
    deadline_days: int | None = Form(None),
    passing_score: int = Form(80),
    max_attempts: int = Form(-1),
    content_html: str | None = Form(None),
    estimated_duration_minutes: int = Form(0),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    from app.models import CourseCategory

    try:
        cat = CourseCategory(category)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректная категория") from exc

    file_path = None
    if file and file.filename:
        file_path = await _save_course_file(file)

    course = Course(
        title=title.strip(),
        description=description,
        category=cat,
        is_mandatory=is_mandatory,
        deadline_days=deadline_days,
        passing_score=passing_score,
        max_attempts=max_attempts,
        content_html=content_html,
        file_path=file_path,
        estimated_duration_minutes=estimated_duration_minutes,
        is_active=True,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    log_audit(
        db,
        action="course.create",
        user=admin,
        object_type="course",
        object_id=course.id,
        request=request,
    )
    resp = CourseAdminResponse.model_validate(course)
    resp.quizzes = []
    resp.quiz_count = 0
    return resp


@router.get("/courses/{course_id}", response_model=CourseAdminResponse)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    course = _get_course_or_404(db, course_id)
    data = CourseAdminResponse.model_validate(course)
    data.quiz_count = len(course.quizzes)
    return data


@router.put("/courses/{course_id}", response_model=CourseAdminResponse)
async def update_course(
    course_id: int,
    request: Request,
    title: str | None = Form(None),
    description: str | None = Form(None),
    category: str | None = Form(None),
    is_mandatory: bool | None = Form(None),
    deadline_days: int | None = Form(None),
    passing_score: int | None = Form(None),
    max_attempts: int | None = Form(None),
    content_html: str | None = Form(None),
    estimated_duration_minutes: int | None = Form(None),
    is_active: bool | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    from app.models import CourseCategory

    course = _get_course_or_404(db, course_id)
    if title is not None:
        course.title = title.strip()
    if description is not None:
        course.description = description
    if category is not None:
        try:
            course.category = CourseCategory(category)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Некорректная категория") from exc
    if is_mandatory is not None:
        course.is_mandatory = is_mandatory
    if deadline_days is not None:
        course.deadline_days = deadline_days or None
    if passing_score is not None:
        course.passing_score = passing_score
    if max_attempts is not None:
        course.max_attempts = max_attempts
    if content_html is not None:
        course.content_html = content_html
    if estimated_duration_minutes is not None:
        course.estimated_duration_minutes = estimated_duration_minutes
    if is_active is not None:
        course.is_active = is_active
    if file and file.filename:
        if course.file_path:
            old = UPLOADS_ROOT / course.file_path.removeprefix("/uploads/")
            if old.exists():
                old.unlink()
        course.file_path = await _save_course_file(file)
    db.commit()
    db.refresh(course)
    log_audit(
        db,
        action="course.update",
        user=admin,
        object_type="course",
        object_id=course.id,
        request=request,
    )
    data = CourseAdminResponse.model_validate(course)
    data.quiz_count = len(course.quizzes)
    return data


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    course = _get_course_or_404(db, course_id)
    course.is_active = False
    db.commit()
    log_audit(
        db,
        action="course.delete",
        user=admin,
        object_type="course",
        object_id=course_id,
        request=request,
    )


# ── Quizzes ───────────────────────────────────────────────────────────────────


@router.get("/courses/{course_id}/quizzes", response_model=list[QuizAdminResponse])
def list_quizzes(
    course_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    _get_course_or_404(db, course_id)
    quizzes = db.query(Quiz).filter(Quiz.course_id == course_id).order_by(Quiz.id).all()
    return quizzes


@router.post("/courses/{course_id}/quizzes", response_model=QuizAdminResponse, status_code=201)
def add_quiz(
    course_id: int,
    payload: QuizCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    _get_course_or_404(db, course_id)
    quiz = Quiz(course_id=course_id, **payload.model_dump())
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    log_audit(
        db,
        action="quiz.create",
        user=admin,
        object_type="quiz",
        object_id=quiz.id,
        request=request,
    )
    return quiz


@router.put("/quizzes/{quiz_id}", response_model=QuizAdminResponse)
def update_quiz(
    quiz_id: int,
    payload: QuizUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(quiz, key, value)
    db.commit()
    db.refresh(quiz)
    log_audit(
        db,
        action="quiz.update",
        user=admin,
        object_type="quiz",
        object_id=quiz.id,
        request=request,
    )
    return quiz


@router.delete("/quizzes/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz(
    quiz_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    db.delete(quiz)
    db.commit()
    log_audit(
        db,
        action="quiz.delete",
        user=admin,
        object_type="quiz",
        object_id=quiz_id,
        request=request,
    )


# ── Assignments ───────────────────────────────────────────────────────────────


@router.post("/courses/{course_id}/assign", response_model=list[AssignmentResponse])
def assign_course(
    course_id: int,
    payload: AssignCourseRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    course = _get_course_or_404(db, course_id)
    assignments = assign_course_to_users(db, course, payload.user_ids, admin.id)
    db.commit()
    log_audit(
        db,
        action="course.assign",
        user=admin,
        object_type="course",
        object_id=course_id,
        request=request,
    )
    return [_assignment_response(db, a) for a in assignments]


@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentResponse])
def list_course_assignments(
    course_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    _get_course_or_404(db, course_id)
    assignments = (
        db.query(CourseAssignment)
        .filter(CourseAssignment.course_id == course_id)
        .order_by(CourseAssignment.assigned_at.desc())
        .all()
    )
    return [_assignment_response(db, a) for a in assignments]


@router.post("/courses/assign/bulk")
def bulk_assign(
    payload: BulkAssignRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    total = 0
    for course_id in payload.course_ids:
        course = _get_course_or_404(db, course_id)
        created = assign_course_to_users(db, course, payload.user_ids, admin.id)
        total += len(created)
    db.commit()
    log_audit(
        db,
        action="course.assign_bulk",
        user=admin,
        object_type="course",
        object_id=",".join(str(cid) for cid in payload.course_ids)[:64],
        request=request,
    )
    return {"assigned_count": total}


# ── Analytics ─────────────────────────────────────────────────────────────────


@router.get("/lms/analytics/overview", response_model=LmsOverviewStats)
def analytics_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    expire_overdue_assignments(db)
    total_courses = db.query(Course).count()
    active_courses = db.query(Course).filter(Course.is_active.is_(True)).count()
    total_users = db.query(User).filter(User.is_active.is_(True)).count()
    assignments = db.query(CourseAssignment).all()
    completed = sum(1 for a in assignments if a.status == AssignmentStatus.COMPLETED)
    completion_rate = round((completed / len(assignments)) * 100, 1) if assignments else 0.0
    overdue = sum(1 for a in assignments if a.status == AssignmentStatus.EXPIRED)
    avg = db.query(func.avg(QuizAttempt.score)).filter(QuizAttempt.score.isnot(None)).scalar()
    recent = (
        db.query(CourseAssignment)
        .order_by(CourseAssignment.assigned_at.desc())
        .limit(10)
        .all()
    )
    return LmsOverviewStats(
        total_courses=total_courses,
        active_courses=active_courses,
        total_users=total_users,
        completion_rate=completion_rate,
        overdue_courses_count=overdue,
        avg_score=round(float(avg), 1) if avg else None,
        recent_assignments=[_assignment_response(db, a) for a in recent],
    )


@router.get("/lms/analytics/courses/{course_id}/results", response_model=list[CourseResultRow])
def course_results(
    course_id: int,
    status_filter: AssignmentStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    _get_course_or_404(db, course_id)
    query = db.query(CourseAssignment).filter(CourseAssignment.course_id == course_id)
    if status_filter:
        query = query.filter(CourseAssignment.status == status_filter)
    rows: list[CourseResultRow] = []
    for assignment in query.all():
        user = db.query(User).filter(User.id == assignment.user_id).first()
        last_attempt = (
            db.query(QuizAttempt)
            .filter(QuizAttempt.course_assignment_id == assignment.id)
            .order_by(QuizAttempt.completed_at.desc().nullslast())
            .first()
        )
        rows.append(
            CourseResultRow(
                user_id=assignment.user_id,
                username=user.username if user else "",
                full_name=user.full_name if user else "",
                status=assignment.status,
                attempts_count=get_assignment_attempts_count(db, assignment.id),
                best_score=get_best_score(db, assignment.id),
                last_attempt_at=last_attempt.completed_at if last_attempt else None,
                deadline_date=assignment.deadline_date,
            )
        )
    return rows


@router.get("/lms/analytics/users/{user_id}/progress", response_model=list[UserProgressRow])
def user_progress(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    rows: list[UserProgressRow] = []
    assignments = db.query(CourseAssignment).filter(CourseAssignment.user_id == user_id).all()
    for assignment in assignments:
        course = db.query(Course).filter(Course.id == assignment.course_id).first()
        if not course:
            continue
        rows.append(
            UserProgressRow(
                course_id=course.id,
                course_title=course.title,
                category=course.category,
                status=assignment.status,
                attempts_count=get_assignment_attempts_count(db, assignment.id),
                best_score=get_best_score(db, assignment.id),
                deadline_date=assignment.deadline_date,
                completed_at=assignment.completed_at,
            )
        )
    return rows


@router.get("/lms/analytics/score-distribution", response_model=list[ScoreDistributionItem])
def analytics_score_distribution(
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    return [
        ScoreDistributionItem(range=label, count=count)
        for label, count in score_distribution(db)
    ]


@router.get("/lms/analytics/completion-dynamics", response_model=list[CompletionDynamicsItem])
def analytics_completion_dynamics(
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    return [
        CompletionDynamicsItem(date=day, count=count)
        for day, count in completion_dynamics(db, days=30)
    ]


@router.get("/lms/reports/export")
def export_report(
    course_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status_filter: AssignmentStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    # TODO: Phase 3 — advanced CSV filters and background export
    query = db.query(QuizAttempt).join(
        CourseAssignment, QuizAttempt.course_assignment_id == CourseAssignment.id
    )
    if course_id:
        query = query.filter(CourseAssignment.course_id == course_id)
    if date_from:
        query = query.filter(QuizAttempt.completed_at >= date_from)
    if date_to:
        query = query.filter(QuizAttempt.completed_at <= date_to)
    if status_filter:
        query = query.filter(CourseAssignment.status == status_filter)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["username", "course_title", "attempt_date", "score", "passed", "attempt_number"]
    )
    for attempt in query.order_by(QuizAttempt.completed_at).all():
        user = db.query(User).filter(User.id == attempt.user_id).first()
        assignment = db.query(CourseAssignment).filter(CourseAssignment.id == attempt.course_assignment_id).first()
        course = db.query(Course).filter(Course.id == assignment.course_id).first() if assignment else None
        attempt_num = (
            db.query(QuizAttempt)
            .filter(
                QuizAttempt.course_assignment_id == attempt.course_assignment_id,
                QuizAttempt.id <= attempt.id,
            )
            .count()
        )
        writer.writerow([
            user.username if user else "",
            course.title if course else "",
            attempt.completed_at.isoformat() if attempt.completed_at else "",
            attempt.score,
            attempt.passed,
            attempt_num,
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="lms_report.csv"'},
    )


# ── Deadlines & unblock ───────────────────────────────────────────────────────


@router.get("/lms/deadlines/overdue", response_model=list[AssignmentResponse])
def overdue_assignments(
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    expire_overdue_assignments(db)
    assignments = (
        db.query(CourseAssignment)
        .filter(CourseAssignment.status == AssignmentStatus.EXPIRED)
        .order_by(CourseAssignment.deadline_date.desc())
        .all()
    )
    return [_assignment_response(db, a) for a in assignments]


@router.post("/lms/deadlines/extend", response_model=AssignmentResponse)
def extend_deadline(
    payload: ExtendDeadlineRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    """Legacy body-based extend; also writes DeadlineExtensionLog."""
    assignment = db.query(CourseAssignment).filter(CourseAssignment.id == payload.assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Назначение не найдено")
    extend_assignment_deadline(db, assignment, payload.new_deadline_date, admin.id)
    db.commit()
    db.refresh(assignment)
    log_audit(
        db,
        action="assignment.extend_deadline",
        user=admin,
        object_type="assignment",
        object_id=assignment.id,
        request=request,
    )
    return _assignment_response(db, assignment)


@router.post(
    "/lms/assignments/{assignment_id}/extend-deadline",
    response_model=AssignmentResponse,
)
def extend_assignment_deadline_endpoint(
    assignment_id: int,
    payload: ExtendAssignmentDeadlineRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    assignment = db.query(CourseAssignment).filter(CourseAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Назначение не найдено")
    extend_assignment_deadline(db, assignment, payload.new_deadline_date, admin.id)
    db.commit()
    db.refresh(assignment)
    log_audit(
        db,
        action="assignment.extend_deadline",
        user=admin,
        object_type="assignment",
        object_id=assignment.id,
        request=request,
    )
    return _assignment_response(db, assignment)


@router.get(
    "/lms/assignments/{assignment_id}/deadline-logs",
    response_model=list[DeadlineExtensionLogResponse],
)
def list_deadline_logs(
    assignment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lms_admin),
):
    assignment = db.query(CourseAssignment).filter(CourseAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Назначение не найдено")
    logs = (
        db.query(DeadlineExtensionLog)
        .filter(DeadlineExtensionLog.assignment_id == assignment_id)
        .order_by(DeadlineExtensionLog.changed_at.desc())
        .all()
    )
    result: list[DeadlineExtensionLogResponse] = []
    for log in logs:
        changer = db.query(User).filter(User.id == log.changed_by_user_id).first() if log.changed_by_user_id else None
        result.append(
            DeadlineExtensionLogResponse(
                id=log.id,
                assignment_id=log.assignment_id,
                old_deadline=log.old_deadline,
                new_deadline=log.new_deadline,
                changed_by_user_id=log.changed_by_user_id,
                changed_by_name=changer.full_name if changer else None,
                changed_at=log.changed_at,
            )
        )
    return result


@router.post(
    "/lms/assignments/{assignment_id}/approve-unblock",
    response_model=ApproveUnblockResponse,
)
def approve_unblock(
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    assignment = db.query(CourseAssignment).filter(CourseAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Назначение не найдено")
    approve_assignment_unblock(db, assignment)
    db.commit()
    db.refresh(assignment)
    log_audit(
        db,
        action="assignment.approve_unblock",
        user=admin,
        object_type="assignment",
        object_id=assignment.id,
        request=request,
    )
    return ApproveUnblockResponse(ok=True, assignment=_assignment_response(db, assignment))


@router.post("/lms/notifications/send-deadline-warnings")
def trigger_deadline_warnings(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_lms_admin),
):
    count = send_deadline_warnings(db)
    log_audit(
        db,
        action="notification.send_deadline_warnings",
        user=admin,
        object_type="notification",
        object_id=count,
        request=request,
    )
    return {"warnings_sent": count}
