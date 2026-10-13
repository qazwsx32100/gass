import { verifyToken, getClientIp } from './auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';

// 點擊事件追蹤限流：單一 IP 每分鐘最多 40 次點擊紀錄，防範點擊數據遭惡意刷爆
const trackRateLimiter = createBoundedRateLimiter({
  windowMs: 60 * 1000,
  maxEntries: 5000
});

// 後台變更限流：單一 IP 每分鐘最多 20 次儲存
const cmsSaveLimiter = createBoundedRateLimiter({
  windowMs: 60 * 1000,
  maxEntries: 1000
});

const ALLOWED_TRACK_EVENTS = new Set(['line', 'phone', 'leak', 'calc']);
const ALLOWED_HOURS_STATUS = new Set(['open', 'busy', 'rest', 'typhoon']);
const ALLOWED_ANNOUNCE_TYPES = new Set(['info', 'warning', 'alert']);
const MAX_CMS_BODY_BYTES = 64 * 1024; // 64 KB

function escapeText(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeNumber(val, defaultVal = 0, min = 0, max = 100000) {
  const num = parseInt(val, 10);
  if (Number.isNaN(num) || num < min || num > max) return defaultVal;
  return num;
}

// In-memory state persistent across warm Serverless invocations
let cmsState = {
  prices: {
    p16kg: 680,
    p20kg: 840,
    p10kg: 460,
    p4kg: 260,
    p50kg: 2050,
    note: '盛隆公道透明牌價 · 歡迎加入 LINE 官方帳號 @350MZOGG 即時配送'
  },
  hours: {
    status: 'open',
    statusText: '今日正常熱情配送中',
    dailyHours: '08:00 – 21:00',
    orderCutoff: '20:30',
    phone: '02-2972-5559',
    notice: '國定假日、春節、中秋照常配送不打烊'
  },
  announcement: {
    enabled: false,
    type: 'info',
    title: '盛隆暖心公告',
    content: '冷氣團來襲居家熱水用量增加，建議提早預約叫瓦斯避免洗澡受凍！'
  },
  stats: {
    lineClicks: 142,
    phoneClicks: 68,
    leakSopClicks: 53,
    calcClicks: 89,
    lastUpdated: new Date().toISOString()
  },
  customFaqs: []
};

function setCorsAndSecurityHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

export default async function handler(req, res) {
  setCorsAndSecurityHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Fetch current CMS settings & stats
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      data: cmsState,
      timestamp: new Date().toISOString()
    });
  }

  // POST: Either track CTA click event (public) or save CMS settings (authenticated)
  if (req.method === 'POST') {
    try {
      const rawString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (Buffer.byteLength(rawString, 'utf8') > MAX_CMS_BODY_BYTES) {
        return res.status(413).json({ success: false, error: '資料體積超出伺服器限制。' });
      }

      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const ip = getClientIp(req) || 'unknown';

      // 1. CTA Click Tracking (Anonymous Public Action with Anti-Spam Rate Limit)
      if (req.query?.action === 'track' || body.action === 'track') {
        const isTrackLimited = trackRateLimiter.check([{ key: `track:${ip}`, max: 40 }]);
        if (isTrackLimited) {
          res.setHeader('Retry-After', '60');
          return res.status(429).json({ success: false, error: '請求過於頻繁，請稍候。' });
        }

        const event = String(body.event || req.query?.event || '').trim().toLowerCase();
        if (!ALLOWED_TRACK_EVENTS.has(event)) {
          return res.status(400).json({ success: false, error: '未知的追蹤事件。' });
        }

        if (event === 'line') cmsState.stats.lineClicks = (cmsState.stats.lineClicks || 0) + 1;
        else if (event === 'phone') cmsState.stats.phoneClicks = (cmsState.stats.phoneClicks || 0) + 1;
        else if (event === 'leak') cmsState.stats.leakSopClicks = (cmsState.stats.leakSopClicks || 0) + 1;
        else if (event === 'calc') cmsState.stats.calcClicks = (cmsState.stats.calcClicks || 0) + 1;
        cmsState.stats.lastUpdated = new Date().toISOString();

        return res.status(200).json({
          success: true,
          stats: cmsState.stats
        });
      }

      // 2. CMS Settings Update (Requires Valid Token & Strict Sanitization)
      const isSaveLimited = cmsSaveLimiter.check([{ key: `save:${ip}`, max: 20 }]);
      if (isSaveLimited) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ success: false, error: '後台儲存過於頻繁，請稍候再試。' });
      }

      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : (body.token || '');

      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          error: '權限不足或登入已過期，請重新登入管理後台'
        });
      }

      // 嚴格過濾與驗證 Prices
      if (body.prices && typeof body.prices === 'object') {
        cmsState.prices = {
          p16kg: sanitizeNumber(body.prices.p16kg, cmsState.prices.p16kg),
          p20kg: sanitizeNumber(body.prices.p20kg, cmsState.prices.p20kg),
          p10kg: sanitizeNumber(body.prices.p10kg, cmsState.prices.p10kg),
          p4kg: sanitizeNumber(body.prices.p4kg, cmsState.prices.p4kg),
          p50kg: sanitizeNumber(body.prices.p50kg, cmsState.prices.p50kg),
          note: escapeText(String(body.prices.note || '').slice(0, 300))
        };
      }

      // 嚴格過濾與驗證 Hours
      if (body.hours && typeof body.hours === 'object') {
        const rawStatus = String(body.hours.status || '').toLowerCase();
        cmsState.hours = {
          status: ALLOWED_HOURS_STATUS.has(rawStatus) ? rawStatus : cmsState.hours.status,
          statusText: escapeText(String(body.hours.statusText || '').slice(0, 100)),
          dailyHours: escapeText(String(body.hours.dailyHours || '').slice(0, 100)),
          orderCutoff: escapeText(String(body.hours.orderCutoff || '').slice(0, 50)),
          phone: escapeText(String(body.hours.phone || '').slice(0, 50)),
          notice: escapeText(String(body.hours.notice || '').slice(0, 200))
        };
      }

      // 嚴格過濾與驗證 Announcement (防禦 Stored XSS)
      if (body.announcement && typeof body.announcement === 'object') {
        const rawType = String(body.announcement.type || '').toLowerCase();
        cmsState.announcement = {
          enabled: Boolean(body.announcement.enabled),
          type: ALLOWED_ANNOUNCE_TYPES.has(rawType) ? rawType : 'info',
          title: escapeText(String(body.announcement.title || '').slice(0, 60)),
          content: escapeText(String(body.announcement.content || '').slice(0, 300))
        };
      }

      // 嚴格過濾與驗證 Custom FAQs
      if (Array.isArray(body.customFaqs)) {
        cmsState.customFaqs = body.customFaqs.slice(0, 100).map(faq => ({
          q: escapeText(String(faq?.q || '').slice(0, 200)),
          a: escapeText(String(faq?.a || '').slice(0, 1000)),
          cat: escapeText(String(faq?.cat || '').slice(0, 50)),
          isCommon: Boolean(faq?.isCommon),
          image: faq?.image ? escapeText(String(faq.image).slice(0, 300)) : undefined
        }));
      }

      cmsState.lastUpdated = new Date().toISOString();
      cmsState.updatedBy = escapeText(decoded.user?.name || '管理員');

      return res.status(200).json({
        success: true,
        message: '官網設定已成功儲存並同步',
        data: cmsState
      });
    } catch (err) {
      console.error('CMS handler error:', err);
      return res.status(500).json({ success: false, error: '後台資料處理異常' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
