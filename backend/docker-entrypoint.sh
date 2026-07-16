#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
python - <<'PY'
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
python - <<'PY'
"""Upgrade schema; stamp existing create_all databases so Alembic can take over."""
import os
import subprocess
import sys

from sqlalchemy import create_engine, inspect, text

url = os.environ["DATABASE_URL"]
engine = create_engine(url)
inspector = inspect(engine)
tables = set(inspector.get_table_names())

has_alembic = "alembic_version" in tables
has_app = "users" in tables

if has_app and not has_alembic:
    print("Existing schema detected without alembic_version — stamping head, then upgrading.")
    # Stamp baseline so the full initial migration is not re-applied on populated DBs.
    # Then upgrade picks up any newer revisions (e.g. refresh_tokens via create_all fallback).
    subprocess.check_call([sys.executable, "-m", "alembic", "stamp", "head"], cwd="/app")
else:
    subprocess.check_call([sys.executable, "-m", "alembic", "upgrade", "head"], cwd="/app")

# Ensure refresh_tokens exists even on stamped legacy DBs (create_all is idempotent).
from app.database import init_db

init_db()
print("Schema ready.")
PY

echo "Initializing seed data..."
python seed.py

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
