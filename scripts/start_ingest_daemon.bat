@echo off
chcp 65001 >nul
title 盛隆瓦斯 - LINE 訂單自動匯入舊進銷存系統守護進程 (啟動器)

echo ========================================================
echo   盛隆瓦斯 — LINE 訂單自動入單系統 (店面背景常駐)
echo ========================================================
echo.

set SCRIPT_DIR=%~dp0
set DAEMON_SCRIPT=%SCRIPT_DIR%shenglong_order_ingest_daemon.py

if not exist "%DAEMON_SCRIPT%" (
    echo [錯誤] 找不到守護進程腳本：%DAEMON_SCRIPT%
    pause
    exit /b 1
)

echo [1/3] 檢查 Python 執行環境...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 系統找不到 python.exe，請確認 Python 已安裝並加入 PATH。
    pause
    exit /b 1
)

echo [2/3] 檢查是否有既有進程在執行...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*shenglong_order_ingest_daemon.py*' } | ForEach-Object { Write-Host '[提示] 發現運行中的舊守護進程 PID:' $_.ProcessId }"

echo [3/3] 啟動訂單自動匯入常駐守護進程 (Order Ingest Daemon)...
start "盛隆瓦斯_訂單自動匯入守護進程" /min python "%DAEMON_SCRIPT%" --interval 5

echo.
echo ========================================================
echo   [成功] 守護進程已於背景啟動！
echo   每 5 秒會自動輪詢 LINE 新訂單並寫入進銷存系統。
echo   新單到達時，店面電腦將自動響鈴提示！
echo ========================================================
timeout /t 3 >nul
