@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 卸載夜間自動同步排程
color 0E

echo ===============================================================================
echo   👑 盛隆瓦斯 門市 ERP 夜間自動同步排程卸載工具
echo ===============================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️ 正在請求系統管理員權限以移除工作排程...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

set "TASK_NAME=ShengLong_Nightly_Cloud_Mirror"

schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

if %errorlevel% equ 0 (
    echo ✅ 已成功刪除排程 [%TASK_NAME%]。
) else (
    echo ℹ️ 找不到排程 [%TASK_NAME%]，可能先前尚未安裝或已被移除。
)

echo.
echo 請按任意鍵結束...
pause >nul
