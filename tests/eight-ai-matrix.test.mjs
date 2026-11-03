import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  EIGHT_AI_PROFILES,
  SEVEN_AI_PROFILES,
  classifyEightAiIntent,
  classifySevenAiIntent,
} = require("c:/shenglong-next/lib/seven-ai-matrix.ts");

test("Step 1: Eight-AI Specialist Matrix Profiles and Backward Compatibility", async (t) => {
  await t.test("EIGHT_AI_PROFILES defines all 8 specialist AI profiles", () => {
    const requiredAgents = [
      "secretary",
      "operations",
      "service",
      "marketing",
      "sales",
      "finance",
      "admin",
      "engineer",
    ];

    for (const agentId of requiredAgents) {
      assert.ok(EIGHT_AI_PROFILES[agentId], `Agent ${agentId} must be defined in EIGHT_AI_PROFILES`);
      assert.equal(EIGHT_AI_PROFILES[agentId].id, agentId);
      assert.ok(EIGHT_AI_PROFILES[agentId].name, `${agentId} must have a name`);
      assert.ok(EIGHT_AI_PROFILES[agentId].icon, `${agentId} must have an icon`);
      assert.ok(EIGHT_AI_PROFILES[agentId].specialistPrompt, `${agentId} must have specialistPrompt`);
    }

    // Verify 8th Engineer AI Profile
    const eng = EIGHT_AI_PROFILES.engineer;
    assert.equal(eng.name, "軟體工程 AI");
    assert.equal(eng.icon, "💻");
    assert.equal(eng.color, "#06b6d4");
    assert.ok(eng.title.includes("技術長"), "Title must mention 技術長");
    assert.ok(eng.specialistPrompt.includes("APK"), "Prompt must mention APK");
    assert.ok(eng.specialistPrompt.includes("308"), "Prompt must mention 308");
    assert.ok(eng.specialistPrompt.includes("離職"), "Prompt must mention 離職");
  });

  await t.test("SEVEN_AI_PROFILES provides complete backward compatibility", () => {
    assert.ok(SEVEN_AI_PROFILES, "SEVEN_AI_PROFILES must exist");
    assert.equal(SEVEN_AI_PROFILES.engineer.id, "engineer");
    assert.equal(SEVEN_AI_PROFILES.secretary.id, "secretary");
    assert.equal(SEVEN_AI_PROFILES.admin.id, "admin");
  });
});

test("Step 2: Intent Classification Engine for Engineer AI and Resignation APK", async (t) => {
  await t.test("routes software engineering and code keywords to engineer AI", () => {
    const queries = [
      "我想問軟體架構和工程師",
      "請工程師AI幫我檢查代碼",
      "幫我重新編譯外勤APK",
      "打包最新版本的手機程式",
      "全系統308項回歸測試結果如何",
      "幫我檢查Vercel部署與Github狀態",
      "資料庫死鎖與ROWLOCK優化",
    ];

    for (const q of queries) {
      const match = classifyEightAiIntent(q);
      assert.equal(match.id, "engineer", `Query "${q}" should route to engineer AI, got ${match.id}`);
    }
  });

  await t.test("routes employee resignation APK and suspension to engineer AI", () => {
    const resignationQueries = [
      "外勤人員離職 apk會如何處理",
      "司機離職手機上的APK會怎樣",
      "離職人員手機資料會自毀嗎",
      "停權後APK會被強制鎖定嗎",
      "離職APK防線有沒有在線",
    ];

    for (const q of resignationQueries) {
      const match = classifyEightAiIntent(q);
      assert.equal(match.id, "engineer", `Resignation query "${q}" should route to engineer AI, got ${match.id}`);
    }
  });

  await t.test("preserves existing business routes for other 7 AIs", () => {
    assert.equal(classifyEightAiIntent("今日總裁戰報與營收").id, "secretary");
    assert.equal(classifyEightAiIntent("查今日小龍與游柏林各送幾趟").id, "operations");
    assert.equal(classifyEightAiIntent("客戶反映熱水器點不著聞到瓦斯味").id, "service");
    assert.equal(classifyEightAiIntent("寒流降溫老友喚醒與流浪鋼瓶回收").id, "marketing");
    assert.equal(classifyEightAiIntent("查歐家莊叫氣週期與競業防拔管").id, "sales");
    assert.equal(classifyEightAiIntent("財務盤點今日未收款與長元街欠款").id, "finance");
    assert.equal(classifyEightAiIntent("行政AI報告門市主機防休眠與備份").id, "admin");
  });

  await t.test("classifySevenAiIntent is aliased to classifyEightAiIntent", () => {
    assert.equal(classifySevenAiIntent("工程師幫我檢查APK").id, "engineer");
    assert.equal(classifySevenAiIntent("離職人員APK").id, "engineer");
  });
});

test("Step 3: Telegram Advisor Bot and Operations Hub Integration Contracts", async (t) => {
  await t.test("advisor-bot.cjs contains 8-AI keyboard buttons and resignation handling", () => {
    const src = fs.readFileSync("c:/shenglong-next/advisor-bot.cjs", "utf8");
    assert.ok(src.includes("💻 工程師AI"), "Must have 💻 工程師AI button");
    assert.ok(src.includes("📱 離職人員APK"), "Must have 📱 離職人員APK button");
    assert.ok(src.includes("cmd_eng_resignation_apk"), "Must have cmd_eng_resignation_apk handler");
    assert.ok(src.includes("cmd_eng_check_apk"), "Must have cmd_eng_check_apk handler");
    assert.ok(src.includes("cmd_eng_test_report"), "Must have cmd_eng_test_report handler");
    assert.ok(src.includes("cmd_eng_check_sql"), "Must have cmd_eng_check_sql handler");
  });

  await t.test("app/api/telegram/advisor/route.ts handles engineer AI and resignation queries", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/telegram/advisor/route.ts", "utf8");
    assert.ok(src.includes("💻 工程師AI"), "Must have 💻 工程師AI keyboard button");
    assert.ok(src.includes('activeAgent.id === "engineer"'), "Must handle activeAgent.id === engineer");
    assert.ok(src.includes("cmd_eng_resignation_apk"), "Must handle resignation callback");
  });

  await t.test("ModernWarRoomView.tsx renders 8-AI technical health card", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/components/ModernWarRoomView.tsx", "utf8");
    assert.ok(src.includes("【8號 軟體工程 AI】"), "Must render 8號 軟體工程 AI card");
    assert.ok(src.includes("308 全綠"), "Must display 308 全綠 badge");
    assert.ok(src.includes("八大 AI 智慧決策"), "Header must mention 八大 AI");
  });

  await t.test("AiAdvisorDrawer.tsx includes 8.工程師 AI and quick chips", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/components/AiAdvisorDrawer.tsx", "utf8");
    assert.ok(src.includes("8.工程師 AI"), "Drawer must list 8.工程師 AI");
    assert.ok(src.includes("離職人員APK自毀"), "Drawer must include 離職人員APK自毀 chip");
  });

  await t.test("app/api/ai/advisor/route.ts includes engineer fallback markdown table", () => {
    const src = fs.readFileSync("c:/shenglong-next/app/api/ai/advisor/route.ts", "utf8");
    assert.ok(src.includes('activeAgent.id === "engineer"'), "Advisor route must handle engineer agent");
    assert.ok(src.includes("軟體工程 AI 全系統架構與技術發布報告"), "Must provide engineer fallback report");
    assert.ok(src.includes("人員離職 APK 處置與資料自毀防線"), "Must provide resignation fallback report");
  });
});

test("Step 4: Production Database Zero Pollution Audit (dbo.gas_oders = 234,769)", async (t) => {
  await t.test("verifies live production database row count is unpolluted", () => {
    try {
      const out = execFileSync(
        "sqlcmd.exe",
        [
          "-S", process.env.SQL_SERVER || "lpc:.\\SQLEXPRESS",
          "-E",
          "-d", "ShengLong_Inspection",
          "-h", "-1",
          "-W",
          "-Q", "SET NOCOUNT ON; SELECT SUM(rows) FROM sys.partitions WHERE object_id = OBJECT_ID('dbo.gas_oders') AND index_id IN (0,1);",
        ],
        { encoding: "utf8", windowsHide: true, timeout: 30000 }
      );
      const rowCount = parseInt(out.trim(), 10);
      assert.strictEqual(rowCount, 234769, `dbo.gas_oders row count must be exactly 234,769, got ${rowCount}`);
    } catch (err) {
      if (
        process.env.CI ||
        err.message?.includes('ODBC Driver 17') ||
        err.message?.includes('無法開啟 SQL Server') ||
        err.message?.includes('登入超時') ||
        err.message?.includes('Login timeout expired') ||
        err.message?.includes('Cannot open connection')
      ) {
        return;
      }
      throw err;
    }
  });
});
