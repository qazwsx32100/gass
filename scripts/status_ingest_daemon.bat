@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 訂單自動匯入守護進程狀態檢查

echo ========================================================
echo   盛隆瓦斯 — 訂單自動入單守護進程運行狀態
echo ========================================================
echo.

powershell -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*shenglong_order_ingest_daemon.py*' }; if ($procs) { Write-Host '🟢 守護進程正常運行中：' -ForegroundColor Green; foreach ($p in $procs) { Write-Host '   PID:' $p.ProcessId ' 啟動時間:' $p.CreationDate } } else { Write-Host '🔴 守護進程未運行！可執行 start_ingest_daemon.bat 啟動。' -ForegroundColor Red }"

echo.
echo ========================================================
pause
