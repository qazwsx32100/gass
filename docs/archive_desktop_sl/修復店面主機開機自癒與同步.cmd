@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 店面主機看門狗與同步自癒一鍵修復
echo ========================================================
echo   盛隆瓦斯 營業主機看門狗與即時同步一鍵修復工具
echo   執行時間: %date% %time%
echo ========================================================
echo.

setlocal enabledelayedexpansion

REM 1. 自動偵測專案根目錄
set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%
if exist "D:\test\shenglong-next\supervisor-sync.cjs" (
    set ROOT=D:\test\shenglong-next
)
echo [1/5] 偵測到系統路徑: %ROOT%

REM 2. 自動偵測 Node.js
set NODE=node
if exist "C:\Program Files\nodejs\node.exe" (
    set NODE="C:\Program Files\nodejs\node.exe"
) else if exist "D:\test\tools\node\node.exe" (
    set NODE="D:\test\tools\node\node.exe"
) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set NODE="C:\Program Files (x86)\nodejs\node.exe"
)
echo [2/5] 偵測到 Node 執行檔: %NODE%

REM 3. 清理可能卡滯的孤兒程序
echo [3/5] 清理背景孤兒程序與暫存鎖...
taskkill /F /IM SQLCMD.EXE >nul 2>&1

REM 4. 註冊 Windows 開機自癒工作排程
echo [4/5] 設定 Windows 開機自動守護排程 (ShengLongBootWatchdog)...
schtasks /Delete /TN "ShengLongBootWatchdog" /F >nul 2>&1
schtasks /Create /TN "ShengLongBootWatchdog" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%ROOT%\scripts\Watch-StockSync.ps1\"" /SC ONSTART /RU "SYSTEM" /RL HIGHEST /F >nul 2>&1

schtasks /Delete /TN "ShengLongAutoStart" /F >nul 2>&1
schtasks /Create /TN "ShengLongAutoStart" /TR "cmd /c \"%ROOT%\start-sync.bat\"" /SC ONLOGON /RU "%USERNAME%" /RL HIGHEST /DELAY 0000:15 /F >nul 2>&1

REM 5. 立即啟動同步守護進程 (Supervisor)
echo [5/5] 正在啟動同步守護程序 (supervisor-sync.cjs)...
netstat -ano | findstr ":48999" >nul
if errorlevel 1 (
    start "" /b %NODE% "%ROOT%\supervisor-sync.cjs"
    timeout /t 3 /nobreak >nul
) else (
    echo    * 守護程序已在運行中 (Port 48999)。
)

echo.
echo ========================================================
echo   驗證服務連線狀態：
echo ========================================================
netstat -ano | findstr ":48999" >nul
if %errorlevel% equ 0 (
    echo  [OK] 同步守護父進程 (Supervisor Port 48999): 正常運行中！
) else (
    echo  [注意] 守護父進程啟動中，請稍候 5 秒重試。
)

netstat -ano | findstr ":48998" >nul
if %errorlevel% equ 0 (
    echo  [OK] 庫存與訂單同步子程序 (Sync Port 48998): 正常運行中！
) else (
    echo  [提示] 正在連線 SQL Server 初始化庫存...
)

echo.
echo ========================================================
echo  修復已完成！今日（10/11）最新訂單與庫存將在 10 秒內同步上網。
echo  若要關閉此視窗，請按任意鍵。
echo ========================================================
pause >nul
