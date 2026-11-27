import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BLUEPRINT_PATH = path.join(ROOT, "docs", "MULTI_AGENT_AI_COLLABORATIVE_DEV_BLUEPRINT.md");
const DESKTOP_MIRROR_PATH =
  "C:\\Users\\懶\\Desktop\\盛隆瓦斯_正式系統規格資產全集\\01_戰情架構與手冊\\盛隆瓦斯_多代理AI協同開發技術藍圖與執行計畫書.md";

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

test("Multi-Agent Dev Blueprint exists and has clean structure without draft duplication", () => {
  assert.ok(fs.existsSync(BLUEPRINT_PATH), "Blueprint markdown file must exist");
  const text = fs.readFileSync(BLUEPRINT_PATH, "utf8");

  assert.ok(!text.includes("多代理協協同開發"), "Draft typo/duplication must be cleaned");
  assert.ok(text.includes("```mermaid"), "Must include Mermaid architecture diagrams");
  assert.ok(text.includes("第一階段：協作中心與指令標準化"), "Must include Phase 1");
  assert.ok(text.includes("第二階段：IDE / Codespaces 與 MCP 執行環境建構"), "Must include Phase 2");
  assert.ok(text.includes("第三階段：自動化閉環整合、測試與回滾"), "Must include Phase 3");
  assert.ok(text.includes("8862712587"), "Must enforce SuperAdmin approval authority");
});

test("Embedded JSON v1.0 task payload parses cleanly and obeys ShengLong safety guardrails", () => {
  const text = fs.readFileSync(BLUEPRINT_PATH, "utf8");
  const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(jsonBlocks.length >= 2, "Must contain JSON task payload and devcontainer examples");

  const taskPayload = JSON.parse(jsonBlocks[0]);
  assert.equal(taskPayload.schemaVersion, "1.0.0");
  assert.ok(typeof taskPayload.taskId === "string" && taskPayload.taskId.startsWith("TASK-"));
  assert.ok(typeof taskPayload.idempotencyKey === "string" && taskPayload.idempotencyKey.length > 10);
  assert.ok(["L1", "L2", "L3"].includes(taskPayload.riskLevel));
  assert.equal(taskPayload.acceptanceCriteria.mustOpenPullRequest, true);
  assert.equal(taskPayload.acceptanceCriteria.allowDirectMainPush, false);
  assert.equal(taskPayload.impactAnalysis.touchesLegacyErp, false);
  assert.equal(taskPayload.safetyConstraints.noLegacyErpDdl, true);
  assert.equal(taskPayload.safetyConstraints.noDriverGpsPolling, true);
  assert.equal(taskPayload.safetyConstraints.noHardcodedSecrets, true);
  assert.ok(taskPayload.safetyConstraints.minPollingIntervalSeconds >= 60);

  const devcontainer = JSON.parse(jsonBlocks[1]);
  assert.equal(devcontainer.remoteEnv.SHENGLONG_ENV, "sandbox");
  assert.equal(devcontainer.remoteEnv.LEGACY_ERP_WRITE_ENABLED, "false");
});

test("Desktop mirror matches repository blueprint when running on dev host", (t) => {
  const desktopDir = path.dirname(DESKTOP_MIRROR_PATH);
  if (!fs.existsSync(desktopDir)) {
    t.skip("Desktop mirror directory not present in non-dev/CI environment");
    return;
  }
  assert.ok(fs.existsSync(DESKTOP_MIRROR_PATH), "Desktop mirror file must exist on dev host");
  const repoContent = fs.readFileSync(BLUEPRINT_PATH, "utf8");
  const desktopContent = fs.readFileSync(DESKTOP_MIRROR_PATH, "utf8");
  assert.equal(sha256(desktopContent), sha256(repoContent), "Desktop mirror SHA-256 must match repo copy");
});
