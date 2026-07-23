#!/usr/bin/env bash
# =============================================================================
# Fund Portal — update from git, backup DB, rebuild, migrate
#
# Usage:
#   sudo bash /opt/fund_portal/scripts/deploy/update_portal.sh
#   sudo fund-portal-update
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fund_portal}"
BRANCH="${BRANCH:-main}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  err "Run as root (sudo)."
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  err "No git repo at ${APP_DIR}."
  exit 1
fi

cd "${APP_DIR}"

log "=== 1/4 Pull latest changes (${BRANCH}) ==="
git fetch --all --prune
git checkout "${BRANCH}"
# Preserve local deploy artifacts
git stash push -u -m "pre-update-$(date +%Y%m%d%H%M%S)" -- \
  docker-compose.override.yml .env 2>/dev/null || true
git pull --ff-only origin "${BRANCH}"
# Restore if stashed (override/.env should normally be untracked or ignored)
git stash pop 2>/dev/null || true

if [[ ! -f "${APP_DIR}/.env" ]]; then
  err "Missing ${APP_DIR}/.env — aborting."
  exit 1
fi

log "=== 2/4 Database backup ==="
if [[ -x "${SCRIPT_DIR}/backup_db.sh" ]]; then
  bash "${SCRIPT_DIR}/backup_db.sh"
else
  warn "backup_db.sh not found — skipping backup."
fi

log "=== 3/4 Rebuild and restart containers ==="
docker compose up -d --build

log "Waiting for backend health..."
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
    log "Backend healthy."
    break
  fi
  sleep 5
  if [[ "${i}" -eq 60 ]]; then
    warn "Health check timed out — continuing to migrations anyway."
  fi
done

log "=== 4/4 Alembic migrations ==="
docker compose exec -T backend alembic upgrade head

docker compose ps
log "Update complete."
echo "  Portal: http://$(hostname -I | awk '{print $1}'):3000"
