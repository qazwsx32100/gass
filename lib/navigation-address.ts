/**
 * 🎯 Google 地圖專用精準導航地址清洗與門牌反補工具 (解決定位漂移、Big5 HTML Entity 腰斬、樓層干擾與跨區問題)
 * 1. 完美解碼 Big5 遺留之 HTML Entities (如 &#21495; -> 號、&#21326; -> 華)，徹底修復舊版 /&#\d+;.*$/ 將後半段門牌整串腰斬的致命 Bug
 * 2. 自動校正錯別字 (如「籚洲」->「蘆洲」) 與阿拉伯數字段號 (如「重新路4段」->「重新路四段」)
 * 3. 支援從客戶代號/戶名 (如 "2.128.7樓[電梯]"、"421.15.3樓") 自動反補缺失的巷、弄、號門牌
 * 4. 自動去除「3樓」、「2F」、「地下室」等干擾 Google 門牌定位的室內字眼，精準釘在建築物一樓大門口
 * 5. 完整涵蓋新北市 (區/市/鄉/鎮) 與台北市 12 行政區 (含省略「區」字之寫法)，預設補齊「新北市三重區」
 */

const SECTION_NUM_MAP: Record<string, string> = {
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

const REVERSE_SECTION_MAP: Record<string, string> = {
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
};

const CHAR_VARIANT_MAP: Record<string, string> = {
  号: "號",
  华: "華",
  区: "區",
  楼: "樓",
  芦: "蘆",
  籚: "蘆",
  厦: "廈",
  弄: "弄",
};

/**
 * 解碼 HTML 實體（十進位 &#21495; 與十六進位 &#x53f7;），絕不截斷後續門牌字串
 */
export function decodeHtmlEntitiesForAddress(input: string): string {
  if (!input) return "";
  return input
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

/**
 * 當地址僅有路名/段名/巷名而缺少「號」時，從盛隆客戶代號/名稱 (例如 "2.128.7樓[電梯]"、"421.15.3樓") 自動反補門牌號碼
 */
export function enrichDoorplateFromCustomerName(cleanAddr: string, customerName?: string | null): string {
  if (!cleanAddr || !customerName) return cleanAddr;
  // 若地址本身已有明確「號」，直接返回不覆寫
  if (/\d+\s*(?:之\s*\d+\s*)?號/.test(cleanAddr)) return cleanAddr;

  let rawName = decodeHtmlEntitiesForAddress(String(customerName).trim());
  rawName = rawName.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248));
  rawName = rawName.replace(/[－—–]/g, "-");

  // 去除括號店名與樓層後綴，例如 "2.128.7樓[電梯]" -> "2.128", "421.15-2.3F" -> "421.15-2"
  const beforeBracket = rawName.split(/[\[\(（【]/)[0].trim();

  // 🛡️ 攤販/路口/巷口/對面等非門牌位置不可硬造門牌號碼（例如 "219.1巷口雞排"、"93.1巷口"）
  if (/(?:巷口|路口|對面|公園|市場|三角窗|角窗|橋下|停車)/.test(beforeBracket)) {
    return cleanAddr;
  }

  const floorSuffixRegex = /[.\s]*(\d+|[一二三四五六七八九十]+|B\d+)\s*(?:樓|F|f)(?:之\d+|-\d+)?.*$/;
  const hadExplicitFloor = floorSuffixRegex.test(beforeBracket);
  const withoutFloor = beforeBracket.replace(floorSuffixRegex, "").trim();

  // 🛡️ 攔截「2-豆花」、「1-可麗餅」這類攤位/品項編號，避免誤判成 2號、1號
  if (/^\d+-[^\d]/.test(withoutFloor)) {
    return cleanAddr;
  }

  const codeMatch = withoutFloor.match(/^(\d+(?:-\d+)?(?:\.\d+(?:-\d+)?)*)(?=$|[\s/]|[^-\d])/);
  if (!codeMatch) return cleanAddr;

  const tokens = codeMatch[1]
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return cleanAddr;

  const formatDoorNo = (tok: string) => {
    const m = tok.match(/^(\d+)-(\d+)$/);
    return m ? `${m[1]}之${m[2]}號` : `${tok}號`;
  };

  // 輔助判斷：該 token 是否看起來像樓層（1~25 或 3-1）
  const looksLikeFloorToken = (tok: string) => {
    const base = Number(tok.split("-")[0]);
    return Number.isFinite(base) && base >= 1 && base <= 25;
  };

  // Case 1: 地址已到「X巷Y弄」，例如「中正北路193巷35弄」，代號為「193.35.25」或「35.25」或「25」
  const alleyLaneMatch = cleanAddr.match(/(\d+)巷(\d+)弄$/);
  if (alleyLaneMatch) {
    const [, alleyNo, laneNo] = alleyLaneMatch;
    if (tokens.length >= 3 && tokens[0] === alleyNo && tokens[1] === laneNo) {
      return `${cleanAddr}${formatDoorNo(tokens[2])}`;
    }
    if (tokens.length >= 2 && tokens[0] === laneNo) {
      return `${cleanAddr}${formatDoorNo(tokens[1])}`;
    }
    if (tokens.length === 1 && tokens[0] !== alleyNo && tokens[0] !== laneNo) {
      return `${cleanAddr}${formatDoorNo(tokens[0])}`;
    }
  }

  // Case 2: 地址已到「X巷」，例如「仁愛街421巷」，代號為「421.15」或「421.35.25」或「15」
  const alleyMatch = cleanAddr.match(/(\d+)巷$/);
  if (alleyMatch) {
    const [, alleyNo] = alleyMatch;
    if (tokens[0] === alleyNo) {
      if (tokens.length === 2) {
        if (!hadExplicitFloor && tokens[1] === "1" && /[^\d.\s]/.test(withoutFloor.slice(codeMatch[1].length))) {
          return cleanAddr;
        }
        return `${cleanAddr}${formatDoorNo(tokens[1])}`;
      }
      if (tokens.length >= 3) {
        if (hadExplicitFloor) {
          return `${cleanAddr}${tokens[1]}弄${formatDoorNo(tokens[2])}`;
        }
        // 無明確「樓」字時，如「421.15.3」多為「421巷15號3樓」，補到號即可不誤造弄
        return `${cleanAddr}${formatDoorNo(tokens[1])}`;
      }
    } else if (tokens.length === 1) {
      return `${cleanAddr}${formatDoorNo(tokens[0])}`;
    }
  }

  // Case 3: 地址已到「X段」，例如「重新路二段」，代號為「2.128」或「2.50.12」
  const secMatch = cleanAddr.match(/([一二三四五六七八九])段$/);
  if (secMatch) {
    const secDigit = REVERSE_SECTION_MAP[secMatch[1]];
    if (tokens[0] === secDigit) {
      if (tokens.length === 2) {
        return `${cleanAddr}${formatDoorNo(tokens[1])}`;
      }
      if (tokens.length === 3) {
        if (hadExplicitFloor) {
          return `${cleanAddr}${tokens[1]}巷${formatDoorNo(tokens[2])}`;
        }
        // 無明確「樓」字時，「2.128.7」代表「2段128號7樓」，絕不可誤造成 128巷7號
        if (looksLikeFloorToken(tokens[2])) {
          return `${cleanAddr}${formatDoorNo(tokens[1])}`;
        }
        return `${cleanAddr}${tokens[1]}巷${formatDoorNo(tokens[2])}`;
      }
      if (tokens.length >= 4 && hadExplicitFloor) {
        return `${cleanAddr}${tokens[1]}巷${tokens[2]}弄${formatDoorNo(tokens[3])}`;
      }
    }
  }

  // Case 4: 地址僅有路/街/大道/段
  if (/(?:路|街|大道|[一二三四五六七八九]段)$/.test(cleanAddr)) {
    if (tokens.length === 1) {
      return `${cleanAddr}${formatDoorNo(tokens[0])}`;
    }
    if (tokens.length === 2) {
      if (hadExplicitFloor) {
        return `${cleanAddr}${tokens[0]}巷${formatDoorNo(tokens[1])}`;
      }
      // 🛡️ 盛隆客號慣例：「91.1」、「101.6」、「142.1」未寫「樓」字時為「門牌.樓層」，絕不可誤判成「91巷1號」
      if (looksLikeFloorToken(tokens[1])) {
        return `${cleanAddr}${formatDoorNo(tokens[0])}`;
      }
      return cleanAddr;
    }
    if (tokens.length >= 3 && hadExplicitFloor) {
      return `${cleanAddr}${tokens[0]}巷${tokens[1]}弄${formatDoorNo(tokens[2])}`;
    }
  }

  return cleanAddr;
}

export function formatAddressForNavigation(rawAddr?: string | null, customerName?: string | null): string {
  if (!rawAddr || typeof rawAddr !== "string") return "";
  let clean = rawAddr.trim();
  if (!clean || clean === "-" || clean === "無" || clean === "無地址") return "";

  // 0. 若本身已是 GPS 經緯度座標 (如 "25.061234,121.498765")，直接返回
  const coordMatch = clean.match(/^(-?[0-9]{1,3}\.[0-9]+)[,\s]+(-?[0-9]{1,3}\.[0-9]+)$/);
  if (coordMatch) {
    return `${coordMatch[1]},${coordMatch[2]}`;
  }

  // 1. 解碼 HTML entities (絕不腰斬後續地址) 並清除倉庫與括號備註
  clean = decodeHtmlEntitiesForAddress(clean);
  const marker = clean.indexOf(" 倉庫:");
  if (marker > 0) clean = clean.substring(0, marker).trim();
  clean = clean.replace(/\([^\)]*\)|\（[^）]*\）|\[[^\]]*\]|【[^】]*】|<[^>]*>/g, " ").trim();

  // 2. 全形數字與全形符號轉半形 (防中文輸入法打出 １０號、－)
  clean = clean.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248));
  clean = clean.replace(/[－—–]/g, "-");

  // 3. 常見行政區與路名錯別字校正
  clean = clean
    .replace(/籚洲/g, "蘆洲")
    .replace(/芦洲/g, "蘆洲")
    .replace(/臺北/g, "台北")
    .replace(/臺灣/g, "台灣")
    .replace(/号/g, "號")
    .replace(/楼/g, "樓");

  // 4. 去除開頭郵遞區號 (例如 241, 247)
  clean = clean.replace(/^\d{3,5}\s*/, "").trim();

  // 5. 舊縣市代碼與鄉鎮市轉新區（嚴格排除 [東西南北]?[路街大道] 避免將路名硬插「區」字，例如「台北市中山北路」不可變「台北市中山區北路」）
  const ntpNames =
    "三重|蘆洲|新莊|板橋|中和|永和|五股|八里|淡水|泰山|土城|樹林|汐止|林口|三峽|鶯歌|瑞芳|深坑|石碇|坪林|三芝|石門|平溪|雙溪|貢寮|金山|萬里|烏來";
  const roadLookahead = "(?!區|市|鄉|鎮|[東西南北]?[路街]|大道|路口|公園|國小|國中|高中|市場|橋|站)";
  clean = clean.replace(new RegExp(`^(?:台灣省|臺灣省)?(?:台北縣|新北市)?(${ntpNames})(?:市|鄉|鎮|區)`, "g"), "新北市$1區");
  clean = clean.replace(new RegExp(`^新北市(${ntpNames})${roadLookahead}`), "新北市$1區");
  clean = clean.replace(new RegExp(`^(${ntpNames})${roadLookahead}`), "$1區");

  // 台北市行政區補齊「區」字（含「台北市大同民權西路」與省寫「萬華西藏路」「北投中央北路」「內湖舊宗路」，且不誤傷「中山北路」「中正北路」「大同南路」「信義西街」）
  const tpeNames = "士林|北投|大同|中山|萬華|中正|大安|松山|信義|南港|內湖|文山";
  clean = clean.replace(new RegExp(`^台北市(${tpeNames})區`), "台北市$1區");
  clean = clean.replace(new RegExp(`^台北市(${tpeNames})${roadLookahead}`), "台北市$1區");
  clean = clean.replace(new RegExp(`^(${tpeNames})區`), "台北市$1區");
  clean = clean.replace(new RegExp(`^(${tpeNames})${roadLookahead}`), "台北市$1區");

  // 6. 段號阿拉伯數字轉國字（如「重新路4段」->「重新路四段」、「新北大道1段」->「新北大道一段」）
  clean = clean.replace(/([路街大道])\s*([1-9])\s*段/g, (_, roadSuffix, num) => {
    return `${roadSuffix}${SECTION_NUM_MAP[num] || num}段`;
  });

  // 6.5 清除門牌/巷弄中的點號雜訊與常見誤打字
  // 例如「42.號1-4樓」->「42號1-4樓」、「14.巷」->「14巷」、「135.巷」->「135巷」
  clean = clean.replace(/(\d+)\.\s*([巷弄號])/g, "$1$2");
  // 例如「61-7.1號」->「61之7號」、「87.1-1號」->「87之1號」
  clean = clean.replace(/(\d+)\s*[-－]\s*(\d+)\.\d+\s*號/g, "$1之$2號");
  clean = clean.replace(/(\d+)\.\d+\s*[-－]\s*(\d+)\s*號/g, "$1之$2號");
  // 例如連棟雙門牌「10.11號」、「33.35號」、「13.17號」、「15.1號」-> 取主門牌「10號」、「33號」、「13號」、「15號」
  clean = clean.replace(/(\d+)\.\d+\s*號/g, "$1號");
  // 例如「龍濱路90.3/92.12樓」->「龍濱路90號」
  clean = clean.replace(/([路街段巷弄])(\d+)\.\d+\s*\/\s*\d+(?:\.\d+)?\s*(?:樓|F|f)?/g, "$1$2號");
  // 誤把「號」打成「樓」：例如「龍門路229樓5樓」->「龍門路229號5樓」、「安慶街101樓6樓」->「安慶街101號6樓」
  clean = clean.replace(/([路街段巷弄])(\d+)\s*樓\s*(\d+|B\d+)\s*(?:樓|F|f)/gi, "$1$2號$3樓");
  // 誤把「號」打成「樓」且無第二個樓字：例如「重安街142樓」(>=30不可能是一般無門牌樓層) ->「重安街142號」
  clean = clean.replace(/([路街段巷弄])(\d{2,})\s*樓(?=$|\s)/g, (m, prefix, num) => {
    return Number(num) >= 30 ? `${prefix}${num}號` : m;
  });

  // 7. 門牌「15-2號」、「15號-2」、「15號之2」統一轉為 Google Maps 標準「15之2號」
  clean = clean.replace(/(\d+)\s*[-－]\s*(\d+)\s*號/g, "$1之$2號");
  clean = clean.replace(/(\d+)\s*號\s*[-－之]\s*(\d+)(?!\s*(?:樓|F|f))/g, "$1之$2號");

  // 8. 截斷樓層與室內定位雜訊，只保留到門牌號碼 (解決 Google 地圖門牌飄移最大殺手)
  const houseMatch = clean.match(/^(.*?\d+\s*(?:之\s*\d+\s*)?號)/);
  if (houseMatch && houseMatch[1]) {
    clean = houseMatch[1].replace(/\s+/g, "");
  } else {
    // 若無「號」字，先剝離尾端樓層字眼，再嘗試以客戶代號/名稱自動反補門牌號碼
    clean = clean
      .replace(/[,，、\s]*(\d+|[一二三四五六七八九十]+|B\d+|地下室?)\s*(?:樓|F|f|層)(?:之\d+|-\d+)?.*$/i, "")
      .replace(/\s+/g, "")
      .trim();
    if (customerName) {
      clean = enrichDoorplateFromCustomerName(clean, customerName);
    }
  }

  // 9. 補齊縣市區 (防止飄移至外縣市同名路段)
  const hasCity =
    /^(?:台灣省|臺灣省)?(?:新北市|台北市|臺北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|台中市|臺中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|台南市|臺南市|高雄市|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣)/.test(
      clean
    );
  if (hasCity) {
    return clean;
  }
  const tpeDistricts = /^(?:士林區|北投區|大同區|中山區|萬華區|中正區|大安區|松山區|信義區|南港區|內湖區|文山區)/;
  if (tpeDistricts.test(clean)) {
    return "台北市" + clean;
  }
  const ntpDistricts = new RegExp(`^(?:${ntpNames})區`);
  if (ntpDistricts.test(clean)) {
    return "新北市" + clean;
  }
  return "新北市三重區" + clean;
}

export interface NavigationOptions {
  travelmode?: "two_wheeler" | "driving" | "bicycling" | "walking";
  placeId?: string;
  customerName?: string | null;
  directNavigate?: boolean;
}

/**
 * 產生 Google 導航專用 URL（深度結合 Google Maps 官方協議）
 * 🛵 預設升級為 two_wheeler (兩輪機車導航模式) + dir_action=navigate (一鍵直接開始導航)：
 * 徹底解決開車模式因汽車無法進入雙北狹窄死巷而在巷口 60 公尺外提早結束導航的痛點！
 * 🛡️ 僅當提供外勤實地釘選或後台確認之精確大門座標 (customGps) 或 Google Place ID 時才使用座標，
 *     一般訂單與客戶圖資一律使用清洗後之標準門牌地址直達，杜絕粗略估算座標導致偏航！
 */
export function getGoogleNavigationUrl(
  rawAddr?: string | null,
  coords?: { lat: number; lng: number } | null,
  options?: NavigationOptions
): string {
  const mode = options?.travelmode || "two_wheeler";
  const dirAction = options?.directNavigate === false ? "" : "&dir_action=navigate";

  // 1. 若有外勤實地釘選之精確大門經緯度座標，100% 座標直達（搭配 Place ID 更鎖定建築節點）
  if (
    coords &&
    typeof coords.lat === "number" &&
    typeof coords.lng === "number" &&
    !isNaN(coords.lat) &&
    !isNaN(coords.lng) &&
    coords.lat !== 0 &&
    coords.lng !== 0
  ) {
    let url = `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=${mode}${dirAction}`;
    if (options?.placeId) {
      url += `&destination_place_id=${encodeURIComponent(options.placeId)}`;
    }
    return url;
  }

  // 2. 若無座標但有 Google Place ID
  if (options?.placeId) {
    const cleanAddr = formatAddressForNavigation(rawAddr, options?.customerName);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddr || "目的地")}&destination_place_id=${encodeURIComponent(options.placeId)}&travelmode=${mode}${dirAction}`;
  }

  // 3. 標準門牌地址直達 (已解碼 HTML Entity、校正錯字與段號、反補客號門牌、截斷樓層與補齊行政區)
  const cleanAddr = formatAddressForNavigation(rawAddr, options?.customerName);
  if (!cleanAddr) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddr)}&travelmode=${mode}${dirAction}`;
}

/**
 * 👁️ 產生 Google 360° 街景直達連結（小巷子核對大門鐵門與巷口轉彎點專用）
 */
export function getGoogleStreetViewUrl(
  rawAddr?: string | null,
  coords?: { lat: number; lng: number } | null,
  options?: { customerName?: string | null }
): string {
  if (
    coords &&
    typeof coords.lat === "number" &&
    typeof coords.lng === "number" &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat !== 0 &&
    coords.lng !== 0
  ) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords.lat},${coords.lng}`;
  }
  const cleanAddr = formatAddressForNavigation(rawAddr, options?.customerName);
  if (!cleanAddr) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddr)}`;
}

/**
 * 📍 產生 Google 地圖標記檢視連結（方便門市／師傅在 Google Maps 裡點選精準小巷位置後按分享貼回）
 */
export function getGoogleMapsPinUrl(
  rawAddr?: string | null,
  coords?: { lat: number; lng: number } | null,
  options?: { placeId?: string; customerName?: string | null }
): string {
  const placeParam = options?.placeId ? `&query_place_id=${encodeURIComponent(options.placeId)}` : "";
  if (
    coords &&
    typeof coords.lat === "number" &&
    typeof coords.lng === "number" &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat !== 0 &&
    coords.lng !== 0
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}${placeParam}`;
  }
  const cleanAddr = formatAddressForNavigation(rawAddr, options?.customerName);
  if (!cleanAddr) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddr)}${placeParam}`;
}

export interface AlleyNavigationRisk {
  isAlley: boolean;
  riskLevel: "high" | "medium" | "low";
  label: string;
  reason: string;
}

/**
 * 🧭 小巷子導航偏移風險自動偵測
 * 台灣老城區「巷＋弄」、「之X號」或無門牌路口容易遭 Google 門牌內插偏移，優先引導鎖定大門座標
 */
export function analyzeAlleyNavigationRisk(
  rawAddr?: string | null,
  hasLockedCustomGps = false
): AlleyNavigationRisk {
  const clean = formatAddressForNavigation(rawAddr || "");
  const hasLane = /\d+\s*弄/.test(clean);
  const hasAlley = /\d+\s*巷/.test(clean);
  const hasSubDoor = /\d+\s*之\s*\d+\s*號/.test(clean);
  const missingDoorNo = Boolean(clean) && !/\d+(?:之\d+)?號/.test(clean);
  const isAlley = hasLane || hasAlley || missingDoorNo;

  if (hasLockedCustomGps) {
    return {
      isAlley,
      riskLevel: "low",
      label: "🎯 Google 大門已鎖定",
      reason: "已綁定實地確認之大門座標，兩輪機車導航直達門口",
    };
  }
  if (hasLane || missingDoorNo || (hasAlley && hasSubDoor)) {
    return {
      isAlley: true,
      riskLevel: "high",
      label: "⚠️ 深巷易偏（建議鎖定大門）",
      reason: hasLane
        ? "含「巷／弄」多層分支，Google 門牌內插較易偏移，建議用 Google 標記或現場鎖定大門"
        : missingDoorNo
          ? "地址無明確門牌號，建議鎖定實地座標避免導偏"
          : "小巷支號門牌容易導至主號或巷口，建議鎖定實際大門",
    };
  }
  if (hasAlley) {
    return {
      isAlley: true,
      riskLevel: "medium",
      label: "📍 巷內門牌（可鎖定大門）",
      reason: "巷弄門牌若發現 Google 導到巷口或屋後，可一鍵鎖定門口路面座標",
    };
  }
  return {
    isAlley: false,
    riskLevel: "low",
    label: "✓ 主幹道門牌",
    reason: "主幹道標準門牌定位穩定",
  };
}

/** 盛隆瓦斯行門市基準座標（新北市三重區龍濱路 19 號） */
export const SHENGLONG_STORE_COORDS = {
  lat: 25.0631,
  lng: 121.5024,
} as const;

/** Haversine 球面距離（公尺） */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface AutoLearnDoorGpsInput {
  liveCoords?: {
    lat: number;
    lng: number;
    accuracy?: number;
    updatedAt?: number;
  } | null;
  orderAddr?: string | null;
  referenceCoords?: { lat: number; lng: number } | null;
  now?: number;
  maxAgeMs?: number;
  maxAccuracyMeters?: number;
  maxDeviationMeters?: number;
}

/**
 * 🛡️ 司機送達自動學習大門 GPS 5 重防誤存閘門
 * 1. 台灣合法經緯度範圍檢查
 * 2. 必須具備明確且高精度 accuracy (<= 25m)，禁止缺精度矇混
 * 3. 定位新鮮度檢查 (<= 90 秒)，杜絕拿過期快取座標污染其他客戶
 * 4. 門市防誤存禁區：若在龍濱路 19 號門市 60m 內且訂單非龍濱路 1~45 號，判定為回店補按送達，拒絕寫入
 * 5. 參考圖資距離校驗：若訂單已有粗略座標且偏離 > 250m，判定為異地補按送達，拒絕寫入
 */
export function shouldAutoLearnDoorGps(input: AutoLearnDoorGpsInput): {
  allowed: boolean;
  reason?: string;
} {
  const {
    liveCoords,
    orderAddr,
    referenceCoords,
    now = Date.now(),
    maxAgeMs = 90_000,
    maxAccuracyMeters = 25,
    maxDeviationMeters = 250,
  } = input || {};

  if (!liveCoords || typeof liveCoords.lat !== "number" || typeof liveCoords.lng !== "number") {
    return { allowed: false, reason: "missing_coords" };
  }
  const { lat, lng, accuracy, updatedAt } = liveCoords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 21.5 || lat > 26.5 || lng < 119.0 || lng > 122.5) {
    return { allowed: false, reason: "out_of_taiwan_bounds" };
  }

  // 2. 精度必須明確且 <= 25 公尺
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > maxAccuracyMeters) {
    return { allowed: false, reason: "low_or_missing_accuracy" };
  }

  // 3. 座標必須為 90 秒內新鮮定位
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || now - updatedAt > maxAgeMs || updatedAt - now > 30_000) {
    return { allowed: false, reason: "stale_coords" };
  }

  // 4. 門市防誤存禁區 (龍濱路 19 號半徑 60m)
  const distToStore = haversineMeters(lat, lng, SHENGLONG_STORE_COORDS.lat, SHENGLONG_STORE_COORDS.lng);
  if (distToStore <= 60) {
    const cleanOrderAddr = formatAddressForNavigation(orderAddr || "");
    const longbinMatch = cleanOrderAddr.match(/龍濱路(\d+)(?:之\d+)?號/);
    const longbinNo = longbinMatch ? Number(longbinMatch[1]) : null;
    const isNearStoreOrder = longbinNo !== null && longbinNo >= 1 && longbinNo <= 45;
    if (!isNearStoreOrder) {
      return { allowed: false, reason: "near_store_retroactive_finish" };
    }
  }

  // 5. 若訂單有參考座標，偏離超過 250 公尺一律拒絕自動覆寫
  if (
    referenceCoords &&
    typeof referenceCoords.lat === "number" &&
    typeof referenceCoords.lng === "number" &&
    Number.isFinite(referenceCoords.lat) &&
    Number.isFinite(referenceCoords.lng) &&
    referenceCoords.lat !== 0 &&
    referenceCoords.lng !== 0
  ) {
    const deviation = haversineMeters(lat, lng, referenceCoords.lat, referenceCoords.lng);
    if (deviation > maxDeviationMeters) {
      return { allowed: false, reason: "exceeds_reference_deviation" };
    }
  }

  return { allowed: true };
}
