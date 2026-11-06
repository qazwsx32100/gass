@echo off
chcp 65001 >nul
title 盛隆瓦斯 - 門市 ERP 雲端資料鏡像自動同步工具
color 0A

echo ===============================================================================
echo   👑 盛隆瓦斯 門市 ERP 雲端唯一真理鏡像同步工具
echo   舊 ERP 零更動 (WITH NOLOCK) ｜ 直連 Supabase PostgreSQL ｜ 0ms 極速中樞
echo ===============================================================================
echo.

cd /d "%~dp0"

:: 尋找可用之 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    ) else if exist "D:\test\tools\node\node.exe" (
        set "NODE_CMD=D:\test\tools\node\node.exe"
    ) else (
        color 0C
        echo ❌ 錯誤：在此主機上找不到 Node.js 執行檔！
        echo 請先安裝 Node.js (v18 或更新版本) 再運行此工具。
        echo.
        pause
        exit /b 1
    )
) else (
    set "NODE_CMD=node"
)

echo 🚀 正在啟動鏡像寫入引擎 (Node: %NODE_CMD%)...
echo.

"%NODE_CMD%" sync-cloud-mirror.cjs

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo ===============================================================================
    echo   ✅ 恭喜！門市客戶主檔與訂單已成功寫入 Supabase 雲端唯一窗口！
    echo   外勤司機端 APP、老闆來電彈屏、監控中心與 AI 助理已即時同步最新資料。
    echo ===============================================================================
) else (
    color 0C
    echo.
    echo ===============================================================================
    echo   ⚠️ 同步過程中發生警示或未完全完成，請檢查上方輸出日誌與 sync-config.env 設定。
    echo ===============================================================================
)

echo.
echo 請按任意鍵關閉此視窗...
pause >nul
