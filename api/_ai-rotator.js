import { getSupabase } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';

import fs from 'node:fs';
import path from 'node:path';

// In-memory cache for serverless environments (10s TTL to reduce DB roundtrips)
let cachedCandidates = null;
let cacheExpiresAt = 0;

function loadFallbackAccounts() {
  // 1. Try environment variables
  const envAccounts = [
    { id: 'acc-1', name: 'qaz', provider: 'gemini', apiKey: process.env.GEMINI_KEY_1 || '', enabled: true, priority: 1 },
    { id: 'acc-2', name: '無名', provider: 'gemini', apiKey: process.env.GEMINI_KEY_2 || '', enabled: true, priority: 2 },
    { id: 'acc-3', name: '神燈', provider: 'gemini', apiKey: process.env.GEMINI_KEY_3 || '', enabled: true, priority: 3 },
    { id: 'acc-4', name: 'OpenAI (備援防線)', provider: 'openai', apiKey: process.env.OPENAI_API_KEY || '', enabled: true, priority: 99 }
  ];
  const withKeys = envAccounts.filter(a => a.apiKey);
  if (withKeys.length > 0) return withKeys;

  // 2. Try loading from local config.json if available
  try {
    const localCfgPath = path.resolve(process.cwd(), 'tools', 'gemini-rotator', 'config.json');
    if (fs.existsSync(localCfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(localCfgPath, 'utf8'));
      if (Array.isArray(cfg.accounts) && cfg.accounts.length > 0) {
        return cfg.accounts.map((a, i) => ({
          id: a.id,
          name: a.name,
          provider: a.provider || (a.apiKey && a.apiKey.startsWith('sk-') ? 'openai' : 'gemini'),
          apiKey: a.apiKey || '',
          enabled: a.enabled !== false,
          priority: a.provider === 'openai' ? 99 : (i + 1)
        }));
      }
    }
  } catch {
    // Non-fatal
  }

  return envAccounts;
}

/**
 * 取得目前可用的候選帳號清單 (優先從 Supabase 讀取並附帶快取)
 */
export async function getAiCandidates(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedCandidates && cacheExpiresAt > now) {
    return cachedCandidates;
  }

  try {
    const supabase = getSupabase(5000);
    const { data, error } = await supabase.rpc('erp_ai_get_candidates');
    if (!error && Array.isArray(data) && data.length > 0) {
      cachedCandidates = data.map(item => ({
        id: item.id,
        name: item.name,
        provider: item.provider || 'gemini',
        apiKey: item.api_key,
        enabled: item.enabled,
        priority: item.priority || 1,
        status: item.status || 'idle',
        cooldownUntil: item.cooldown_until ? new Date(item.cooldown_until).getTime() : 0
      }));
      cacheExpiresAt = now + 10_000;
      return cachedCandidates;
    }
  } catch (err) {
    // Non-fatal, use fallback accounts
  }

  cachedCandidates = loadFallbackAccounts();
  cacheExpiresAt = now + 10_000;
  return cachedCandidates;
}

/**
 * 記錄 429 冷卻狀態至 Supabase
 */
async function reportCooldown(accountId, cooldownSeconds = 60, errorMsg = '') {
  try {
    const supabase = getSupabase(4000);
    await supabase.rpc('erp_ai_set_cooldown', {
      p_account_id: accountId,
      p_cooldown_seconds: cooldownSeconds,
      p_error: String(errorMsg || '').slice(0, 500)
    });
  } catch (err) {
    // Non-blocking
  }
}

/**
 * 記錄呼叫成功狀態至 Supabase
 */
async function reportSuccess(accountId, tokens = 0, latencyMs = 0, model = '') {
  try {
    const supabase = getSupabase(4000);
    await supabase.rpc('erp_ai_record_success', {
      p_account_id: accountId,
      p_tokens: tokens,
      p_latency_ms: latencyMs,
      p_model: model
    });
  } catch (err) {
    // Non-blocking
  }
}

/**
 * 核心自動輪調呼叫方法 (自動處理 429 限流與容錯轉移)
 * 流程：Gemini 1 -> Gemini 2 -> Gemini 3 -> OpenAI 備援防線
 */
export async function callAiWithFailover({
  prompt = '',
  messages = [],
  systemInstruction = '',
  temperature = 0.7,
  preferredModel = 'gemini-3.8-flash'
}) {
  const startTime = Date.now();
  const candidates = await getAiCandidates();
  const now = Date.now();

  // 整理輸入為標準 messages 陣列
  const fullMessages = [];
  if (systemInstruction) {
    fullMessages.push({ role: 'system', content: systemInstruction });
  }

  if (messages.length > 0) {
    fullMessages.push(...messages);
  } else if (prompt) {
    fullMessages.push({ role: 'user', content: prompt });
  }

  // 優先使用未冷卻的帳號
  const activeCandidates = candidates.filter(c => c.enabled && (c.status !== 'cooldown' || c.cooldownUntil <= now));
  const queue = activeCandidates.length > 0 ? activeCandidates : candidates.filter(c => c.enabled);

  if (queue.length === 0) {
    throw new Error('目前沒有任何啟用的 AI 帳號金鑰可用');
  }

  const errors = [];

  for (let i = 0; i < queue.length; i++) {
    const acc = queue[i];
    const attemptStart = Date.now();
    const isOpenAi = acc.provider === 'openai';

    const targetUrl = isOpenAi
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

    const targetModel = isOpenAi
      ? 'gpt-4o-mini'
      : (preferredModel || 'gemini-3.8-flash');

    try {
      const res = await fetchWithTimeout(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${acc.apiKey}`
        },
        body: JSON.stringify({
          model: targetModel,
          messages: fullMessages,
          temperature
        })
      }, 25000);

      const latencyMs = Date.now() - attemptStart;

      if (res.status === 429) {
        const errText = await res.text().catch(() => '');
        console.warn(`[AI Rotator] 帳號「${acc.name}」觸發 429 限流，自動轉移至下一組...`);
        acc.status = 'cooldown';
        acc.cooldownUntil = Date.now() + 60_000;
        reportCooldown(acc.id, 60, errText).catch(() => {});
        errors.push({ account: acc.name, status: 429, error: '429 Rate Limit' });
        continue;
      }

      if (res.status >= 500) {
        const errText = await res.text().catch(() => '');
        console.warn(`[AI Rotator] 帳號「${acc.name}」伺服器繁忙 (HTTP ${res.status})，自動轉移至下一組...`);
        errors.push({ account: acc.name, status: res.status, error: errText.slice(0, 100) });
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
      }

      const json = await res.json();
      const replyText = json.choices?.[0]?.message?.content || '';
      const totalTokens = json.usage?.total_tokens || 0;

      // 成功！非同步回報 Supabase
      reportSuccess(acc.id, totalTokens, latencyMs, targetModel).catch(() => {});

      return {
        text: replyText,
        accountId: acc.id,
        accountName: acc.name,
        provider: acc.provider,
        model: targetModel,
        tokens: totalTokens,
        latencyMs,
        failoverCount: i,
        totalDurationMs: Date.now() - startTime
      };
    } catch (err) {
      console.warn(`[AI Rotator] 帳號「${acc.name}」連線異常 [${err.message}], 切換下一組...`);
      errors.push({ account: acc.name, error: err.message });
      continue;
    }
  }

  const allErrStr = errors.map(e => `${e.account}: ${e.error}`).join(' | ');
  throw new Error(`所有 AI 帳號皆已用盡或限流: ${allErrStr}`);
}
