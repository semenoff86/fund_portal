"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router
from app.config import get_settings
from app.database import init_db
from app.routers import (
    admin,
    chat,
    document_templates,
    lms_admin,
    lms_user,
    notifications,
    orders,
    profile,
    servicedesk,
)
from app.services.document_templates import ensure_sample_templates

settings = get_settings()

UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
(UPLOADS_DIR / "templates").mkdir(parents=True, exist_ok=True)
(UPLOADS_DIR / "knowledge").mkdir(parents=True, exist_ok=True)
(UPLOADS_DIR / "courses").mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_sample_templates()
    from app.database import SessionLocal
    from app.services.audit import purge_expired_audit_logs

    db = SessionLocal()
    try:
        purge_expired_audit_logs(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="МКК Корпоративный Портал",
    description="Internal portal API for Microcredit Fund employees",
    version="0.1.0",
    lifespan=lifespan,
)

# Разрешаем localhost и частные IP (доступ из локальной сети)
CORS_ORIGIN_REGEX = (
    r"https?://"
    r"(localhost|127\.0\.0\.1|"
    r"192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})"
    r"(:\d+)?"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for uploaded avatars
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Routers
app.include_router(auth_router)
app.include_router(profile.router)
app.include_router(orders.router)
app.include_router(servicedesk.router)
app.include_router(document_templates.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(lms_admin.router)
app.include_router(lms_user.router)
app.include_router(notifications.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
