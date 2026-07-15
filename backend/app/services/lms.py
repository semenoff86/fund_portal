"""LMS business logic: scoring, assignments, deadlines, notifications."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    AssignmentStatus,
    Course,
    CourseAssignment,
    Notification,
    NotificationType,
    Quiz,
    QuizAttempt,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def calculate_quiz_score(answers: dict[int, int], quizzes: list[Quiz]) -> int:
    if not quizzes:
        return 0
    correct = sum(1 for q in quizzes if answers.get(q.id) == q.correct_answer_index)
    return round((correct / len(quizzes)) * 100)


def check_passed(score: int, passing_score: int = 80) -> bool:
    return score >= passing_score


def compute_deadline(course: Course, assigned_at: datetime | None = None) -> datetime | None:
    if not course.deadline_days:
        return None
    base = assigned_at or utcnow()
    return base + timedelta(days=course.deadline_days)


def create_notification(
    db: Session,
    *,
    user_id: int,
    type: NotificationType,
    title: str,
    message: str,
    course_id: int | None = None,
    link: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        course_id=course_id,
        link=link,
    )
    db.add(notification)
    return notification


def assign_course_to_users(
    db: Session,
    course: Course,
    user_ids: list[int],
    assigned_by_id: int,
) -> list[CourseAssignment]:
    created: list[CourseAssignment] = []
    for user_id in user_ids:
        existing = (
            db.query(CourseAssignment)
            .filter(CourseAssignment.user_id == user_id, CourseAssignment.course_id == course.id)
            .first()
        )
        if existing and existing.status == AssignmentStatus.COMPLETED:
            continue
        if existing:
            assignment = existing
            assignment.assigned_at = utcnow()
            assignment.assigned_by = assigned_by_id
            assignment.deadline_date = compute_deadline(course)
            assignment.status = AssignmentStatus.ASSIGNED
            assignment.completed_at = None
        else:
            assignment = CourseAssignment(
                user_id=user_id,
                course_id=course.id,
                assigned_by=assigned_by_id,
                deadline_date=compute_deadline(course),
                status=AssignmentStatus.ASSIGNED,
            )
            db.add(assignment)
        created.append(assignment)
        create_notification(
            db,
            user_id=user_id,
            type=NotificationType.COURSE_ASSIGNED,
            title="Назначен новый курс",
            message=f'Вам назначен курс «{course.title}»',
            course_id=course.id,
            link=f"/dashboard/lms/courses/{course.id}",
        )
    db.flush()
    return created


def get_assignment_attempts_count(db: Session, assignment_id: int) -> int:
    return db.query(QuizAttempt).filter(QuizAttempt.course_assignment_id == assignment_id).count()


def get_best_score(db: Session, assignment_id: int) -> int | None:
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.course_assignment_id == assignment_id, QuizAttempt.score.isnot(None))
        .all()
    )
    if not attempts:
        return None
    return max(a.score for a in attempts if a.score is not None)


def expire_overdue_assignments(db: Session) -> int:
    now = utcnow()
    overdue = (
        db.query(CourseAssignment)
        .filter(
            CourseAssignment.status.in_([AssignmentStatus.ASSIGNED, AssignmentStatus.IN_PROGRESS]),
            CourseAssignment.deadline_date.isnot(None),
            CourseAssignment.deadline_date < now,
        )
        .all()
    )
    count = 0
    for assignment in overdue:
        assignment.status = AssignmentStatus.EXPIRED
        course = db.query(Course).filter(Course.id == assignment.course_id).first()
        title = course.title if course else "курс"
        create_notification(
            db,
            user_id=assignment.user_id,
            type=NotificationType.DEADLINE_EXCEEDED,
            title="Срок прохождения курса истёк",
            message=f'Курс «{title}» просрочен',
            course_id=assignment.course_id,
            link=f"/dashboard/lms/courses/{assignment.course_id}",
        )
        count += 1
    if count:
        db.commit()
    return count


def send_deadline_warnings(db: Session, days_before: int = 3) -> int:
    now = utcnow()
    target_start = now + timedelta(days=days_before)
    target_end = now + timedelta(days=days_before + 1)
    assignments = (
        db.query(CourseAssignment)
        .filter(
            CourseAssignment.status.in_([AssignmentStatus.ASSIGNED, AssignmentStatus.IN_PROGRESS]),
            CourseAssignment.deadline_date.isnot(None),
            CourseAssignment.deadline_date >= target_start,
            CourseAssignment.deadline_date < target_end,
        )
        .all()
    )
    count = 0
    for assignment in assignments:
        course = db.query(Course).filter(Course.id == assignment.course_id).first()
        if not course:
            continue
        create_notification(
            db,
            user_id=assignment.user_id,
            type=NotificationType.DEADLINE_WARNING,
            title="Напоминание о дедлайне",
            message=f'До завершения курса «{course.title}» осталось {days_before} дня',
            course_id=course.id,
            link=f"/dashboard/lms/courses/{course.id}",
        )
        count += 1
    if count:
        db.commit()
    return count


def mark_final_attempt(db: Session, assignment_id: int, attempt_id: int) -> None:
    db.query(QuizAttempt).filter(QuizAttempt.course_assignment_id == assignment_id).update(
        {"is_final": False}
    )
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == attempt_id).first()
    if attempt:
        attempt.is_final = True
