const LEGACY_DISTRICTS = Object.freeze({
  板橋市: '板橋區', 三重市: '三重區', 中和市: '中和區', 永和市: '永和區',
  新莊市: '新莊區', 新店市: '新店區', 土城市: '土城區', 蘆洲市: '蘆洲區',
  汐止市: '汐止區', 樹林市: '樹林區', 鶯歌鎮: '鶯歌區', 三峽鎮: '三峽區',
  淡水鎮: '淡水區', 瑞芳鎮: '瑞芳區', 五股鄉: '五股區', 泰山鄉: '泰山區',
  林口鄉: '林口區', 深坑鄉: '深坑區', 石碇鄉: '石碇區', 坪林鄉: '坪林區',
  三芝鄉: '三芝區', 石門鄉: '石門區', 八里鄉: '八里區', 平溪鄉: '平溪區',
  雙溪鄉: '雙溪區', 貢寮鄉: '貢寮區', 金山鄉: '金山區', 萬里鄉: '萬里區',
  烏來鄉: '烏來區',
});

function modernizeAddress(value) {
  let address = String(value ?? '').normalize('NFKC').replace(/臺/g, '台');
  address = address.replace(/台北縣/g, '新北市');
  for (const [legacy, modern] of Object.entries(LEGACY_DISTRICTS)) {
    address = address.replaceAll(legacy, modern);
  }
  return address.trim();
}

function normalizeAddress(value) {
  return modernizeAddress(value)
    .toLowerCase()
    .replace(/[\s　,，、.。．\-－_]/g, '');
}

function addressesMatch(left, right) {
  const a = normalizeAddress(left);
  const b = normalizeAddress(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

module.exports = { LEGACY_DISTRICTS, modernizeAddress, normalizeAddress, addressesMatch };
