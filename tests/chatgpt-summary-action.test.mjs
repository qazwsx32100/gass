import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("ChatGPT Actions: OpenAPI 3.1.0 Specification Integrity", () => {
  const schemaPath = "c:/shenglong-next/public/openapi-shenglong-ai.json";
  assert.ok(fs.existsSync(schemaPath), "openapi-shenglong-ai.json must exist in public/");

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.openapi, "3.1.0", "OpenAPI version must be 3.1.0");
  assert.ok(schema.info.title.includes("盛隆瓦斯"), "Title must mention 盛隆瓦斯");
  assert.equal(schema.servers[0].url, "https://shenglong.vercel.app", "Server must point to Vercel Production");

  // Check critical operations
  const paths = schema.paths;
  assert.ok(paths["/api/ai/chatgpt/summary"], "Must define /api/ai/chatgpt/summary");
  assert.equal(paths["/api/ai/chatgpt/summary"].get.operationId, "getShengLongSummary");

  assert.ok(paths["/api/gas-stock"], "Must define /api/gas-stock");
  assert.equal(paths["/api/gas-stock"].get.operationId, "getRealtimeGasStock");

  assert.ok(paths["/api/ai/eight-departments"], "Must define /api/ai/eight-departments");
  assert.ok(paths["/api/ai/pipelines"], "Must define /api/ai/pipelines");
  assert.ok(paths["/api/ai/sales/anomalies"], "Must define /api/ai/sales/anomalies");
  assert.ok(paths["/api/ai/admin/geocode-audit"], "Must define /api/ai/admin/geocode-audit");
  assert.ok(paths["/api/ai/customer-service/audit"], "Must define /api/ai/customer-service/audit");
});

test("ChatGPT Custom GPT: Setup Guide and Master Costing Standards", () => {
  const guidePath = "c:/shenglong-next/docs/CHATGPT_CUSTOM_GPT_SETUP_GUIDE.md";
  assert.ok(fs.existsSync(guidePath), "CHATGPT_CUSTOM_GPT_SETUP_GUIDE.md must exist in docs/");

  const guide = fs.readFileSync(guidePath, "utf8");
  assert.ok(guide.includes("盛隆瓦斯 ｜ 八大 AI 戰情總裁特助"), "Must define GPT Name");
  assert.ok(guide.includes("22.63"), "Directive #3 gas cost $22.63 must be specified");
  assert.ok(guide.includes("556"), "Directive #3 residential floor $556 must be specified");
  assert.ok(guide.includes("529"), "Directive #3 commercial floor $529 must be specified");
  assert.ok(guide.includes("70"), "Standard freight $70 must be specified");
  assert.ok(guide.includes("140"), "50kg freight $140 must be specified");
  assert.ok(guide.includes("Only me"), "Must instruct setting visibility to Only me");
});
