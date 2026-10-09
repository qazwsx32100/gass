@echo off
chcp 65001 >nul
echo ========================================================
echo   正在啟動 Gemini 多帳號輪調與監控中心...
echo ========================================================
cd /d "%~dp0"
start http://localhost:3333
node server.mjs
pause
