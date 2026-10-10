const base = new URL(process.env.STAGING_API_URL || 'http://127.0.0.1:3000');
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('Remote smoke tests require HTTPS');
}
const tests = [
  ['GET', '/', 200],
  ['GET', '/library', 200],
  ['GET', '/admin/extract', 200],
  ['GET', '/admin/import', 200],
  ['GET', '/api/v1/library', 401],
  ['POST', '/api/v1/library/00000000-0000-4000-8000-000000000001/test', 401],
  ['POST', '/api/import/questions-json', 401],
  ['GET', '/api/internal/ready', 401],
  ['POST', '/api/v1/tests', 401],
  ['POST', '/api/mini-tests/00000000-0000-4000-8000-000000000001/submit', 401],
  ['GET', '/api/v1/ingestions', 401],
  ['GET', '/api/v1/attempts', 401],
  ['GET', '/api/v1/progress', 401],
  ['GET', '/api/progress/summary', 401],
  ['POST', '/api/v1/uploads', 401],
];
let failed = false;
for (const [method, path, expected] of tests) {
  const response = await fetch(new URL(path, base), {
    method, redirect: 'manual', signal: AbortSignal.timeout(15_000),
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
  });
  const ok = response.status === expected && (!path.startsWith('/admin/') ||
    (await response.text()).includes('Bạn chưa có quyền truy cập'));
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${method} ${path}: ${response.status} (expected ${expected})`);
}
if (failed) process.exitCode = 1;
