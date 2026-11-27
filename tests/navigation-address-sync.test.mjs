import test from "node:test";
import assert from "node:assert/strict";
import { formatAddressForNavigation, getGoogleNavigationUrl } from "../api/_navigation-address.js";

test("【Gass 導航地址防誤判同步測試】北市路名不誤插區字、外區不誤冠三重、門牌雜訊與兩輪機車導航", () => {
  assert.equal(
    formatAddressForNavigation("台北市中山北路一段53巷19號"),
    "台北市中山北路一段53巷19號"
  );
  assert.equal(
    formatAddressForNavigation("萬華西藏路60號2樓"),
    "台北市萬華區西藏路60號"
  );
  assert.equal(
    formatAddressForNavigation("北投中央北路四段296號1樓"),
    "台北市北投區中央北路四段296號"
  );
  assert.equal(
    formatAddressForNavigation("內湖舊宗路一段150巷25號1樓"),
    "台北市內湖區舊宗路一段150巷25號"
  );
  assert.equal(
    formatAddressForNavigation("樹林大慶街56號2樓"),
    "新北市樹林區大慶街56號"
  );
  assert.equal(
    formatAddressForNavigation("三重區自強路一段42.號1-4樓"),
    "新北市三重區自強路一段42號"
  );
  assert.equal(
    formatAddressForNavigation("三重區龍門路229樓5樓"),
    "新北市三重區龍門路229號"
  );

  const navUrl = getGoogleNavigationUrl("台北市中山北路一段53巷19號3樓");
  assert.ok(navUrl.includes("travelmode=two_wheeler"));
  assert.ok(navUrl.includes(encodeURIComponent("台北市中山北路一段53巷19號")));
});
