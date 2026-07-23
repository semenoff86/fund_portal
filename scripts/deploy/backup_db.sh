#!/usr/bin/env bash
# =============================================================================
# Fund Portal — PostgreSQL backup
# Dumps the fund_portal_db container to /data/backups/ and keeps the last 7.
#
# Usage:
#   sudo bash /opt/fund_portal/scripts/deploy/backup_db.sh
#   sudo fund-portal-backup
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fund_portal}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
CONTAINER="${CONTAINER:-fund_portal_db}"
KEEP="${KEEP:-7}"
DB_NAME="${DB_NAME:-fund_portal}"
DB_USER="${DB_USER:-postgres}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  err "Run as root (sudo)."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  err "Container ${CONTAINER} is not running."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/fund_portal_${TIMESTAMP}.sql.gz"

log "Backing up ${DB_NAME} from ${CONTAINER} → ${OUT_FILE}"
docker exec "${CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists \
  | gzip -c > "${OUT_FILE}"

chmod 600 "${OUT_FILE}"
SIZE="$(du -h "${OUT_FILE}" | awk '{print $1}')"
log "Backup complete (${SIZE})."

# Retention: keep only the newest KEEP files matching the pattern
mapfile -t OLD < <(ls -1t "${BACKUP_DIR}"/fund_portal_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" || true)
if [[ ${#OLD[@]} -gt 0 ]]; then
  log "Removing ${#OLD[@]} old backup(s) (keeping last ${KEEP})..."
  rm -f "${OLD[@]}"
fi

log "Current backups:"
ls -lh "${BACKUP_DIR}"/fund_portal_*.sql.gz 2>/dev/null || echo "(none)"
