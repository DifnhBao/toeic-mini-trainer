import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../mobile/src/lib/api-error';
import { createAuthSession, type AuthTokens, type MobileUser } from '../mobile/src/lib/auth-session';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const user = (id: string): MobileUser => ({ id, name: id, email: `${id}@synthetic.invalid`, image: null });
const tokens = (id: string, n = 0): AuthTokens => ({ accessToken: `${id}:access:${n}`, refreshToken: `${id}:refresh:${n}`, accessTokenExpiresIn: 900, refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z' });
function harness(initial: string | null = null) {
  const h = {
    value: initial, clock: 10_000, writes: [] as Array<string | null>, calls: [] as Array<{ path: string; init: RequestInit }>, rotations: 0,
    read: async (): Promise<string | null> => h.value,
    write: async (value: string | null) => { h.writes.push(value); h.value = value; },
    handle: async (path: string, init: RequestInit): Promise<unknown> => {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      if (path === '/api/v1/auth/logout') return { success: true };
      if (path === '/api/v1/auth/google' || path === '/api/v1/auth/apple') return { user: user(body.idToken), tokens: tokens(body.idToken) };
      if (path === '/api/v1/auth/refresh') return { tokens: tokens(body.refreshToken.split(':')[0], ++h.rotations) };
      const owner = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '').split(':')[0];
      return path === '/api/v1/auth/me' ? { user: user(owner!) } : { owner };
    },
  };
  const session = createAuthSession({ readRefresh: () => h.read(), writeRefresh: value => h.write(value), deviceId: async () => 'synthetic-device', deviceName: 'test', now: () => h.clock,
    request: async <T>(path: string, init: RequestInit = {}) => { h.calls.push({ path, init }); return await h.handle(path, init) as T; },
  });
  return { h, session };
}
const isChanged = (error: unknown) => error instanceof ApiError && error.code === 'SESSION_CHANGED';
const expired = (h: ReturnType<typeof harness>['h']) => { h.clock += 901_000; };

describe('mobile session isolation under delayed network and storage', () => {
  it('shares one refresh across twenty concurrent authenticated requests', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); expired(h);
    const entered = deferred<void>(), reply = deferred<{ tokens: AuthTokens }>(); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/refresh')) { entered.resolve(); return reply.promise; } return original(path, init); };
    const pending = Array.from({ length: 20 }, () => session.authorizedFetch('/private'));
    await entered.promise; reply.resolve({ tokens: tokens('A', 1) });
    assert.deepEqual(await Promise.all(pending), Array.from({ length: 20 }, () => ({ owner: 'A' })));
    assert.equal(h.calls.filter(call => call.path.endsWith('/refresh')).length, 1);
    assert.equal(h.value, tokens('A', 1).refreshToken);
  });
  it('discards refresh success after logout without restoring memory or disk', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); expired(h);
    const entered = deferred<void>(), reply = deferred<{ tokens: AuthTokens }>(); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/refresh')) { entered.resolve(); return reply.promise; } return original(path, init); };
    const rejected = assert.rejects(session.authorizedFetch('/private'), isChanged);
    await entered.promise; await session.logout(); reply.resolve({ tokens: tokens('A', 1) }); await rejected;
    assert.equal(session.getSnapshot().user, null); assert.equal(h.value, null);
    assert.equal(h.calls.filter(call => call.path === '/private').length, 0);
  });
  it('ignores an old refresh 401 after a new account signs in', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); expired(h);
    const entered = deferred<void>(), reply = deferred<never>(); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/refresh')) { entered.resolve(); return reply.promise; } return original(path, init); };
    const rejected = assert.rejects(session.authorizedFetch('/private'), isChanged);
    await entered.promise; await session.signIn('google', 'B'); reply.reject(new ApiError('Expired', 401)); await rejected;
    assert.equal(session.getSnapshot().user?.id, 'B'); assert.equal(h.value, tokens('B').refreshToken);
  });
  it('rejects a slower older login and keeps the last chosen account', async () => {
    const { h, session } = harness(); const entered = deferred<void>(), reply = deferred<unknown>(); const original = h.handle;
    h.handle = async (path, init) => {
      if (path.endsWith('/google') && JSON.parse(init.body as string).idToken === 'A') { entered.resolve(); return reply.promise; }
      return original(path, init);
    };
    const rejected = assert.rejects(session.signIn('google', 'A'), isChanged);
    await entered.promise; await session.signIn('google', 'B'); reply.resolve({ user: user('A'), tokens: tokens('A') }); await rejected;
    assert.equal(session.getSnapshot().user?.id, 'B'); assert.equal(h.value, tokens('B').refreshToken);
    assert.ok(h.calls.some(call => call.path.endsWith('/logout') && JSON.parse(call.init.body as string).refreshToken === tokens('A').refreshToken));
  });
  it('orders a slow token write before logout deletion and a later login', async () => {
    const { h, session } = harness(); const writing = deferred<void>(), release = deferred<void>(); let activeWrites = 0, maximum = 0;
    h.write = async value => {
      activeWrites++; maximum = Math.max(maximum, activeWrites);
      if (value === tokens('A').refreshToken) { writing.resolve(); await release.promise; }
      h.writes.push(value); h.value = value; activeWrites--;
    };
    const rejected = assert.rejects(session.signIn('google', 'A'), isChanged);
    await writing.promise; const logout = session.logout(); const login = session.signIn('google', 'B');
    release.resolve(); await Promise.all([rejected, logout, login]);
    assert.equal(maximum, 1); assert.equal(h.value, tokens('B').refreshToken); assert.equal(session.getSnapshot().user?.id, 'B');
    assert.deepEqual(h.writes, [null, tokens('A').refreshToken, null, null, tokens('B').refreshToken]);
  });
  for (const fails of [false, true]) {
    it(`does not deliver or retry a former account's delayed ${fails ? '401' : 'private response'}`, async () => {
      const { h, session } = harness(); await session.signIn('google', 'A'); const entered = deferred<void>(), reply = deferred<unknown>(); const original = h.handle;
      h.handle = async (path, init) => { if (path === '/private') { entered.resolve(); return reply.promise; } return original(path, init); };
      const rejected = assert.rejects(session.authorizedFetch('/private'), isChanged);
      await entered.promise; await session.signIn('google', 'B');
      if (fails) reply.reject(new ApiError('Unauthorized', 401)); else reply.resolve({ privateOwner: 'A' });
      await rejected;
      assert.equal(h.calls.filter(call => call.path === '/private').length, 1);
      assert.equal(h.calls.filter(call => call.path.endsWith('/refresh')).length, 0);
      assert.equal(session.getSnapshot().user?.id, 'B'); assert.equal(h.value, tokens('B').refreshToken);
    });
  }
  it('uses an already refreshed access token when an older request returns 401 late', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); const entered = deferred<void>(), reply = deferred<never>(); const original = h.handle;
    h.handle = async (path, init) => {
      const oldAccess = new Headers(init.headers).get('Authorization') === `Bearer ${tokens('A').accessToken}`;
      if (path === '/slow' && oldAccess) { entered.resolve(); return reply.promise; }
      if (path === '/fast' && oldAccess) throw new ApiError('Unauthorized', 401);
      return original(path, init);
    };
    const slow = session.authorizedFetch('/slow'); await entered.promise;
    assert.deepEqual(await session.authorizedFetch('/fast'), { owner: 'A' });
    reply.reject(new ApiError('Unauthorized', 401)); assert.deepEqual(await slow, { owner: 'A' });
    assert.equal(h.calls.filter(call => call.path.endsWith('/refresh')).length, 1);
  });
  it('prevents callbacks retained by an old screen from requesting or logging out the new account', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); const old = session.getSnapshot().generation;
    await session.signIn('google', 'B'); const before = h.calls.length;
    await assert.rejects(session.authorizedFetch('/private', {}, old), isChanged); await session.logout(old);
    assert.equal(h.calls.length, before); assert.equal(session.getSnapshot().user?.id, 'B'); assert.equal(h.value, tokens('B').refreshToken);
  });
  it('clears the current session on a definitive refresh 401', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); expired(h); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/refresh')) throw new ApiError('Expired', 401); return original(path, init); };
    await assert.rejects(session.authorizedFetch('/private'), (error: unknown) => error instanceof ApiError && error.status === 401);
    assert.equal(h.value, null); assert.equal(session.getSnapshot().user, null);
  });
  it('keeps a valid persisted refresh token after a temporary network/server error', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); expired(h); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/refresh')) throw new ApiError('Unavailable', 503); return original(path, init); };
    await assert.rejects(session.authorizedFetch('/private'), (error: unknown) => error instanceof ApiError && error.status === 503);
    assert.equal(h.value, tokens('A').refreshToken); assert.equal(session.getSnapshot().user?.id, 'A');
    h.handle = original; assert.deepEqual(await session.authorizedFetch('/private'), { owner: 'A' });
  });
  it('reports a failed local deletion and allows retry instead of restoring the old session', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); const original = h.write;
    h.write = async value => { if (value === null) throw new Error('Synthetic storage failure'); await original(value); };
    await session.logout(); assert.equal(session.getSnapshot().logoutError, 'local'); assert.equal(session.getSnapshot().user, null);
    assert.equal(h.value, tokens('A').refreshToken); await session.restore(); assert.equal(session.getSnapshot().user, null);
    h.write = original; await session.logout(); assert.equal(h.value, null); assert.equal(session.getSnapshot().logoutError, null);
  });
  it('reports server logout failure and retries its token from memory without persisting it again', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/logout')) throw new ApiError('Unavailable', 503); return original(path, init); };
    await session.logout(); assert.equal(h.value, null); assert.equal(session.getSnapshot().logoutError, 'remote');
    const writes = h.writes.length; h.handle = original; await session.logout();
    assert.equal(session.getSnapshot().logoutError, null); assert.equal(h.value, null);
    assert.deepEqual(h.writes.slice(writes), [null]); assert.equal(h.calls.filter(call => call.path.endsWith('/logout')).length, 2);
  });
  it('does not expose a login whose token could not be saved, and recovers the storage queue', async () => {
    const { h, session } = harness(); const original = h.write;
    h.write = async value => { if (value === tokens('A').refreshToken) throw new Error('Synthetic write failure'); await original(value); };
    await assert.rejects(session.signIn('google', 'A'), (error: unknown) => error instanceof ApiError && error.code === 'SESSION_STORAGE_FAILED');
    assert.equal(session.getSnapshot().user, null); assert.equal(h.value, null);
    await session.signIn('google', 'B'); assert.equal(session.getSnapshot().user?.id, 'B'); assert.equal(h.value, tokens('B').refreshToken);
  });
  it('does not expose an access token when a rotated refresh token cannot be saved', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); expired(h); const original = h.write;
    h.write = async value => { if (value === tokens('A', 1).refreshToken) throw new Error('Synthetic rotated write failure'); await original(value); };
    await assert.rejects(session.authorizedFetch('/private'));
    assert.equal(session.getSnapshot().user, null); assert.equal(h.value, null); assert.equal(h.calls.filter(call => call.path === '/private').length, 0);
  });
  it('ignores an old restore/profile response after a new login', async () => {
    const { h, session } = harness(tokens('A').refreshToken); const entered = deferred<void>(), reply = deferred<unknown>(); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/me')) { entered.resolve(); return reply.promise; } return original(path, init); };
    const restoring = session.restore(); await entered.promise; await session.signIn('google', 'B'); reply.resolve({ user: user('A') }); await restoring;
    assert.equal(session.getSnapshot().user?.id, 'B'); assert.equal(h.value, tokens('B').refreshToken); assert.equal(session.getSnapshot().isBootstrapping, false);
  });
  it('keeps restoration retryable after a temporary failure without deleting stored credentials', async () => {
    const { h, session } = harness(tokens('A').refreshToken); const original = h.handle;
    h.handle = async (path, init) => { if (path.endsWith('/refresh')) throw new ApiError('Unavailable', 503); return original(path, init); };
    await session.restore(); assert.equal(session.getSnapshot().sessionRestoreError, true); assert.equal(session.getSnapshot().isBootstrapping, false);
    assert.equal(h.value, tokens('A').refreshToken); h.handle = original; await session.restore();
    assert.equal(session.getSnapshot().user?.id, 'A'); assert.equal(session.getSnapshot().sessionRestoreError, false);
  });
  it('shares bootstrap work across repeated provider effects', async () => {
    const { h, session } = harness(tokens('A').refreshToken);
    await Promise.all(Array.from({ length: 20 }, () => session.restore()));
    assert.equal(h.calls.filter(call => call.path.endsWith('/refresh')).length, 1); assert.equal(h.calls.filter(call => call.path.endsWith('/me')).length, 1);
    assert.equal(session.getSnapshot().user?.id, 'A');
  });
  it('keeps an unreadable stored token recoverable until logout can revoke it', async () => {
    const { h, session } = harness(tokens('A').refreshToken); const original = h.read;
    h.read = async () => { throw new Error('Synthetic locked storage'); };
    await session.logout(); assert.equal(session.getSnapshot().logoutError, 'local'); assert.equal(h.value, tokens('A').refreshToken);
    assert.equal(h.calls.length, 0); h.read = original; await session.logout();
    assert.equal(h.value, null); assert.equal(session.getSnapshot().logoutError, null);
    assert.equal(h.calls.filter(call => call.path.endsWith('/logout')).length, 1);
  });
  it('does not restore a token from a disk read completed after logout', async () => {
    const { h, session } = harness(tokens('A').refreshToken); const entered = deferred<void>(), release = deferred<string | null>(); let first = true;
    h.read = async () => { if (first) { first = false; entered.resolve(); return release.promise; } return h.value; };
    const restoration = session.restore(); await entered.promise; const logout = session.logout();
    release.resolve(tokens('A').refreshToken); await Promise.all([restoration, logout]);
    assert.equal(h.value, null); assert.equal(session.getSnapshot().user, null); assert.equal(session.getSnapshot().isBootstrapping, false);
    assert.equal(h.calls.filter(call => call.path.endsWith('/refresh')).length, 0);
  });
  it('clears a current session when the retry also returns 401', async () => {
    const { h, session } = harness(); await session.signIn('google', 'A'); const original = h.handle;
    h.handle = async (path, init) => { if (path === '/private') throw new ApiError('Unauthorized', 401); return original(path, init); };
    await assert.rejects(session.authorizedFetch('/private'), (error: unknown) => error instanceof ApiError && error.status === 401);
    assert.equal(h.calls.filter(call => call.path === '/private').length, 2); assert.equal(h.value, null); assert.equal(session.getSnapshot().user, null);
  });
});
