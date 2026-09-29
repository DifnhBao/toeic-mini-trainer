import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { apiRequest } from '@/lib/api';
import type { TestData } from '@/types/learning';

type GuestCreate = { challengeToken: string; test: TestData; remainingToday: number };
type GuestResult = {
  score: number;
  total: number;
  results: Array<{
    selectedOption: string | null;
    isCorrect: boolean;
    explanationText: string | null;
    question: TestData['questions'][number]['question'] & { correctAnswer: string };
  }>;
};

function AudioPreview({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable onPress={() => status.playing ? player.pause() : player.play()} style={styles.secondaryButton}>
      <Text style={styles.secondaryText}>{status.playing ? 'Tạm dừng audio' : 'Nghe audio'}</Text>
    </Pressable>
  );
}

export default function GuestScreen() {
  const [test, setTest] = useState<TestData | null>(null);
  const [challengeToken, setChallengeToken] = useState('');
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<GuestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest<GuestCreate>('/api/v1/guest/tests', {
        method: 'POST',
        body: JSON.stringify({ count: 10, parts: [1, 2, 3, 4, 5, 6, 7] }),
      });
      setTest(response.test);
      setChallengeToken(response.challengeToken);
      setAnswers({});
      setCurrentIndex(0);
      setResult(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tạo bài học thử.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!test || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest<GuestResult>('/api/v1/guest/tests/submit', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, answers }),
      });
      setResult(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể nộp bài học thử.');
    } finally {
      setBusy(false);
    }
  };

  const current = test?.questions[currentIndex]?.question;
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Học thử không cần tài khoản</Text>
        <Text style={styles.subtitle}>Bạn có thể làm bài và xem điểm. Đóng màn hình sẽ mất kết quả; đăng nhập nếu muốn lưu tiến độ và dùng AI Coach.</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator color={palette.primary} />}

        {!test && <Pressable disabled={busy} onPress={() => void start()} style={styles.primaryButton}>
          <Text style={styles.primaryText}>Bắt đầu bài 10 câu</Text>
        </Pressable>}

        {test && !result && current && (
          <View style={styles.card}>
            <Text style={styles.kicker}>CÂU {currentIndex + 1}/{test.questions.length} · PART {current.part}</Text>
            {!!current.group?.passageText && <Text style={styles.body}>{current.group.passageText.replace(/<[^>]*>/g, ' ')}</Text>}
            {!!current.group?.audioUrl && <AudioPreview url={current.group.audioUrl} />}
            {!!current.group?.imageUrl && <Image source={{ uri: current.group.imageUrl }} alt="Hình minh họa câu hỏi" style={styles.image} resizeMode="contain" />}
            <Text style={styles.question}>{current.content || 'Nghe audio và chọn đáp án đúng.'}</Text>
            {Object.entries(current.options).map(([key, value]) => (
              <Pressable key={key} onPress={() => setAnswers((old) => ({ ...old, [current.id]: key as 'A' | 'B' | 'C' | 'D' }))}
                style={[styles.option, answers[current.id] === key && styles.selectedOption]}>
                <Text style={styles.body}>{key}. {value}</Text>
              </Pressable>
            ))}
            <View style={styles.row}>
              <Pressable disabled={currentIndex === 0} onPress={() => setCurrentIndex((value) => value - 1)} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Trước</Text>
              </Pressable>
              {currentIndex < test.questions.length - 1 ? (
                <Pressable onPress={() => setCurrentIndex((value) => value + 1)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Tiếp</Text>
                </Pressable>
              ) : (
                <Pressable disabled={busy} onPress={() => void submit()} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Nộp bài</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {result && <View style={styles.card}>
          <Text style={styles.title}>Bạn đúng {result.score}/{result.total} câu</Text>
          <Text style={styles.subtitle}>Bài học thử không được lưu vào lịch sử.</Text>
          {result.results.map((item, index) => <View key={item.question.id} style={styles.resultRow}>
            <Text style={styles.question}>Câu {index + 1}: {item.question.content || 'Câu hỏi nghe'}</Text>
            <Text style={styles.body}>Bạn chọn: {item.selectedOption || 'Bỏ trống'} · Đáp án: {item.question.correctAnswer}</Text>
            {!!item.explanationText && <Text style={styles.body}>{item.explanationText}</Text>}
          </View>)}
          <Pressable onPress={() => router.push('/sign-in')} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Đăng nhập để lưu tiến độ</Text>
          </Pressable>
          <Pressable onPress={() => { setTest(null); setResult(null); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Làm bài khác</Text>
          </Pressable>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 20, gap: 14, paddingBottom: 36 },
  title: { color: palette.ink, fontSize: 25, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  kicker: { color: palette.primary, fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: palette.surface, borderRadius: radius.large, padding: 18, gap: 12 },
  question: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  body: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  option: { padding: 13, borderWidth: 1, borderColor: palette.line, borderRadius: radius.medium },
  selectedOption: { borderColor: palette.primary, backgroundColor: '#E6F5EF' },
  row: { flexDirection: 'row', gap: 10 },
  primaryButton: { padding: 14, backgroundColor: palette.primary, borderRadius: radius.medium, alignItems: 'center', flex: 1 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { padding: 13, borderColor: palette.primary, borderWidth: 1, borderRadius: radius.medium, alignItems: 'center', flex: 1 },
  secondaryText: { color: palette.primary, fontSize: 14, fontWeight: '700' },
  resultRow: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 9, gap: 4 },
  image: { width: '100%', height: 220 },
  error: { color: palette.danger, fontSize: 13 },
});
