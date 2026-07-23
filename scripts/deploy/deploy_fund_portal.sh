#!/usr/bin/env bash
# =============================================================================
# Fund Portal — bare-metal deployment for Ubuntu 22.04
# Target: Intel Core i5, 16GB RAM, dual SSD (128GB system + 240GB data)
# Server: 192.168.0.14 (example)
#
# Usage (as root or with sudo):
#   sudo bash scripts/deploy/deploy_fund_portal.sh
#
# Optional env:
#   SKIP_DISK=1          — skip 240GB disk prep (already mounted at /data)
#   SKIP_OLLAMA=1        — skip Ollama install / model pull
#   REPO_URL=...         — override git clone URL
#   APP_DIR=/opt/fund_portal
#   SERVER_IP=192.168.0.14
# =============================================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/semenoff86/fund_portal.git}"
APP_DIR="${APP_DIR:-/opt/fund_portal}"
SERVER_IP="${SERVER_IP:-192.168.0.14}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b-instruct-q4_K_M}"
DATA_MOUNT="/data"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    err "This script must be run as root (sudo)."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# 1) Safely identify and prepare the 240GB data disk
# ---------------------------------------------------------------------------
prepare_data_disk() {
  if [[ "${SKIP_DISK:-0}" == "1" ]]; then
    warn "SKIP_DISK=1 — skipping disk preparation."
    mkdir -p "${DATA_MOUNT}"
    return 0
  fi

  if mountpoint -q "${DATA_MOUNT}" 2>/dev/null; then
    log "${DATA_MOUNT} is already mounted — skipping disk format."
    return 0
  fi

  log "Scanning block devices for ~240GB data SSD..."
  echo
  lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL
  echo

  # Prefer whole disks whose size is ~240G (220–260 GiB), not mounted, not the root disk.
  mapfile -t CANDIDATES < <(
    lsblk -dn -b -o NAME,SIZE,TYPE,MOUNTPOINT \
      | awk '
          $3 == "disk" && $2 >= 220*1024*1024*1024 && $2 <= 260*1024*1024*1024 {
            print $1
          }
        '
  )

  # Exclude the disk that hosts /
  ROOT_SRC="$(findmnt -n -o SOURCE / || true)"
  ROOT_DISK=""
  if [[ -n "${ROOT_SRC}" ]]; then
    ROOT_DISK="$(lsblk -no PKNAME "${ROOT_SRC}" 2>/dev/null || true)"
    if [[ -z "${ROOT_DISK}" ]]; then
      ROOT_DISK="$(basename "${ROOT_SRC}" | sed -E 's/p?[0-9]+$//')"
    fi
  fi

  FILTERED=()
  for d in "${CANDIDATES[@]:-}"; do
    [[ -z "${d}" ]] && continue
    if [[ -n "${ROOT_DISK}" && "${d}" == "${ROOT_DISK}" ]]; then
      warn "Skipping /dev/${d} — it hosts the root filesystem."
      continue
    fi
    # Skip if any partition is already mounted
    if lsblk -n -o MOUNTPOINT "/dev/${d}" | grep -q '/'; then
      warn "Skipping /dev/${d} — already has mounted partitions."
      continue
    fi
    FILTERED+=("${d}")
  done

  if [[ ${#FILTERED[@]} -eq 0 ]]; then
    err "No suitable ~240GB unmounted data disk found."
    err "Mount your data disk at ${DATA_MOUNT} manually, or re-run with SKIP_DISK=1."
    exit 1
  fi

  if [[ ${#FILTERED[@]} -gt 1 ]]; then
    warn "Multiple candidate disks found: ${FILTERED[*]}"
  fi

  DATA_DISK="${FILTERED[0]}"
  DATA_DEV="/dev/${DATA_DISK}"
  SIZE_H="$(lsblk -dn -o SIZE "${DATA_DEV}")"
  MODEL_H="$(lsblk -dn -o MODEL "${DATA_DEV}" | xargs || true)"

  echo
  warn "================================================================="
  warn " ABOUT TO WIPE AND FORMAT: ${DATA_DEV}"
  warn " Size:  ${SIZE_H}"
  warn " Model: ${MODEL_H:-unknown}"
  warn " Mount: ${DATA_MOUNT} (ext4)"
  warn " This will DESTROY ALL DATA on ${DATA_DEV}."
  warn " The 128GB system disk must NOT be selected."
  warn "================================================================="
  echo
  read -r -p "Type the device path exactly (${DATA_DEV}) to confirm: " CONFIRM
  if [[ "${CONFIRM}" != "${DATA_DEV}" ]]; then
    err "Confirmation mismatch. Aborting without changes."
    exit 1
  fi

  log "Partitioning ${DATA_DEV}..."
  # Wipe signatures and create a single GPT partition
  wipefs -a "${DATA_DEV}" || true
  parted -s "${DATA_DEV}" mklabel gpt
  parted -s "${DATA_DEV}" mkpart primary ext4 1MiB 100%

  # Resolve partition name (nvme: p1, sata: 1)
  if [[ "${DATA_DISK}" == nvme* ]] || [[ "${DATA_DISK}" == mmcblk* ]]; then
    PART="${DATA_DEV}p1"
  else
    PART="${DATA_DEV}1"
  fi

  # Wait for udev
  sleep 2
  udevadm settle || true
  if [[ ! -b "${PART}" ]]; then
    err "Partition ${PART} did not appear."
    exit 1
  fi

  log "Formatting ${PART} as ext4..."
  mkfs.ext4 -F -L fund_data "${PART}"

  mkdir -p "${DATA_MOUNT}"
  UUID="$(blkid -s UUID -o value "${PART}")"
  if [[ -z "${UUID}" ]]; then
    err "Could not read UUID of ${PART}."
    exit 1
  fi

  # Idempotent fstab entry
  if grep -qE "[[:space:]]${DATA_MOUNT}[[:space:]]" /etc/fstab; then
    warn "fstab already has an entry for ${DATA_MOUNT} — leaving it unchanged."
  else
    echo "UUID=${UUID} ${DATA_MOUNT} ext4 defaults,nofail 0 2" >> /etc/fstab
    log "Added ${DATA_MOUNT} to /etc/fstab (UUID=${UUID})."
  fi

  mount "${DATA_MOUNT}"
  log "Mounted ${PART} at ${DATA_MOUNT}."
}

create_data_dirs() {
  log "Creating data directories under ${DATA_MOUNT}..."
  mkdir -p \
    "${DATA_MOUNT}/postgres" \
    "${DATA_MOUNT}/uploads" \
    "${DATA_MOUNT}/backups" \
    "${DATA_MOUNT}/fastembed"
  chmod 755 "${DATA_MOUNT}/postgres" "${DATA_MOUNT}/uploads" "${DATA_MOUNT}/backups" "${DATA_MOUNT}/fastembed"
}

# ---------------------------------------------------------------------------
# 2) System packages + Docker CE
# ---------------------------------------------------------------------------
install_packages() {
  log "Updating apt and installing base packages..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y \
    ca-certificates curl gnupg lsb-release git ufw \
    parted util-linux
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker and Compose plugin already installed."
    docker --version
    docker compose version
    return 0
  fi

  log "Installing Docker CE and Compose plugin..."
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo \
    "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
  log "Compose: $(docker compose version)"
}

# ---------------------------------------------------------------------------
# 3) Ollama
# ---------------------------------------------------------------------------
install_ollama() {
  if [[ "${SKIP_OLLAMA:-0}" == "1" ]]; then
    warn "SKIP_OLLAMA=1 — skipping Ollama."
    return 0
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    log "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
  else
    log "Ollama already installed: $(ollama --version 2>/dev/null || true)"
  fi

  # Prefer project unit if present; otherwise use vendor unit + override
  if [[ -f "${SCRIPT_DIR}/systemd/ollama.service" ]]; then
    log "Installing project ollama.service unit..."
    cp "${SCRIPT_DIR}/systemd/ollama.service" /etc/systemd/system/ollama.service
  fi

  mkdir -p /etc/systemd/system/ollama.service.d
  cat > /etc/systemd/system/ollama.service.d/override.conf <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

  systemctl daemon-reload
  systemctl enable --now ollama
  sleep 2
  systemctl is-active --quiet ollama && log "Ollama service is active." || warn "Ollama service not active yet."

  log "Pulling model ${OLLAMA_MODEL} (this may take several minutes)..."
  ollama pull "${OLLAMA_MODEL}"
}

# ---------------------------------------------------------------------------
# 4) App clone, .env, compose paths & memory limits
# ---------------------------------------------------------------------------
clone_repo() {
  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Repo already present at ${APP_DIR} — pulling latest..."
    git -C "${APP_DIR}" fetch --all --prune
    git -C "${APP_DIR}" checkout main
    git -C "${APP_DIR}" pull --ff-only origin main || warn "git pull failed — continuing with existing tree."
  else
    log "Cloning ${REPO_URL} → ${APP_DIR}..."
    mkdir -p "$(dirname "${APP_DIR}")"
    git clone --branch main "${REPO_URL}" "${APP_DIR}"
  fi
}

generate_env() {
  local env_file="${APP_DIR}/.env"
  if [[ -f "${env_file}" ]]; then
    warn ".env already exists at ${env_file} — not overwriting secrets."
    # shellcheck disable=SC1090
    set -a; source "${env_file}"; set +a
    SECRET_KEY="${SECRET_KEY:-}"
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
    if [[ -z "${SECRET_KEY}" || -z "${POSTGRES_PASSWORD}" ]]; then
      err ".env exists but SECRET_KEY / POSTGRES_PASSWORD missing. Fix manually."
      exit 1
    fi
    return 0
  fi

  log "Generating strong SECRET_KEY and POSTGRES_PASSWORD..."
  SECRET_KEY="$(openssl rand -base64 48 | tr -d '\n/=+' | head -c 64)"
  POSTGRES_PASSWORD="$(openssl rand -base64 32 | tr -d '\n/=+' | head -c 32)"

  cat > "${env_file}" <<EOF
# Generated by deploy_fund_portal.sh — keep secret
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=fund_portal
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/fund_portal
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
AUDIT_RETENTION_MONTHS=12
CORS_ORIGINS=http://${SERVER_IP}:3000,http://localhost:3000,http://127.0.0.1:3000
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=${OLLAMA_MODEL}
TEMPLATES_DIR=/templates/documents
FASTEMBED_CACHE_DIR=/app/cache/fastembed
EOF
  chmod 600 "${env_file}"
  log "Wrote ${env_file}"
}

write_compose_override() {
  # Prefer override so upstream docker-compose.yml stays intact for git pulls.
  local override="${APP_DIR}/docker-compose.override.yml"
  log "Writing ${override} (/data volumes + memory limits)..."

  # shellcheck disable=SC1090
  set -a; source "${APP_DIR}/.env"; set +a

  cat > "${override}" <<EOF
# Generated by deploy_fund_portal.sh — bind mounts on ${DATA_MOUNT} + mem limits
services:
  db:
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
      POSTGRES_DB: ${POSTGRES_DB:-fund_portal}
    volumes:
      - ${DATA_MOUNT}/postgres:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 2G
    mem_limit: 2g

  backend:
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-fund_portal}
      SECRET_KEY: "${SECRET_KEY}"
      ALGORITHM: HS256
      ACCESS_TOKEN_EXPIRE_MINUTES: "${ACCESS_TOKEN_EXPIRE_MINUTES:-15}"
      REFRESH_TOKEN_EXPIRE_DAYS: "${REFRESH_TOKEN_EXPIRE_DAYS:-7}"
      AUDIT_RETENTION_MONTHS: ${AUDIT_RETENTION_MONTHS:-12}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://${SERVER_IP}:3000,http://localhost:3000,http://127.0.0.1:3000}
      TEMPLATES_DIR: /templates/documents
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen2.5:7b-instruct-q4_K_M}
      FASTEMBED_CACHE_DIR: /app/cache/fastembed
    volumes:
      - ${DATA_MOUNT}/uploads:/app/uploads
      - ${DATA_MOUNT}/fastembed:/app/cache/fastembed
      - ./templates/documents/source:/templates/documents/source
      - ./templates/documents/metadata:/templates/documents/metadata:ro
    deploy:
      resources:
        limits:
          memory: 2G
    mem_limit: 2g

  frontend:
    deploy:
      resources:
        limits:
          memory: 512M
    mem_limit: 512m
EOF
  chmod 600 "${override}"
}

install_helper_scripts() {
  log "Installing helper scripts to ${APP_DIR}/scripts/deploy..."
  mkdir -p "${APP_DIR}/scripts/deploy/systemd"
  cp -f "${SCRIPT_DIR}/backup_db.sh" "${APP_DIR}/scripts/deploy/backup_db.sh"
  cp -f "${SCRIPT_DIR}/update_portal.sh" "${APP_DIR}/scripts/deploy/update_portal.sh"
  chmod +x "${APP_DIR}/scripts/deploy/backup_db.sh" "${APP_DIR}/scripts/deploy/update_portal.sh"

  # Convenience symlinks
  ln -sfn "${APP_DIR}/scripts/deploy/backup_db.sh" /usr/local/bin/fund-portal-backup
  ln -sfn "${APP_DIR}/scripts/deploy/update_portal.sh" /usr/local/bin/fund-portal-update
}

install_systemd_units() {
  log "Installing systemd units..."
  if [[ -f "${SCRIPT_DIR}/systemd/fund-portal.service" ]]; then
    cp "${SCRIPT_DIR}/systemd/fund-portal.service" /etc/systemd/system/fund-portal.service
  fi
  if [[ -f "${SCRIPT_DIR}/systemd/ollama.service" ]]; then
    cp "${SCRIPT_DIR}/systemd/ollama.service" /etc/systemd/system/ollama.service
  fi
  systemctl daemon-reload
  systemctl enable fund-portal.service
  systemctl enable ollama.service || true
}

configure_ufw() {
  log "Configuring UFW (22, 3000, 8000, 11434)..."
  ufw allow 22/tcp comment 'SSH'
  ufw allow 3000/tcp comment 'Fund Portal frontend'
  ufw allow 8000/tcp comment 'Fund Portal API'
  ufw allow 11434/tcp comment 'Ollama'
  ufw --force enable
  ufw status verbose
}

start_stack() {
  log "Building and starting Docker Compose stack..."
  cd "${APP_DIR}"
  docker compose up -d --build

  log "Waiting for backend health..."
  local i
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
      log "Backend is healthy."
      break
    fi
    sleep 5
    if [[ "${i}" -eq 60 ]]; then
      warn "Backend health check timed out — check: docker compose -f ${APP_DIR}/docker-compose.yml logs backend"
    fi
  done

  log "Running Alembic migrations..."
  docker compose exec -T backend alembic upgrade head || warn "Alembic migration returned non-zero."

  docker compose ps
}

print_summary() {
  echo
  log "=== DEPLOYMENT COMPLETE ==="
  echo "  Portal:   http://${SERVER_IP}:3000"
  echo "  API:      http://${SERVER_IP}:8000"
  echo "  Ollama:   http://${SERVER_IP}:11434"
  echo "  App dir:  ${APP_DIR}"
  echo "  Data:     ${DATA_MOUNT}/{postgres,uploads,backups}"
  echo "  Secrets:  ${APP_DIR}/.env  (chmod 600)"
  echo
  echo "  Backup:   sudo fund-portal-backup"
  echo "  Update:   sudo fund-portal-update"
  echo "  Status:   systemctl status fund-portal ollama"
  echo
}

main() {
  require_root
  log "Starting Fund Portal deployment..."

  prepare_data_disk
  create_data_dirs
  install_packages
  install_docker
  install_ollama
  clone_repo
  generate_env
  write_compose_override
  install_helper_scripts
  install_systemd_units
  configure_ufw
  start_stack
  print_summary
}

main "$@"
