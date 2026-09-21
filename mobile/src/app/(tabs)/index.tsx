import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import type { ProgressSummary } from '@/types/learning';

export default function DashboardScreen() {
  const { user, authorizedFetch } = useAuth();
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const firstName = user?.name?.split(' ')[0] || 'bạn';

  useFocusEffect(
    useCallback(() => {
      let active = true;
      authorizedFetch<ProgressSummary>('/api/v1/progress')
        .then((value) => active && setProgress(value))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [authorizedFetch]),
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.kicker}>CHÀO {firstName.toUpperCase()}</Text>
          <Text style={styles.title}>Hôm nay mình luyện gì?</Text>
          <Text style={styles.subtitle}>Một bài ngắn 10–20 câu là đủ để giữ nhịp mỗi ngày.</Text>
        </View>

        <Pressable
          onPress={() => router.push('/practice')}
          style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}>
          <View style={styles.heroPill}><Text style={styles.heroPillText}>GỢI Ý HÔM NAY</Text></View>
          <Text style={styles.heroTitle}>Mini test cân bằng</Text>
          <Text style={styles.heroCopy}>10 câu nghe · 10 câu đọc · khoảng 18 phút</Text>
          <View style={styles.primaryButton}><Text style={styles.primaryButtonText}>Bắt đầu luyện</Text></View>
        </Pressable>

        <View style={styles.progressCard}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{progress?.totalTests ?? 0}</Text>
            <Text style={styles.statLabel}>Bài đã làm</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{progress?.overallAccuracy ?? 0}%</Text>
            <Text style={styles.statLabel}>Độ chính xác</Text>
          </View>
          <View style={styles.statDivider} />
          <Pressable onPress={() => router.push('/history')} style={styles.historyLink}>
            <Text style={styles.historyLinkText}>Lịch sử →</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Lối tắt</Text>
        <View style={styles.grid}>
          <Pressable onPress={() => router.push('/practice')} style={styles.smallCard}>
            <Text style={styles.cardIcon}>◉</Text>
            <Text style={styles.cardTitle}>Luyện từng Part</Text>
            <Text style={styles.cardText}>Chọn Part 1–7 và số câu.</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/coach')} style={styles.smallCard}>
            <Text style={styles.cardIcon}>✦</Text>
            <Text style={styles.cardTitle}>Hỏi AI Coach</Text>
            <Text style={styles.cardText}>Ngữ pháp, từ vựng và mẹo thi.</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 20, gap: 18 },
  kicker: { color: palette.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: palette.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', marginTop: 5 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 7 },
  heroCard: { backgroundColor: palette.primaryDark, borderRadius: radius.large, padding: 22, gap: 10 },
  heroPill: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF1F', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  heroPillText: { color: '#DDF3EC', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 4 },
  heroCopy: { color: '#CDE5DE', fontSize: 14, lineHeight: 20 },
  primaryButton: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: palette.accent, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.small },
  primaryButtonText: { color: '#362400', fontSize: 15, fontWeight: '800' },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  progressCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: palette.line, padding: 14 },
  stat: { flex: 1 },
  statValue: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  statLabel: { color: palette.muted, fontSize: 10, marginTop: 2 },
  statDivider: { width: 1, height: 34, backgroundColor: palette.line, marginHorizontal: 10 },
  historyLink: { paddingVertical: 8, paddingLeft: 4 },
  historyLinkText: { color: palette.primary, fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', gap: 12 },
  smallCard: { flex: 1, minHeight: 150, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radius.medium, padding: 16 },
  cardIcon: { color: palette.primary, fontSize: 22, fontWeight: '800' },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: '700', marginTop: 14 },
  cardText: { color: palette.muted, fontSize: 13, lineHeight: 18, marginTop: 5 },
  pressed: { opacity: 0.82 },
});
