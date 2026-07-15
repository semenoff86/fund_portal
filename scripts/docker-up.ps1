# Запуск всего проекта в Docker
Set-Location "$PSScriptRoot\.."

Write-Host "Проверка портов 3000 и 8000..." -ForegroundColor Yellow
foreach ($port in 3000, 8000) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "  Порт $port занят процессом: $($proc.ProcessName) (PID $($conn.OwningProcess))" -ForegroundColor Red
        Write-Host "  Остановите локальный npm/uvicorn перед запуском Docker." -ForegroundColor Red
    }
}

Write-Host "`nСборка и запуск контейнеров..." -ForegroundColor Cyan
docker compose up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nГотово!" -ForegroundColor Green
    Write-Host "  Портал:  http://localhost:3000"
    Write-Host "  API:     http://localhost:8000"
    Write-Host "  Вход:    admin / admin"
}
