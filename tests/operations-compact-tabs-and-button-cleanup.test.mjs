import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛡️ 盛隆監控中心 派工頁面按鈕精簡 ✕ 子分頁高密度排版全鏈路驗證", async (t) => {
  const operationsPagePath = path.resolve("c:/shenglong-next/app/operations/page.tsx");
  const opsContent = fs.readFileSync(operationsPagePath, "utf-8");

  await t.test("1. 上方 5 大冗餘按鈕 (路線分群、複製 Line、CSV、車隊大地圖、打烊日結) 已全數自派工區頂部徹底移除", () => {
    // 檢查在訂單派工區中，不再有原先之快捷操作按鈕列
    assert.doesNotMatch(
      opsContent,
      /快捷操作按鈕列（在手機版獨立第二行橫向滑動/
    );

    // 確保原先的 5 顆按鈕結構不在派工頂部橫幅內
    assert.doesNotMatch(
      opsContent,
      /<button\s+onClick=\{\(\) => handleTabChange\("MAP"\)\}[^>]*>\s*<span>🗺️<\/span>\s*<span>車隊大地圖<\/span>/
    );
    assert.doesNotMatch(
      opsContent,
      /<span>CSV<\/span>/
    );
    assert.doesNotMatch(
      opsContent,
      /<span>\{copiedSuccess \? "已複製" : "複製 Line"\}<\/span>/
    );
    assert.doesNotMatch(
      opsContent,
      /<button\s+onClick=\{\(\) => setShowSmartDispatchModal\(true\)\}[^>]*>\s*<span>🗺️<\/span>\s*<span>路線分群<\/span>/
    );
    assert.doesNotMatch(
      opsContent,
      /<button\s+onClick=\{\(\) => setShowReconcileModal\(true\)\}[^>]*>\s*<span>🧾<\/span>\s*<span>打烊日結<\/span>/
    );
  });

  await t.test("2. 子分頁切換器 (今日即時派工、歷史訂單紀錄、雙軌自動對帳) 升級為高密度精簡分段器 (Segmented Control)，徹底節省空間", () => {
    // 檢查高效精簡分段器標記
    assert.match(opsContent, /今日即時派工 ✕ 📜 歷史訂單 ✕ ⚖️ 雙軌自動對帳 高效精簡分段器/);

    // 檢查分段器容器樣式：極簡內距與緊湊圓角
    assert.match(opsContent, /padding:\s*"3px"/);
    assert.match(opsContent, /borderRadius:\s*"10px"/);

    // 檢查 3 個子分頁按鈕精簡格式 (padding 大幅縮減)
    assert.match(opsContent, /padding:\s*isAppExperience\s*\?\s*"4px 8px"\s*:\s*"5px 12px"/);
    assert.match(opsContent, /fontSize:\s*isAppExperience\s*\?\s*"12px"\s*:\s*"13px"/);

    // 檢查 3 大標籤文字與微型角標
    assert.match(opsContent, /<span>今日即時派工<\/span>/);
    assert.match(opsContent, /<span>歷史訂單紀錄<\/span>/);
    assert.match(opsContent, /<span>雙軌自動對帳<\/span>/);
  });

  await t.test("3. 毫秒級 SSE 串流推播燈平滑融合於分段器右側，杜絕重複標題行佔用垂直高度", () => {
    assert.match(opsContent, /ordersSubTab === "LIVE" && \(/);
    assert.match(opsContent, /sseConnected \? "⚡ 毫秒串流" : "🔄 輪詢連線"/);
  });
});
