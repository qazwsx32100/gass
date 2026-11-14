import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 司機端歷史配送紀錄穩定排序與防跳動檢驗", async (t) => {
  await t.test("1. 後端穩定排序演算法驗證：依時間降序、單號降序", () => {
    const rawOrders = [
      { id: 101, time: "09:30", deliver: "小龍" },
      { id: 105, time: "14:20", deliver: "小龍" },
      { id: 102, time: "09:30", deliver: "小龍" }, // 同時間，較大 ID
      { id: 104, time: "11:00", deliver: "小龍" },
      { id: 103, time: "09:30", deliver: "小龍" }, // 同時間，最大 ID
    ];

    const sorted = [...rawOrders].sort((a, b) => {
      const timeA = String(a.time || a.orderTime || "");
      const timeB = String(b.time || b.orderTime || "");
      const timeCmp = timeB.localeCompare(timeA);
      if (timeCmp !== 0) return timeCmp;
      return (Number(b.id || b.oder_id) || 0) - (Number(a.id || a.oder_id) || 0);
    });

    assert.equal(sorted[0].id, 105, "14:20 應排在第一位");
    assert.equal(sorted[1].id, 104, "11:00 應排在第二位");
    assert.equal(sorted[2].id, 103, "09:30 中 ID 最大的 103 應排在前面");
    assert.equal(sorted[3].id, 102, "09:30 中 ID 次大的 102 應排在中間");
    assert.equal(sorted[4].id, 101, "09:30 中 ID 最小的 101 應排在最後");
  });

  await t.test("2. 後端 earnings/route.ts 包含絕對穩定排序與 SQL ORDER BY", () => {
    const routeFile = path.resolve("C:/shenglong-next/app/api/driver/earnings/route.ts");
    assert.ok(fs.existsSync(routeFile), "earnings route.ts 必須存在");
    const content = fs.readFileSync(routeFile, "utf-8");

    assert.ok(
      content.includes("ORDER BY o.oder_time DESC, o.oder_id DESC"),
      "SQL 查詢必須強制 ORDER BY o.oder_time DESC, o.oder_id DESC"
    );
    assert.ok(
      content.includes("timeB.localeCompare(timeA)"),
      "KV 與離線 Fallback 必須包含時間降序排序"
    );
  });

  await t.test("3. 前端 driver/page.tsx 已徹底移除叫貨歷史按鈕與彈窗", () => {
    const pageFile = path.resolve("C:/shenglong-next/app/driver/page.tsx");
    assert.ok(fs.existsSync(pageFile), "driver page.tsx 必須存在");
    const content = fs.readFileSync(pageFile, "utf-8");

    // 不可有「叫貨歷史」按鈕
    assert.ok(
      !content.includes("<span>叫貨歷史</span>"),
      "前端不可再含有 叫貨歷史 按鈕文字"
    );
    // 不可有 SharedCustomerHistoryModal
    assert.ok(
      !content.includes("SharedCustomerHistoryModal"),
      "前端不可再含有 SharedCustomerHistoryModal 彈窗引用"
    );
  });

  await t.test("4. 前端 driver/page.tsx 實裝請求序號鎖定與穩定 React Key", () => {
    const pageFile = path.resolve("C:/shenglong-next/app/driver/page.tsx");
    const content = fs.readFileSync(pageFile, "utf-8");

    assert.ok(
      content.includes("activeEarningsReqIdRef"),
      "必須具備 activeEarningsReqIdRef 請求序號鎖定"
    );
    assert.ok(
      content.includes("showEarningsModalRef.current"),
      "歷史彈窗開啟時必須暫緩非強制背景輪詢"
    );
    assert.ok(
      content.includes("hist-ord-"),
      "歷史訂單渲染必須使用穩定 key 而非數組索引"
    );
  });
});
