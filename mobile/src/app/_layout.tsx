import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { palette } from '@/constants/design';
import { AuthProvider, useAuth } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { isBootstrapping, user } = useAuth();

  useEffect(() => {
    if (!isBootstrapping) SplashScreen.hideAsync().catch(() => undefined);
  }, [isBootstrapping]);

  if (isBootstrapping) return null;

  return (
    <Stack
      key={user?.id ?? 'guest'}
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.canvas },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="guest" options={{ title: 'Học thử' }} />
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="test/[id]" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="result/[id]" options={{ title: 'Kết quả', headerBackTitle: 'Trang chủ' }} />
        <Stack.Screen name="history" options={{ title: 'Lịch sử luyện tập' }} />
        <Stack.Screen name="insights" options={{ title: 'Phân tích học tập' }} />
      </Stack.Protected>
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
