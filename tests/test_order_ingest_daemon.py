#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
盛隆瓦斯 — LINE 訂單自動匯入舊進銷存系統 (Ingest Daemon) 單元與整合測試
"""

import os
import sys
import unittest
from pathlib import Path

# 將 scripts 加入 sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from shenglong_order_ingest_daemon import (
    normalize_phone,
    get_db_connection,
    ingest_single_order,
)


class TestOrderIngestDaemon(unittest.TestCase):

    def test_normalize_phone(self):
        """測試電話清理與正規化"""
        self.assertEqual(normalize_phone("0912-345-678"), "0912345678")
        self.assertEqual(normalize_phone("+886 912 345 678"), "886912345678")
        self.assertEqual(normalize_phone("(02) 2971-1234"), "0229711234")
        self.assertEqual(normalize_phone(""), "")
        self.assertEqual(normalize_phone(None), "")

    def test_db_connection_live(self):
        """測試本地 SQL Server (SQLEXPRESS) 連線功能"""
        conn, db_name = get_db_connection()
        self.assertIsNotNone(conn)
        self.assertIn(db_name, ["gas_station_ShengLong", "ShengLong_Inspection"])
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        self.assertEqual(cursor.fetchone()[0], 1)
        conn.close()

    def test_dry_run_ingest(self):
        """測試模擬入單 (Dry-Run Mode)，不造成實際資料庫變更"""
        conn, _ = get_db_connection()
        mock_order = {
            "orderId": "SL-TEST-DRYRUN-001",
            "lineUserId": "U_test_user_001",
            "customerId": "LINE-test-001",
            "customerName": "測試人員",
            "phone": "0912-999-888",
            "deliveryAddress": "新北市三重區重新路一段1號",
            "total": 755,
            "note": "測試備註",
            "items": [
                {"code": "GAS-20", "name": "桶裝瓦斯 20 公斤", "quantity": 1}
            ]
        }
        res = ingest_single_order(conn, mock_order, dry_run=True)
        self.assertEqual(res, 999999)
        conn.close()


if __name__ == "__main__":
    unittest.main()
