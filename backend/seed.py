"""Seed the database with demo data for development."""

from datetime import date

from app.auth import get_password_hash
from app.database import SessionLocal, init_db
from app.models import (
    Course,
    CourseAssignment,
    CourseCategory,
    DocumentCategory,
    DocumentStatus,
    OrderDocument,
    Quiz,
    User,
    UserRole,
)
from app.services.lms import assign_course_to_users


def seed():
    init_db()
    db = SessionLocal()

    try:
        if db.query(User).filter(User.username == "admin").first():
            print("Database already seeded. Skipping.")
            return

        admin = User(
            username="admin",
            password_hash=get_password_hash("admin"),
            email="admin@mkk.ru",
            full_name="Администратор Системы",
            role=UserRole.ADMIN,
            department="ИТ",
            bio="Системный администратор портала",
        )
        analyst = User(
            username="analyst",
            password_hash=get_password_hash("analyst"),
            email="analyst@mkk.ru",
            full_name="Иванов Иван Иванович",
            role=UserRole.ANALYST,
            department="Аналитика",
        )
        db.add_all([admin, analyst])

        documents = [
            OrderDocument(
                title="Положение о кредитной политике",
                category=DocumentCategory.CREDIT,
                status=DocumentStatus.ACTIVE,
                issue_date=date(2024, 3, 15),
                content_text="Регламент кредитной политики МКК...",
            ),
            OrderDocument(
                title="Инструкция по охране труда",
                category=DocumentCategory.SAFETY,
                status=DocumentStatus.ACTIVE,
                issue_date=date(2024, 1, 10),
                content_text="Требования безопасности на рабочем месте...",
            ),
        ]
        db.add_all(documents)

        course = Course(
            title="Основы микрофинансирования",
            description="Вводный курс для новых сотрудников МКК",
            category=CourseCategory.CREDIT,
            is_mandatory=True,
            deadline_days=14,
            passing_score=80,
            max_attempts=-1,
            content_html="<p>Добро пожаловать на курс по основам микрофинансирования.</p>",
            estimated_duration_minutes=45,
            is_active=True,
        )
        db.add(course)
        db.flush()

        db.add_all([
            Quiz(
                course_id=course.id,
                question="Что такое МКК?",
                options=["Микрокредитная компания", "Международный кредитный центр", "Муниципальный комитет", "Министерство культуры"],
                correct_answer_index=0,
                explanation="МКК — микрокредитная компания.",
            ),
            Quiz(
                course_id=course.id,
                question="Какой документ регулирует кредитную политику?",
                options=["Положение о кредитной политике", "Трудовой договор", "Устав банка", "Приказ об отпуске"],
                correct_answer_index=0,
                explanation="Кредитная политика утверждается соответствующим положением.",
            ),
        ])

        course2 = Course(
            title="Информационная безопасность",
            description="Обязательный курс по ИБ для всех сотрудников",
            category=CourseCategory.SAFETY,
            is_mandatory=True,
            deadline_days=7,
            passing_score=80,
            max_attempts=3,
            content_html="<p>Основы информационной безопасности в МКК.</p>",
            estimated_duration_minutes=30,
            is_active=True,
        )
        db.add(course2)
        db.flush()

        db.add(
            Quiz(
                course_id=course2.id,
                question="Как часто нужно менять пароль?",
                options=["Каждые 90 дней", "Никогда", "Раз в 5 лет", "Раз в месяц"],
                correct_answer_index=0,
                explanation="Пароль необходимо менять каждые 90 дней.",
            )
        )

        db.flush()
        assign_course_to_users(db, course, [analyst.id], admin.id)
        assign_course_to_users(db, course2, [analyst.id], admin.id)

        db.commit()
        print("Database seeded successfully.")
        print("  admin / admin")
        print("  analyst / analyst")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
