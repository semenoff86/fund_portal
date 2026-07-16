#!/usr/bin/env bash
# Apply Alembic migrations to the database pointed at by DATABASE_URL.
# Usage (from repo root or backend/):
#   ./scripts/migrate.sh
#   ./backend/scripts/migrate.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${BACKEND_DIR}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Running alembic upgrade head (DATABASE_URL=${DATABASE_URL:-from app settings})..."
alembic upgrade head
echo "Migrations applied successfully."
