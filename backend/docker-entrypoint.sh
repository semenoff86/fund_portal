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

echo "Initializing database and seed data..."
python seed.py

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
