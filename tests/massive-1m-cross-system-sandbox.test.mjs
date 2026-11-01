/**
 * massive-1m-cross-system-sandbox.test.mjs
 * 盛隆瓦斯 - 1,000,000 筆全系統跨維度沙盒壓力測試自動化回歸套件
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildDispatchWritebackSql } = require("c:/shenglong-next/lib/erp-writeback-engine.cjs");

test("1M Sandbox: 1,000,000 筆跨系統事件串流無死角壓測", (t) => {
  const TOTAL_RECORDS = 1000000;
  const CHUNK_SIZE = 100000;
  const CHUNKS = TOTAL_RECORDS / CHUNK_SIZE;

  let totalProcessed = 0;
  let lineOrdersCount = 0;
  let driverActionsCount = 0;
  let operationsEditsCount = 0;
  let callerIdOrdersCount = 0;
  let newErpOrdersCount = 0;
  let syntaxErrors = 0;

  const startTime = Date.now();

  for (let c = 0; c < CHUNKS; c++) {
    const offset = c * CHUNK_SIZE;
    for (let i = 0; i < CHUNK_SIZE; i++) {
      const globalId = offset + i + 1;

      if (globalId <= 250000) {
        // LINE 官方帳號下單 (250,000)
        const job = {
          orderId: 0,
          action: "create",
          payload: {
            lineOrderId: `LINE_${globalId}`,
            phone: "0912345678",
            address: "新北市三重區文化北路",
            driver: "小龍",
            spec: "20kg",
            quantity: 1,
          },
        };
        const res = buildDispatchWritebackSql(job);
        if (res.sql && res.sql.includes("INSERT INTO dbo.gas_oders")) {
          lineOrdersCount++;
        } else {
          syntaxErrors++;
        }
      } else if (globalId <= 500000) {
        // 司機 App 配送回寫 (250,000)
        const job = {
          orderId: 360000 + (i % 50000),
          action: "deliver",
          payload: {
            driver: "游柏林",
            emptyReturned: 2,
            paymentMethod: "transfer",
            collectedAmount: 850,
          },
        };
        const res = buildDispatchWritebackSql(job);
        if (res.sql && res.sql.includes("WITH (ROWLOCK)") && res.sql.includes("UPDATE dbo.gas_oders")) {
          driverActionsCount++;
        } else {
          syntaxErrors++;
        }
      } else if (globalId <= 700000) {
        // 監控戰情中心修改 (200,000)
        const job = {
          orderId: 360000 + (i % 40000),
          action: "remarks",
          payload: { remarks: "改電聯放門口" },
        };
        const res = buildDispatchWritebackSql(job);
        if (res.sql && res.sql.includes("WITH (ROWLOCK)")) {
          operationsEditsCount++;
        } else {
          syntaxErrors++;
        }
      } else if (globalId <= 850000) {
        // JM489 來電彈屏轉單 (150,000)
        const job = {
          orderId: 0,
          action: "create",
          payload: {
            lineOrderId: `CALL_${globalId}`,
            phone: "29725559",
            address: "新北市三重區龍濱路47號",
            driver: "小龍",
            spec: "20kg",
            quantity: 1,
          },
        };
        const res = buildDispatchWritebackSql(job);
        if (res.sql && res.sql.includes("INSERT INTO dbo.gas_oders")) {
          callerIdOrdersCount++;
        } else {
          syntaxErrors++;
        }
      } else {
        // 新 ERP 雲端開單 (150,000)
        const job = {
          orderId: 0,
          action: "create",
          payload: {
            lineOrderId: `ERP_${globalId}`,
            phone: "29763869",
            address: "新北市三重區自強路",
            driver: "待派工",
            spec: "20kg",
            quantity: 2,
          },
        };
        const res = buildDispatchWritebackSql(job);
        if (res.sql && res.sql.includes("INSERT INTO dbo.gas_oders")) {
          newErpOrdersCount++;
        } else {
          syntaxErrors++;
        }
      }
      totalProcessed++;
    }
  }

  const duration = Date.now() - startTime;

  assert.equal(totalProcessed, 1000000, "必須精準處理 1,000,000 筆");
  assert.equal(lineOrdersCount, 250000, "LINE 訂單應為 250,000 筆");
  assert.equal(driverActionsCount, 250000, "司機回寫應為 250,000 筆");
  assert.equal(operationsEditsCount, 200000, "監控中心修改應為 200,000 筆");
  assert.equal(callerIdOrdersCount, 150000, "來電轉單應為 150,000 筆");
  assert.equal(newErpOrdersCount, 150000, "新 ERP 開單應為 150,000 筆");
  assert.equal(syntaxErrors, 0, "語法與型別錯誤必須為 0");
  assert.ok(duration < 15000, `百萬筆壓測應在 15 秒內完成，實際: ${duration}ms`);
});
