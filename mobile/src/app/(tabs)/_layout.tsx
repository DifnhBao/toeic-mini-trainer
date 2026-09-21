import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { palette } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';

const icons: Record<string, string> = {
  index: '⌂',
  practice: '▶',
  coach: '✦',
  profile: '●',
};

export default function TabsLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: palette.surface },
        headerShadowVisible: false,
        headerTitleStyle: { color: palette.ink, fontWeight: '700' },
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: { borderTopColor: palette.line, backgroundColor: palette.surface },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{icons[route.name]}</Text>
        ),
      })}>
      <Tabs.Screen name="index" options={{ title: 'Hôm nay', headerTitle: 'TOEIC Mini Trainer' }} />
      <Tabs.Screen name="practice" options={{ title: 'Luyện tập', headerTitle: 'Tạo bài luyện' }} />
      <Tabs.Screen name="coach" options={{ title: 'AI Coach', headerTitle: 'Giáo viên AI' }} />
      <Tabs.Screen name="profile" options={{ title: 'Cá nhân', headerTitle: 'Tài khoản' }} />
    </Tabs>
  );
}
