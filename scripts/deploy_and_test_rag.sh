#!/usr/bin/env bash
# Deploy latest main + RAG ingest + Ollama smoke test (run on the Ubuntu VM)
set -euo pipefail

cd "$(dirname "$0")/.." 2>/dev/null || cd ~/fund_portal

echo "==> Fetch latest code"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch --all || true
  git checkout main
  git pull --ff-only origin main || {
    echo "git pull failed (HTTPS SIGILL on this Hyper-V guest?) — falling back to tarball"
    curl -fsSL https://github.com/semenoff86/fund_portal/archive/refs/heads/main.tar.gz \
      | tar -xz --strip-components=1
  }
else
  echo "No git repo — refreshing from GitHub tarball"
  curl -fsSL https://github.com/semenoff86/fund_portal/archive/refs/heads/main.tar.gz \
    | tar -xz --strip-components=1
fi

echo "==> Rebuild & restart"
sudo docker compose up -d --build

echo "==> Wait for DB"
sleep 8

echo "==> Alembic migrations"
sudo docker compose exec -T backend alembic upgrade head

echo "==> Enable pgvector + pg_trgm"
sudo docker compose exec -T db psql -U postgres -d fund_portal -c "CREATE EXTENSION IF NOT EXISTS vector;"
sudo docker compose exec -T db psql -U postgres -d fund_portal -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

echo "==> Ingest knowledge docs (idempotent)"
sudo docker compose exec -T backend python scripts/ingest_docs.py

echo "==> Ollama generate smoke test"
time curl -s http://localhost:11434/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:7b-instruct-q4_K_M","prompt":"Скажи только: OK","stream":false}' \
  | head -c 500
echo

echo "==> Health checks"
curl -sf http://127.0.0.1:8000/api/health && echo
curl -sI http://127.0.0.1:3000 | head -5

echo
echo "Done. Portal: http://192.168.0.14:3000  API: http://192.168.0.14:8000/docs"
echo "WARNING: 1 vCPU — if 7B responds >30s, set OLLAMA_MODEL=qwen2.5:3b-instruct-q4_K_M in .env / override and restart backend."
