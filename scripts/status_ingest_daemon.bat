@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 訂單自動匯入守護進程狀態檢查

echo ========================================================
echo   盛隆瓦斯 — 訂單自動入單守護進程運行狀態
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check_daemon.ps1"

echo.
echo ========================================================
pause
