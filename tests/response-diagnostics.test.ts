import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { apiFailureMessage, withSupportCode } from '../shared/response-diagnostics';
import { apiRequest, ApiError } from '../mobile/src/lib/api';

const serverId = '11111111-1111-4111-8111-111111111111';
const oldId = '22222222-2222-4222-8222-222222222222';

test('web support message accepts legacy/v1 errors and only the response ID, without copying private metadata', () => {
  const response = Response.json({}, { status: 503, headers: { 'x-request-id': serverId, 'set-cookie': 'private-cookie', 'x-provider-token': 'private-token' } });
  for (const error of ['Hãy thử lại.', { message: 'Hãy thử lại.', code: 'BUSY' }]) {
    const payload = { error, requestId: oldId, token: 'private-token', url: 'https://private.invalid/?signature=secret' };
    const message = apiFailureMessage(response, payload, 'fallback');
    assert.equal(message, `Hãy thử lại.\nMã hỗ trợ: ${serverId}`);
    for (const secret of [oldId, 'private-cookie', 'private-token', 'signature']) assert.ok(!message.includes(secret));
  }
  assert.equal(response.headers.get('set-cookie'), 'private-cookie');
});

test('missing/malformed bodies use friendly fallback; invalid support IDs never enter the message or ApiError property', () => {
  const response = new Response(null, { headers: { 'x-request-id': serverId } });
  for (const payload of [null, '', [], { error: {} }, { error: { message: {} } }, { error: ' ' }]) {
    assert.equal(apiFailureMessage(response, payload, 'Không tải được.'), `Không tải được.\nMã hỗ trợ: ${serverId}`);
  }
  for (const value of [undefined, null, oldId.toUpperCase().replace('22222222', 'ABCDEFAB'), 'not-an-id',
    `${serverId}\nprivate-header`, `https://private.invalid/${serverId}`, [serverId], { requestId: serverId }]) {
    assert.equal(withSupportCode('fallback', value), 'fallback');
    const error = new ApiError('fallback', 503, 'BUSY', value);
    assert.equal(error.requestId, undefined); assert.equal(error.message, 'fallback');
  }
});

async function mobileFixture(run: () => Promise<void>) {
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  process.env.EXPO_PUBLIC_API_URL = 'https://synthetic.invalid';
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
  try { await run(); }
  finally {
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL; else process.env.EXPO_PUBLIC_API_URL = previousUrl;
    if (descriptor) Object.defineProperty(globalThis, '__DEV__', descriptor); else Reflect.deleteProperty(globalThis, '__DEV__');
  }
}

test('mobile HTTP errors retain status/code for auth and show the server-issued support ID', async () => mobileFixture(async () => {
  const mocked = mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Đăng nhập lại.', code: 'UNAUTHORIZED' }, requestId: oldId },
    { status: 401, headers: { 'x-request-id': serverId } }));
  try {
    await assert.rejects(apiRequest('/api/v1/tests'), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.status, 401); assert.equal(error.code, 'UNAUTHORIZED');
      assert.equal(error.requestId, serverId); assert.equal(error.message, `Đăng nhập lại.\nMã hỗ trợ: ${serverId}`); return true;
    });
  } finally { mocked.mock.restore(); }
}));

test('mobile non-JSON HTTP failure and invalid successful JSON response still preserve correlation without showing response bodies', async () => mobileFixture(async () => {
  const responses = [new Response('<html>private-body</html>', { status: 503, headers: { 'x-request-id': serverId } }),
    new Response('private-body', { status: 200, headers: { 'x-request-id': oldId } })];
  const mocked = mock.method(globalThis, 'fetch', async () => responses.shift()!);
  try {
    for (const [status, id] of [[503, serverId], [502, oldId]] as const) await assert.rejects(apiRequest('/api/v1/tests'), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.status, status); assert.equal(error.requestId, id);
      assert.ok(error.message.includes(`Mã hỗ trợ: ${id}`)); assert.ok(!error.message.includes('private-body')); return true;
    });
  } finally { mocked.mock.restore(); }
}));

test('mobile never fabricates correlation for old API, provider IDs, malformed error values or network abort', async () => mobileFixture(async () => {
  const mocked = mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: { token: 'private-value' }, code: {} }, requestId: serverId },
    { status: 503, headers: { 'x-amz-request-id': serverId, 'x-request-id': 'private-value' } }));
  try {
    await assert.rejects(apiRequest('/api/v1/tests'), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.requestId, undefined); assert.equal(error.code, undefined);
      assert.equal(error.message, 'Máy chủ tạm thời không phản hồi.'); return true;
    });
    mocked.mock.mockImplementation(async () => { throw new DOMException('aborted', 'AbortError'); });
    await assert.rejects(apiRequest('/api/v1/tests'), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.status, 408); assert.equal(error.requestId, undefined);
      assert.ok(!error.message.includes('Mã hỗ trợ')); return true;
    });
  } finally { mocked.mock.restore(); }
}));

test('mobile successful payload is returned unchanged and support code is not written to caller headers', async () => mobileFixture(async () => {
  const headers = new Headers({ Authorization: 'Bearer synthetic', 'x-request-id': oldId });
  const mocked = mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }, { headers: { 'x-request-id': serverId } }));
  try {
    assert.deepEqual(await apiRequest('/api/v1/tests', { headers }), { ok: true });
    assert.equal(headers.get('x-request-id'), oldId);
  } finally { mocked.mock.restore(); }
}));
