import { ApiError } from './api-error';

export type MobileUser = { id: string; name: string | null; email: string | null; image: string | null };
export type AuthTokens = { accessToken: string; accessTokenExpiresIn: number; refreshToken: string; refreshTokenExpiresAt: string };
export type AuthSnapshot = {
  generation: number;
  user: MobileUser | null;
  isBootstrapping: boolean;
  sessionRestoreError: boolean;
  logoutError: 'local' | 'remote' | null;
};
type Dependencies = {
  readRefresh: () => Promise<string | null>;
  writeRefresh: (value: string | null) => Promise<void>;
  deviceId: () => Promise<string>;
  deviceName: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  now?: () => number;
};

export function createAuthSession(deps: Dependencies) {
  let state: AuthSnapshot = { generation: 0, user: null, isBootstrapping: true, sessionRestoreError: false, logoutError: null };
  let access: string | null = null, expiry = 0, refresh: string | null = null, loaded = false;
  let storageTail: Promise<unknown> = Promise.resolve();
  let refreshing: { generation: number; promise: Promise<string | null> } | null = null;
  let restoring: { generation: number; promise: Promise<void> } | null = null;
  let device: Promise<string> | null = null;
  const listeners = new Set<() => void>();
  const pendingRevocations = new Set<string>(); // Memory only; never put tokens in AsyncStorage/logs.
  const now = deps.now ?? Date.now;
  const changed = () => new ApiError('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.', 401, 'SESSION_CHANGED');
  function check(generation: number) { if (generation !== state.generation) throw changed(); }
  function publish(patch: Partial<AuthSnapshot>) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  function storage<T>(operation: () => Promise<T>): Promise<T> {
    const next = storageTail.then(operation, operation);
    storageTail = next.catch(() => undefined);
    return next;
  }
  function advance() {
    access = null; expiry = 0; refresh = null; loaded = true;
    refreshing = null; restoring = null;
    publish({ generation: state.generation + 1, user: null, isBootstrapping: false, sessionRestoreError: false, logoutError: null });
    return state.generation;
  }
  function getDevice() {
    if (!device) device = deps.deviceId().catch(error => { device = null; throw error; });
    return device;
  }
  async function revoke(token: string): Promise<boolean> {
    pendingRevocations.add(token);
    try {
      await deps.request('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: token }) });
      pendingRevocations.delete(token);
      return true;
    } catch { return false; }
  }
  async function clear(generation: number) {
    check(generation);
    const cleared = advance();
    try { await storage(() => deps.writeRefresh(null)); }
    catch { if (state.generation === cleared) publish({ logoutError: 'local' }); }
  }
  async function stored(generation: number) {
    check(generation);
    if (!loaded) await storage(async () => {
      check(generation);
      const value = await deps.readRefresh();
      check(generation); refresh = value; loaded = true;
    });
    check(generation);
    return refresh;
  }
  async function accept(tokens: AuthTokens, generation: number) {
    if (generation !== state.generation) { void revoke(tokens.refreshToken); throw changed(); }
    try {
      await storage(async () => {
        check(generation);
        await deps.writeRefresh(tokens.refreshToken);
        check(generation);
        refresh = tokens.refreshToken; loaded = true;
        access = tokens.accessToken; expiry = now() + tokens.accessTokenExpiresIn * 1000;
      });
    } catch {
      void revoke(tokens.refreshToken);
      if (generation !== state.generation) throw changed();
      await clear(generation);
      throw new ApiError('Không lưu được phiên đăng nhập trên thiết bị. Vui lòng thử đăng nhập lại.', 503, 'SESSION_STORAGE_FAILED');
    }
    check(generation);
    return tokens.accessToken;
  }
  function refreshAccess(generation: number): Promise<string | null> {
    check(generation);
    if (refreshing?.generation === generation) return refreshing.promise;
    const flight = { generation, promise: Promise.resolve<string | null>(null) };
    flight.promise = (async () => {
      try {
        const token = await stored(generation);
        if (!token) return null;
        const deviceId = await getDevice(); check(generation);
        const response = await deps.request<{ tokens: AuthTokens }>('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: token, deviceId }) });
        return await accept(response.tokens, generation);
      } catch (error) {
        if (generation !== state.generation) throw changed();
        if (error instanceof ApiError && error.status === 401) await clear(generation);
        throw error;
      } finally { if (refreshing === flight) refreshing = null; }
    })();
    refreshing = flight;
    return flight.promise;
  }
  async function accessToken(generation: number) {
    check(generation);
    return access && expiry > now() + 30_000 ? access : refreshAccess(generation);
  }
  async function authorizedFetch<T>(path: string, init: RequestInit = {}, generation = state.generation): Promise<T> {
    check(generation);
    let token = await accessToken(generation); check(generation);
    if (!token) throw new ApiError('Bạn cần đăng nhập lại.', 401, 'UNAUTHORIZED');
    const send = (value: string) => {
      const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${value}`);
      return deps.request<T>(path, { ...init, headers });
    };
    try {
      const result = await send(token); check(generation); return result;
    } catch (error) {
      check(generation);
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // A delayed 401 for an older access token must reuse the newer token,
      // rather than rotate the same refresh family again.
      if (access === token) { access = null; expiry = 0; }
      token = await accessToken(generation); check(generation);
      if (!token) throw error;
      try {
        const result = await send(token); check(generation); return result;
      } catch (retryError) {
        check(generation);
        if (retryError instanceof ApiError && retryError.status === 401 && access === token) await clear(generation);
        throw retryError;
      }
    }
  }
  async function signIn(provider: 'google' | 'apple', idToken: string, name?: string) {
    const oldToken = refresh;
    const generation = advance();
    // Queue deletion immediately, before any network/device await. A previous
    // write can finish, but this delete/new login will always follow it.
    const deletion = storage(() => deps.writeRefresh(null));
    if (oldToken) void revoke(oldToken);
    try { await deletion; }
    catch {
      if (generation !== state.generation) throw changed();
      publish({ logoutError: 'local' });
      throw new ApiError('Chưa xóa được phiên cũ trên thiết bị. Vui lòng thử lại.', 503, 'SESSION_STORAGE_FAILED');
    }
    check(generation);
    const deviceId = await getDevice(); check(generation);
    const response = await deps.request<{ tokens: AuthTokens; user: MobileUser }>(`/api/v1/auth/${provider}`, {
      method: 'POST', body: JSON.stringify({ idToken, deviceId, deviceName: deps.deviceName, ...(name ? { name } : {}) }),
    });
    await accept(response.tokens, generation); check(generation);
    publish({ user: response.user, logoutError: null });
  }
  async function logout(generation = state.generation) {
    if (generation !== state.generation) return;
    const knownToken = refresh;
    // Read is queued before delete so even an in-flight login write can be
    // revoked; a later login's write will be queued after this delete.
    const reading = storage(deps.readRefresh);
    const cleared = advance();
    const deleting = storage(async () => {
      // If no token is known in memory, keep disk recoverable when reading it
      // fails. A retry must still be able to revoke that unknown family.
      if (!knownToken) await reading;
      await deps.writeRefresh(null);
    });
    const [read, removed] = await Promise.allSettled([reading, deleting]);
    const diskToken = read.status === 'fulfilled' ? read.value : null;
    const tokens = new Set([...pendingRevocations, ...[knownToken, diskToken].filter((token): token is string => !!token)]);
    const results = await Promise.all([...tokens].map(revoke));
    if (state.generation === cleared) publish({ logoutError: removed.status === 'rejected' ? 'local' : results.some(result => !result) ? 'remote' : null });
  }
  function restore(): Promise<void> {
    const generation = state.generation;
    if (restoring?.generation === generation) return restoring.promise;
    if (state.user && !state.sessionRestoreError) return Promise.resolve();
    if (state.logoutError === 'local') return Promise.resolve();
    publish({ isBootstrapping: true, sessionRestoreError: false });
    const flight = { generation, promise: Promise.resolve() };
    flight.promise = (async () => {
      try {
        const token = await accessToken(generation); check(generation);
        if (!token) return;
        const response = await deps.request<{ user: MobileUser }>('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        check(generation); publish({ user: response.user });
      } catch (error) {
        if (generation !== state.generation) return;
        if (error instanceof ApiError && error.status === 401) await clear(generation);
        else publish({ sessionRestoreError: true });
      } finally {
        if (generation === state.generation) publish({ isBootstrapping: false });
        if (restoring === flight) restoring = null;
      }
    })();
    restoring = flight;
    return flight.promise;
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    signIn, logout, restore, authorizedFetch,
  };
}
