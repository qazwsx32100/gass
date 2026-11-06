import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaipeiDateString,
  getTaiwanDateString,
  getTaiwanYearMonthString,
  getTaipeiYearMonth,
  getTaipeiDateTimeString,
  getTaipeiMonthRange,
  isTaipeiToday,
} from "../src/utils/taiwanDate.js";

test("【Gass 台灣時間模組】1. UTC 跨日 0 點邊界驗證 (Asia/Taipei UTC+8)", () => {
  const utcDate = new Date("2026-11-05T16:00:00.000Z");
  const twDate = getTaipeiDateString(utcDate, "-");
  assert.equal(twDate, "2026-11-06");

  assert.equal(getTaiwanDateString(utcDate), "2026-11-06");
  assert.equal(getTaiwanYearMonthString(utcDate), "2026-11");
});

test("【Gass 台灣時間模組】2. 月份範圍與末日推估", () => {
  const rangeNov = getTaipeiMonthRange(new Date("2026-11-06T00:00:00.000Z"), "-");
  assert.equal(rangeNov.from, "2026-11-01");
  assert.equal(rangeNov.to, "2026-11-30");
});

test("【Gass 台灣時間模組】3. 當日判定 (isTaipeiToday)", () => {
  const now = new Date();
  const todayStr = getTaipeiDateString(now, "-");
  assert.equal(isTaipeiToday(todayStr), true);
  assert.equal(isTaipeiToday("2020-01-01"), false);
});
