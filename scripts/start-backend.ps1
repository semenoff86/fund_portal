# Запуск backend для доступа из локальной сети (0.0.0.0:8000)
Set-Location "$PSScriptRoot\..\backend"
Write-Host "Backend: http://0.0.0.0:8000 (доступен по IP сервера)" -ForegroundColor Cyan
.\.venv\Scripts\uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
