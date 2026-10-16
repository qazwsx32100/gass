@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 停止 LINE 訂單自動匯入守護進程

echo ========================================================
echo   盛隆瓦斯 — 停止訂單自動入單守護進程
echo ========================================================
echo.

powershell -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*shenglong_order_ingest_daemon.py*' }; if ($procs) { foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force; Write-Host '[成功] 已終止守護進程 PID:' $p.ProcessId } } else { Write-Host '[提示] 目前沒有正在運行的守護進程。' }"

echo.
echo 已完成操作。
timeout /t 3 >nul
