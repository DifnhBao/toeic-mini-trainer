import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { apiRequest } from '@/lib/api';
import { createAuthSession, type MobileUser } from '@/lib/auth-session';
export type { MobileUser } from '@/lib/auth-session';

const REFRESH_TOKEN_KEY = 'toeic.auth.refresh.v1';
const DEVICE_ID_KEY = 'toeic.auth.device.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'toeic-mini-trainer.auth',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
let webRefreshToken: string | null = null;
let webDeviceId: string | null = null;
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

// One controller/queue for this app runtime, including provider remounts.
// No network or SecureStore work starts until an action/restore is requested.
const session = createAuthSession({
  readRefresh: () => readSecret(REFRESH_TOKEN_KEY),
  writeRefresh: value => writeSecret(REFRESH_TOKEN_KEY, value),
  deviceId: getDeviceId,
  deviceName: `${Platform.OS} ${Platform.Version}`,
  request: apiRequest,
});
type AuthContextValue = {
  user: MobileUser | null;
  isBootstrapping: boolean;
  sessionRestoreError: boolean;
  logoutError: 'local' | 'remote' | null;
  retrySession: () => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (idToken: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  authorizedFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
const signInWithGoogle = (idToken: string) => session.signIn('google', idToken);
const signInWithApple = (idToken: string, name?: string) => session.signIn('apple', idToken, name);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  // A callback retained by an old screen must remain bound to that session.
  const authorizedFetch = useCallback(<T,>(path: string, init?: RequestInit) => session.authorizedFetch<T>(path, init, state.generation), [state.generation]);
  const logout = useCallback(() => session.logout(state.generation), [state.generation]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void session.restore(); });
    return () => { active = false; };
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    ...state, retrySession: session.restore, signInWithGoogle, signInWithApple, logout, authorizedFetch,
  }), [state, logout, authorizedFetch]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
