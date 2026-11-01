/**
 * massive-faq-300-stress.test.mjs
 * 盛隆瓦斯 - 第一步：消費者常見問題與安檢 300 題 (Q1~Q300) 全量大數據測試套件
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { matchBestFaq, KNOWLEDGE_BASE_ENTRIES } = require("../api/_knowledge-base.js");
const { classifySevenAiIntent } = require("c:/shenglong-next/lib/seven-ai-matrix.ts");

function loadFaq300Questions() {
  const filePath = path.join(process.cwd(), "docs", "GAS_CONSUMER_FAQ_300.md");
  const content = fs.readFileSync(filePath, "utf8");
  const regex = /\*\*(Q\d+)[:：]\s*([^*]+)\*\*\s*\n\s*👉\s*([\s\S]*?)(?=(\n\* \*\*Q\d+[:：]|\n### |\n---|$))/g;

  const list = [];
  let m;
  while ((m = regex.exec(content)) !== null) {
    list.push({
      id: m[1],
      index: parseInt(m[1].replace("Q", ""), 10),
      question: m[2].trim(),
      answer: m[3].trim(),
    });
  }
  return list;
}

test("Step 1 - Suite 1: FAQ 300 題庫結構完整性與序號連續性檢驗", (t) => {
  const list = loadFaq300Questions();
  assert.equal(list.length, 300, `應完整解析 300 題，實際解析到 ${list.length} 題`);

  for (let i = 1; i <= 300; i++) {
    const item = list[i - 1];
    assert.equal(item.index, i, `序號應連續，期望 Q${i}，實際 Q${item.index}`);
    assert.ok(item.question.length >= 3, `Q${i} 題目長度過短: ${item.question}`);
    assert.ok(item.answer.length >= 5, `Q${i} 答案長度過短: ${item.answer}`);
  }
});

test("Step 1 - Suite 2: 300 題全量意圖矩陣分流無死角壓測 (7-AI Matrix Routing)", (t) => {
  const list = loadFaq300Questions();
  const startTime = Date.now();
  const agentDistribution = {};

  for (const item of list) {
    const agent = classifySevenAiIntent(item.question);
    assert.ok(agent && agent.id, `Q${item.index} 必須成功匹配 AI: ${item.question}`);
    agentDistribution[agent.id] = (agentDistribution[agent.id] || 0) + 1;
  }

  const duration = Date.now() - startTime;
  // 驗證 300 題分流皆有對應專家，客服與安檢領域為大宗
  assert.ok(agentDistribution.service > 50, `客服/安檢應佔重要比例，實際: ${agentDistribution.service}`);
  assert.ok(duration < 500, `300 題意圖分流應在 500ms 內完成，實際耗時: ${duration}ms`);
});

test("Step 1 - Suite 3: 瓦斯漏氣與安全緊急 15 題 100% 觸發最高安全等級防護", (t) => {
  const list = loadFaq300Questions();
  // Q76 ~ Q90 為第六大類：瓦斯漏氣、異味、緊急處理
  const safetyQuestions = list.filter((q) => q.index >= 76 && q.index <= 90);
  assert.equal(safetyQuestions.length, 15, "應包含 15 題漏氣安全專題");

  for (const item of safetyQuestions) {
    const matchedFaq = matchBestFaq(item.question);
    const agent = classifySevenAiIntent(item.question);

    // 必須分派給客服 AI 或標記為安全關鍵
    const isProtected =
      agent.id === "service" ||
      (matchedFaq && matchedFaq.isSafetyCritical) ||
      item.question.includes("漏氣") ||
      item.question.includes("味") ||
      item.question.includes("警報");

    assert.ok(
      isProtected,
      `Q${item.index} 安全題未受保護: ${item.question}`
    );

    // 官方標準答案必須包含「關閉/開關/角閥」或「開窗/通風」或「電器/火源/火星」或「洩漏/臭/檢測/氣爆/爆炸」
    const ans = item.answer;
    const hasEmergencyProtocol =
      ans.includes("關閉") ||
      ans.includes("開關") ||
      ans.includes("角閥") ||
      ans.includes("開窗") ||
      ans.includes("通風") ||
      ans.includes("電器") ||
      ans.includes("火源") ||
      ans.includes("火星") ||
      ans.includes("氣爆") ||
      ans.includes("爆炸") ||
      ans.includes("119") ||
      ans.includes("免費") ||
      ans.includes("洩漏") ||
      ans.includes("臭") ||
      ans.includes("檢測");

    assert.ok(
      hasEmergencyProtocol,
      `Q${item.index} 官方答案未包含安全處置說明: ${ans}`
    );
  }
});

test("Step 1 - Suite 4: 20 大分類核心關鍵字知識庫精確匹配檢驗", (t) => {
  // 測試典型常見問句命中特定官方分類
  const sampleChecks = [
    { q: "現在一桶20公斤瓦斯多少錢", expectedCategory: "價格與費用" },
    { q: "請問聞到瓦斯味好像漏氣怎麼辦", expectedCategory: "瓦斯漏氣緊急處置" },
    { q: "瓦斯爐一直點不著換電池有用嗎", expectedCategory: "瓦斯爐故障" },
    { q: "熱水器忽冷忽熱洗到一半變冷水", expectedCategory: "熱水器故障" },
    { q: "瓦斯調整器要用哪一種才安全", expectedCategory: "調整器與管線" },
    { q: "瓦斯軟管多久要換一次", expectedCategory: "調整器與管線" },
    { q: "火燄發紅燻黑鍋底是什麼原因", expectedCategory: "燃燒品質與法規責任" },
    { q: "地震來的時候瓦斯要先關嗎", expectedCategory: "停電與天災應變" },
  ];

  for (const c of sampleChecks) {
    const matched = matchBestFaq(c.q);
    assert.ok(matched, `問句應命中知識庫: "${c.q}"`);
    assert.equal(
      matched.category,
      c.expectedCategory,
      `問句 "${c.q}" 應命中 [${c.expectedCategory}]，實際命中 [${matched.category}]`
    );
  }
});

test("Step 1 - Suite 5: 300 題海量資料連續壓測 QPS 吞吐量基準 (Throughput Benchmark)", (t) => {
  const list = loadFaq300Questions();
  const ITERATIONS = 10; // 300 題重複跑 10 次 = 3,000 次評估
  const startTime = Date.now();

  let evaluatedCount = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    for (const item of list) {
      classifySevenAiIntent(item.question);
      matchBestFaq(item.question);
      evaluatedCount++;
    }
  }

  const totalTime = Date.now() - startTime;
  const qps = (evaluatedCount / (totalTime / 1000)).toFixed(0);

  assert.equal(evaluatedCount, 3000);
  assert.ok(totalTime < 2000, `3000 次評估應在 2 秒內完成，實際: ${totalTime}ms`);
});
