"""Database engine and session management."""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Yield a database session for request scope."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables, enable extensions, and apply lightweight schema patches."""
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN "
                "NOT NULL DEFAULT TRUE"
            )
        )
        order_patches = [
            "ALTER TABLE order_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE order_documents ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        ]
        for patch in order_patches:
            conn.execute(text(patch))
        course_patches = [
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS deadline_days INTEGER",
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS passing_score INTEGER NOT NULL DEFAULT 80",
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT -1",
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS content_html TEXT",
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS file_path VARCHAR(512)",
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS explanation TEXT",
        ]
        for patch in course_patches:
            conn.execute(text(patch))
        conn.commit()
    Base.metadata.create_all(bind=engine)
