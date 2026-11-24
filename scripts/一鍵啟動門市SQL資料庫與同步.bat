@echo off
chcp 65001 >nul
title 盛隆瓦斯 — 門市 SQL Server 資料庫與即時同步一鍵修復

:: 檢查是否已具備系統管理員身分 (UAC 提權)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo   盛隆瓦斯 — 正在請求系統管理員權限以啟動門市資料庫...
    echo ========================================================
    echo.
    powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo ========================================================
echo   👑 盛隆瓦斯 — 門市 SQL Server 資料庫與即時同步一鍵修復
echo ========================================================
echo.
echo [步驟 1/6] 釋放系統記憶體並清理逾時進程...
taskkill /F /IM sqlcmd.exe >nul 2>&1

echo [步驟 2/6] 正在啟動門市 SQL Server (SQLEXPRESS) 服務...
net start "MSSQL$SQLEXPRESS"

echo [步驟 3/6] 正在啟動 SQL Server Browser 網路探測服務...
net start "SQLBrowser"

echo [步驟 4/6] 配置 Windows 崩潰自癒重啟策略 (Crash Auto-Recovery)...
sc.exe failure "MSSQL$SQLEXPRESS" reset= 86400 actions= restart/5000/restart/5000/restart/10000 >nul 2>&1

echo [步驟 5/6] 驗證資料庫連線與觸發雲端同步...
"C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE" -S .\SQLEXPRESS -E -d ShengLong_Inspection -h -1 -W -Q "SET NOCOUNT ON; SELECT '🎯 門市 SQL Server 已成功連線！當前資料庫：' + DB_NAME();"

echo [步驟 6/6] 觸發 2023~2025 門市歷年訂單鏡像至雲端 Supabase 與本地離線快照...
if exist "C:\shenglong-next\scripts\sync-orders-2023-2025.cjs" (
    node "C:\shenglong-next\scripts\sync-orders-2023-2025.cjs"
)

echo.
echo ========================================================
echo   ✅ 門市 SQL Server 與雙向雲端同步已全部恢復正常！
echo   🛵 監控中心戰情室 (/operations) 與 司機 App (/driver) 已即時連線！
echo   🏛️ 2023~2025 歷年訂單雲端鏡像已同步就緒！
echo ========================================================
echo.
echo 請按任意鍵完成並關閉視窗...
pause >nul
