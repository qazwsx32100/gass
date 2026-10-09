Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  正在啟動 Gemini 多帳號輪調與監控中心..." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Set-Location -Path $PSScriptRoot
Start-Process "http://localhost:3333"
node server.mjs
