const baseUrl = (process.argv[2] || process.env.ERP_BASE_URL || 'https://erp-weld-three-96.vercel.app').replace(/\/$/, '');

const checks = [
  { name: 'home', method: 'GET', path: '/', expectedStatus: 200 },
  { name: 'api-health', method: 'GET', path: '/api/health', expectedStatus: 200 },
  { name: 'app-state-get-unauth', method: 'GET', path: '/api/app-state', expectedStatus: 401 },
  {
    name: 'app-state-post-unauth',
    method: 'POST',
    path: '/api/app-state',
    expectedStatus: 401,
    body: JSON.stringify({ state: {} }),
    headers: { 'content-type': 'application/json' }
  },
  {
    name: 'email-verification-unauth',
    method: 'POST',
    path: '/api/send-email-verification',
    expectedStatus: 401,
    body: JSON.stringify({ email: 'test@example.com' }),
    headers: { 'content-type': 'application/json' }
  },
  {
    name: 'backup-file-public',
    method: 'GET',
    path: '/backups/BusinessPilot_Backup_2026-07-07.json',
    expectedStatus: 404
  }
];

let failed = false;

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    method: check.method,
    headers: check.headers,
    body: check.body,
    redirect: 'manual'
  });

  const result = {
    name: check.name,
    status: response.status,
    expectedStatus: check.expectedStatus,
    csp: Boolean(response.headers.get('content-security-policy')),
    xFrame: Boolean(response.headers.get('x-frame-options')),
    nosniff: response.headers.get('x-content-type-options') === 'nosniff'
  };

  const ok = result.status === result.expectedStatus && result.csp && result.xFrame && result.nosniff;
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}`);
}

if (failed) {
  process.exitCode = 1;
}
