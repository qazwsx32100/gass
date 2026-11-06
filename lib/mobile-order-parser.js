/**
 * mobile-order-parser.js
 * 👑 盛隆瓦斯 全系統統一訂單規格與語義地址解析器 (Single Source of Truth)
 * 供 c:\Gass 與 c:\shenglong-next 雙邊共用，徹底消除規格漏列與版本漂移
 */

/**
 * 萃取訂單鋼瓶規格徽章標籤 (含 50kg, 20kg, 18kg, 16kg, 10kg, 新4kg, 4kg)
 */
export function extractOrderSpecs(o) {
  const chips = [];

  // 1. 50kg 超重規格
  const q50 = Number(o?.raw50 ?? o?.b50) || 0;
  if (q50 > 0) {
    chips.push({
      spec: "50kg",
      qty: q50,
      label: `50kg × ${q50}`,
      bg: "rgba(147, 51, 234, 0.16)",
      color: "#9333ea",
      border: "rgba(147, 51, 234, 0.38)",
    });
  }

  // 2. 20kg 核心常規規格
  const q20 = Number(o?.raw20 ?? o?.b20) || 0;
  if (q20 > 0) {
    chips.push({
      spec: "20kg",
      qty: q20,
      label: `20kg × ${q20}`,
      bg: "rgba(22, 163, 74, 0.16)",
      color: "#16a34a",
      border: "rgba(22, 163, 74, 0.38)",
    });
  }

  // 3. 18kg 店面特規
  const q18 = Number(o?.raw18) || 0;
  if (q18 > 0) {
    chips.push({
      spec: "18kg",
      qty: q18,
      label: `18kg × ${q18}`,
      bg: "rgba(2, 132, 199, 0.16)",
      color: "#0284c7",
      border: "rgba(2, 132, 199, 0.38)",
    });
  }

  // 4. 16kg 常規規格
  const q16 = Number(o?.raw16) || 0;
  if (q16 > 0) {
    chips.push({
      spec: "16kg",
      qty: q16,
      label: `16kg × ${q16}`,
      bg: "rgba(37, 99, 235, 0.16)",
      color: "#2563eb",
      border: "rgba(37, 99, 235, 0.38)",
    });
  }

  // 5. 10kg 常規規格
  const q10 = Number(o?.raw10) || 0;
  if (q10 > 0) {
    chips.push({
      spec: "10kg",
      qty: q10,
      label: `10kg × ${q10}`,
      bg: "rgba(234, 88, 12, 0.16)",
      color: "#ea580c",
      border: "rgba(234, 88, 12, 0.38)",
    });
  }

  // 6. 新 4kg 鋼瓶特規
  const qNew4 = Number(o?.raw_new_4 ?? o?.new_4kg ?? o?.bNew4) || 0;
  if (qNew4 > 0) {
    chips.push({
      spec: "新4kg",
      qty: qNew4,
      label: `新4kg × ${qNew4}`,
      bg: "rgba(236, 72, 153, 0.16)",
      color: "#ec4899",
      border: "rgba(236, 72, 153, 0.38)",
    });
  }

  // 7. 4kg 一般規格
  const q4 = Number(o?.raw4) || 0;
  if (q4 > 0) {
    chips.push({
      spec: "4kg",
      qty: q4,
      label: `4kg × ${q4}`,
      bg: "rgba(219, 39, 119, 0.16)",
      color: "#db2777",
      border: "rgba(219, 39, 119, 0.38)",
    });
  }

  // 若欄位無直接數值，進行 items 文字備註自然語言智慧解析
  if (chips.length === 0 && o?.items) {
    const rawItems = String(o.items).trim();
    const specPatterns = [
      { regex: /(?:50\s*(?:kg|公斤|k)|五[十0]公斤)[\s*xX×:：-]*(\d+)?/i, spec: "50kg", bg: "rgba(147, 51, 234, 0.16)", color: "#9333ea", border: "rgba(147, 51, 234, 0.38)" },
      { regex: /(?:20\s*(?:kg|公斤|k)|二[十0]公斤)[\s*xX×:：-]*(\d+)?/i, spec: "20kg", bg: "rgba(22, 163, 74, 0.16)", color: "#16a34a", border: "rgba(22, 163, 74, 0.38)" },
      { regex: /(?:18\s*(?:kg|公斤|k)|十[八8]公斤)[\s*xX×:：-]*(\d+)?/i, spec: "18kg", bg: "rgba(2, 132, 199, 0.16)", color: "#0284c7", border: "rgba(2, 132, 199, 0.38)" },
      { regex: /(?:16\s*(?:kg|公斤|k)|十[六6]公斤)[\s*xX×:：-]*(\d+)?/i, spec: "16kg", bg: "rgba(37, 99, 235, 0.16)", color: "#2563eb", border: "rgba(37, 99, 235, 0.38)" },
      { regex: /(?:10\s*(?:kg|公斤|k)|十公斤)[\s*xX×:：-]*(\d+)?/i, spec: "10kg", bg: "rgba(234, 88, 12, 0.16)", color: "#ea580c", border: "rgba(234, 88, 12, 0.38)" },
      { regex: /(?:新\s*4\s*(?:kg|公斤|k)|新四公斤)[\s*xX×:：-]*(\d+)?/i, spec: "新4kg", bg: "rgba(236, 72, 153, 0.16)", color: "#ec4899", border: "rgba(236, 72, 153, 0.38)" },
      { regex: /(?:4\s*(?:kg|公斤|k)|四公斤)[\s*xX×:：-]*(\d+)?/i, spec: "4kg", bg: "rgba(219, 39, 119, 0.16)", color: "#db2777", border: "rgba(219, 39, 119, 0.38)" },
    ];

    for (const pat of specPatterns) {
      const match = rawItems.match(pat.regex);
      if (match) {
        const qty = match[1] ? parseInt(match[1], 10) : 1;
        chips.push({
          spec: pat.spec,
          qty: qty || 1,
          label: `${pat.spec} × ${qty || 1}`,
          bg: pat.bg,
          color: pat.color,
          border: pat.border,
        });
      }
    }

    if (chips.length === 0) {
      chips.push({
        spec: "other",
        qty: 1,
        label: rawItems.length > 12 ? rawItems.slice(0, 11) + "…" : rawItems,
        bg: "rgba(13, 148, 136, 0.15)",
        color: "#0d9488",
        border: "rgba(13, 148, 136, 0.35)",
      });
    }
  }

  // 兜底預設：若完全無法辨識且無規格，預設為 20kg × 1
  if (chips.length === 0) {
    chips.push({
      spec: "20kg",
      qty: 1,
      label: "瓦斯 × 1",
      bg: "rgba(22, 163, 74, 0.16)",
      color: "#16a34a",
      border: "rgba(22, 163, 74, 0.38)",
    });
  }

  return chips;
}

/**
 * 智能瓦斯支數總結算 (解決非標規格造成外送支數歸零問題)
 */
export function parseBottlesFromOrder(order) {
  const r50 = Number(order?.raw50 ?? order?.b50) || 0;
  const r20 = Number(order?.raw20 ?? order?.b20) || 0;
  const r18 = Number(order?.raw18) || 0;
  const r16 = Number(order?.raw16) || 0;
  const r10 = Number(order?.raw10) || 0;
  const rNew4 = Number(order?.raw_new_4 ?? order?.new_4kg ?? order?.bNew4) || 0;
  const r4 = Number(order?.raw4) || 0;

  let b50 = r50;
  let bOther = r20 + r18 + r16 + r10 + rNew4 + r4;

  if (Number(order?.bOther) > bOther) {
    bOther = Number(order.bOther);
  }

  if (b50 + bOther === 0 && order?.items && typeof order.items === "string") {
    const chips = extractOrderSpecs(order);
    for (const c of chips) {
      if (c.spec === "50kg") {
        b50 += c.qty;
      } else {
        bOther += c.qty;
      }
    }
  }

  if (b50 + bOther === 0) {
    bOther = 1; // 預設至少 1 支
  }

  return {
    totalBottles: b50 + bOther,
    b50,
    bOther,
  };
}

/**
 * 手機端門牌地址層次解析 (過濾干擾縣市、標準化行政區、分離樓層與特殊備註)
 */
export function parseAddressForMobile(rawAddr) {
  if (!rawAddr) {
    return { district: "", streetAndNumber: "無地址", floor: "", isSanchong: true };
  }

  let text = rawAddr.trim();
  text = text.replace(/^(?:台灣|臺灣)?(?:新北市|台北市|臺北市)?/, "").trim();

  let district = "";
  const distMatch = text.match(/^([^\s號路街道巷弄]+?[區鄉鎮市])/);
  if (distMatch) {
    district = distMatch[1];
    text = text.slice(district.length).trim();
  }

  const isSanchong = !district || district === "三重區" || district === "三重";

  let floor = "";
  const floorMatch = text.match(/([0-9一二三四五六七八九十B]+(?:樓(?:之[0-9]+)?|[fF](?:-[0-9]+)?|地下(?:一|二|[0-9])?層?)(?:[前後後右左側室號])?)/);
  if (floorMatch) {
    floor = floorMatch[1];
    text = text.replace(floorMatch[0], "").trim();
  }

  text = text.replace(/[,，、\s]+$/, "").trim();

  return {
    district: district || (isSanchong ? "三重區" : ""),
    streetAndNumber: text || rawAddr,
    floor: floor,
    isSanchong,
  };
}
