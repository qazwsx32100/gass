import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🏢 完單分類邏輯：舊 ERP 的 O(欠款) 與 M(月結) 送達後歸入「已送達」，配送中僅保留真正外送中瓦斯", () => {
  // 1. 驗證 operations/page.tsx 程式碼規範
  const opsPath = path.resolve("c:/shenglong-next/app/operations/page.tsx");
  const opsCode = fs.readFileSync(opsPath, "utf8");

  assert.ok(
    opsCode.includes('rawPayed === "O"') && opsCode.includes('isPayedText === "欠款"'),
    "isOrderCompleted 必須包含 O 與 欠款 判定"
  );
  assert.ok(
    opsCode.includes('rawPayed === "M"') && opsCode.includes('isPayedText === "月結"'),
    "isOrderCompleted 必須包含 M 與 月結 判定"
  );
  assert.ok(
    opsCode.includes('badgeIcon = "⏳"') && opsCode.includes('badgeLabel = "欠款"'),
    "卡片欠款狀態必須標註 ⏳ 欠款"
  );
  assert.ok(
    opsCode.includes('badgeIcon = "📝"') && opsCode.includes('badgeLabel = "月結"'),
    "卡片月結狀態必須標註 📝 月結"
  );

  // 2. 模擬與檢驗狀態判定函式行為
  const isOrderPending = (o) => {
    return (
      !o.driver ||
      o.driver === "待派工" ||
      o.driver === "未指派" ||
      o.driver === "-" ||
      o.driver === "待派"
    );
  };

  const isOrderCompleted = (o) => {
    const s = o.status;
    const rawPayed = String(o.payed || "").trim().toUpperCase();
    const isPayedText = String(o.isPayed || "").trim();
    const isPaid =
      rawPayed === "Y" ||
      rawPayed === "T" ||
      rawPayed === "M" ||
      rawPayed === "O" ||
      isPayedText === "已付款" ||
      isPayedText === "已結算" ||
      isPayedText === "已結單" ||
      isPayedText === "月結" ||
      isPayedText === "欠款" ||
      Boolean(o.isPaid);
    const isDriverFinished = o.driverStatus === "finished";
    return (
      s === "DELIVERED" ||
      s === "COMPLETED" ||
      s === "F" ||
      o.driver === "已送達" ||
      o.isDelivered === true ||
      isPaid ||
      isDriverFinished
    );
  };

  const isOrderDelivering = (o) => {
    return !isOrderPending(o) && !isOrderCompleted(o);
  };

  // Case A: 今日欠款訂單 (#362110)
  const debtOrder = {
    id: 362110,
    name: "42.4",
    addr: "三重區龍門路42號4樓",
    driver: "小龍",
    payed: "O",
    isPayed: "欠款",
  };
  assert.equal(isOrderPending(debtOrder), false, "欠款單已派司機，絕非待派工");
  assert.equal(isOrderCompleted(debtOrder), true, "欠款單送達後必須歸入已送達");
  assert.equal(isOrderDelivering(debtOrder), false, "欠款單絕不可被當作配送中");

  // Case B: 月結訂單
  const monthlyOrder = {
    id: 362000,
    name: "大戶餐廳",
    addr: "三重區正義北路1號",
    driver: "小龍",
    payed: "M",
    isPayed: "月結",
  };
  assert.equal(isOrderPending(monthlyOrder), false);
  assert.equal(isOrderCompleted(monthlyOrder), true, "月結單送達後必須歸入已送達");
  assert.equal(isOrderDelivering(monthlyOrder), false, "月結單絕不可被當作配送中");

  // Case C: 現金已結單
  const cashOrder = {
    id: 362001,
    name: "一般客",
    addr: "三重區龍濱路10號",
    driver: "小龍",
    payed: "Y",
    isPayed: "已付款",
  };
  assert.equal(isOrderCompleted(cashOrder), true, "已付款單歸入已送達");
  assert.equal(isOrderDelivering(cashOrder), false);

  // Case D: 真正外送中之未結單
  const inTransitOrder = {
    id: 362002,
    name: "外送中客戶",
    addr: "三重區中正北路50號",
    driver: "小龍",
    payed: "",
    isPayed: "未付款",
  };
  assert.equal(isOrderPending(inTransitOrder), false);
  assert.equal(isOrderCompleted(inTransitOrder), false, "未付款未完單不可當作已完成");
  assert.equal(isOrderDelivering(inTransitOrder), true, "真正外送中訂單正確落入配送中");

  // Case E: 尚未派工之新單
  const unassignedOrder = {
    id: 362003,
    name: "新進客戶",
    addr: "三重區重新路1號",
    driver: "待派工",
    payed: "",
  };
  assert.equal(isOrderPending(unassignedOrder), true, "待派工訂單落入待派工");
  assert.equal(isOrderCompleted(unassignedOrder), false);
  assert.equal(isOrderDelivering(unassignedOrder), false);
});

test("🏷️ SharedOrderStatusBadge 與 SharedOrderCard 對 欠款(debt) 與 月結(monthly) 膠囊支援", () => {
  const badgePath = path.resolve("c:/shenglong-next/app/components/SharedOrderStatusBadge.tsx");
  const badgeCode = fs.readFileSync(badgePath, "utf8");

  assert.ok(badgeCode.includes('| "debt"'), "OrderStatusType 必須包含 debt 型別");
  assert.ok(badgeCode.includes('resolvedText = label || "欠款"'), "必須支援 欠款 解析");
  assert.ok(badgeCode.includes('icon = "⏳"'), "欠款必須使用 ⏳ 圖示");
  assert.ok(badgeCode.includes('#d97706'), "欠款樣式必須使用琥珀色");

  const cardPath = path.resolve("c:/shenglong-next/app/components/SharedOrderCard.tsx");
  const cardCode = fs.readFileSync(cardPath, "utf8");
  assert.ok(cardCode.includes('rawPayed === "O"'), "SharedOrderCard 必須支援 O 欠款判定");
  assert.ok(cardCode.includes('<SharedOrderStatusBadge'), "SharedOrderCard 必須掛載狀態膠囊");
});
