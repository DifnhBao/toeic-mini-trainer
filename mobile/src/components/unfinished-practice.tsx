import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, radius } from '@/constants/design';
import { ApiError, getApiBaseUrl } from '@/lib/api';
import { practiceNamespace, type PracticeDraft } from '@/lib/practice-drafts';
import { practiceDrafts } from '@/lib/practice-storage';
import { useAuth } from '@/providers/auth-provider';
import { recoverLegacyPracticeDrafts } from '@/lib/legacy-practice-drafts';
import type { TestData } from '@/types/learning';

const recoveries = new Map<string, Promise<void>>();

export function UnfinishedPractice({ limit = 20 }: { limit?: number }) {
  const { user, authorizedFetch } = useAuth();
  const [drafts, setDrafts] = useState<PracticeDraft[]>([]);
  const [loadedNamespace, setLoadedNamespace] = useState('');
  const [error, setError] = useState('');
  const userId = user?.id ?? '';
  const namespace = userId ? practiceNamespace(getApiBaseUrl(), userId) : '';
  useFocusEffect(useCallback(() => {
    let active = true;
    setDrafts([]); setError('');
    const refresh = () => practiceDrafts.list(namespace).then((values) => { if (active) { setDrafts(values); setLoadedNamespace(namespace); } });
    if (namespace) {
      void refresh().catch(() => { if (active) setError('Chưa đọc được bài đang luyện trên thiết bị.'); });
      let recovery = recoveries.get(namespace);
      if (!recovery) {
        recovery = recoverLegacyPracticeDrafts({ namespace, storage: AsyncStorage, drafts: practiceDrafts, newId: Crypto.randomUUID, expectedUserId: userId,
          fetchOwnedTest: async (testId) => {
            try { return (await authorizedFetch<{ test: TestData }>(`/api/v1/tests/${testId}`)).test; }
            catch (error) { if (error instanceof ApiError && [403, 404].includes(error.status)) return null; throw error; }
          },
        });
        recoveries.set(namespace, recovery);
        void recovery.catch(() => recoveries.delete(namespace));
      }
      void recovery.then(refresh).catch(() => { if (active) setError('Chưa khôi phục được bài từ bản cũ. Hãy mở lại trang khi có mạng.'); });
    }
    return () => { active = false; };
  }, [namespace, userId, authorizedFetch]));
  const discard = (testId: string) => Alert.alert('Xóa bản nháp?', 'Đáp án chưa nộp của bài này sẽ bị xóa khỏi thiết bị.', [
    { text: 'Giữ lại', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => {
      practiceDrafts.remove(namespace, testId).then(() => setDrafts((values) => values.filter((value) => value.testId !== testId)))
        .catch(() => setError('Chưa xóa được bản nháp. Hãy thử lại.'));
    } },
  ]);
  const visibleDrafts = loadedNamespace === namespace ? drafts : [];
  if (!visibleDrafts.length && !error) return null;
  return <View style={styles.container}>
    <Text style={styles.title}>Bài đang luyện</Text>
    {visibleDrafts.slice(0, limit).map((draft) => <View key={draft.testId} style={styles.card}>
      <Pressable accessibilityRole="button" onPress={() => router.push(`/test/${draft.testId}`)} style={styles.resume}>
        <Text style={styles.name}>{draft.title}</Text>
        <Text style={styles.detail}>{Object.keys(draft.answers).length}/{draft.total} câu đã trả lời · Câu {draft.currentIndex + 1}</Text>
        <Text style={styles.link}>Tiếp tục luyện →</Text>
      </Pressable>
      <Pressable accessibilityLabel="Xóa bản nháp bài luyện" onPress={() => discard(draft.testId)} style={styles.delete}><Text style={styles.deleteText}>Xóa</Text></Pressable>
    </View>)}
    {visibleDrafts.length > limit && <Pressable onPress={() => router.push('/practice')}><Text style={styles.link}>Xem tất cả {visibleDrafts.length} bài</Text></Pressable>}
    {!!error && <Text style={styles.deleteText}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 10 }, title: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  card: { flexDirection: 'row', borderRadius: radius.medium, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  resume: { flex: 1, padding: 16 }, name: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  detail: { color: palette.muted, fontSize: 12, marginTop: 6 }, link: { color: palette.primary, fontWeight: '700', marginTop: 8 },
  delete: { padding: 16, justifyContent: 'center' }, deleteText: { color: palette.danger, fontSize: 12 },
});
