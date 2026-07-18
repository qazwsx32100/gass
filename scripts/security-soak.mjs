import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
  }),
);

const baseUrl = String(args.base || process.env.ERP_PRODUCTION_URL || 'https://erp-weld-three-96.vercel.app').replace(/\/$/, '');
const durationMinutes = Number(args.minutes || 30);
const intervalSeconds = Number(args.interval || 30);
const outputFile = path.resolve(String(args.output || '.security-soak-results.jsonl'));
const durationMs = durationMinutes * 60 * 1000;
const intervalMs = intervalSeconds * 1000;
const startedAt = Date.now();

const checks = [
  { name: 'home', path: '/', method: 'GET', expectedStatus: 200 },
  { name: 'health', path: '/api/health', method: 'GET', expectedStatus: 200 },
  { name: 'app-state-get-unauth', path: '/api/app-state', method: 'GET', expectedStatus: 401 },
  { name: 'app-state-post-unauth', path: '/api/app-state', method: 'POST', expectedStatus: 401, body: '{}' },
  { name: 'email-verification-unauth', path: '/api/send-email-verification', method: 'POST', expectedStatus: 401, body: '{}' },
  { name: 'attachment-get-unauth', path: '/api/attachments', method: 'GET', expectedStatus: 401 },
  { name: 'attachment-post-unauth', path: '/api/attachments', method: 'POST', expectedStatus: 401, body: '{}' },
  { name: 'backup-public', path: '/backups/security-probe.json', method: 'GET', expectedStatus: 404 },
  { name: 'env-public', path: '/.env', method: 'GET', expectedStatus: 404 },
  { name: 'git-config-public', path: '/.git/config', method: 'GET', expectedStatus: 404 },
];

const stats = Object.fromEntries(
  checks.map((check) => [check.name, { count: 0, passed: 0, failed: 0, latencies: [], statuses: {} }]),
);
const failures = [];
let rounds = 0;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percent / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function appendResult(result) {
  fs.appendFileSync(outputFile, `${JSON.stringify(result)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runCheck(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const start = performance.now();

  try {
    const headers = {
      accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
      'user-agent': 'Shenglong-ERP-Safe-Monitor/1.0',
    };
    if (check.body !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(`${baseUrl}${check.path}`, {
      method: check.method,
      headers,
      body: check.body,
      redirect: 'manual',
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    const missingHeaders = [];
    if (!response.headers.get('content-security-policy')) missingHeaders.push('Content-Security-Policy');
    if (!response.headers.get('x-frame-options')) missingHeaders.push('X-Frame-Options');
    if (!response.headers.get('x-content-type-options')) missingHeaders.push('X-Content-Type-Options');

    const current = stats[check.name];
    current.count += 1;
    current.latencies.push(latencyMs);
    current.statuses[response.status] = (current.statuses[response.status] || 0) + 1;

    const passed = response.status === check.expectedStatus && missingHeaders.length === 0;
    if (passed) {
      current.passed += 1;
    } else {
      current.failed += 1;
      failures.push({
        at: new Date().toISOString(),
        check: check.name,
        status: response.status,
        expectedStatus: check.expectedStatus,
        missingHeaders,
        latencyMs,
      });
    }

    await response.arrayBuffer();
  } catch (error) {
    const current = stats[check.name];
    const latencyMs = Math.round(performance.now() - start);
    current.count += 1;
    current.failed += 1;
    current.latencies.push(latencyMs);
    failures.push({ at: new Date().toISOString(), check: check.name, error: String(error), latencyMs });
  } finally {
    clearTimeout(timeout);
  }
}

fs.writeFileSync(outputFile, '', 'utf8');
appendResult({
  type: 'start',
  baseUrl,
  startedAt: new Date(startedAt).toISOString(),
  durationMinutes,
  intervalSeconds,
  checks: checks.length,
});

while (Date.now() - startedAt < durationMs) {
  const roundStartedAt = Date.now();
  rounds += 1;
  for (const check of checks) await runCheck(check);

  const allStats = Object.values(stats);
  const requests = allStats.reduce((total, current) => total + current.count, 0);
  const failed = allStats.reduce((total, current) => total + current.failed, 0);
  const latencies = allStats.flatMap((current) => current.latencies);
  appendResult({
    type: 'progress',
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    rounds,
    requests,
    failed,
    p95Ms: percentile(latencies, 95),
    maxMs: latencies.length ? Math.max(...latencies) : 0,
  });

  const waitMs = intervalMs - (Date.now() - roundStartedAt);
  if (waitMs > 0 && Date.now() - startedAt + waitMs < durationMs) await sleep(waitMs);
}

const allStats = Object.values(stats);
const requests = allStats.reduce((total, current) => total + current.count, 0);
const failed = allStats.reduce((total, current) => total + current.failed, 0);
const latencies = allStats.flatMap((current) => current.latencies);
const byCheck = Object.fromEntries(
  Object.entries(stats).map(([name, current]) => [name, {
    count: current.count,
    passed: current.passed,
    failed: current.failed,
    statuses: current.statuses,
    p50Ms: percentile(current.latencies, 50),
    p95Ms: percentile(current.latencies, 95),
    maxMs: current.latencies.length ? Math.max(...current.latencies) : 0,
  }]),
);

appendResult({
  type: 'final',
  startedAt: new Date(startedAt).toISOString(),
  endedAt: new Date().toISOString(),
  durationSeconds: Math.round((Date.now() - startedAt) / 1000),
  rounds,
  requests,
  passed: requests - failed,
  failed,
  errorRate: requests ? Number(((failed / requests) * 100).toFixed(3)) : 0,
  latency: {
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    maxMs: latencies.length ? Math.max(...latencies) : 0,
  },
  byCheck,
  failures: failures.slice(0, 100),
});
