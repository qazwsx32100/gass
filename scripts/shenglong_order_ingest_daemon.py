#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
盛隆瓦斯 — LINE 訂單自動匯入舊進銷存系統 守護進程 (Order Ingest Daemon)

功能職責：
1. 定時向雲端佇列輪詢 (GET /api?action=pending-ingest-orders) 待匯入訂單
2. 比對或建立舊系統客戶資料 (dbo.customers)
3. 檢查防重入標記 (LINE#<orderId> Idempotency Key)
4. 寫入舊系統訂單主表 (dbo.gas_oders)，包含自動配號、規格數量、金額、並設置 music='T' 觸發店面電腦響鈴
5. 回填雲端 Google Sheets 狀態 (POST /api?action=mark-ingest-success)，寫入 legacyOrderId
6. 發送 Telegram 派工通知，確保人員即時掌握入單狀態
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# Windows 控制台編碼防護 (防止 cp950 遇到特殊字元報錯)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import pyodbc
import requests

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("order_ingest_daemon")


def load_env_file(env_path: Path):
    """手動解析 .env 檔案，避免依賴外部 python-dotenv 套件"""
    if not env_path.exists():
        return
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key not in os.environ:
                        os.environ[key] = val
    except Exception as e:
        logger.warning(f"讀取 .env 失敗 ({env_path}): {e}")


# 載入當前目錄與上層目錄的 .env
current_dir = Path(__file__).resolve().parent
load_env_file(current_dir / ".env")
load_env_file(current_dir.parent / ".env")
load_env_file(Path("c:/Gass/.env"))

# 系統設定
API_BASE_URL = os.environ.get(
    "LINE_SYNC_API_URL",
    os.environ.get("APP_BASE_URL", "https://erp-weld-three-96.vercel.app/api"),
).rstrip("/")
SYNC_SECRET = os.environ.get(
    "INTERNAL_SYNC_SECRET",
    os.environ.get("ERP_SYNC_SECRET", "shenglong-internal-secure-sync-secret-2026"),
)
SQL_SERVER = os.environ.get("SQL_SERVER", ".\\SQLEXPRESS")
SQL_DATABASE = os.environ.get("SQL_DATABASE", "ShengLong_Inspection")
SQL_DRIVER = os.environ.get("SQL_ODBC_DRIVER", "{ODBC Driver 17 for SQL Server}")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ORDER_CHAT_ID = os.environ.get(
    "TELEGRAM_ORDER_CHAT_ID",
    os.environ.get("ADMIN_CHAT_ID", "8862712587"),
)


def get_db_connection():
    """建立 SQL Server 連線，優先使用目標庫，若不存在則退回檢查庫"""
    dbs_to_try = [SQL_DATABASE]
    if SQL_DATABASE == "ShengLong_Inspection":
        dbs_to_try.append("gas_station_ShengLong")
    else:
        dbs_to_try.append("ShengLong_Inspection")

    last_err = None
    for db in dbs_to_try:
        conn_str = (
            f"DRIVER={SQL_DRIVER};"
            f"SERVER={SQL_SERVER};"
            f"DATABASE={db};"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"
            "Connection Timeout=5;"
        )
        try:
            conn = pyodbc.connect(conn_str, autocommit=False)
            return conn, db
        except Exception as e:
            last_err = e
            continue

    raise RuntimeError(f"無法連線至 SQL Server ({SQL_SERVER}, databases={dbs_to_try}): {last_err}")


def normalize_phone(phone_str: str) -> str:
    """清理電話號碼，只保留數字"""
    return re.sub(r"\D", "", phone_str or "")


def fetch_pending_orders():
    """向雲端 API 查詢待匯入訂單"""
    url = f"{API_BASE_URL}?action=pending-ingest-orders"
    headers = {
        "x-internal-sync-secret": SYNC_SECRET,
        "User-Agent": "ShengLong-Ingest-Daemon/1.0",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok"):
                return data.get("orders", [])
            else:
                logger.warning(f"雲端佇列回傳錯誤: {data.get('message')}")
        elif resp.status_code == 403:
            logger.error("雲端佇列拒絕連線：密鑰不符 (403 Forbidden)")
        else:
            logger.warning(f"雲端佇列 HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"請求雲端佇列失敗: {e}")
    return []


def mark_order_ingest_success(order_id: str, legacy_order_id: int):
    """向雲端 API 回報匯入成功並記錄舊系統單號"""
    url = f"{API_BASE_URL}?action=mark-ingest-success"
    headers = {
        "x-internal-sync-secret": SYNC_SECRET,
        "Content-Type": "application/json",
        "User-Agent": "ShengLong-Ingest-Daemon/1.0",
    }
    now_iso = datetime.now(ZoneInfo("Asia/Taipei")).isoformat()
    payload = {
        "orderId": order_id,
        "legacyOrderId": str(legacy_order_id),
        "importedAt": now_iso,
    }
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok"):
                logger.info(f"[SUCCESS] 成功回填雲端狀態: {order_id} -> 舊系統單號 #{legacy_order_id}")
                return True
            else:
                logger.warning(f"回填雲端回傳失敗: {data.get('message')}")
        else:
            logger.warning(f"回填雲端 HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"回填雲端發生異常 ({order_id}): {e}")
    return False


def send_telegram_notify(order_id: str, legacy_order_id: int, order: dict):
    """入單成功後推播至 Telegram 派工群組"""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_ORDER_CHAT_ID:
        return

    items_text = ", ".join([f"{item.get('name')} × {item.get('quantity')}" for item in order.get("items", [])])
    if not items_text:
        items_text = "瓦斯訂單"

    now_str = datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y/%m/%d %H:%M:%S")
    text = (
        f"🔔 *【盛隆瓦斯 - 訂單自動入單成功】*\n"
        f"────────────────────────\n"
        f"📋 *進銷存單號*：`#{legacy_order_id}`\n"
        f"🆔 *LINE 訂單號*：`{order_id}`\n"
        f"👤 *客戶姓名*：{order.get('customerName') or '客戶'}\n"
        f"📞 *聯絡電話*：{order.get('phone') or '無'}\n"
        f"📍 *配送地址*：{order.get('deliveryAddress') or '無'}\n"
        f"⚡ *訂購項目*：{items_text}\n"
        f"💰 *應收總額*：${order.get('total', 0)}\n"
        f"📝 *備註*：{order.get('note') or '無'}\n"
        f"⏰ *入庫時間*：{now_str}\n"
        f"────────────────────────\n"
        f"💻 店面電腦進銷存已同步並自動響鈴提示！"
    )

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_ORDER_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
    }
    try:
        resp = requests.post(url, json=payload, timeout=5)
        if resp.status_code != 200:
            logger.warning(f"Telegram 推播失敗: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Telegram 發送異常: {e}")


def match_or_create_customer(cursor, order: dict) -> int:
    """比對電話號碼尋找客戶，若無則建立新客戶並回傳 customer_id"""
    raw_phone = order.get("phone", "")
    clean_p = normalize_phone(raw_phone)
    name = (order.get("customerName") or "LINE客戶")[:50]
    address = (order.get("deliveryAddress") or "")[:250]

    # 1. 查詢電話 (customer_tel 或 customer_remarks 包含電話)
    if clean_p:
        query_find = """
        SELECT TOP 1 customer_id FROM dbo.customers
        WHERE REPLACE(REPLACE(customer_tel, '-', ''), ' ', '') = ?
           OR customer_tel LIKE ?
           OR customer_remarks LIKE ?
        ORDER BY customer_id ASC;
        """
        cursor.execute(query_find, (clean_p, f"%{clean_p}%", f"%{clean_p}%"))
        row = cursor.fetchone()
        if row:
            return int(row[0])

    # 2. 若找不到既有客戶，建立新客戶
    query_insert = """
    INSERT INTO dbo.customers (
        location_name, customer_name, leader_name, customer_tel,
        customer_address, short_addr, customer_type, customer_remarks,
        active, pay_way
    ) VALUES (
        '總店', ?, ?, ?,
        ?, ?, '一般戶', ?,
        'T', ' '
    );
    SELECT SCOPE_IDENTITY();
    """
    short_addr = address[:50]
    remarks = f"LINE自動建檔 (UID: {order.get('lineUserId', '')[:30]})"
    cursor.execute(query_insert, (name, name, raw_phone, address, short_addr, remarks))
    cust_id = int(cursor.fetchone()[0])
    logger.info(f"[INFO] 建立新客戶 #{cust_id} ({name}, {raw_phone})")
    return cust_id


def ingest_single_order(conn, order: dict, dry_run: bool = False) -> int | None:
    """處理單筆訂單的入庫作業"""
    order_id = order.get("orderId")
    if not order_id:
        return None

    cursor = conn.cursor()

    # 1. 防重複檢查 (Idempotency Key: LINE#<orderId>，限制於最新 1,000 筆內快速比對，避免 23 萬筆全表掃描延遲)
    idempotency_key = f"LINE#{order_id}"
    query_check = """
    SELECT TOP 1 oder_id FROM (
        SELECT TOP 1000 oder_id, oder_remarks FROM dbo.gas_oders ORDER BY oder_id DESC
    ) sub WHERE oder_remarks LIKE ?
    """
    cursor.execute(query_check, (f"%{idempotency_key}%",))
    existing = cursor.fetchone()
    if existing:
        legacy_id = int(existing[0])
        logger.info(f"[INFO] 訂單 {order_id} 先前已存在於進銷存系統 (#{legacy_id})，跳過重複寫入")
        if not dry_run:
            mark_order_ingest_success(order_id, legacy_id)
        return legacy_id

    if dry_run:
        logger.info(f"[DRY-RUN] 模擬寫入訂單 {order_id} (金額: {order.get('total')})")
        return 999999

    # 2. 獲取客戶 ID
    customer_id = match_or_create_customer(cursor, order)

    # 3. 解析各規格瓦斯數量
    quantities = {
        "50kg": 0,
        "20kg": 0,
        "18kg": 0,
        "16kg": 0,
        "10kg": 0,
        "new_4kg": 0,
        "4kg": 0,
    }
    for it in order.get("items", []):
        code = str(it.get("code") or "").lower()
        qty = int(it.get("quantity") or 0)
        if "50" in code:
            quantities["50kg"] += qty
        elif "20" in code:
            quantities["20kg"] += qty
        elif "18" in code:
            quantities["18kg"] += qty
        elif "16" in code:
            quantities["16kg"] += qty
        elif "10" in code:
            quantities["10kg"] += qty
        elif "new4" in code:
            quantities["new_4kg"] += qty
        elif "4" in code:
            quantities["4kg"] += qty

    now_dt = datetime.now(ZoneInfo("Asia/Taipei"))
    oder_date = now_dt.strftime("%Y/%m/%d")
    oder_time = now_dt.strftime("%H:%M:%S")
    oder_price = int(order.get("total") or 0)

    # 組合備註 (包含原始備註與防重標籤)
    raw_note = str(order.get("note") or "").strip()
    if raw_note:
        oder_remarks = f"{raw_note[:30]} | {idempotency_key}"[:50]
    else:
        oder_remarks = idempotency_key[:50]

    caller_phone = str(order.get("phone") or "")[:50]

    # 4. 插入訂單主表 dbo.gas_oders
    query_insert = """
    INSERT INTO dbo.gas_oders (
        customer_id, location_name, oder_date, oder_time,
        oder_50kg, oder_20kg, oder_18kg, oder_16kg, oder_10kg, oder_new_4kg, oder_4kg,
        oder_price, payed, deliver, oder_remarks, pay_way,
        disable, discount, tip, type, future_oder, music, keyin, caller_phone
    ) VALUES (
        ?, '總店', ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, 'N', '稍後輸入', ?, ' ',
        'N', 0, 0, 'C', 'F', 'T', 'LINE自動', ?
    );
    SELECT SCOPE_IDENTITY();
    """

    cursor.execute(
        query_insert,
        (
            customer_id,
            oder_date,
            oder_time,
            quantities["50kg"],
            quantities["20kg"],
            quantities["18kg"],
            quantities["16kg"],
            quantities["10kg"],
            quantities["new_4kg"],
            quantities["4kg"],
            oder_price,
            oder_remarks,
            caller_phone,
        ),
    )
    new_oder_id = int(cursor.fetchone()[0])
    conn.commit()

    logger.info(f"[SUCCESS] 成功寫入舊進銷存訂單 #{new_oder_id} (LINE單號: {order_id}, 客戶: #{customer_id})")

    # 5. 回填雲端狀態
    mark_order_ingest_success(order_id, new_oder_id)

    # 6. Telegram 推播
    send_telegram_notify(order_id, new_oder_id, order)

    return new_oder_id


def run_ingest_cycle(dry_run: bool = False):
    """執行一次輪詢與匯入週期"""
    pending_orders = fetch_pending_orders()
    if not pending_orders:
        return 0

    logger.info(f"發現 {len(pending_orders)} 筆待匯入訂單，開始處理...")
    conn, db_name = get_db_connection()
    success_count = 0
    try:
        for order in pending_orders:
            order_id = order.get("orderId")
            try:
                legacy_id = ingest_single_order(conn, order, dry_run=dry_run)
                if legacy_id:
                    success_count += 1
            except Exception as e:
                conn.rollback()
                logger.error(f"處理訂單 {order_id} 失敗: {e}", exc_info=True)
    finally:
        conn.close()

    logger.info(f"匯入週期結束：成功 {success_count} / {len(pending_orders)} 筆")
    return success_count


def main():
    parser = argparse.ArgumentParser(description="盛隆瓦斯 LINE 訂單自動匯入守護進程")
    parser.add_argument("--once", action="store_true", help="僅執行一次輪詢後結束")
    parser.add_argument("--interval", type=int, default=5, help="輪詢間隔秒數 (預設 5 秒)")
    parser.add_argument("--dry-run", action="store_true", help="測試模式，不實際寫入資料庫與回填")
    args = parser.parse_args()

    logger.info("==========================================")
    logger.info("盛隆瓦斯 — LINE 訂單自動匯入進銷存 Daemon 啟動")
    logger.info(f"雲端端點: {API_BASE_URL}")
    logger.info(f"資料庫主機: {SQL_SERVER}")
    logger.info(f"模式: {'單次執行 (--once)' if args.once else f'持續守護 (每 {args.interval} 秒)'}")
    if args.dry_run:
        logger.info("[INFO] 已啟用 --dry-run 測試模式")
    logger.info("==========================================")

    # 啟動時先檢驗資料庫連線
    try:
        conn, db_name = get_db_connection()
        logger.info(f"SQL Server 連線驗證成功 (連線資料庫: {db_name})")
        conn.close()
    except Exception as e:
        logger.error(f"資料庫連線檢驗失敗: {e}")
        if not args.dry_run:
            sys.exit(1)

    if args.once:
        run_ingest_cycle(dry_run=args.dry_run)
        return

    while True:
        try:
            run_ingest_cycle(dry_run=args.dry_run)
        except Exception as e:
            logger.error(f"守護進程週期異常: {e}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
