import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import { apiRequest } from '../mobile/src/lib/api';
import { createAuthSession } from '../mobile/src/lib/auth-session';

declare global { var __DEV__: boolean; }

// React Native's Headers polyfill stores headers in an enumerable map. Node's
// Headers does not, so tests using only Node would miss the native bridge failure.
const OriginalHeaders = globalThis.Headers;
class NativeShapedHeaders extends OriginalHeaders {
  map: Record<string, string> = {};
  constructor(init?: HeadersInit) {
    super(init);
    this.forEach((value, name) => { this.map[name] = value; });
  }
}

it('passes only string header pairs across the native fetch boundary for authenticated requests and refresh retries', async () => {
  const previousHeaders = globalThis.Headers;
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  const devDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  globalThis.Headers = NativeShapedHeaders;
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
  process.env.EXPO_PUBLIC_API_URL = 'https://synthetic.invalid';
  const requests: Array<{ path: string; headers: Headers; body?: BodyInit | null }> = [];
  let rejectExpiredToken = true;
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init: RequestInit) => {
    // Model Expo's normalizeHeadersInit followed by Android's List<Pair<String,String>> cast.
    const nativeHeaders = Array.isArray(init.headers) ? init.headers : Object.entries(init.headers ?? {});
    for (const pair of nativeHeaders) {
      assert.equal(pair.length, 2);
      assert.equal(typeof pair[0], 'string');
      assert.equal(typeof pair[1], 'string', 'Android rejects map/array values in header pairs');
    }
    const headers = new OriginalHeaders(nativeHeaders as [string, string][]);
    const path = new URL(String(input)).pathname;
    requests.push({ path, headers, body: init.body });
    assert.equal(headers.get('accept'), path === '/override' ? 'application/problem+json' : 'application/json');
    if (init.body) assert.equal(headers.get('content-type'), path === '/override' ? 'text/plain' : 'application/json');
    const tokens = (suffix: string) => ({ accessToken: `access-${suffix}`, refreshToken: `refresh-${suffix}`, accessTokenExpiresIn: 900, refreshTokenExpiresAt: '2099-01-01T00:00:00Z' });
    if (path.endsWith('/google')) return Response.json({ tokens: tokens('first'), user: { id: 'A', name: null, email: null, image: null } });
    if (path.endsWith('/refresh')) return Response.json({ tokens: tokens('second') });
    if (path === '/api/v1/tests' && rejectExpiredToken) {
      rejectExpiredToken = false;
      return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    }
    return Response.json({ ok: true });
  });
  try {
    let stored: string | null = null;
    const session = createAuthSession({ readRefresh: async () => stored, writeRefresh: async value => { stored = value; }, deviceId: async () => 'synthetic', deviceName: 'test', request: apiRequest });
    await session.signIn('google', 'synthetic-id-token');
    await session.authorizedFetch('/api/v1/library', { headers: { 'X-Client': 'record' } });
    await session.authorizedFetch('/api/v1/tests', { method: 'POST', body: '{}', headers: [['X-Client', 'tuple']] });
    const callerHeaders = new NativeShapedHeaders({ Accept: 'application/problem+json', 'Content-Type': 'text/plain', 'X-Client': 'instance' });
    await session.authorizedFetch('/override', { method: 'POST', body: 'body', headers: callerHeaders });
    assert.equal(callerHeaders.has('authorization'), false, 'do not mutate caller headers');
    const privateCalls = requests.filter(call => ['/api/v1/library', '/api/v1/tests', '/override'].includes(call.path));
    assert.deepEqual(privateCalls.map(call => call.headers.get('authorization')), ['Bearer access-first', 'Bearer access-first', 'Bearer access-second', 'Bearer access-second']);
    assert.deepEqual(privateCalls.map(call => call.headers.get('x-client')), ['record', 'tuple', 'tuple', 'instance']);
    assert.equal(requests.filter(call => call.path.endsWith('/refresh')).length, 1);
    assert.equal(stored, 'refresh-second');
    await apiRequest('/without-headers');
    assert.equal(requests.at(-1)?.headers.get('content-type'), null);
  } finally {
    fetchMock.mock.restore();
    globalThis.Headers = previousHeaders;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousUrl;
    if (devDescriptor) Object.defineProperty(globalThis, '__DEV__', devDescriptor);
    else Reflect.deleteProperty(globalThis, '__DEV__');
  }
});
