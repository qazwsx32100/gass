@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 停止 LINE 訂單自動匯入守護進程

echo ========================================================
echo   盛隆瓦斯 — 停止訂單自動入單守護進程
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_daemon.ps1"

echo.
echo 已完成操作。
timeout /t 3 >nul
