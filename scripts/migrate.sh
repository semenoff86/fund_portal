#!/usr/bin/env bash
# Convenience wrapper — delegates to backend/scripts/migrate.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "${ROOT}/backend/scripts/migrate.sh"
