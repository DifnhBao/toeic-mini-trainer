import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { ApiError, apiRequest } from '@/lib/api';

const REFRESH_TOKEN_KEY = 'toeic.auth.refresh.v1';
const DEVICE_ID_KEY = 'toeic.auth.device.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'toeic-mini-trainer.auth',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let webRefreshToken: string | null = null;
let webDeviceId: string | null = null;

export type MobileUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type AuthTokens = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

type SignInResponse = { user: MobileUser; tokens: AuthTokens };
type RefreshResponse = { tokens: AuthTokens };
type MeResponse = { user: MobileUser };

type AuthContextValue = {
  user: MobileUser | null;
  isBootstrapping: boolean;
  sessionRestoreError: boolean;
  retrySession: () => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (idToken: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  authorizedFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readSecret(key: string) {
  if (Platform.OS === 'web') return key === REFRESH_TOKEN_KEY ? webRefreshToken : webDeviceId;
  return SecureStore.getItemAsync(key, secureOptions);
}

async function writeSecret(key: string, value: string | null) {
  if (Platform.OS === 'web') {
    if (key === REFRESH_TOKEN_KEY) webRefreshToken = value;
    else webDeviceId = value;
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key, secureOptions);
  else await SecureStore.setItemAsync(key, value, secureOptions);
}

async function getDeviceId() {
  const existing = await readSecret(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await writeSecret(DEVICE_ID_KEY, created);
  return created;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [sessionRestoreError, setSessionRestoreError] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const accessTokenExpiryRef = useRef(0);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const clearLocalSession = useCallback(async () => {
    accessTokenRef.current = null;
    accessTokenExpiryRef.current = 0;
    refreshTokenRef.current = null;
    setUser(null);
    await writeSecret(REFRESH_TOKEN_KEY, null);
  }, []);

  const acceptTokens = useCallback(async (tokens: AuthTokens) => {
    // Persist the newly rotated refresh token before exposing the access token.
    await writeSecret(REFRESH_TOKEN_KEY, tokens.refreshToken);
    refreshTokenRef.current = tokens.refreshToken;
    accessTokenRef.current = tokens.accessToken;
    accessTokenExpiryRef.current = Date.now() + tokens.accessTokenExpiresIn * 1000;
    return tokens.accessToken;
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const operation = (async () => {
      const refreshToken = refreshTokenRef.current ?? (await readSecret(REFRESH_TOKEN_KEY));
      if (!refreshToken) return null;
      refreshTokenRef.current = refreshToken;

      try {
        const deviceId = await getDeviceId();
        const response = await apiRequest<RefreshResponse>('/api/v1/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken, deviceId }),
        });
        return await acceptTokens(response.tokens);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await clearLocalSession();
        throw error;
      }
    })();

    refreshPromiseRef.current = operation;
    try {
      return await operation;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [acceptTokens, clearLocalSession]);

  const accessToken = useCallback(async () => {
    if (
      accessTokenRef.current &&
      accessTokenExpiryRef.current > Date.now() + 30_000
    ) {
      return accessTokenRef.current;
    }
    return refreshAccessToken();
  }, [refreshAccessToken]);

  const authorizedFetch = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      let token = await accessToken();
      if (!token) throw new ApiError('Bạn cần đăng nhập lại.', 401, 'UNAUTHORIZED');

      try {
        return await apiRequest<T>(path, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        accessTokenRef.current = null;
        token = await refreshAccessToken();
        if (!token) throw error;
        return apiRequest<T>(path, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${token}` },
        });
      }
    },
    [accessToken, refreshAccessToken],
  );

  const providerSignIn = useCallback(
    async (provider: 'google' | 'apple', idToken: string, name?: string) => {
      const deviceId = await getDeviceId();
      const response = await apiRequest<SignInResponse>(`/api/v1/auth/${provider}`, {
        method: 'POST',
        body: JSON.stringify({
          idToken,
          deviceId,
          deviceName: `${Platform.OS} ${Platform.Version}`,
          ...(name ? { name } : {}),
        }),
      });
      await acceptTokens(response.tokens);
      setUser(response.user);
    },
    [acceptTokens],
  );

  const signInWithGoogle = useCallback(
    (idToken: string) => providerSignIn('google', idToken),
    [providerSignIn],
  );
  const signInWithApple = useCallback(
    (idToken: string, name?: string) => providerSignIn('apple', idToken, name),
    [providerSignIn],
  );

  const logout = useCallback(async () => {
    const token = refreshTokenRef.current ?? (await readSecret(REFRESH_TOKEN_KEY));
    await clearLocalSession();
    if (!token) return;
    await apiRequest('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => undefined);
  }, [clearLocalSession]);

  const restoreSession = useCallback(async (isActive: () => boolean = () => true) => {
    if (isActive()) {
      setIsBootstrapping(true);
      setSessionRestoreError(false);
    }
    try {
      const stored = await readSecret(REFRESH_TOKEN_KEY);
      if (!stored) return;
      refreshTokenRef.current = stored;
      const token = await refreshAccessToken();
      if (!token || !isActive()) return;
      const response = await apiRequest<MeResponse>('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (isActive()) setUser(response.user);
    } catch (error) {
      // A temporary network/server failure must not erase a valid refresh token.
      if (isActive() && error instanceof ApiError && error.status === 401) {
        await clearLocalSession().catch(() => undefined);
      } else if (isActive()) {
        setSessionRestoreError(true);
      }
    } finally {
      if (isActive()) setIsBootstrapping(false);
    }
  }, [clearLocalSession, refreshAccessToken]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void restoreSession(() => active);
    });
    return () => {
      active = false;
    };
  }, [restoreSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isBootstrapping,
      sessionRestoreError,
      retrySession: restoreSession,
      signInWithGoogle,
      signInWithApple,
      logout,
      authorizedFetch,
    }),
    [user, isBootstrapping, sessionRestoreError, restoreSession, signInWithGoogle, signInWithApple, logout, authorizedFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
