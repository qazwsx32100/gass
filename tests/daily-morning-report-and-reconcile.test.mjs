import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("📊 戰情自動化功能 (2-A + 2-B): 老闆 Telegram 每日晨報排程與雙軌一鍵自動批次平帳", async (t) => {
  const vercelJsonPath = path.resolve("C:/shenglong-next/vercel.json");
  const dailyReportRoutePath = path.resolve("C:/shenglong-next/app/api/telegram/daily-report/route.ts");
  const reconcileRoutePath = path.resolve("C:/shenglong-next/app/api/operations/reconcile/route.ts");
  const reconcilePanelPath = path.resolve("C:/shenglong-next/app/components/ReconciliationPanel.tsx");

  assert.ok(fs.existsSync(vercelJsonPath), "vercel.json 必須存在");
  assert.ok(fs.existsSync(dailyReportRoutePath), "daily-report route.ts 必須存在");
  assert.ok(fs.existsSync(reconcileRoutePath), "operations/reconcile route.ts 必須存在");
  assert.ok(fs.existsSync(reconcilePanelPath), "ReconciliationPanel.tsx 必須存在");

  const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
  const dailyReportContent = fs.readFileSync(dailyReportRoutePath, "utf8");
  const reconcileRouteContent = fs.readFileSync(reconcileRoutePath, "utf8");
  const reconcilePanelContent = fs.readFileSync(reconcilePanelPath, "utf8");

  await t.test("1. 驗證 Vercel Cron 包含每日 08:30 (UTC 00:30) 營運晨報排程 (2-A)", () => {
    assert.ok(Array.isArray(vercelJson.crons), "vercel.json 必須包含 crons 陣列");
    const morningCron = vercelJson.crons.find(
      (c) => c.path.includes("daily-report")
    );
    assert.ok(morningCron, "必須包含 daily-report 定時排程");
    assert.equal(morningCron.schedule, "30 0 * * *", "排程時間必須為每日 00:30 UTC (台北時間 08:30 AM)");
  });

  await t.test("2. 驗證 daily-report 路由支援 x-vercel-cron 授權放行與老闆 Telegram (8862712587)", () => {
    assert.ok(
      dailyReportContent.includes('request.headers.get("x-vercel-cron") === "1"'),
      "daily-report 必須支援 x-vercel-cron 授權"
    );
    assert.ok(
      dailyReportContent.includes("8862712587"),
      "預設推播對象必須指向老闆 Telegram ID (8862712587)"
    );
    assert.ok(
      dailyReportContent.includes("營運結算日報"),
      "報表內容必須包含營運結算日報標題"
    );
  });

  await t.test("3. 驗證 operations/reconcile 路由支援 POST batch_settle 批次自動平帳 (2-B)", () => {
    assert.ok(
      reconcileRouteContent.includes("export async function POST"),
      "reconcile route 必須提供 POST 端點"
    );
    assert.ok(
      reconcileRouteContent.includes("batch_settle"),
      "必須支援 batch_settle 動作"
    );
    assert.ok(
      reconcileRouteContent.includes("isSettled"),
      "GET 端點必須回傳 isSettled 平帳狀態"
    );
  });

  await t.test("4. 驗證 ReconciliationPanel 前端掛載一鍵全自動批次平帳按鈕與即時反饋", () => {
    assert.ok(
      reconcilePanelContent.includes("handleBatchSettle"),
      "面板必須實裝 handleBatchSettle 處理函式"
    );
    assert.ok(
      reconcilePanelContent.includes("一鍵批次平帳"),
      "面板必須呈現「一鍵批次平帳」操作按鈕"
    );
    assert.ok(
      reconcilePanelContent.includes("settleToast"),
      "平帳後必須呈現成功提示與即時重新核對"
    );
  });
});
