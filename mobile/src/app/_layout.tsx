import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { palette } from '@/constants/design';
import { AuthProvider, useAuth } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { isBootstrapping } = useAuth();

  useEffect(() => {
    if (!isBootstrapping) SplashScreen.hideAsync().catch(() => undefined);
  }, [isBootstrapping]);

  if (isBootstrapping) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.canvas },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="test/[id]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="result/[id]" options={{ title: 'Kết quả', headerBackTitle: 'Trang chủ' }} />
      <Stack.Screen name="history" options={{ title: 'Lịch sử luyện tập' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
