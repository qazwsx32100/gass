@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 安裝每晚 21:05 雲端自動同步排程
color 0B

echo ===============================================================================
echo   👑 盛隆瓦斯 門市 ERP 夜間自動同步排程安裝工具 (21:05)
echo ===============================================================================
echo.

:: 檢查系統管理員權限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️ 正在請求系統管理員權限以註冊 Windows 工作排程器...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

:: 建立日誌資料夾
if not exist "logs" mkdir "logs"

:: 尋找可用之 Node.js
set "NODE_CMD=node.exe"
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
) else if exist "D:\test\tools\node\node.exe" (
    set "NODE_CMD=D:\test\tools\node\node.exe"
)

:: 產出靜默執行 VBS 腳本 (確保 21:05 背景執行時絕不彈出黑色命令提示字元視窗干擾門市)
set "VBS_SCRIPT=%~dp0run-silent.vbs"
(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%~dp0"
echo WshShell.Run """%NODE_CMD%"" sync-cloud-mirror.cjs", 0, False
) > "%VBS_SCRIPT%"

set "TASK_NAME=ShengLong_Nightly_Cloud_Mirror"
set "ACTION_CMD=wscript.exe \"%VBS_SCRIPT%\""

echo 正在將排程註冊至 Windows 工作排程器...
echo ・排程名稱: %TASK_NAME%
echo ・執行時間: 每日 21:05 (打烊後自動鏡像)
echo ・執行檔案: %ACTION_CMD%
echo.

schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "%ACTION_CMD%" /sc daily /st 21:05 /ru "SYSTEM" /f >nul 2>&1

if %errorlevel% neq 0 (
    :: 若 SYSTEM 失敗，改用目前登入使用者建立
    schtasks /create /tn "%TASK_NAME%" /tr "%ACTION_CMD%" /sc daily /st 21:05 /f >nul 2>&1
)

if %errorlevel% equ 0 (
    color 0A
    echo ===============================================================================
    echo   ✅ 恭喜！夜間 21:05 自動同步排程已成功安裝！
    echo   系統每晚打烊時 (21:05) 會自動將門市客戶主檔與訂單寫入 Supabase 雲端資料庫。
    echo   全程於背景靜默執行，絕不干擾店面打單與電腦使用。
    echo ===============================================================================
) else (
    color 0C
    echo ❌ 安裝失敗，請以「系統管理員身分」右鍵執行此批次檔。
)

echo.
echo 請按任意鍵結束...
pause >nul
