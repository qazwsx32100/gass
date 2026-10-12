import { verifyToken } from './auth.js';

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
    status: 'open', // 'open' | 'busy' | 'rest' | 'typhoon'
    statusText: '今日正常熱情配送中',
    dailyHours: '08:00 – 21:00',
    orderCutoff: '20:30',
    phone: '02-2972-5559',
    notice: '國定假日、春節、中秋照常配送不打烊'
  },
  announcement: {
    enabled: false,
    type: 'info', // 'info' | 'warning' | 'alert'
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

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

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
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

      // 1. CTA Click Tracking (Anonymous Public Action)
      if (req.query?.action === 'track' || body.action === 'track') {
        const event = body.event || req.query?.event;
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

      // 2. CMS Settings Update (Requires Valid Token)
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

      // Merge new settings safely
      if (body.prices && typeof body.prices === 'object') {
        cmsState.prices = { ...cmsState.prices, ...body.prices };
      }
      if (body.hours && typeof body.hours === 'object') {
        cmsState.hours = { ...cmsState.hours, ...body.hours };
      }
      if (body.announcement && typeof body.announcement === 'object') {
        cmsState.announcement = { ...cmsState.announcement, ...body.announcement };
      }
      if (Array.isArray(body.customFaqs)) {
        cmsState.customFaqs = body.customFaqs;
      }
      cmsState.lastUpdated = new Date().toISOString();
      cmsState.updatedBy = decoded.user?.name || '管理員';

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
