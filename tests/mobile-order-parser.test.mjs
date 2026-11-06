import test from "node:test";
import assert from "node:assert/strict";
import {
  extractOrderSpecs,
  parseBottlesFromOrder,
  parseAddressForMobile,
} from "../lib/mobile-order-parser.js";

test("【Gass 訂單語義解析】1. 全規格欄位精準萃取 (含 50k, 20k, 18k, 16k, 10k, 新4k, 4k)", () => {
  const order = {
    raw50: 1,
    raw20: 2,
    raw18: 1,
    raw16: 0,
    raw10: 1,
    raw_new_4: 1,
    raw4: 3,
  };

  const chips = extractOrderSpecs(order);
  const specs = chips.map((c) => c.spec);

  assert.ok(specs.includes("50kg"));
  assert.ok(specs.includes("20kg"));
  assert.ok(specs.includes("18kg"));
  assert.ok(specs.includes("10kg"));
  assert.ok(specs.includes("新4kg"));
  assert.ok(specs.includes("4kg"));

  const chip20 = chips.find((c) => c.spec === "20kg");
  assert.equal(chip20.qty, 2);
  assert.equal(chip20.label, "20kg × 2");
});

test("【Gass 訂單語義解析】2. items 自然語言手寫與 LINE 備註智慧萃取", () => {
  const textOrder = {
    items: "送二十公斤*2桶，另外要一桶10kg瓦斯和四公斤",
  };

  const chips = extractOrderSpecs(textOrder);
  const specs = chips.map((c) => c.spec);

  assert.ok(specs.includes("20kg"));
  assert.ok(specs.includes("10kg"));
  assert.ok(specs.includes("4kg"));

  const chip20 = chips.find((c) => c.spec === "20kg");
  assert.equal(chip20.qty, 2);
});

test("【Gass 訂單語義解析】3. 智能支數結算 (杜絕特規品項導致支數歸零)", () => {
  const summary1 = parseBottlesFromOrder({ raw50: 2, raw20: 3, raw18: 1 });
  assert.equal(summary1.b50, 2);
  assert.equal(summary1.bOther, 4);
  assert.equal(summary1.totalBottles, 6);
});

test("【Gass 門牌地址解析】4. 門牌階層清洗與樓層分離", () => {
  const addr1 = parseAddressForMobile("新北市三重區重新路四段53號3樓之2");
  assert.equal(addr1.district, "三重區");
  assert.equal(addr1.floor, "3樓之2");
  assert.ok(addr1.streetAndNumber.includes("重新路四段53號"));
  assert.equal(addr1.isSanchong, true);
});
