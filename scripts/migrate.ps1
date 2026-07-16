# Apply Alembic migrations (Windows PowerShell).
# Usage from repo root:
#   .\scripts\migrate.ps1
# Requires PostgreSQL reachable via DATABASE_URL (see backend/.env).

$ErrorActionPreference = "Stop"
$BackendDir = Join-Path (Split-Path -Parent $PSScriptRoot) "backend"
Set-Location $BackendDir

$python = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

Write-Host "Running alembic upgrade head in $BackendDir ..."
& $python -m alembic upgrade head
Write-Host "Migrations applied successfully."
