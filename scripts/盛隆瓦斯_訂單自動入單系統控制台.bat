@echo off
chcp 65001 >nul
title 盛隆瓦斯 — 訂單自動入單系統控制台
:MENU
cls
echo ========================================================
echo   盛隆瓦斯 — LINE 訂單自動匯入舊進銷存系統控制台
echo ========================================================
echo.
echo   [1] 啟動背景守護進程 (Start Daemon)
echo   [2] 檢查當前運行狀態 (Check Status)
echo   [3] 停止背景守護進程 (Stop Daemon)
echo   [4] 執行一次模擬測試 (Dry-Run Test)
echo   [5] 查看任務看板 (TODO Board)
echo   [6] 啟動門市 SQL 資料庫與即時同步 (Start SQL Server & Sync)
echo   [0] 離開 (Exit)
echo.
echo ========================================================
set /p opt="請輸入選項代號 [0-6]: "

if "%opt%"=="1" (
    call "C:\Gass\scripts\start_ingest_daemon.bat"
    goto MENU
)
if "%opt%"=="2" (
    call "C:\Gass\scripts\status_ingest_daemon.bat"
    goto MENU
)
if "%opt%"=="3" (
    call "C:\Gass\scripts\stop_ingest_daemon.bat"
    goto MENU
)
if "%opt%"=="4" (
    echo.
    echo 正在執行模擬入單測試 (Dry-Run)...
    python "C:\Gass\scripts\shenglong_order_ingest_daemon.py" --once --dry-run
    pause
    goto MENU
)
if "%opt%"=="5" (
    start notepad "C:\Users\懶\Desktop\盛隆瓦斯_進行中與待完成項目看板.md"
    goto MENU
)
if "%opt%"=="6" (
    call "C:\Users\懶\Desktop\一鍵啟動門市SQL資料庫與同步.bat"
    goto MENU
)
if "%opt%"=="0" exit
goto MENU
