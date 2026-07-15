# Production backend (без --reload)
Set-Location "$PSScriptRoot\..\backend"
Write-Host "MKK Backend (prod): http://0.0.0.0:8000" -ForegroundColor Cyan
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
