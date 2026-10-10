import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import type { LibraryCatalogue } from '../../../../types/library';

export default function LibraryScreen() {
  const { user } = useAuth();
  return user ? <LibraryContent key={user.id} /> : null;
}
function LibraryContent() {
  const { authorizedFetch } = useAuth();
  const [catalogue, setCatalogue] = useState<LibraryCatalogue>({ lessons: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    void authorizedFetch<LibraryCatalogue>('/api/v1/library')
      .then((data) => { if (active) { setCatalogue(data); setError(''); } })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Chưa tải được kho bài.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authorizedFetch]));
  async function load(more = false) {
    if (loading) return;
    setLoading(true); setError('');
    try {
      const data = await authorizedFetch<LibraryCatalogue>(`/api/v1/library${more && catalogue.nextCursor ? `?cursor=${catalogue.nextCursor}` : ''}`);
      if (!mounted.current) return;
      setCatalogue((current) => ({ ...data, lessons: more ? [...current.lessons, ...data.lessons.filter((lesson) => !current.lessons.some((old) => old.id === lesson.id))] : data.lessons }));
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa tải được kho bài.'); }
    finally { if (mounted.current) setLoading(false); }
  }
  async function start(id: string) {
    if (busy.current) return;
    busy.current = true; setCreating(id); setError('');
    try {
      const data = await authorizedFetch<{ test: { id: string } }>(`/api/v1/library/${id}/test`, { method: 'POST' });
      if (mounted.current) router.push(`/test/${data.test.id}`);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa tạo được bài.'); }
    finally { busy.current = false; if (mounted.current) setCreating(null); }
  }
  return <SafeAreaView edges={['bottom']} style={styles.safeArea}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Chọn bài để luyện</Text><Text style={styles.copy}>Đề, đáp án và audio được quản trị viên chuẩn bị trên web. Bạn chỉ cần chọn bài có sẵn.</Text>
    <Pressable disabled={loading} onPress={() => void load()} style={styles.secondary}><Text style={styles.secondaryText}>Tải lại kho bài</Text></Pressable>
    {loading && <ActivityIndicator color={palette.primary} />}{!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!loading && !error && catalogue.lessons.length === 0 && <View style={styles.card}><Text style={styles.cardTitle}>Kho bài đang được chuẩn bị</Text><Text style={styles.copy}>Bạn vẫn có thể luyện ngẫu nhiên từ các câu hiện có theo Part.</Text></View>}
    {catalogue.lessons.map((lesson) => <View key={lesson.id} style={styles.card}>
      <Text style={styles.cardTitle}>{lesson.title} · Part {lesson.parts.join(', ')}</Text>
      <Text style={styles.copy}>{lesson.questionCount > 50 ? 'Trên 50' : lesson.questionCount} câu{lesson.hasAudio ? ' · Có audio' : ''}{lesson.hasImage ? ' · Có hình ảnh' : ''}</Text>
      <Pressable disabled={!lesson.playable || creating !== null} onPress={() => void start(lesson.id)} style={[styles.button, (!lesson.playable || creating !== null) && styles.disabled]}>
        {creating === lesson.id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{lesson.playable ? 'Luyện bài này' : lesson.unavailableReason}</Text>}
      </Pressable>
    </View>)}
    {catalogue.nextCursor && <Pressable disabled={loading} onPress={() => void load(true)} style={styles.secondary}><Text style={styles.secondaryText}>Xem thêm bài</Text></Pressable>}
    <Pressable onPress={() => router.push('/practice')} style={styles.secondary}><Text style={styles.secondaryText}>Luyện ngẫu nhiên theo Part →</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, gap: 16 },
  title: { color: palette.ink, fontSize: 27, fontWeight: '800' },
  copy: { color: palette.muted, fontSize: 14, lineHeight: 22 },
  card: { padding: 18, gap: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radius.large },
  cardTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  button: { backgroundColor: palette.primary, padding: 14, alignItems: 'center', borderRadius: radius.small },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondary: { padding: 14, borderWidth: 1, borderColor: palette.line, borderRadius: radius.small },
  secondaryText: { color: palette.primary, fontSize: 14, fontWeight: '700' },
  error: { color: palette.danger, fontSize: 14, lineHeight: 21 }, disabled: { opacity: 0.45 },
});
