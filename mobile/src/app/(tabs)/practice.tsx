import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import { UnfinishedPractice } from '@/components/unfinished-practice';

const counts = [10, 20, 30, 50];
const parts = [1, 2, 3, 4, 5, 6, 7];

export default function PracticeScreen() {
  const { authorizedFetch } = useAuth();
  const [count, setCount] = useState(20);
  const [selectedParts, setSelectedParts] = useState<number[]>(parts);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const togglePart = (part: number) => {
    setSelectedParts((current) =>
      current.includes(part) ? current.filter((value) => value !== part) : [...current, part],
    );
  };

  const createTest = async () => {
    if (creating || selectedParts.length === 0) return;
    setCreating(true);
    setError('');
    try {
      const response = await authorizedFetch<{ test: { id: string } }>('/api/v1/tests', {
        method: 'POST',
        body: JSON.stringify({ count, parts: selectedParts }),
      });
      router.push(`/test/${response.test.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Không thể tạo bài luyện.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <UnfinishedPractice />
        <View>
          <Text style={styles.title}>Thiết kế buổi luyện</Text>
          <Text style={styles.subtitle}>Chọn số câu và những phần bạn muốn tập trung.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>SỐ LƯỢNG CÂU</Text>
          <View style={styles.choiceRow}>
            {counts.map((value) => (
              <Pressable
                key={value}
                onPress={() => setCount(value)}
                style={[styles.choice, count === value && styles.choiceActive]}>
                <Text style={[styles.choiceText, count === value && styles.choiceTextActive]}>{value}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, styles.partLabel]}>TOEIC PART</Text>
          <View style={styles.partGrid}>
            {parts.map((part) => {
              const active = selectedParts.includes(part);
              return (
                <Pressable key={part} onPress={() => togglePart(part)} style={[styles.part, active && styles.partActive]}>
                  <Text style={[styles.partText, active && styles.partTextActive]}>Part {part}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{count} câu · {selectedParts.length} Part</Text>
          <Text style={styles.summaryText}>
            Câu hỏi được chọn ngẫu nhiên từ kho cá nhân và không lộ đáp án trước khi nộp.
          </Text>
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          onPress={createTest}
          disabled={selectedParts.length === 0 || creating}
          style={[styles.startButton, (selectedParts.length === 0 || creating) && styles.disabled]}>
          {creating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.startButtonText}>Tạo bài luyện</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 20, gap: 18 },
  title: { color: palette.ink, fontSize: 27, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  card: { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.large, padding: 18 },
  label: { color: palette.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  choiceRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  choice: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.small, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line },
  choiceActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  choiceText: { color: palette.ink, fontWeight: '700' },
  choiceTextActive: { color: '#FFFFFF' },
  partLabel: { marginTop: 24 },
  partGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  part: { width: '30%', alignItems: 'center', paddingVertical: 12, borderRadius: radius.small, borderWidth: 1, borderColor: palette.line },
  partActive: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
  partText: { color: palette.muted, fontWeight: '600' },
  partTextActive: { color: palette.primaryDark },
  summary: { paddingHorizontal: 4 },
  summaryTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  summaryText: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  error: { color: palette.danger, fontSize: 13, lineHeight: 19 },
  startButton: { alignItems: 'center', backgroundColor: palette.primary, borderRadius: radius.medium, paddingVertical: 16 },
  startButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
