import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- Supabase Cloud Sync ---
let supabase = null;
function initSupabase() {
  const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const url = envUrl || config.supabaseUrl;
  const key = envKey || config.supabaseKey;
  if (url && key) {
    try {
      supabase = createClient(url, key);
      console.log(`[Supabase Sync] ✅ 成功連接至雲端 Supabase`);
    } catch (e) {
      console.warn('[Supabase Sync] 初始化失敗:', e.message);
    }
  }
}

// --- Configuration Storage ---
let config = {
  port: 3333,
  strategy: 'failover', // 'failover' | 'round-robin'
  cooldownSeconds: 60,
  accounts: [
    { id: 'acc-1', name: 'Gemini 帳號 1 (主要帳號)', apiKey: '', enabled: true },
    { id: 'acc-2', name: 'Gemini 帳號 2 (備援帳號 A)', apiKey: '', enabled: true },
    { id: 'acc-3', name: 'Gemini 帳號 3 (備援帳號 B)', apiKey: '', enabled: true }
  ]
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      config = { ...config, ...data };
    } else {
      saveConfig();
    }
  } catch (err) {
    console.error('Failed to load config.json:', err);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    if (supabase && config.accounts) {
      supabase.from('ai_accounts').upsert(config.accounts.map((a, i) => ({
        id: a.id,
        name: a.name,
        provider: a.provider || (a.apiKey && a.apiKey.startsWith('sk-') ? 'openai' : 'gemini'),
        api_key: a.apiKey,
        enabled: a.enabled,
        priority: a.provider === 'openai' ? 99 : (i + 1),
        updated_at: new Date().toISOString()
      }))).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to save config.json:', err);
  }
}

loadConfig();
initSupabase();

// --- Runtime Account State & Metrics ---
const accountState = new Map();

function ensureAccountState(id) {
  if (!accountState.has(id)) {
    accountState.set(id, {
      status: 'idle', // 'idle' | 'cooldown' | 'error'
      cooldownUntil: 0,
      totalRequests: 0,
      todayRequests: 0,
      totalTokens: 0,
      dailyQuotaLimit: 1500, // Google Free Tier default is 1,500 RPD
      successRequests: 0,
      rateLimitHits: 0,
      lastLatencyMs: 0,
      lastUsedAt: null,
      lastError: null
    });
  }
  return accountState.get(id);
}

// Initialize all accounts in state
config.accounts.forEach(acc => ensureAccountState(acc.id));

let roundRobinIndex = 0;
const recentLogs = [];
const MAX_LOGS = 100;

function addLog(entry) {
  recentLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry
  });
  if (recentLogs.length > MAX_LOGS) recentLogs.pop();
}

function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

function isAccountOpenAI(acc) {
  if (acc.provider === 'openai') return true;
  if (acc.provider === 'gemini') return false;
  return Boolean(acc.apiKey && acc.apiKey.startsWith('sk-'));
}

function mapModel(requestedModel, targetProvider) {
  if (targetProvider === 'openai') {
    if (!requestedModel || requestedModel.startsWith('gemini')) {
      if (requestedModel && requestedModel.includes('pro')) return 'gpt-4o';
      return 'gpt-4o-mini';
    }
    return requestedModel;
  } else {
    if (!requestedModel || requestedModel.startsWith('gpt')) {
      if (requestedModel && requestedModel.includes('gpt-4o') && !requestedModel.includes('mini')) return 'gemini-2.5-pro';
      return 'gemini-3.8-flash';
    }
    return requestedModel;
  }
}

// Check cooldown expiry
function updateCooldowns() {
  const now = Date.now();
  for (const [id, state] of accountState.entries()) {
    if (state.status === 'cooldown' && now >= state.cooldownUntil) {
      state.status = 'idle';
      state.lastError = null;
    }
  }
}

// Get candidate accounts based on current strategy
function getCandidateAccounts() {
  updateCooldowns();
  const validAccounts = config.accounts.filter(a => a.enabled && a.apiKey && a.apiKey.trim().length > 10);
  
  if (validAccounts.length === 0) return [];

  // Split into available (not cooling down) and cooling down
  const now = Date.now();
  const available = validAccounts.filter(a => {
    const st = ensureAccountState(a.id);
    return st.cooldownUntil <= now;
  });

  if (config.strategy === 'round-robin') {
    if (available.length > 0) {
      // Rotate starting from roundRobinIndex
      const startIdx = roundRobinIndex % available.length;
      roundRobinIndex = (roundRobinIndex + 1) % 10000;
      return [...available.slice(startIdx), ...available.slice(0, startIdx)];
    }
  }

  // Default failover: keep configured list order
  if (available.length > 0) {
    return available;
  }

  // If all are cooling down, sort by earliest cooldown finish
  return [...validAccounts].sort((a, b) => {
    const stA = ensureAccountState(a.id);
    const stB = ensureAccountState(b.id);
    return stA.cooldownUntil - stB.cooldownUntil;
  });
}

// --- Request Body Parser Helper ---
async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key'
  });
  res.end(JSON.stringify(data));
}

// --- HTTP Server ---
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Dashboard Web UI
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || pathname === '/index.html')) {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(indexPath).pipe(res);
    }
    return sendJson(res, 404, { error: 'Dashboard UI index.html not found' });
  }

  // 2. Status API for Dashboard
  if (req.method === 'GET' && pathname === '/api/status') {
    updateCooldowns();
    const now = Date.now();
    const accountsData = config.accounts.map(acc => {
      const state = ensureAccountState(acc.id);
      const remainingCooldown = Math.max(0, Math.ceil((state.cooldownUntil - now) / 1000));
      const dailyLimit = state.dailyQuotaLimit || 1500;
      const todayUsed = state.todayRequests || 0;
      const remainingRequests = Math.max(0, dailyLimit - todayUsed);
      const quotaPercent = Math.max(0, Math.min(100, Math.round((remainingRequests / dailyLimit) * 100)));
      return {
        id: acc.id,
        name: acc.name,
        apiKeyMasked: maskApiKey(acc.apiKey),
        hasKey: Boolean(acc.apiKey && acc.apiKey.trim().length > 10),
        enabled: acc.enabled,
        provider: isAccountOpenAI(acc) ? 'openai' : 'gemini',
        status: state.status,
        remainingCooldown,
        totalRequests: state.totalRequests,
        todayRequests: todayUsed,
        totalTokens: state.totalTokens || 0,
        dailyQuotaLimit: dailyLimit,
        remainingRequests,
        quotaPercent,
        successRequests: state.successRequests,
        rateLimitHits: state.rateLimitHits,
        lastLatencyMs: state.lastLatencyMs,
        lastUsedAt: state.lastUsedAt,
        lastError: state.lastError
      };
    });

    const activeCount = accountsData.filter(a => a.enabled && a.hasKey && a.status !== 'cooldown').length;
    const totalRequests = accountsData.reduce((sum, a) => sum + a.totalRequests, 0);
    const totalRateLimits = accountsData.reduce((sum, a) => sum + a.rateLimitHits, 0);

    return sendJson(res, 200, {
      strategy: config.strategy,
      cooldownSeconds: config.cooldownSeconds,
      port: config.port,
      summary: {
        activeCount,
        totalCount: accountsData.length,
        totalRequests,
        totalRateLimits,
        uptime: process.uptime()
      },
      accounts: accountsData,
      logs: recentLogs.slice(0, 50)
    });
  }

  // 3. Update Configuration API
  if (req.method === 'POST' && pathname === '/api/config') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw);

      if (payload.strategy) config.strategy = payload.strategy;
      if (typeof payload.cooldownSeconds === 'number') config.cooldownSeconds = Math.max(10, payload.cooldownSeconds);

      if (Array.isArray(payload.accounts)) {
        config.accounts = payload.accounts.map(newAcc => {
          const oldAcc = config.accounts.find(a => a.id === newAcc.id) || {};
          // Preserve existing API key if masked or empty sent back
          let finalKey = (newAcc.apiKey || '').trim();
          if (finalKey.includes('...') || finalKey === '') {
            finalKey = oldAcc.apiKey || '';
          }
          const prov = newAcc.provider || oldAcc.provider || (finalKey.startsWith('sk-') ? 'openai' : 'gemini');
          return {
            id: newAcc.id || `acc-${Date.now()}`,
            name: newAcc.name || oldAcc.name || 'AI 帳號',
            provider: prov,
            apiKey: finalKey,
            enabled: newAcc.enabled !== false
          };
        });
        config.accounts.forEach(a => ensureAccountState(a.id));
      }

      saveConfig();
      addLog({ type: 'config', detail: '更新系統配置與帳號設定', status: 'success' });
      return sendJson(res, 200, { success: true, message: '設定已更新' });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // 4. Reset Cooldown API
  if (req.method === 'POST' && pathname.match(/^\/api\/accounts\/([^/]+)\/reset$/)) {
    const accId = pathname.split('/')[3];
    const state = ensureAccountState(accId);
    state.status = 'idle';
    state.cooldownUntil = 0;
    state.lastError = null;
    addLog({ type: 'manual_reset', accountId: accId, detail: `手動解除冷卻狀態`, status: 'success' });
    return sendJson(res, 200, { success: true, message: '已解除冷卻狀態' });
  }

  // 5. Toggle Account API
  if (req.method === 'POST' && pathname.match(/^\/api\/accounts\/([^/]+)\/toggle$/)) {
    const accId = pathname.split('/')[3];
    const acc = config.accounts.find(a => a.id === accId);
    if (acc) {
      acc.enabled = !acc.enabled;
      saveConfig();
      addLog({ type: 'toggle', accountId: accId, detail: `${acc.enabled ? '啟用' : '停用'} 帳號`, status: 'info' });
      return sendJson(res, 200, { success: true, enabled: acc.enabled });
    }
    return sendJson(res, 404, { error: 'Account not found' });
  }

  // 6. Test Key Connection API
  if (req.method === 'POST' && pathname === '/api/test') {
    try {
      const raw = await readBody(req);
      const { accountId } = JSON.parse(raw || '{}');
      const targetAccounts = accountId ? config.accounts.filter(a => a.id === accountId) : config.accounts.filter(a => a.apiKey);

      if (targetAccounts.length === 0) {
        return sendJson(res, 400, { error: '沒有已填寫 API Key 的帳號可測試' });
      }

      const results = [];
      for (const acc of targetAccounts) {
        const startTime = Date.now();
        try {
          let testRes;
          if (isAccountOpenAI(acc)) {
            testRes = await fetch('https://api.openai.com/v1/models', {
              headers: { 'Authorization': `Bearer ${acc.apiKey}` },
              signal: AbortSignal.timeout(10000)
            });
          } else {
            testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(acc.apiKey)}`, {
              signal: AbortSignal.timeout(10000)
            });
          }

          const latencyMs = Date.now() - startTime;
          const resBody = await testRes.json().catch(() => ({}));

          if (testRes.ok) {
            results.push({ id: acc.id, name: acc.name, ok: true, latencyMs, message: '連線正常' });
          } else {
            const errMsg = resBody?.error?.message || `HTTP ${testRes.status}`;
            results.push({ id: acc.id, name: acc.name, ok: false, latencyMs, message: errMsg });
          }
        } catch (netErr) {
          results.push({ id: acc.id, name: acc.name, ok: false, latencyMs: Date.now() - startTime, message: netErr.message });
        }
      }

      return sendJson(res, 200, { results });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 7. OpenAI Compatible Models Endpoint
  if (req.method === 'GET' && pathname === '/v1/models') {
    return sendJson(res, 200, {
      object: 'list',
      data: [
        { id: 'gemini-2.5-pro', object: 'model', created: 1730000000, owned_by: 'google' },
        { id: 'gemini-2.5-flash', object: 'model', created: 1730000000, owned_by: 'google' },
        { id: 'gemini-2.0-flash', object: 'model', created: 1730000000, owned_by: 'google' },
        { id: 'gemini-2.0-flash-exp', object: 'model', created: 1730000000, owned_by: 'google' },
        { id: 'gemini-1.5-pro', object: 'model', created: 1720000000, owned_by: 'google' },
        { id: 'gemini-1.5-flash', object: 'model', created: 1720000000, owned_by: 'google' }
      ]
    });
  }

  // 8. Core Proxy: OpenAI Compatible /v1/chat/completions
  if (req.method === 'POST' && pathname === '/v1/chat/completions') {
    const rawBody = await readBody(req);
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return sendJson(res, 400, { error: { message: 'Invalid JSON request body', type: 'invalid_request_error' } });
    }

    const isStreaming = Boolean(parsedBody.stream);
    const requestedModel = parsedBody.model || 'gemini-2.5-flash';
    const candidates = getCandidateAccounts();

    if (candidates.length === 0) {
      return sendJson(res, 503, {
        error: {
          message: '沒有可用的 Gemini API 帳號。請在儀表板設定至少一組有效的 API Key。',
          type: 'service_unavailable'
        }
      });
    }

    const attempts = [];
    let success = false;
    let finalAccountId = null;

    for (let i = 0; i < candidates.length; i++) {
      const acc = candidates[i];
      const state = ensureAccountState(acc.id);
      const attemptStart = Date.now();
      state.totalRequests++;

      try {
        const isOpenAI = isAccountOpenAI(acc);
        const mappedModel = mapModel(requestedModel, isOpenAI ? 'openai' : 'gemini');
        const targetUrl = isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
        const targetBody = JSON.stringify({ ...parsedBody, model: mappedModel });

        const googleRes = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${acc.apiKey}`
          },
          body: targetBody
        });

        const latency = Date.now() - attemptStart;
        state.lastLatencyMs = latency;
        state.lastUsedAt = new Date().toISOString();

        // Check for 429 Rate Limit / Quota Exceeded
        if (googleRes.status === 429) {
          const errText = await googleRes.text().catch(() => '');
          state.rateLimitHits++;
          state.status = 'cooldown';
          state.cooldownUntil = Date.now() + config.cooldownSeconds * 1000;
          state.lastError = `429 Rate Limit (${new Date().toLocaleTimeString()})`;

          attempts.push({
            accountId: acc.id,
            accountName: acc.name,
            status: 429,
            latencyMs: latency,
            error: '429 Quota Exhausted'
          });

          addLog({
            type: 'failover',
            model: requestedModel,
            fromAccount: acc.name,
            detail: `觸發 429 限流，自動切換至下一組帳號 (冷卻 ${config.cooldownSeconds}s)`,
            status: 'warning'
          });

          // Continue to next available account!
          continue;
        }

        // Check for other errors (e.g. 401 Invalid Key, 403, 500)
        if (!googleRes.ok) {
          const errBody = await googleRes.text().catch(() => '');
          attempts.push({
            accountId: acc.id,
            accountName: acc.name,
            status: googleRes.status,
            latencyMs: latency,
            error: errBody.slice(0, 100)
          });
          // If 5xx server error, also retry next account
          if (googleRes.status >= 500) {
            continue;
          }
          // If 400 bad prompt, don't retry, forward client error
          res.writeHead(googleRes.status, {
            'Content-Type': googleRes.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(errBody);
        }

        // SUCCESS!
        state.successRequests++;
        state.status = 'idle';
        finalAccountId = acc.id;
        success = true;

        attempts.push({
          accountId: acc.id,
          accountName: acc.name,
          status: 200,
          latencyMs: latency
        });

        addLog({
          type: 'completion',
          model: requestedModel,
          accountName: acc.name,
          latencyMs: latency,
          failoverCount: i, // how many failovers occurred before success
          stream: isStreaming,
          status: 'success'
        });

        // Forward headers
        const forwardHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': googleRes.headers.get('content-type') || (isStreaming ? 'text/event-stream' : 'application/json'),
          'Cache-Control': isStreaming ? 'no-cache' : 'no-transform'
        };

        res.writeHead(200, forwardHeaders);

        state.todayRequests = (state.todayRequests || 0) + 1;

        if (isStreaming && googleRes.body) {
          // Stream directly to client
          const reader = googleRes.body.getReader();
          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunkStr = Buffer.from(value).toString('utf-8');
                const m = chunkStr.match(/"total_tokens":\s*(\d+)/);
                if (m) state.totalTokens = (state.totalTokens || 0) + parseInt(m[1], 10);
                res.write(value);
              }
              res.end();
            } catch (streamErr) {
              console.error('Stream piping error:', streamErr);
              res.end();
            }
          };
          return pump();
        } else {
          const resData = await googleRes.arrayBuffer();
          try {
            const parsed = JSON.parse(Buffer.from(resData).toString('utf-8'));
            if (parsed?.usage?.total_tokens) {
              state.totalTokens = (state.totalTokens || 0) + parsed.usage.total_tokens;
            }
          } catch {}
          return res.end(Buffer.from(resData));
        }

      } catch (reqErr) {
        attempts.push({
          accountId: acc.id,
          accountName: acc.name,
          status: 'network_error',
          error: reqErr.message
        });
        continue;
      }
    }

    // If reached here, all candidate accounts failed
    addLog({
      type: 'exhausted',
      model: requestedModel,
      detail: `所有帳號均已嘗試但皆失敗 (共 ${candidates.length} 組帳號)`,
      status: 'error'
    });

    return sendJson(res, 429, {
      error: {
        message: '所有 Gemini 帳號目前皆處於限流冷卻中或無效。請稍候幾十秒後再試，或在儀表板查看即時狀態。',
        type: 'all_keys_rate_limited',
        attempts
      }
    });
  }

  // 9. Gemini Native API Proxy (/v1beta/models/*)
  if (pathname.startsWith('/v1beta/models/')) {
    const rawBody = await readBody(req);
    const candidates = getCandidateAccounts();

    if (candidates.length === 0) {
      return sendJson(res, 503, { error: { message: '沒有可用的 Gemini API 帳號' } });
    }

    for (let i = 0; i < candidates.length; i++) {
      const acc = candidates[i];
      const state = ensureAccountState(acc.id);
      const attemptStart = Date.now();
      state.totalRequests++;

      try {
        const targetUrl = new URL(`https://generativelanguage.googleapis.com${pathname}${parsedUrl.search}`);
        targetUrl.searchParams.set('key', acc.apiKey);

        const googleRes = await fetch(targetUrl.toString(), {
          method: req.method,
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/json'
          },
          body: req.method !== 'GET' ? rawBody : undefined
        });

        const latency = Date.now() - attemptStart;
        state.lastLatencyMs = latency;
        state.lastUsedAt = new Date().toISOString();

        if (googleRes.status === 429) {
          state.rateLimitHits++;
          state.status = 'cooldown';
          state.cooldownUntil = Date.now() + config.cooldownSeconds * 1000;
          continue;
        }

        if (googleRes.ok) {
          state.successRequests++;
          const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': googleRes.headers.get('content-type') || 'application/json'
          };
          res.writeHead(googleRes.status, headers);
          const buf = await googleRes.arrayBuffer();
          return res.end(Buffer.from(buf));
        }

        if (googleRes.status >= 500) continue;

        res.writeHead(googleRes.status, { 'Access-Control-Allow-Origin': '*' });
        const buf = await googleRes.arrayBuffer();
        return res.end(Buffer.from(buf));
      } catch {
        continue;
      }
    }

    return sendJson(res, 429, { error: { message: '所有 Gemini 帳號皆已限流' } });
  }

  // Default 404
  sendJson(res, 404, { error: 'Not Found' });
});

const PORT = config.port || 3333;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Gemini Multi-Account Rotator & Dashboard 已啟動！`);
  console.log(`📊 視覺化監控儀表板: http://localhost:${PORT}`);
  console.log(`🔌 OpenAI 相容端點:   http://localhost:${PORT}/v1`);
  console.log(`=======================================================`);
});
