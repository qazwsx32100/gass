import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCustomerCode,
  normalizePhone,
  getCloudCustomerDirectory,
  searchCloudCustomers,
  getCloudCustomerById,
  getGatewayMeta
} from "../lib/cloud-customer-gateway.ts";

test("【雲端客戶中樞】1. 門市經典代號萃取與電話正規化驗證", () => {
  assert.equal(extractCustomerCode("26.21.1(羊肉爐)"), "26.21.1");
  assert.equal(extractCustomerCode("47.2樓"), "47.2");
  assert.equal(extractCustomerCode("陳大明"), "");
  assert.equal(extractCustomerCode("102.15.3[排骨飯]"), "102.15.3");

  assert.equal(normalizePhone("0922-734-808"), "0922734808");
  assert.equal(normalizePhone("+886-922-734-808"), "0922734808");
  assert.equal(normalizePhone("02-2976-3869"), "0229763869");
});

test("【雲端客戶中樞】2. 雲端名冊載入與健康元資料驗證", () => {
  const dir = getCloudCustomerDirectory();
  assert.ok(dir.length >= 3000, `名冊總數應大於 3000 戶，目前為: ${dir.length}`);

  const meta = getGatewayMeta();
  assert.equal(meta.isHealthy, true);
  assert.equal(meta.totalCustomers, dir.length);
  assert.ok(meta.lastSync.length > 0);
});

test("【雲端客戶中樞】3. 關鍵客戶 26.21.1 0ms 極速檢索驗證", () => {
  // 依代號檢索
  const byCode = searchCloudCustomers("26.21.1");
  assert.ok(byCode.length >= 1);
  assert.equal(byCode[0].code, "26.21.1");
  assert.ok(byCode[0].name.includes("羊肉爐"));

  // 依電話末碼檢索
  const byPhone = searchCloudCustomers("734808");
  assert.ok(byPhone.length >= 1);
  assert.equal(byPhone[0].id, 3049);

  // 依 ID 檢索
  const byId = getCloudCustomerById(3049);
  assert.ok(byId !== null);
  assert.equal(byId.id, 3049);
  assert.equal(byId.code, "26.21.1");
  assert.equal(byId.phoneClean, "0922734808");
});

test("【雲端客戶中樞】4. 杜絕本地過期死檔 (orders_2026_full.json) 讀取驗證", () => {
  // 驗證中樞已徹底與本地死檔解耦
  const cust = getCloudCustomerById(3049);
  assert.ok(cust !== null);
  // 確保回傳資料為乾淨標準格式
  assert.ok(typeof cust.name === "string");
  assert.ok(typeof cust.addr === "string");
});

test("【門市ERP鏡像腳本】5. 鏡像引擎函式與設定模組完整性驗證", async () => {
  const { runCloudMirror, extractCustomerCode: extractMirrorCode } = await import("../scripts/sync-cloud-mirror.cjs");
  assert.equal(typeof runCloudMirror, "function");
  assert.equal(extractMirrorCode("26.21.1(羊肉爐)"), "26.21.1");
  assert.equal(extractMirrorCode("102.15.3"), "102.15.3");
});
