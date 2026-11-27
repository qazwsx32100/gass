const SECTION_NUM_MAP = {
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六",
  "7": "七",
  "8": "八",
  "9": "九",
};

const CHAR_VARIANT_MAP = {
  号: "號",
  华: "華",
  区: "區",
  楼: "樓",
  芦: "蘆",
  籚: "蘆",
  厦: "廈",
};

export function decodeHtmlEntitiesForAddress(input) {
  if (!input) return "";
  return String(input)
    .replace(/&#(\d+);?/g, (_, dec) => {
      const code = Number(dec);
      if (!Number.isFinite(code) || code <= 0) return "";
      const ch = String.fromCharCode(code);
      return CHAR_VARIANT_MAP[ch] || ch;
    })
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
      const code = parseInt(hex, 16);
      if (!Number.isFinite(code) || code <= 0) return "";
      const ch = String.fromCharCode(code);
      return CHAR_VARIANT_MAP[ch] || ch;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-zA-Z0-9]+;/g, "");
}

export function formatAddressForNavigation(rawAddr) {
  if (!rawAddr || typeof rawAddr !== "string") return "";
  let clean = rawAddr.trim();
  if (!clean || clean === "-" || clean === "無" || clean === "無地址") return "";

  const coordMatch = clean.match(/^(-?[0-9]{1,3}\.[0-9]+)[,\s]+(-?[0-9]{1,3}\.[0-9]+)$/);
  if (coordMatch) return `${coordMatch[1]},${coordMatch[2]}`;

  clean = decodeHtmlEntitiesForAddress(clean);
  const marker = clean.indexOf(" 倉庫:");
  if (marker > 0) clean = clean.substring(0, marker).trim();
  clean = clean.replace(/\([^\)]*\)|\（[^）]*\）|\[[^\]]*\]|【[^】]*】|<[^>]*>/g, " ").trim();

  clean = clean.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248));
  clean = clean.replace(/[－—–]/g, "-");
  clean = clean
    .replace(/籚洲/g, "蘆洲")
    .replace(/芦洲/g, "蘆洲")
    .replace(/臺北/g, "台北")
    .replace(/臺灣/g, "台灣")
    .replace(/号/g, "號")
    .replace(/楼/g, "樓");
  clean = clean.replace(/^\d{3,5}\s*/, "").trim();

  const ntpNames =
    "三重|蘆洲|新莊|板橋|中和|永和|五股|八里|淡水|泰山|土城|樹林|汐止|林口|三峽|鶯歌|瑞芳|深坑|石碇|坪林|三芝|石門|平溪|雙溪|貢寮|金山|萬里|烏來";
  const roadLookahead = "(?!區|市|鄉|鎮|[東西南北]?[路街]|大道|路口|公園|國小|國中|高中|市場|橋|站)";
  clean = clean.replace(new RegExp(`^(?:台灣省|臺灣省)?(?:台北縣|新北市)?(${ntpNames})(?:市|鄉|鎮|區)`, "g"), "新北市$1區");
  clean = clean.replace(new RegExp(`^新北市(${ntpNames})${roadLookahead}`), "新北市$1區");
  clean = clean.replace(new RegExp(`^(${ntpNames})${roadLookahead}`), "$1區");

  const tpeNames = "士林|北投|大同|中山|萬華|中正|大安|松山|信義|南港|內湖|文山";
  clean = clean.replace(new RegExp(`^台北市(${tpeNames})區`), "台北市$1區");
  clean = clean.replace(new RegExp(`^台北市(${tpeNames})${roadLookahead}`), "台北市$1區");
  clean = clean.replace(new RegExp(`^(${tpeNames})區`), "台北市$1區");
  clean = clean.replace(new RegExp(`^(${tpeNames})${roadLookahead}`), "台北市$1區");

  clean = clean.replace(/([路街大道])\s*([1-9])\s*段/g, (_, sfx, n) => `${sfx}${SECTION_NUM_MAP[n] || n}段`);
  clean = clean.replace(/(\d+)\.\s*([巷弄號])/g, "$1$2");
  clean = clean.replace(/(\d+)\s*[-－]\s*(\d+)\.\d+\s*號/g, "$1之$2號");
  clean = clean.replace(/(\d+)\.\d+\s*[-－]\s*(\d+)\s*號/g, "$1之$2號");
  clean = clean.replace(/(\d+)\.\d+\s*號/g, "$1號");
  clean = clean.replace(/([路街段巷弄])(\d+)\.\d+\s*\/\s*\d+(?:\.\d+)?\s*(?:樓|F|f)?/g, "$1$2號");
  clean = clean.replace(/([路街段巷弄])(\d+)\s*樓\s*(\d+|B\d+)\s*(?:樓|F|f)/gi, "$1$2號$3樓");
  clean = clean.replace(/([路街段巷弄])(\d{2,})\s*樓(?=$|\s)/g, (m, p, n) => (Number(n) >= 30 ? `${p}${n}號` : m));

  clean = clean.replace(/(\d+)\s*[-－]\s*(\d+)\s*號/g, "$1之$2號");
  clean = clean.replace(/(\d+)\s*號\s*[-－之]\s*(\d+)(?!\s*(?:樓|F|f))/g, "$1之$2號");

  const houseMatch = clean.match(/^(.*?\d+\s*(?:之\s*\d+\s*)?號)/);
  if (houseMatch && houseMatch[1]) {
    clean = houseMatch[1].replace(/\s+/g, "");
  } else {
    clean = clean
      .replace(/[,，、\s]*(\d+|[一二三四五六七八九十]+|B\d+|地下室?)\s*(?:樓|F|f|層)(?:之\d+|-\d+)?.*$/i, "")
      .replace(/\s+/g, "")
      .trim();
  }

  const hasCity =
    /^(?:台灣省|臺灣省)?(?:新北市|台北市|臺北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|台中市|臺中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|台南市|臺南市|高雄市|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣)/.test(
      clean
    );
  if (hasCity) return clean;
  if (/^(?:士林區|北投區|大同區|中山區|萬華區|中正區|大安區|松山區|信義區|南港區|內湖區|文山區)/.test(clean)) {
    return "台北市" + clean;
  }
  if (new RegExp(`^(?:${ntpNames})區`).test(clean)) {
    return "新北市" + clean;
  }
  return "新北市三重區" + clean;
}

export function getGoogleNavigationUrl(rawAddr, mode = "two_wheeler") {
  const cleanAddr = formatAddressForNavigation(rawAddr);
  if (!cleanAddr) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddr)}&travelmode=${mode}&dir_action=navigate`;
}
