import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import type { AttemptDetail } from '@/types/learning';

function stripMarkup(value: string) {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function formatDuration(total: number | null) {
  if (total === null) return '—';
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const attemptId = Array.isArray(id) ? id[0] : id;
  const { authorizedFetch } = useAuth();
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState('');
  const [explainRequests, setExplainRequests] = useState<Record<string, { loading: boolean; error: string }>>({});

  useEffect(() => {
    if (!attemptId) return;
    let active = true;
    authorizedFetch<{ attempt: AttemptDetail }>(`/api/v1/attempts/${attemptId}`)
      .then((response) => active && setAttempt(response.attempt))
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Không thể tải kết quả.'));
    return () => {
      active = false;
    };
  }, [attemptId, authorizedFetch]);

  const requestExplanation = async (answerId: string) => {
    if (explainRequests[answerId]?.loading) return;
    setExplainRequests((prev) => ({ ...prev, [answerId]: { loading: true, error: '' } }));
    try {
      const response = await authorizedFetch<{ explanation: { explanationText: string } }>('/api/v1/ai/explain', {
        method: 'POST',
        body: JSON.stringify({ userAnswerId: answerId }),
      });
      setAttempt((prev) =>
        prev
          ? {
              ...prev,
              userAnswers: prev.userAnswers.map((answer) =>
                answer.id === answerId
                  ? { ...answer, aiExplanation: { explanationText: response.explanation.explanationText, suggestedSkills: null } }
                  : answer,
              ),
            }
          : prev,
      );
      setExplainRequests((prev) => ({ ...prev, [answerId]: { loading: false, error: '' } }));
    } catch (explainError) {
      setExplainRequests((prev) => ({
        ...prev,
        [answerId]: { loading: false, error: explainError instanceof Error ? explainError.message : 'Không tạo được lời giải.' },
      }));
    }
  };

  if (!attempt && !error) {
    return <View style={styles.state}><ActivityIndicator color={palette.primary} /><Text>Đang chấm và tải lời giải…</Text></View>;
  }
  if (!attempt) {
    return <View style={styles.state}><Text style={styles.stateTitle}>Không tải được kết quả</Text><Text style={styles.error}>{error}</Text></View>;
  }

  const score = attempt.score ?? 0;
  const percentage = attempt.total ? Math.round((score / attempt.total) * 100) : 0;
  const heading = percentage >= 80 ? 'Nền tảng rất tốt!' : percentage >= 60 ? 'Bạn đang tiến bộ.' : 'Đã tìm ra phần cần ôn.';

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>KẾT QUẢ BÀI LUYỆN</Text>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.testTitle}>{attempt.test.title}</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scorePercent}>{percentage}%</Text>
            <Text style={styles.scoreFraction}>{score}/{attempt.total} câu đúng</Text>
          </View>
          <View style={styles.metrics}>
            <View style={styles.metric}><Text style={styles.metricValue}>{score}</Text><Text style={styles.metricLabel}>Đúng</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{attempt.total - score}</Text><Text style={styles.metricLabel}>Cần xem</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{formatDuration(attempt.durationSeconds)}</Text><Text style={styles.metricLabel}>Thời gian</Text></View>
          </View>
          <View style={styles.heroActions}>
            <Pressable onPress={() => router.replace('/practice')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Làm bài khác</Text></Pressable>
            <Pressable onPress={() => router.push('/history')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Lịch sử</Text></Pressable>
          </View>
        </View>

        <View style={styles.reviewHeading}>
          <Text style={styles.reviewTitle}>Chữa từng câu</Text>
          <Text style={styles.reviewCopy}>Đáp án đúng chỉ được mở sau khi bài đã nộp.</Text>
        </View>

        {attempt.userAnswers.map((answer, index) => {
          const question = answer.question;
          return (
            <View key={answer.id} style={[styles.reviewCard, answer.isCorrect ? styles.correctCard : styles.wrongCard]}>
              <View style={styles.reviewTop}>
                <Text style={styles.questionNumber}>Câu {index + 1} · Part {question.part}</Text>
                <Text style={[styles.status, answer.isCorrect ? styles.correctText : styles.wrongText]}>
                  {answer.isCorrect ? '✓ Chính xác' : '✕ Cần xem lại'}
                </Text>
              </View>
              {question.group?.imageUrl && (
                <Image
                  alt={`Hình minh họa câu ${index + 1}`}
                  source={{ uri: question.group.imageUrl }}
                  resizeMode="contain"
                  style={styles.image}
                />
              )}
              {question.group?.passageText && <View style={styles.passage}><Text style={styles.passageText}>{stripMarkup(question.group.passageText)}</Text></View>}
              <Text style={styles.questionText}>{question.content || 'Chọn đáp án đúng nhất.'}</Text>
              <View style={styles.options}>
                {Object.entries(question.options).map(([key, value]) => {
                  const correct = key === question.correctAnswer;
                  const selectedWrong = key === answer.selectedOption && !answer.isCorrect;
                  return (
                    <View key={key} style={[styles.option, correct && styles.correctOption, selectedWrong && styles.wrongOption]}>
                      <Text style={styles.optionKey}>{key}</Text>
                      <Text style={styles.optionText}>{value}</Text>
                      {correct && <Text style={styles.optionHint}>ĐÚNG</Text>}
                      {selectedWrong && <Text style={styles.wrongHint}>BẠN CHỌN</Text>}
                    </View>
                  );
                })}
              </View>
              {!answer.selectedOption && <Text style={styles.unanswered}>Bạn đã bỏ trống câu này.</Text>}
              {!answer.isCorrect && (
                <View style={styles.aiNotice}>
                  <Text style={styles.aiNoticeTitle}>✦ AI Coach</Text>
                  {answer.aiExplanation?.explanationText ? (
                    <Text style={styles.aiNoticeText}>{answer.aiExplanation.explanationText}</Text>
                  ) : explainRequests[answer.id]?.loading ? (
                    <View style={styles.explainLoading}>
                      <ActivityIndicator color="#5B3CB0" />
                      <Text style={styles.aiNoticeText}>Đang soạn lời giải…</Text>
                    </View>
                  ) : (
                    <>
                      <Pressable onPress={() => requestExplanation(answer.id)} style={styles.explainButton}>
                        <Text style={styles.explainButtonText}>Chữa câu này bằng AI</Text>
                      </Pressable>
                      {!!explainRequests[answer.id]?.error && (
                        <Text style={styles.explainError}>{explainRequests[answer.id].error}</Text>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 18, gap: 14, paddingBottom: 36 },
  state: { flex: 1, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  error: { color: palette.danger, textAlign: 'center' },
  hero: { backgroundColor: palette.primaryDark, borderRadius: radius.large, padding: 22, alignItems: 'center' },
  eyebrow: { color: '#A8DACE', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  heading: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  testTitle: { color: '#CDE5DE', fontSize: 13, textAlign: 'center', marginTop: 5 },
  scoreCircle: { width: 142, height: 142, borderRadius: 71, borderWidth: 10, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  scorePercent: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
  scoreFraction: { color: '#CDE5DE', fontSize: 11, marginTop: 2 },
  metrics: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 22 },
  metric: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#FFFFFF20' },
  metricValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  metricLabel: { color: '#A8DACE', fontSize: 11, marginTop: 3 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 22, alignSelf: 'stretch' },
  primaryButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radius.small, backgroundColor: palette.accent },
  primaryButtonText: { color: '#362400', fontWeight: '800' },
  secondaryButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radius.small, borderWidth: 1, borderColor: '#FFFFFF50' },
  secondaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  reviewHeading: { marginTop: 10 },
  reviewTitle: { color: palette.ink, fontSize: 22, fontWeight: '800' },
  reviewCopy: { color: palette.muted, fontSize: 13, marginTop: 4 },
  reviewCard: { backgroundColor: palette.surface, borderRadius: radius.medium, padding: 16, borderWidth: 1 },
  correctCard: { borderColor: '#B8DCCD' },
  wrongCard: { borderColor: '#EDC8C4' },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionNumber: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  status: { fontSize: 12, fontWeight: '800' },
  correctText: { color: palette.primary },
  wrongText: { color: palette.danger },
  image: { width: '100%', height: 200, marginTop: 14, backgroundColor: palette.canvas, borderRadius: radius.small },
  passage: { backgroundColor: palette.canvas, borderRadius: radius.small, padding: 12, marginTop: 14 },
  passageText: { color: palette.ink, fontSize: 13, lineHeight: 20 },
  questionText: { color: palette.ink, fontSize: 16, lineHeight: 23, fontWeight: '700', marginTop: 14 },
  options: { gap: 8, marginTop: 12 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: radius.small, backgroundColor: palette.canvas },
  correctOption: { backgroundColor: palette.primarySoft },
  wrongOption: { backgroundColor: '#FFF0EE' },
  optionKey: { width: 24, color: palette.ink, fontWeight: '800' },
  optionText: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 18 },
  optionHint: { color: palette.primary, fontSize: 9, fontWeight: '900' },
  wrongHint: { color: palette.danger, fontSize: 9, fontWeight: '900' },
  unanswered: { color: palette.danger, fontSize: 12, marginTop: 9 },
  aiNotice: { marginTop: 14, backgroundColor: '#F1EEFF', borderRadius: radius.small, padding: 12 },
  aiNoticeTitle: { color: '#5B3CB0', fontSize: 12, fontWeight: '800' },
  aiNoticeText: { color: '#4B3F68', fontSize: 13, lineHeight: 19, marginTop: 4 },
  explainLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  explainButton: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#5B3CB0', paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.small },
  explainButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  explainError: { color: palette.danger, fontSize: 12, marginTop: 6 },
});
