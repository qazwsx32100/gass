import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🛵 外勤實戰功能 (1-A + 1-B): 空瓶退殘氣秤重折抵計算器與商業戶電子簽名板", async (t) => {
  const modalPath = path.resolve("C:/shenglong-next/app/components/SharedDeliveryCollectionModal.tsx");
  const driverPagePath = path.resolve("C:/shenglong-next/app/driver/page.tsx");
  const statusRoutePath = path.resolve("C:/shenglong-next/app/api/driver/orders/status/route.ts");
  const offlineStoragePath = path.resolve("C:/shenglong-next/lib/driver-offline-storage.ts");

  assert.ok(fs.existsSync(modalPath), "SharedDeliveryCollectionModal.tsx 必須存在");
  assert.ok(fs.existsSync(driverPagePath), "app/driver/page.tsx 必須存在");
  assert.ok(fs.existsSync(statusRoutePath), "driver/orders/status/route.ts 必須存在");
  assert.ok(fs.existsSync(offlineStoragePath), "driver-offline-storage.ts 必須存在");

  const modalContent = fs.readFileSync(modalPath, "utf8");
  const driverContent = fs.readFileSync(driverPagePath, "utf8");
  const statusContent = fs.readFileSync(statusRoutePath, "utf8");
  const storageContent = fs.readFileSync(offlineStoragePath, "utf8");

  await t.test("1. 驗證空瓶退殘氣秤重計算器 (1-A) 符合盛隆進價標準模型與防呆鉗制", () => {
    assert.ok(modalContent.includes("refundKg"), "彈窗必須包含 refundKg 殘氣重量狀態");
    assert.ok(modalContent.includes("refundRate"), "彈窗必須包含退殘氣費率");
    assert.ok(modalContent.includes("22.63"), "退殘氣標準費率必須嚴格遵循盛隆批發進價 $22.63/kg (Directive #3)");
    assert.ok(modalContent.includes("⚖️ 空瓶退殘氣折抵"), "彈窗必須呈現空瓶退殘氣折抵功能");
    assert.ok(modalContent.includes("Math.round"), "折抵金額必須以整數四捨五入計算");
    assert.ok(modalContent.includes("appliedRefundAmount"), "實收金額必須自動扣除殘氣折抵");
  });

  await t.test("2. 驗證商業戶 / 月結手寫電子簽名板 (1-B) Canvas 與 Base64 數據存證", () => {
    assert.ok(modalContent.includes("showSignaturePad"), "彈窗必須支援手寫簽名板開關");
    assert.ok(modalContent.includes("signatureData"), "彈窗必須維護 signatureData 簽名影像數據");
    assert.ok(modalContent.includes("<canvas"), "必須包含 HTML5 Canvas 手寫畫布");
    assert.ok(modalContent.includes("onTouchStart"), "簽名板必須支援手機觸控 (Touch Events)");
    assert.ok(modalContent.includes("清除重簽"), "必須支援一鍵清除重簽");
    assert.ok(modalContent.includes("toDataURL"), "必須轉為 DataURL 格式儲存");
  });

  await t.test("3. 驗證後端 orders/status 路由正確接收並安全沉澱雲端", () => {
    assert.ok(statusContent.includes("refundKg"), "後端必須解析 refundKg");
    assert.ok(statusContent.includes("refundAmount"), "後端必須解析 refundAmount");
    assert.ok(statusContent.includes("signatureData"), "後端必須解析 signatureData");
    assert.ok(statusContent.includes("【退殘氣:"), "後端自動標記中必須包含退殘氣明細");
    assert.ok(statusContent.includes("【已電子簽名】"), "後端自動標記中必須包含已電子簽名標記");
  });

  await t.test("4. 驗證離線寄件匣 Outbox 完整支援殘氣與簽名持久化暫存", () => {
    assert.ok(storageContent.includes("refundKg?: number;"), "OutboxAction payload 必須支援 refundKg");
    assert.ok(storageContent.includes("refundAmount?: number;"), "OutboxAction payload 必須支援 refundAmount");
    assert.ok(storageContent.includes("signatureData?: string;"), "OutboxAction payload 必須支援 signatureData");
    assert.ok(driverContent.includes("refundKg: payload.refundKg"), "司機前端結單必須傳遞 refundKg");
    assert.ok(driverContent.includes("signatureData: payload.signatureData"), "司機前端結單必須傳遞 signatureData");
  });
});
