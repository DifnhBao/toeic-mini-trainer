import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import type { AttemptSummary } from '@/types/learning';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function HistoryScreen() {
  const { authorizedFetch } = useAuth();
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchPage = useCallback((cursor?: string) =>
    authorizedFetch<{ attempts: AttemptSummary[]; nextCursor: string | null }>(
      `/api/v1/attempts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ), [authorizedFetch]);

  useEffect(() => {
    let active = true;
    fetchPage()
      .then((response) => {
        if (!active) return;
        setAttempts(response.attempts);
        setNextCursor(response.nextCursor);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Không tải được lịch sử.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetchPage(nextCursor);
      setAttempts((current) => [...current, ...response.attempts]);
      setNextCursor(response.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không tải được trang tiếp theo.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator color={palette.primary} />}
        {!loading && attempts.length === 0 && !error && (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có bài đã nộp</Text><Text style={styles.emptyText}>Hoàn thành mini test đầu tiên để xem tiến độ tại đây.</Text></View>
        )}
        {attempts.map((attempt) => (
          <Pressable key={attempt.id} onPress={() => router.push(`/result/${attempt.id}`)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}>
            <View style={styles.cardTop}><Text style={styles.title} numberOfLines={2}>{attempt.title}</Text><View style={styles.accuracy}><Text style={styles.accuracyText}>{attempt.accuracy}%</Text></View></View>
            <Text style={styles.meta}>{formatDate(attempt.completedAt)} · {attempt.score}/{attempt.total} câu đúng</Text>
          </Pressable>
        ))}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!nextCursor && (
          <Pressable onPress={loadMore} disabled={loadingMore} style={styles.moreButton}>
            {loadingMore ? <ActivityIndicator color={palette.primary} /> : <Text style={styles.moreText}>Xem thêm</Text>}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 18, gap: 10, paddingBottom: 36 },
  card: { padding: 16, backgroundColor: palette.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: palette.line },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { flex: 1, color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  accuracy: { minWidth: 54, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 18, backgroundColor: palette.primarySoft, alignItems: 'center' },
  accuracyText: { color: palette.primaryDark, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 12, marginTop: 8 },
  empty: { alignItems: 'center', padding: 28, backgroundColor: palette.surface, borderRadius: radius.large },
  emptyTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  emptyText: { color: palette.muted, textAlign: 'center', fontSize: 13, lineHeight: 20, marginTop: 6 },
  error: { color: palette.danger, textAlign: 'center' },
  moreButton: { padding: 14, alignItems: 'center' },
  moreText: { color: palette.primary, fontWeight: '700' },
});
