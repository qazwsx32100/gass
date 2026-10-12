import asyncio
import argparse
import random
import time
import json
import os
import sys
from datetime import datetime
from playwright.async_api import async_playwright

# 確保 Windows 命令列 UTF-8 輸出正常
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

TARGET_URL = "https://shenglong-gas.vercel.app"
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stability_test_logs")
os.makedirs(LOG_DIR, exist_ok=True)

async def test_session(session_id: int, duration_seconds: int, headless: bool = True):
    """
    單次測試會話：
    1. 打開目標網頁
    2. 搜集頁面可點擊按鈕/連結
    3. 確實且安全地點擊按鈕
    4. 在頁面維持指定時間（隨機滾動與微互動，避免閒置斷線）
    5. 監控 Console 報錯、網路失敗與記憶體消耗
    """
    session_start = time.time()
    errors = []
    failed_requests = []
    buttons_clicked = 0

    print(f"\n[Worker #{session_id}] 🚀 開始執行測試，目標停留時間: {duration_seconds} 秒 ({duration_seconds/60:.1f} 分鐘)...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        # 建立 context 並設置視窗大小
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        # 監聽 Console 報錯
        page.on("console", lambda msg: errors.append(f"[Console {msg.type}] {msg.text}") if msg.type in ["error"] else None)
        page.on("pageerror", lambda exc: errors.append(f"[PageError] {exc}"))

        # 監聽網路請求失敗
        page.on("requestfailed", lambda req: failed_requests.append(f"[Network Failed] {req.method} {req.url} - {req.failure}"))

        try:
            # 1. 導航至網頁
            nav_start = time.time()
            response = await page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=60000)
            nav_time = time.time() - nav_start
            status_code = response.status if response else 0
            print(f"[Worker #{session_id}] 🌐 首頁載入完成 (Status: {status_code}, 耗時: {nav_time:.2f}s)")

            # 等待前端渲染
            await page.wait_for_timeout(2000)

            # 2. 獲取初始記憶體資訊
            try:
                mem_start = await page.evaluate("() => performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null")
            except Exception:
                mem_start = None

            # 3. 尋找並點擊可互動按鈕與連結
            # 優先搜尋 button, a, 具備 role='button' 元素
            clickables = await page.locator("button, a, [role='button']").all()
            print(f"[Worker #{session_id}] 🔍 頁面共找到 {len(clickables)} 個可點擊元件")

            for idx, el in enumerate(clickables):
                try:
                    # 檢查元素是否可見且可用
                    if await el.is_visible() and await el.is_enabled():
                        text = (await el.inner_text()).strip()
                        href = await el.get_attribute("href")
                        
                        # 過濾跳轉到外站 (如 tel:, mailto:, facebook.com, line.me 等) 以免跳出主站，或針對 target="_blank"
                        if href and any(prefix in href for prefix in ["tel:", "mailto:", "javascript:void"]):
                            continue
                        
                        # 滾動至元素並點擊
                        await el.scroll_into_view_if_needed(timeout=2000)
                        await el.click(timeout=3000)
                        buttons_clicked += 1
                        await page.wait_for_timeout(1000) # 給動畫或請求 1 秒反應時間
                except Exception as e:
                    # 某些按鈕可能因為蓋板、抽屜關閉而變得不可點擊，略過並記錄
                    pass

            # 4. 在指定時間內進行維持與隨機互動（微滾動、查看內容）
            print(f"[Worker #{session_id}] ⏳ 開始停留階段 (預計停留至剩餘時間耗盡)...")
            while (time.time() - session_start) < duration_seconds:
                # 隨機滾動模擬人類瀏覽
                scroll_y = random.randint(100, 1000)
                await page.evaluate(f"window.scrollTo({{ top: {scroll_y}, behavior: 'smooth' }})")
                await page.wait_for_timeout(random.randint(3000, 7000))
                
                # 偶爾再點擊一次頁面上的無害互動按鈕（若有輪播圖、標籤頁等）
                try:
                    active_buttons = await page.locator("button:visible").all()
                    if active_buttons:
                        target_btn = random.choice(active_buttons)
                        await target_btn.click(timeout=1500)
                        buttons_clicked += 1
                except Exception:
                    pass

                # 隨機滾回頂部
                if random.random() < 0.3:
                    await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")

            # 5. 獲取結束時的記憶體
            try:
                mem_end = await page.evaluate("() => performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null")
            except Exception:
                mem_end = None

            total_elapsed = time.time() - session_start
            mem_str = f"初始: {mem_start:.2f}MB, 結束: {mem_end:.2f}MB" if mem_start and mem_end else "不支援"
            print(f"[Worker #{session_id}] ✅ 會話結束！總停留: {total_elapsed:.1f}s | 點擊次數: {buttons_clicked} | JS Heap: {mem_str} | Errors: {len(errors)}")

            return {
                "session_id": session_id,
                "success": len(errors) == 0,
                "duration_seconds": total_elapsed,
                "buttons_clicked": buttons_clicked,
                "mem_start_mb": mem_start,
                "mem_end_mb": mem_end,
                "errors": errors,
                "failed_requests": failed_requests,
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            print(f"[Worker #{session_id}] ❌ 測試異常中斷: {e}")
            return {
                "session_id": session_id,
                "success": False,
                "duration_seconds": time.time() - session_start,
                "buttons_clicked": buttons_clicked,
                "fatal_error": str(e),
                "errors": errors,
                "failed_requests": failed_requests,
                "timestamp": datetime.now().isoformat()
            }
        finally:
            await context.close()
            await browser.close()

async def run_batch(total_runs: int, concurrency: int, min_stay_sec: int, max_stay_sec: int, headless: bool):
    print("=" * 60)
    print(f"🔥 網頁穩定性與壓力測試啟動")
    print(f"目標網址: {TARGET_URL}")
    print(f"總執行次數: {total_runs} 次")
    print(f"並發線程數 (Workers): {concurrency}")
    print(f"單次停留時間範圍: {min_stay_sec} ~ {max_stay_sec} 秒 ({min_stay_sec/60:.1f} ~ {max_stay_sec/60:.1f} 分鐘)")
    print(f"瀏覽器模式: {'無頭模式 (Headless)' if headless else '顯示視窗 (GUI)'}")
    print("=" * 60)

    semaphore = asyncio.Semaphore(concurrency)
    results = []

    async def sem_task(run_idx):
        stay_time = random.randint(min_stay_sec, max_stay_sec)
        async with semaphore:
            res = await test_session(run_idx, stay_time, headless=headless)
            results.append(res)
            # 即時寫入 log
            with open(os.path.join(LOG_DIR, "results.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps(res, ensure_ascii=False) + "\n")

    tasks = [sem_task(i + 1) for i in range(total_runs)]
    await asyncio.gather(*tasks)

    # 匯總報表
    print("\n" + "=" * 60)
    print("📊 測試完成總結報表")
    total_finished = len(results)
    success_count = sum(1 for r in results if r["success"])
    total_clicks = sum(r.get("buttons_clicked", 0) for r in results)
    all_errors = [e for r in results for e in r.get("errors", [])]

    print(f"總執行次數: {total_finished}")
    print(f"成功次數: {success_count} / {total_finished} ({success_count/total_finished*100:.1f}%)")
    print(f"累積點擊按鈕次數: {total_clicks}")
    print(f"累積攔截錯誤數: {len(all_errors)}")
    print(f"詳細報告已儲存於: {os.path.join(LOG_DIR, 'results.jsonl')}")
    print("=" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="網頁自動化按鈕點擊與穩定性壓力測試")
    parser.add_argument("--runs", type=int, default=1, help="執行總次數 (預設: 1)")
    parser.add_argument("--concurrency", type=int, default=1, help="並發 Worker 數量 (預設: 1)")
    parser.add_argument("--min-stay", type=int, default=180, help="最小停留秒數 (預設: 180 = 3分鐘)")
    parser.add_argument("--max-stay", type=int, default=600, help="最大停留秒數 (預設: 600 = 10分鐘)")
    parser.add_argument("--no-headless", action="store_true", help="關閉無頭模式以顯示瀏覽器畫面")

    args = parser.parse_args()
    asyncio.run(run_batch(
        total_runs=args.runs,
        concurrency=args.concurrency,
        min_stay_sec=args.min_stay,
        max_stay_sec=args.max_stay,
        headless=not args.no_headless
    ))
