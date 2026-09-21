import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const initials = (user?.name || user?.email || 'T').slice(0, 1).toUpperCase();

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <Text style={styles.name}>{user?.name || 'Người học TOEIC'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.securityCard}>
          <Text style={styles.securityTitle}>Bảo mật phiên đăng nhập</Text>
          <Text style={styles.securityText}>
            Access token ngắn hạn chỉ nằm trong bộ nhớ. Refresh token được mã hóa trên thiết bị và tự
            xoay sau mỗi lần sử dụng.
          </Text>
        </View>

        <Pressable onPress={logout} style={({ pressed }) => [styles.logoutButton, pressed && { opacity: 0.7 }]}>
          <Text style={styles.logoutText}>Đăng xuất khỏi thiết bị này</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 20, gap: 14 },
  profileCard: { alignItems: 'center', backgroundColor: palette.surface, borderRadius: radius.large, borderWidth: 1, borderColor: palette.line, padding: 24 },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  name: { color: palette.ink, fontSize: 21, fontWeight: '800', marginTop: 14 },
  email: { color: palette.muted, fontSize: 14, marginTop: 4 },
  securityCard: { backgroundColor: palette.primarySoft, borderRadius: radius.medium, padding: 18 },
  securityTitle: { color: palette.primaryDark, fontSize: 15, fontWeight: '700' },
  securityText: { color: palette.primaryDark, fontSize: 13, lineHeight: 20, marginTop: 6 },
  logoutButton: { alignItems: 'center', paddingVertical: 15, borderRadius: radius.medium, borderWidth: 1, borderColor: '#EDC8C4', backgroundColor: '#FFF8F7' },
  logoutText: { color: palette.danger, fontSize: 15, fontWeight: '700' },
});
