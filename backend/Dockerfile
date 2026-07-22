# Multi-stage production image for the FastAPI backend.
# Stage 1: install Python dependencies
# Stage 2: slim runtime as non-root user

FROM python:3.11-slim AS builder

WORKDIR /build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


FROM python:3.11-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TEMPLATES_DIR=/templates/documents \
    PATH="/home/appuser/.local/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 appuser

COPY --from=builder /install /usr/local

COPY backend/app ./app
COPY backend/seed.py .
COPY backend/scripts ./scripts
COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY templates/documents /templates/documents

RUN mkdir -p uploads/avatars uploads/templates uploads/knowledge uploads/courses \
        /app/cache/fastembed \
        /templates/documents/generated \
    && chown -R appuser:appuser /app /templates

COPY backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Entrypoint starts as root to fix volume ownership, then drops to appuser.
USER root

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
