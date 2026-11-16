import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🏢 監控中心地址樓層呈現規範：樓層作為自然文本平實呈現，不設獨立反白標籤/膠囊", async () => {
  const filePath = path.resolve("c:/shenglong-next/app/components/SharedAddressAction.tsx");
  const code = fs.readFileSync(filePath, "utf8");

  // 1. 確認不包含過去的獨立高對比樓層膠囊 (已依使用者指令「地址樓層的部分 不用特別標籤」移除)
  assert.ok(!code.includes("獨立高亮樓層反白膠囊"), "必須移除獨立高亮樓層反白膠囊說明");
  assert.ok(!code.includes("boxShadow: \"0 1px 4px rgba(0,0,0,0.2)\""), "樓層不得有獨立膠囊陰影");
  assert.ok(!code.includes("padding: \"2px 8px\""), "樓層不得有獨立標籤 padding 膠囊樣式");

  // 2. 確認樓層已平實融合至地址主文字中
  assert.ok(code.includes("fullStreetWithFloor"), "必須定義 fullStreetWithFloor 進行地址與樓層自然平實結合");
  assert.ok(code.includes("📍 {fullStreetWithFloor}"), "必須以單一門牌地址行自然顯示");

  // 3. 驗證自然結合邏輯行為
  const tsPath = new URL("../lib/mobile-order-parser.ts", import.meta.url);
  const jsPath = new URL("../lib/mobile-order-parser.js", import.meta.url);
  const parserModule = fs.existsSync(tsPath)
    ? await import(tsPath.href)
    : await import(jsPath.href);
  const { parseAddressForMobile } = parserModule;

  const testAddrWithFloor = "新北市三重區重新路四段53號3樓之2";
  const parsed1 = parseAddressForMobile(testAddrWithFloor);
  const full1 = parsed1.floor && !parsed1.streetAndNumber.includes(parsed1.floor)
    ? `${parsed1.streetAndNumber} ${parsed1.floor}`
    : parsed1.streetAndNumber;
  assert.equal(full1, "重新路四段53號 3樓之2");

  const testAddrWithoutFloor = "新北市三重區重新路四段53號";
  const parsed2 = parseAddressForMobile(testAddrWithoutFloor);
  const full2 = parsed2.floor && !parsed2.streetAndNumber.includes(parsed2.floor)
    ? `${parsed2.streetAndNumber} ${parsed2.floor}`
    : parsed2.streetAndNumber;
  assert.equal(full2, "重新路四段53號");
});
