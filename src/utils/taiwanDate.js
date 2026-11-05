/**
 * 🇹🇼 盛隆瓦斯 全系統唯一權威台灣時間模組 (Asia/Taipei, UTC+8)
 * 供 c:\Gass 與 c:\shenglong-next 雙邊共用，徹底消除跨日 0 點邊界漂移
 */

export const getTaiwanDateString = (date = new Date()) => {
  return getTaipeiDateString(date, "-");
};

export const getTaiwanYearMonthString = (date = new Date()) => {
  return getTaipeiDateString(date, "-").slice(0, 7);
};

export function getTaipeiDateString(d = new Date(), separator = "/") {
  let dateObj;
  if (typeof d === "string") {
    const clean = d.trim().replace(/\//g, "-");
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return separator === "/" ? clean.replace(/-/g, "/") : clean;
    }
    dateObj = new Date(d);
  } else if (typeof d === "number") {
    dateObj = new Date(d);
  } else {
    dateObj = d;
  }

  if (isNaN(dateObj?.getTime?.())) {
    dateObj = new Date();
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj); // YYYY-MM-DD

  return separator === "/" ? parts.replace(/-/g, "/") : parts;
}

export function getTaipeiYearMonth(d = new Date(), separator = "/") {
  const dateStr = getTaipeiDateString(d, separator);
  return dateStr.slice(0, 7);
}

export function getTaipeiDateTimeString(d = new Date(), separator = "/") {
  let dateObj;
  if (typeof d === "string" || typeof d === "number") {
    dateObj = new Date(d);
  } else {
    dateObj = d;
  }
  if (isNaN(dateObj?.getTime?.())) {
    dateObj = new Date();
  }

  const dateStr = getTaipeiDateString(dateObj, separator);
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dateObj);

  return `${dateStr} ${timeStr}`;
}

export function getTaipeiMonthRange(d = new Date(), separator = "-") {
  const dateStr = getTaipeiDateString(d, "-");
  const [yearStr, monthStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayStr = String(lastDay).padStart(2, "0");

  const from = `${yearStr}-${monthStr}-01`;
  const to = `${yearStr}-${monthStr}-${lastDayStr}`;

  return {
    from: separator === "/" ? from.replace(/-/g, "/") : from,
    to: separator === "/" ? to.replace(/-/g, "/") : to,
  };
}

export function isTaipeiToday(targetDateStr) {
  if (!targetDateStr) return false;
  const normTarget = String(targetDateStr).trim().replace(/\//g, "-").slice(0, 10);
  const todayTaipei = getTaipeiDateString(new Date(), "-");
  return normTarget === todayTaipei;
}
