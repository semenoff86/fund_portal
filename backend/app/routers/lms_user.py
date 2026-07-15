"""LMS user API: assigned courses, quiz taking, progress."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AssignmentStatus, Course, CourseAssignment, NotificationType, Quiz, QuizAttempt, User
from app.lms_schemas import (
    QuizAnswerReview,
    QuizAttemptResponse,
    QuizPublicResponse,
    QuizSubmitLmsRequest,
    QuizSubmitLmsResponse,
    UserCourseDetail,
    UserCourseListItem,
    UserProgressStats,
)
from app.services.lms import (
    calculate_quiz_score,
    check_passed,
    create_notification,
    expire_overdue_assignments,
    get_assignment_attempts_count,
    get_best_score,
    mark_final_attempt,
    utcnow,
)

router = APIRouter(prefix="/api/lms", tags=["lms"])


def _get_user_assignment(db: Session, user_id: int, course_id: int) -> CourseAssignment:
    assignment = (
        db.query(CourseAssignment)
        .filter(CourseAssignment.user_id == user_id, CourseAssignment.course_id == course_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="Курс не назначен")
    return assignment


def _course_list_item(db: Session, course: Course, assignment: CourseAssignment) -> UserCourseListItem:
    return UserCourseListItem(
        course_id=course.id,
        title=course.title,
        description=course.description,
        category=course.category,
        is_mandatory=course.is_mandatory,
        passing_score=course.passing_score,
        max_attempts=course.max_attempts,
        estimated_duration_minutes=course.estimated_duration_minutes,
        assignment_id=assignment.id,
        status=assignment.status,
        deadline_date=assignment.deadline_date,
        attempts_count=get_assignment_attempts_count(db, assignment.id),
        best_score=get_best_score(db, assignment.id),
        completed_at=assignment.completed_at,
    )


def _build_reviews(quizzes: list[Quiz], answers: dict[int, int]) -> list[QuizAnswerReview]:
    reviews = []
    for quiz in quizzes:
        selected = answers.get(quiz.id, -1)
        reviews.append(
            QuizAnswerReview(
                quiz_id=quiz.id,
                question=quiz.question,
                options=quiz.options,
                selected_index=selected,
                correct_index=quiz.correct_answer_index,
                is_correct=selected == quiz.correct_answer_index,
                explanation=quiz.explanation,
            )
        )
    return reviews


@router.get("/courses", response_model=list[UserCourseListItem])
def list_my_courses(
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expire_overdue_assignments(db)
    assignments = (
        db.query(CourseAssignment)
        .filter(CourseAssignment.user_id == current_user.id)
        .order_by(CourseAssignment.assigned_at.desc())
        .all()
    )
    items: list[UserCourseListItem] = []
    for assignment in assignments:
        course = db.query(Course).filter(Course.id == assignment.course_id, Course.is_active.is_(True)).first()
        if not course:
            continue
        item = _course_list_item(db, course, assignment)
        if status_filter:
            if status_filter == "overdue" and assignment.status != AssignmentStatus.EXPIRED:
                continue
            if status_filter != "overdue" and assignment.status.value.lower() != status_filter.lower():
                continue
        items.append(item)
    return items


@router.get("/courses/{course_id}", response_model=UserCourseDetail)
def get_course_detail(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id, Course.is_active.is_(True)).first()
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    assignment = _get_user_assignment(db, current_user.id, course_id)
    return UserCourseDetail(
        id=course.id,
        title=course.title,
        description=course.description,
        category=course.category,
        is_mandatory=course.is_mandatory,
        passing_score=course.passing_score,
        max_attempts=course.max_attempts,
        content_html=course.content_html,
        file_path=course.file_path,
        estimated_duration_minutes=course.estimated_duration_minutes,
        assignment_id=assignment.id,
        status=assignment.status,
        deadline_date=assignment.deadline_date,
        attempts_count=get_assignment_attempts_count(db, assignment.id),
        best_score=get_best_score(db, assignment.id),
    )


@router.post("/courses/{course_id}/start")
def start_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assignment = _get_user_assignment(db, current_user.id, course_id)
    if assignment.status == AssignmentStatus.ASSIGNED:
        assignment.status = AssignmentStatus.IN_PROGRESS
        db.commit()
    return {"status": assignment.status.value}


@router.get("/courses/{course_id}/quiz", response_model=list[QuizPublicResponse])
def get_quiz(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_assignment(db, current_user.id, course_id)
    quizzes = db.query(Quiz).filter(Quiz.course_id == course_id).order_by(Quiz.id).all()
    if not quizzes:
        raise HTTPException(status_code=404, detail="Тест для курса не настроен")
    return quizzes


@router.post("/courses/{course_id}/quiz/submit", response_model=QuizSubmitLmsResponse)
def submit_quiz(
    course_id: int,
    payload: QuizSubmitLmsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    assignment = _get_user_assignment(db, current_user.id, course_id)
    quizzes = db.query(Quiz).filter(Quiz.course_id == course_id).all()
    if not quizzes:
        raise HTTPException(status_code=400, detail="Нет вопросов в тесте")

    if len(payload.answers) < len(quizzes):
        raise HTTPException(status_code=400, detail="Ответьте на все вопросы")

    attempts_count = get_assignment_attempts_count(db, assignment.id)
    if course.max_attempts != -1 and attempts_count >= course.max_attempts:
        raise HTTPException(status_code=400, detail="Превышено максимальное количество попыток")

    score = calculate_quiz_score(payload.answers, quizzes)
    passed = check_passed(score, course.passing_score)
    correct = sum(1 for q in quizzes if payload.answers.get(q.id) == q.correct_answer_index)

    attempt = QuizAttempt(
        user_id=current_user.id,
        course_assignment_id=assignment.id,
        answers={str(k): v for k, v in payload.answers.items()},
        score=score,
        passed=passed,
        completed_at=utcnow(),
    )
    db.add(attempt)
    db.flush()
    mark_final_attempt(db, assignment.id, attempt.id)

    if passed:
        assignment.status = AssignmentStatus.COMPLETED
        assignment.completed_at = utcnow()
        create_notification(
            db,
            user_id=current_user.id,
            type=NotificationType.COURSE_COMPLETED,
            title="Курс завершён",
            message=f'Вы успешно прошли курс «{course.title}» ({score}%)',
            course_id=course.id,
            link=f"/dashboard/lms/courses/{course.id}/results",
        )
    else:
        if assignment.status == AssignmentStatus.ASSIGNED:
            assignment.status = AssignmentStatus.IN_PROGRESS
        create_notification(
            db,
            user_id=current_user.id,
            type=NotificationType.TEST_FAILED,
            title="Тест не пройден",
            message=f'Результат: {score}%. Требуется минимум {course.passing_score}%',
            course_id=course.id,
            link=f"/dashboard/lms/courses/{course.id}/quiz",
        )

    db.commit()
    reviews = _build_reviews(quizzes, payload.answers)
    return QuizSubmitLmsResponse(
        score=score,
        passed=passed,
        correct_answers=correct,
        total_questions=len(quizzes),
        attempt_id=attempt.id,
        reviews=reviews,
    )


@router.get("/courses/{course_id}/results", response_model=list[QuizAttemptResponse])
def get_course_results(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assignment = _get_user_assignment(db, current_user.id, course_id)
    quizzes = {q.id: q for q in db.query(Quiz).filter(Quiz.course_id == course_id).all()}
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.course_assignment_id == assignment.id)
        .order_by(QuizAttempt.completed_at.desc())
        .all()
    )
    result: list[QuizAttemptResponse] = []
    for attempt in attempts:
        answers = {int(k): v for k, v in (attempt.answers or {}).items()}
        reviews = _build_reviews(list(quizzes.values()), answers)
        result.append(
            QuizAttemptResponse(
                id=attempt.id,
                score=attempt.score,
                passed=attempt.passed,
                started_at=attempt.started_at,
                completed_at=attempt.completed_at,
                is_final=attempt.is_final,
                reviews=reviews,
            )
        )
    return result


@router.get("/my-progress", response_model=UserProgressStats)
def my_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expire_overdue_assignments(db)
    assignments = db.query(CourseAssignment).filter(CourseAssignment.user_id == current_user.id).all()
    courses: list[UserCourseListItem] = []
    for assignment in assignments:
        course = db.query(Course).filter(Course.id == assignment.course_id).first()
        if course:
            courses.append(_course_list_item(db, course, assignment))
    return UserProgressStats(
        total_assigned=len(assignments),
        completed=sum(1 for a in assignments if a.status == AssignmentStatus.COMPLETED),
        in_progress=sum(1 for a in assignments if a.status == AssignmentStatus.IN_PROGRESS),
        overdue=sum(1 for a in assignments if a.status == AssignmentStatus.EXPIRED),
        courses=courses,
    )


@router.get("/my-overdue", response_model=list[UserCourseListItem])
def my_overdue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expire_overdue_assignments(db)
    assignments = (
        db.query(CourseAssignment)
        .filter(
            CourseAssignment.user_id == current_user.id,
            CourseAssignment.status == AssignmentStatus.EXPIRED,
        )
        .all()
    )
    items = []
    for assignment in assignments:
        course = db.query(Course).filter(Course.id == assignment.course_id).first()
        if course:
            items.append(_course_list_item(db, course, assignment))
    return items
