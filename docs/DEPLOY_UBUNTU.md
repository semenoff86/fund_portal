# Fund Portal — Ubuntu 22.04 Bare-Metal Deployment Guide

Target hardware assumed in this guide:

| Item | Value |
|------|--------|
| OS | Ubuntu 22.04 LTS (bare metal) |
| CPU | Intel Core i5 |
| RAM | 16 GB |
| System SSD | ~128 GB (OS already installed) |
| Data SSD | ~240 GB (prepared by the deploy script) |
| Example IP | `192.168.0.14` |
| LLM | Ollama `qwen2.5:7b-instruct-q4_K_M` |
| App path | `/opt/fund_portal` |
| Data path | `/data/{postgres,uploads,backups,fastembed}` |

---

## 1. Prerequisites

1. Fresh Ubuntu 22.04 with SSH access and a sudo-capable user.
2. Both SSDs visible (`lsblk`). Confirm the **128 GB** disk hosts `/` and the **240 GB** disk is empty / unused.
3. Outbound HTTPS for apt, Docker CE, GitHub, and Ollama model pulls.
4. This repository: https://github.com/semenoff86/fund_portal

Optional: set a static IP `192.168.0.14` via netplan before deploying.

---

## 2. Automated deployment (recommended)

On the server:

```bash
# Temporary clone just to get the scripts (or scp them)
sudo apt-get update -y
sudo apt-get install -y git ca-certificates curl
git clone --branch main https://github.com/semenoff86/fund_portal.git /tmp/fund_portal_bootstrap
cd /tmp/fund_portal_bootstrap

sudo bash scripts/deploy/deploy_fund_portal.sh
```

Useful overrides:

```bash
sudo SERVER_IP=192.168.0.14 bash scripts/deploy/deploy_fund_portal.sh
sudo SKIP_DISK=1 bash scripts/deploy/deploy_fund_portal.sh   # /data already mounted
sudo SKIP_OLLAMA=1 bash scripts/deploy/deploy_fund_portal.sh # install LLM later
```

### What the script does

1. **Data disk (safe)** — finds a ~240 GB unmounted disk that is **not** the root disk, shows `lsblk`, and requires you to type `/dev/sdX` (or `/dev/nvmeXnY`) exactly before wipe/format.
2. Formats **ext4**, mounts at `/data`, appends UUID entry to `/etc/fstab`.
3. Creates `/data/postgres`, `/data/uploads`, `/data/backups`, `/data/fastembed`.
4. Installs **Docker CE** + Compose plugin.
5. Installs **Ollama**, enables systemd unit, pulls `qwen2.5:7b-instruct-q4_K_M`.
6. Clones the app to `/opt/fund_portal`.
7. Generates `.env` with strong `SECRET_KEY` and `POSTGRES_PASSWORD`.
8. Writes `docker-compose.override.yml` with `/data` bind mounts and memory limits:
   - Postgres: **2 GB**
   - Backend: **2 GB**
   - Frontend: **512 MB**
9. Configures **UFW**: TCP `22`, `3000`, `8000`, `11434`.
10. Starts the stack, runs Alembic migrations, enables `fund-portal.service`.

After success:

| Service | URL |
|---------|-----|
| Frontend | http://192.168.0.14:3000 |
| API | http://192.168.0.14:8000 |
| Ollama | http://192.168.0.14:11434 |

Secrets live in `/opt/fund_portal/.env` (`chmod 600`). Do **not** commit this file.

---

## 3. Manual deployment (step-by-step)

Use this if you prefer full control or the automated script is blocked mid-way.

### 3.1 Identify the 240 GB disk

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL
findmnt -n -o SOURCE /
```

Pick the ~240G disk that does **not** contain `/`. Example: `/dev/sdb`.

**Danger:** formatting the wrong disk destroys the OS. Double-check size and that nothing is mounted from that disk.

```bash
sudo wipefs -a /dev/sdb
sudo parted -s /dev/sdb mklabel gpt
sudo parted -s /dev/sdb mkpart primary ext4 1MiB 100%
sudo mkfs.ext4 -L fund_data /dev/sdb1
sudo mkdir -p /data
UUID=$(sudo blkid -s UUID -o value /dev/sdb1)
echo "UUID=${UUID} /data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
sudo mount /data
sudo mkdir -p /data/postgres /data/uploads /data/backups /data/fastembed
```

### 3.2 Docker CE

```bash
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git ufw
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

### 3.3 Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo cp /opt/fund_portal/scripts/deploy/systemd/ollama.service /etc/systemd/system/  # after clone
# or use vendor unit + override:
sudo mkdir -p /etc/systemd/system/ollama.service.d
printf '%s\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0:11434"' \
  | sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl enable --now ollama
ollama pull qwen2.5:7b-instruct-q4_K_M
```

### 3.4 Clone app and secrets

```bash
sudo git clone --branch main https://github.com/semenoff86/fund_portal.git /opt/fund_portal
cd /opt/fund_portal

SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n/=+' | head -c 64)
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/=+' | head -c 32)

sudo tee .env >/dev/null <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=fund_portal
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/fund_portal
SECRET_KEY=${SECRET_KEY}
CORS_ORIGINS=http://192.168.0.14:3000,http://localhost:3000,http://127.0.0.1:3000
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M
EOF
sudo chmod 600 .env
```

Copy or generate `docker-compose.override.yml` as produced by `deploy_fund_portal.sh` (bind mounts under `/data` + `mem_limit`).

### 3.5 Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
sudo ufw allow 11434/tcp
sudo ufw --force enable
sudo ufw status
```

### 3.6 Start stack + migrations

```bash
cd /opt/fund_portal
sudo docker compose up -d --build
sudo docker compose exec -T backend alembic upgrade head
sudo docker compose ps
curl -sf http://127.0.0.1:8000/api/health
```

### 3.7 Enable boot autostart

```bash
sudo cp /opt/fund_portal/scripts/deploy/systemd/fund-portal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fund-portal.service
```

---

## 4. Day-2 operations

### Backup database

```bash
sudo bash /opt/fund_portal/scripts/deploy/backup_db.sh
# or (after deploy):
sudo fund-portal-backup
```

Dumps go to `/data/backups/fund_portal_YYYYMMDD_HHMMSS.sql.gz`. Only the **last 7** files are kept.

Restore example:

```bash
gunzip -c /data/backups/fund_portal_YYYYMMDD_HHMMSS.sql.gz \
  | sudo docker exec -i fund_portal_db psql -U postgres -d fund_portal
```

### Update application

```bash
sudo bash /opt/fund_portal/scripts/deploy/update_portal.sh
# or:
sudo fund-portal-update
```

This pulls `main`, runs a DB backup, rebuilds containers, and applies Alembic migrations.

### Cron (optional daily backup)

```bash
sudo crontab -e
# 02:30 every day
30 2 * * * /opt/fund_portal/scripts/deploy/backup_db.sh >> /var/log/fund_portal_backup.log 2>&1
```

### Useful commands

```bash
sudo systemctl status fund-portal ollama docker
cd /opt/fund_portal && sudo docker compose ps
sudo docker compose logs -f backend
sudo docker stats
df -h / /data
ollama list
curl -sf http://127.0.0.1:11434/api/tags
```

---

## 5. Memory budget (16 GB host)

Approximate steady-state allocation:

| Component | Limit / expectation |
|-----------|---------------------|
| OS + Docker overhead | ~1–2 GB |
| PostgreSQL (`mem_limit`) | 2 GB |
| Backend | 2 GB |
| Frontend | 512 MB |
| Ollama (qwen2.5 7B Q4) | ~5–6 GB (unit `MemoryMax=8G`) |
| Headroom | ~2–3 GB |

If the host swaps heavily, stop unused services or use a smaller quantized model.

---

## 6. Troubleshooting

| Symptom | Checks |
|---------|--------|
| Wrong disk / fear of wipe | Re-run with `SKIP_DISK=1` after manually mounting `/data`. Never confirm a device path you are unsure about. |
| `/data` empty after reboot | `sudo cat /etc/fstab`, `sudo blkid`, `sudo mount -a` |
| Backend cannot reach Ollama | `systemctl status ollama`; from container network use `host.docker.internal:11434` (compose already sets `extra_hosts`); host firewall / `OLLAMA_HOST=0.0.0.0:11434` |
| AI 503 / mock answers | `ollama list`, `ollama pull qwen2.5:7b-instruct-q4_K_M`, check `OLLAMA_MODEL` in `.env` / override |
| DB unhealthy | `docker compose logs db`; ensure `/data/postgres` permissions and disk space |
| Frontend blank / API CORS | Add LAN URL to `CORS_ORIGINS` in `.env` and override, then `docker compose up -d --force-recreate backend` |
| Port already in use | `ss -tlnp \| grep -E '3000\|8000\|11434'` |
| Compose override ignored | File must be `/opt/fund_portal/docker-compose.override.yml` next to `docker-compose.yml` |
| Migrations fail | `docker compose exec backend alembic current`; `alembic upgrade head`; restore from `/data/backups` if needed |
| Out of disk on `/` | Confirm large data lives under `/data` (`du -sh /data/*`) |

### Health endpoints

```bash
curl -sf http://127.0.0.1:8000/api/health
curl -sI http://127.0.0.1:3000 | head -5
curl -sf http://127.0.0.1:11434/api/tags | head
```

---

## 7. Security notes

- Keep `/opt/fund_portal/.env` and `docker-compose.override.yml` mode `600`; they contain DB password and `SECRET_KEY`.
- Prefer restricting UFW sources to your management LAN instead of `Anywhere` for ports `8000` / `11434` if the portal is internal-only.
- Do not expose PostgreSQL port publicly (compose does not publish `5432` by default).
- Rotate secrets periodically and take a backup before rotation.

---

## 8. File map

| Path | Role |
|------|------|
| `scripts/deploy/deploy_fund_portal.sh` | Full first-time install |
| `scripts/deploy/backup_db.sh` | DB dump + 7-day retention |
| `scripts/deploy/update_portal.sh` | Pull, backup, rebuild, migrate |
| `scripts/deploy/systemd/ollama.service` | Ollama systemd unit |
| `scripts/deploy/systemd/fund-portal.service` | Compose autostart on boot |
| `docs/DEPLOY_UBUNTU.md` | This guide |

---

## 9. Rollback sketch

1. Stop stack: `cd /opt/fund_portal && sudo docker compose down`
2. Restore DB dump into a healthy `db` container (see §4).
3. `git -C /opt/fund_portal checkout <known-good-sha>`
4. `sudo docker compose up -d --build`
5. `sudo docker compose exec -T backend alembic upgrade head` (or `downgrade` only if you know the revision history)
