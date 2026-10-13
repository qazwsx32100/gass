import { getSupabase, sendJson, getClientIp } from './_auth.js';
import { getAiCandidates } from './_ai-rotator.js';
import { createBoundedRateLimiter } from './_rateLimit.js';

const aiStatusRateLimiter = createBoundedRateLimiter({
  windowMs: 60 * 1000,
  maxEntries: 2000
});

/**
 * 盛隆瓦斯 雲端 AI 輪調狀態監控 API
 * 端點: GET /api/ai-status
 * 供本機監控面板 (localhost:3333) 與後台儀表板即時讀取雲端狀態
 */
export default async function handler(req, res) {
  // CORS 與安全標頭設定
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  // IP 速率限制
  const clientIp = getClientIp(req) || 'unknown';
  if (aiStatusRateLimiter.check([{ key: `ai_status:${clientIp}`, max: 30 }])) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { ok: false, error: '請求過於頻繁，請稍候重試。' });
  }

  let supabaseConnected = false;
  let accountsData = [];
  let recentLogs = [];

  try {
    const supabase = getSupabase(5000);
    
    // 1. 嘗試由 Supabase 讀取帳號與狀態
    const { data: dbAccounts, error: accError } = await supabase
      .from('ai_accounts')
      .select('*')
      .order('priority', { ascending: true });

    if (!accError && Array.isArray(dbAccounts) && dbAccounts.length > 0) {
      supabaseConnected = true;
      accountsData = dbAccounts.map(a => ({
        id: a.id,
        name: a.name,
        provider: a.provider || (a.api_key && a.api_key.startsWith('sk-') ? 'openai' : 'gemini'),
        apiKeyMasked: a.api_key ? (a.api_key.slice(0, 7) + '...' + a.api_key.slice(-4)) : '(未設定)',
        hasKey: Boolean(a.api_key && a.api_key.length > 10),
        enabled: a.enabled,
        priority: a.priority,
        status: a.status || 'idle',
        todayRequests: a.today_requests || 0,
        totalRequests: a.total_requests || 0,
        totalTokens: a.total_tokens || 0,
        dailyQuotaLimit: a.provider === 'openai' ? 99999 : 1500,
        remainingRequests: a.provider === 'openai' ? 99999 : Math.max(0, 1500 - (a.today_requests || 0)),
        quotaPercent: a.provider === 'openai' ? 100 : Math.max(0, Math.min(100, Math.round(((1500 - (a.today_requests || 0)) / 1500) * 100))),
        successRequests: a.success_requests || 0,
        rateLimitHits: a.rate_limit_hits || 0,
        lastLatencyMs: a.last_latency_ms || 0,
        lastUsedAt: a.last_used_at,
        lastError: a.last_error
      }));
    }

    // 2. 嘗試讀取最近日誌
    if (supabaseConnected) {
      const { data: dbLogs } = await supabase
        .from('ai_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (Array.isArray(dbLogs)) {
        recentLogs = dbLogs;
      }
    }
  } catch (err) {
    // Supabase 暫時不可用或尚未建立 table
  }

  // 若尚未建立 Supabase table，自動回傳伺服器環境變數設定的候選帳號清單
  if (accountsData.length === 0) {
    const fallbackCandidates = await getAiCandidates(true);
    accountsData = fallbackCandidates.map((c, i) => {
      const isOAI = c.provider === 'openai';
      return {
        id: c.id,
        name: c.name,
        provider: c.provider,
        apiKeyMasked: c.apiKey ? (c.apiKey.slice(0, 7) + '...' + c.apiKey.slice(-4)) : '(未設定)',
        hasKey: Boolean(c.apiKey && c.apiKey.length > 10),
        enabled: c.enabled,
        priority: c.priority,
        status: c.status || 'idle',
        todayRequests: 0,
        totalRequests: 0,
        totalTokens: 0,
        dailyQuotaLimit: isOAI ? 99999 : 1500,
        remainingRequests: isOAI ? 99999 : 1500,
        quotaPercent: 100,
        successRequests: 0,
        rateLimitHits: 0,
        lastLatencyMs: 0,
        lastUsedAt: null,
        lastError: null
      };
    });
  }

  const activeCount = accountsData.filter(a => a.enabled && a.hasKey && a.status !== 'cooldown').length;
  const totalRequests = accountsData.reduce((sum, a) => sum + (a.totalRequests || 0), 0);
  const totalRateLimits = accountsData.reduce((sum, a) => sum + (a.rateLimitHits || 0), 0);

  return sendJson(res, 200, {
    ok: true,
    service: 'gass-ai-rotator-cloud',
    supabaseConnected,
    summary: {
      activeCount,
      totalCount: accountsData.length,
      totalRequests,
      totalRateLimits,
      uptime: process.uptime()
    },
    accounts: accountsData,
    logs: recentLogs
  });
}
