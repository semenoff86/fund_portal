# Production frontend (после npm run build)
Set-Location "$PSScriptRoot\..\frontend"
if (-not (Test-Path ".next\BUILD_ID")) {
    Write-Host "Сначала выполните: npm run build" -ForegroundColor Yellow
    exit 1
}
Write-Host "MKK Frontend (prod): http://0.0.0.0:3000" -ForegroundColor Cyan
npx next start -H 0.0.0.0 -p 3000
