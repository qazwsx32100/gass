/**
 * 客戶地圖資料正規化工具
 *
 * 背景：src/data/customerMapData.json 的欄位為 { id, name, tel, dist, lat, lng, status }，
 * 但 GasCustomerMapPanel 的篩選/圖釘/CSV 仍讀取舊欄位 (col, clean, raw, last, days, cat, gas, stv)。
 * 這裡把新資料轉成元件需要的形狀，避免 selectedColors[undefined] 造成地圖全空。
 */

// status → 地圖顏色（與 CUSTOMER_MAP_STATS 的 blue/green/pink/red/gray 數量一致）
export const STATUS_TO_COLOR = {
  WITHIN_6_MONTHS: 'blue',
  '6_TO_12_MONTHS': 'green',
  '1_TO_1_5_YEARS': 'pink',
  '1_5_TO_3_YEARS': 'red',
  OVER_3_YEARS: 'gray',
  NO_ORDER: 'gray'
};

export const normalizeCustomerMapRow = (d = {}) => {
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const coord = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : '';
  return {
    ...d,
    lat,
    lng,
    col: d.col || STATUS_TO_COLOR[d.status] || 'gray',
    // 資料檔沒有地址欄位時，以座標作為導航目的地（Google Maps 可直接解析 "lat,lng"）
    clean: d.clean || d.raw || coord,
    raw: d.raw || '',
    last: d.last || null,
    days: Number.isFinite(d.days) ? d.days : null,
    cat: d.cat || '',
    gas: d.gas ?? '-',
    stv: d.stv ?? '-'
  };
};

export const normalizeCustomerMapData = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map(normalizeCustomerMapRow)
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
