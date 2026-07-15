# Запуск frontend для доступа из локальной сети (0.0.0.0:3000)
Set-Location "$PSScriptRoot\..\frontend"
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object -First 1).IPAddress
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
if ($ip) { Write-Host "Из сети:   http://${ip}:3000" -ForegroundColor Green }
npm run dev
