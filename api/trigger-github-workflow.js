import { getBearerToken, verifyToken, getClientIp, sendJson } from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';

/**
 * 盛隆瓦斯 — 遠端觸發 GitHub Actions Workflow 端點
 *
 * POST /api/trigger-github-workflow
 * Header: Authorization: Bearer <signed-token>
 * Body:   { "workflow": "sync-members" | "inspect-backup" }
 *
 * 安全機制：
 *  - 必須持有有效的後台 session token（Bearer）
 *  - GitHub PAT 保存於 Vercel 環境變數 GITHUB_ACTIONS_PAT（永不暴露給前端）
 *  - 使用 GitHub REST API workflow_dispatch event 觸發（無需開任何 Port）
 */

const ALLOWED_WORKFLOWS = {
  'sync-members': {
    file: 'sync-members.yml',
    label: '會員資料同步 (sync_customers_to_sheet.py)',
  },
  'inspect-backup': {
    file: 'inspect-backup.yml',
    label: '備份結構檢查 (inspect_backup.py)',
  },
};

function getGithubConfig() {
  const pat = process.env.GITHUB_ACTIONS_PAT;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const ref = process.env.GITHUB_WORKFLOW_REF || 'main';

  if (!pat || !owner || !repo) {
    throw new Error('GitHub Actions 環境變數未設定（GITHUB_ACTIONS_PAT / GITHUB_REPO_OWNER / GITHUB_REPO_NAME）');
  }
  return { pat, owner, repo, ref };
}

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  // ── 1. 驗證 session token ──────────────────────────────────────────────────
  const token = getBearerToken(req);
  const session = verifyToken(token);
  if (!session) {
    return sendJson(res, 401, { ok: false, error: '未授權：請先登入後台' });
  }

  // 只允許 admin 觸發遠端 workflow
  if (session.id !== 'ADMIN' && session.role !== 'admin') {
    return sendJson(res, 403, { ok: false, error: '權限不足：僅限管理員操作' });
  }

  // ── 2. 解析請求 body ───────────────────────────────────────────────────────
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return sendJson(res, 400, { ok: false, error: '無效的 JSON 請求' });
  }

  const workflowKey = String(body.workflow || '').trim();
  const workflowDef = ALLOWED_WORKFLOWS[workflowKey];
  if (!workflowDef) {
    return sendJson(res, 400, {
      ok: false,
      error: `未知的 workflow：${workflowKey}`,
      allowed: Object.keys(ALLOWED_WORKFLOWS),
    });
  }

  // ── 3. 呼叫 GitHub REST API 觸發 workflow_dispatch ────────────────────────
  let config;
  try {
    config = getGithubConfig();
  } catch (err) {
    console.error('[trigger-github-workflow] 設定錯誤:', err.message);
    return sendJson(res, 500, { ok: false, error: err.message });
  }

  const dispatchUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${workflowDef.file}/dispatches`;

  let githubResponse;
  try {
    githubResponse = await fetchWithTimeout(
      dispatchUrl,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.pat}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: config.ref }),
      },
      15000 // 15 秒 timeout
    );
  } catch (err) {
    console.error('[trigger-github-workflow] 網路錯誤:', err.message);
    return sendJson(res, 502, { ok: false, error: `無法連線至 GitHub API：${err.message}` });
  }

  // GitHub workflow_dispatch 成功時回傳 204 No Content
  if (githubResponse.status === 204) {
    const clientIp = getClientIp(req);
    console.log(
      `[trigger-github-workflow] ✅ 已觸發 ${workflowKey} — by ${session.id} from ${clientIp}`
    );
    return sendJson(res, 200, {
      ok: true,
      workflow: workflowKey,
      label: workflowDef.label,
      triggeredAt: new Date().toISOString(),
      triggeredBy: session.id,
      message: `✅ ${workflowDef.label} 已成功觸發，請至 GitHub Actions 查看執行進度。`,
    });
  }

  // 處理 GitHub API 錯誤
  let errorBody = '';
  try {
    errorBody = await githubResponse.text();
  } catch { /* ignore */ }

  console.error(
    `[trigger-github-workflow] GitHub API 錯誤 ${githubResponse.status}: ${errorBody}`
  );
  return sendJson(res, githubResponse.status >= 500 ? 502 : 422, {
    ok: false,
    error: `GitHub API 回傳錯誤 ${githubResponse.status}`,
    detail: errorBody,
  });
}
