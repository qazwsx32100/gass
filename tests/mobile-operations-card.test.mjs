import test from "node:test";
import assert from "node:assert/strict";

import {
  extractOrderSpecs,
  parseAddressForMobile,
} from "../lib/mobile-order-parser.js";

test("📱 Mobile Card: extractOrderSpecs 結構化 rawXX 精準萃取", () => {
  const orderWithRaw = {
    id: 101,
    time: "10:30",
    name: "李先生",
    tel: "0912345678",
    addr: "新北市三重區長元街78號4樓",
    items: "20kg*1",
    price: 850,
    driver: "小龍",
    lastOrderDate: "2026-10-15",
    raw20: 2,
    raw16: 1,
  };

  const chips = extractOrderSpecs(orderWithRaw);
  assert.equal(chips.length, 2, "應解析出 2 個規格標籤");
  assert.equal(chips[0].label, "20kg × 2");
  assert.equal(chips[0].color, "#16a34a");
  assert.equal(chips[1].label, "16kg × 1");
  assert.equal(chips[1].color, "#2563eb");
});

test("📱 Mobile Card: extractOrderSpecs items 字串智能正規化備援", () => {
  const orderWithItemsStr = {
    id: 102,
    time: "11:00",
    name: "王小姐",
    tel: "0987654321",
    addr: "重新路四段120號2F",
    items: "50kg*1, 20kg*2",
    price: 3200,
    driver: "游柏林",
    lastOrderDate: "",
  };

  const chips = extractOrderSpecs(orderWithItemsStr);
  assert.equal(chips.length, 2, "應解析出 50kg 與 20kg 標籤");
  assert.equal(chips[0].label, "50kg × 1");
  assert.equal(chips[0].color, "#9333ea");
  assert.equal(chips[1].label, "20kg × 2");
  assert.equal(chips[1].color, "#16a34a");
});

test("📱 Mobile Card: parseAddressForMobile 門牌與樓層高對比分離", () => {
  const addr1 = "新北市三重區長元街78號 4樓";
  const res1 = parseAddressForMobile(addr1);
  assert.equal(res1.isSanchong, true, "應識別為三重區");
  assert.equal(res1.streetAndNumber, "長元街78號");
  assert.equal(res1.floor, "4樓");

  const addr2 = "重新路四段120號2F";
  const res2 = parseAddressForMobile(addr2);
  assert.equal(res2.isSanchong, true);
  assert.equal(res2.streetAndNumber, "重新路四段120號");
  assert.equal(res2.floor, "2F");

  const addr3 = "新北市蘆洲區中山一路50號3樓之2";
  const res3 = parseAddressForMobile(addr3);
  assert.equal(res3.isSanchong, false, "應識別為非三重區（蘆洲）");
  assert.equal(res3.district, "蘆洲區");
  assert.equal(res3.floor, "3樓之2");
});
