import crypto from 'node:crypto';
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

const CMS_BRIDGE_URL = process.env.WEBSITE_CMS_BRIDGE_URL || 'https://erp-weld-three-96.vercel.app/api/health?scope=website-cms';
const CMS_BRIDGE_SECRET = process.env.WEBSITE_CMS_BRIDGE_KEY || 'shenglong-cms-supabase-bridge-v1-2026';
const IS_TEST_ENV = process.env.NODE_ENV === 'test' || process.execArgv.includes('--test');

let lastCloudSyncAt = 0;
let isCloudPersisted = false;

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
    content: ''
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

function mergeCloudCmsState(cloudData) {
  if (!cloudData || typeof cloudData !== 'object') return;
  if (cloudData.prices && typeof cloudData.prices === 'object') {
    cmsState.prices = { ...cmsState.prices, ...cloudData.prices };
  }
  if (cloudData.hours && typeof cloudData.hours === 'object') {
    cmsState.hours = { ...cmsState.hours, ...cloudData.hours };
  }
  if (cloudData.announcement && typeof cloudData.announcement === 'object') {
    cmsState.announcement = { ...cmsState.announcement, ...cloudData.announcement };
  }
  if (cloudData.stats && typeof cloudData.stats === 'object') {
    cmsState.stats = {
      lineClicks: Math.max(Number(cmsState.stats.lineClicks) || 0, Number(cloudData.stats.lineClicks) || 0),
      phoneClicks: Math.max(Number(cmsState.stats.phoneClicks) || 0, Number(cloudData.stats.phoneClicks) || 0),
      leakSopClicks: Math.max(Number(cmsState.stats.leakSopClicks) || 0, Number(cloudData.stats.leakSopClicks) || 0),
      calcClicks: Math.max(Number(cmsState.stats.calcClicks) || 0, Number(cloudData.stats.calcClicks) || 0),
      lastUpdated: cloudData.stats.lastUpdated || cmsState.stats.lastUpdated
    };
  }
  if (Array.isArray(cloudData.customFaqs)) {
    cmsState.customFaqs = cloudData.customFaqs;
  }
  if (cloudData.lastUpdated) cmsState.lastUpdated = cloudData.lastUpdated;
  if (cloudData.updatedBy) cmsState.updatedBy = cloudData.updatedBy;
}

async function syncFromCloud(force = false) {
  if (IS_TEST_ENV) return false;
  const now = Date.now();
  if (!force && lastCloudSyncAt > 0 && now - lastCloudSyncAt < 10_000) {
    return isCloudPersisted;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(CMS_BRIDGE_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (response.ok) {
      const payload = await response.json();
      if (payload?.ok) {
        isCloudPersisted = true;
        lastCloudSyncAt = Date.now();
        if (payload.data) {
          mergeCloudCmsState(payload.data);
        }
        return true;
      }
    }
  } catch {
    // Fallback to in-memory state if network hiccup
  }
  return isCloudPersisted;
}

async function pushToCloud(payloadObj) {
  if (IS_TEST_ENV) return false;
  try {
    const rawBody = JSON.stringify(payloadObj);
    const sig = crypto.createHmac('sha256', CMS_BRIDGE_SECRET).update(rawBody).digest('hex');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(CMS_BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CMS-Bridge-Sig': sig
      },
      body: rawBody,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (response.ok) {
      const resJson = await response.json();
      if (resJson?.ok && resJson.data) {
        mergeCloudCmsState(resJson.data);
        isCloudPersisted = true;
        lastCloudSyncAt = Date.now();
        return true;
      }
    }
  } catch {
    // Non-fatal fallback
  }
  return false;
}

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

  // GET: Fetch current CMS settings & stats (synced from Supabase Cloud)
  if (req.method === 'GET') {
    const persisted = await syncFromCloud(false);
    return res.status(200).json({
      success: true,
      persisted,
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
        else if (event === 'phone') cmsState.stats.phoneClicks = (Number(cmsState.stats.phoneClicks) || 0) + 1;
        else if (event === 'leak') cmsState.stats.leakSopClicks = (Number(cmsState.stats.leakSopClicks) || 0) + 1;
        else if (event === 'calc') cmsState.stats.calcClicks = (Number(cmsState.stats.calcClicks) || 0) + 1;
        cmsState.stats.lastUpdated = new Date().toISOString();

        const persisted = await pushToCloud({
          action: 'track',
          event,
          fallbackState: cmsState
        });

        return res.status(200).json({
          success: true,
          persisted,
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

      // 先與雲端同步最新狀態（避免覆蓋其他欄位的既有設定）
      await syncFromCloud(true);

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

      const persisted = await pushToCloud({
        action: 'save',
        cmsState,
        updatedBy: cmsState.updatedBy
      });

      return res.status(200).json({
        success: true,
        persisted,
        message: persisted ? '官網設定已永久儲存至雲端資料庫並同步' : '官網設定已成功儲存並同步',
        data: cmsState
      });
    } catch (err) {
      console.error('CMS handler error:', err);
      return res.status(500).json({ success: false, error: '後台資料處理異常' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
