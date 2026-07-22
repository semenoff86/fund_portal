#!/bin/sh
set -e

# Named volumes are often root-owned on first create — fix before dropping privileges.
mkdir -p /app/cache/fastembed /app/uploads
chown -R appuser:appuser /app/cache /app/uploads 2>/dev/null || true

echo "Waiting for PostgreSQL..."
runuser -u appuser -- python - <<'PY'
import os
import sys
import time

from sqlalchemy import create_engine, text

url = os.environ["DATABASE_URL"]
engine = create_engine(url)

for attempt in range(60):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database is ready.")
        break
    except Exception:
        time.sleep(1)
else:
    print("Database connection timeout.", file=sys.stderr)
    sys.exit(1)
PY

echo "Applying Alembic migrations..."
runuser -u appuser -- python - <<'PY'
"""Upgrade schema; stamp existing create_all databases so Alembic can take over."""
import os
import subprocess
import sys

from sqlalchemy import create_engine, inspect

url = os.environ["DATABASE_URL"]
engine = create_engine(url)
inspector = inspect(engine)
tables = set(inspector.get_table_names())

has_alembic = "alembic_version" in tables
has_app = "users" in tables

if has_app and not has_alembic:
    print("Existing schema detected without alembic_version — stamping head, then upgrading.")
    subprocess.check_call([sys.executable, "-m", "alembic", "stamp", "head"], cwd="/app")
else:
    subprocess.check_call([sys.executable, "-m", "alembic", "upgrade", "head"], cwd="/app")

from app.database import init_db

init_db()
print("Schema ready.")
PY

echo "Initializing seed data..."
runuser -u appuser -- python seed.py

echo "Starting API server..."
exec runuser -u appuser -- uvicorn app.main:app --host 0.0.0.0 --port 8000
