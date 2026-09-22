import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import type { TestData } from '@/types/learning';

type Draft = {
  answers: Record<string, string>;
  currentIndex: number;
  startedAt: number;
  clientSubmissionId: string;
};

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function plainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function AudioPanel({ url }: { url: string }) {
  const player = useAudioPlayer(url, { updateInterval: 500, downloadFirst: true });
  const status = useAudioPlayerStatus(player);

  return (
    <View style={styles.audioPanel}>
      <Pressable
        accessibilityRole="button"
        onPress={() => (status.playing ? player.pause() : player.play())}
        style={styles.audioButton}>
        <Text style={styles.audioButtonText}>{status.playing ? 'Ⅱ' : '▶'}</Text>
      </Pressable>
      <View style={styles.audioInfo}>
        <Text style={styles.audioTitle}>Audio câu hỏi</Text>
        <Text style={styles.audioTime}>
          {status.isLoaded
            ? `${formatDuration(status.currentTime)} / ${formatDuration(status.duration || 0)}`
            : 'Đang tải audio…'}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Nghe lại từ đầu"
        onPress={() => {
          player.seekTo(0);
          player.play();
        }}
        style={styles.replayButton}>
        <Text style={styles.replayText}>↺</Text>
      </Pressable>
    </View>
  );
}

export default function TestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const testId = Array.isArray(id) ? id[0] : id;
  const { user, authorizedFetch } = useAuth();
  const [test, setTest] = useState<TestData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [submissionId, setSubmissionId] = useState(() => Crypto.randomUUID());
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const draftKey = `toeic.draft.${testId}`;

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!user || !testId) return;
    let active = true;
    (async () => {
      try {
        const [response, saved] = await Promise.all([
          authorizedFetch<{ test: TestData }>(`/api/v1/tests/${testId}`),
          AsyncStorage.getItem(draftKey),
        ]);
        if (!active) return;
        setTest(response.test);
        if (saved) {
          const draft = JSON.parse(saved) as Partial<Draft>;
          if (draft.answers && typeof draft.answers === 'object') setAnswers(draft.answers);
          if (Number.isInteger(draft.currentIndex)) {
            setCurrentIndex(Math.max(0, Math.min(response.test.questions.length - 1, draft.currentIndex!)));
          }
          if (typeof draft.startedAt === 'number') setStartedAt(draft.startedAt);
          else setStartedAt(Date.now());
          if (typeof draft.clientSubmissionId === 'string') setSubmissionId(draft.clientSubmissionId);
        } else setStartedAt(Date.now());
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Không thể mở bài luyện.');
      } finally {
        if (active) {
          setDraftReady(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizedFetch, draftKey, testId, user]);

  useEffect(() => {
    if (startedAt <= 0) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (!draftReady || !test || startedAt <= 0) return;
    const draft: Draft = {
      answers,
      currentIndex,
      startedAt,
      clientSubmissionId: submissionId,
    };
    AsyncStorage.setItem(draftKey, JSON.stringify(draft)).catch(() => undefined);
  }, [answers, currentIndex, draftKey, draftReady, startedAt, submissionId, test]);

  const answeredCount = Object.keys(answers).length;
  const question = test?.questions[currentIndex]?.question;
  const parts = useMemo(
    () => (test ? [...new Set(test.questions.map((item) => item.question.part))] : []),
    [test],
  );

  if (!user) return <Redirect href="/sign-in" />;

  const performSubmit = async () => {
    if (!test || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await authorizedFetch<{ attemptId: string }>(
        `/api/v1/tests/${test.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            answers,
            clientSubmissionId: submissionId,
            durationSeconds: startedAt > 0
              ? Math.min(24 * 60 * 60, Math.floor((Date.now() - startedAt) / 1000))
              : 0,
          }),
        },
      );
      await AsyncStorage.removeItem(draftKey);
      router.replace(`/result/${response.attemptId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể nộp bài.');
      setSubmitting(false);
    }
  };

  const submit = () => {
    if (!test) return;
    const unanswered = test.questions.length - answeredCount;
    if (unanswered > 0) {
      Alert.alert(
        'Vẫn còn câu chưa làm',
        `Bạn còn ${unanswered} câu. Các câu trống sẽ được tính là sai.`,
        [
          { text: 'Làm tiếp', style: 'cancel' },
          { text: 'Nộp bài', style: 'destructive', onPress: performSubmit },
        ],
      );
      return;
    }
    performSubmit();
  };

  const exit = () => {
    Alert.alert('Thoát bài luyện?', 'Đáp án hiện tại đã được tự động lưu trên thiết bị.', [
      { text: 'Ở lại', style: 'cancel' },
      { text: 'Thoát', onPress: () => router.replace('/(tabs)') },
    ]);
  };

  if (loading) {
    return <View style={styles.state}><ActivityIndicator color={palette.primary} /><Text>Đang chuẩn bị bài luyện…</Text></View>;
  }
  if (!test || !question) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>Không mở được bài luyện</Text>
        <Text style={styles.error}>{error || 'Bài luyện không có câu hỏi.'}</Text>
        <Pressable onPress={() => router.replace('/(tabs)')}><Text style={styles.textLink}>Về trang chủ</Text></Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={exit} style={styles.headerAction}><Text style={styles.headerActionText}>Thoát</Text></Pressable>
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.headerTitle}>{test.title}</Text>
          <Text style={styles.timer}>◷ {formatDuration(elapsed)}</Text>
        </View>
        <Pressable onPress={submit} disabled={submitting} style={styles.headerAction}>
          <Text style={styles.submitLink}>{submitting ? 'Đang nộp' : 'Nộp'}</Text>
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{answeredCount}/{test.questions.length} đã trả lời</Text>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.round((answeredCount / test.questions.length) * 100)}%` }]} /></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.numberStrip}>
        {test.questions.map((item, index) => {
          const selected = index === currentIndex;
          const answered = Boolean(answers[item.question.id]);
          return (
            <Pressable
              key={item.question.id}
              onPress={() => setCurrentIndex(index)}
              style={[styles.number, answered && styles.numberAnswered, selected && styles.numberCurrent]}>
              <Text style={[styles.numberText, (answered || selected) && styles.numberTextActive]}>{index + 1}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.questionContent}>
        <View style={styles.questionMeta}>
          <Text style={styles.partPill}>PART {question.part}</Text>
          <Text style={styles.questionCount}>CÂU {currentIndex + 1} / {test.questions.length}</Text>
        </View>

        {question.group?.audioUrl && <AudioPanel key={question.group.audioUrl} url={question.group.audioUrl} />}

        <View style={styles.questionCard}>
          {question.group?.imageUrl && (
            <Image
              alt={`Hình minh họa câu ${currentIndex + 1}`}
              source={{ uri: question.group.imageUrl }}
              resizeMode="contain"
              style={styles.questionImage}
            />
          )}
          {question.group?.passageText && (
            <View style={styles.passage}><Text style={styles.passageText}>{plainText(question.group.passageText)}</Text></View>
          )}
          <Text style={styles.questionText}>
            {question.content || (question.part === 1 ? 'Chọn câu mô tả đúng nhất cho hình ảnh.' : 'Chọn đáp án đúng nhất.')}
          </Text>
          <View style={styles.answers}>
            {Object.entries(question.options || {}).map(([key, value]) => {
              const selected = answers[question.id] === key;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={key}
                  onPress={() => setAnswers((current) => ({ ...current, [question.id]: key }))}
                  style={[styles.answer, selected && styles.answerSelected]}>
                  <View style={[styles.optionKey, selected && styles.optionKeySelected]}>
                    <Text style={[styles.optionKeyText, selected && styles.optionKeyTextSelected]}>{key}</Text>
                  </View>
                  <Text style={[styles.answerText, selected && styles.answerTextSelected]}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.partsNote}>Bài này gồm {parts.map((part) => `Part ${part}`).join(', ')}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          disabled={currentIndex === 0}
          onPress={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          style={[styles.secondaryButton, currentIndex === 0 && styles.disabled]}>
          <Text style={styles.secondaryButtonText}>← Câu trước</Text>
        </Pressable>
        {currentIndex < test.questions.length - 1 ? (
          <Pressable onPress={() => setCurrentIndex((value) => value + 1)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Câu tiếp →</Text>
          </Pressable>
        ) : (
          <Pressable onPress={submit} disabled={submitting} style={[styles.primaryButton, submitting && styles.disabled]}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Nộp bài</Text>}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  state: { flex: 1, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  stateTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  textLink: { color: palette.primary, fontSize: 15, fontWeight: '700' },
  header: { height: 62, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.line },
  headerAction: { width: 64, paddingVertical: 10 },
  headerActionText: { color: palette.muted, fontWeight: '600' },
  submitLink: { color: palette.primary, fontWeight: '800', textAlign: 'right' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: palette.ink, fontSize: 13, fontWeight: '700', maxWidth: 210 },
  timer: { color: palette.muted, fontSize: 12, marginTop: 2 },
  progressRow: { paddingHorizontal: 18, paddingTop: 12, backgroundColor: palette.surface },
  progressText: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  track: { height: 4, borderRadius: 4, backgroundColor: palette.line, marginTop: 7 },
  fill: { height: 4, borderRadius: 4, backgroundColor: palette.primary },
  numberStrip: { gap: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: palette.surface },
  number: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line },
  numberAnswered: { backgroundColor: palette.primarySoft, borderColor: palette.primarySoft },
  numberCurrent: { backgroundColor: palette.primary, borderColor: palette.primary },
  numberText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  numberTextActive: { color: palette.primaryDark },
  questionContent: { padding: 18, paddingBottom: 30 },
  questionMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  partPill: { color: palette.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  questionCount: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  audioPanel: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.medium, backgroundColor: palette.primaryDark, marginBottom: 12 },
  audioButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  audioButtonText: { color: '#302000', fontWeight: '800', fontSize: 15 },
  audioInfo: { flex: 1, marginLeft: 12 },
  audioTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  audioTime: { color: '#CDE5DE', fontSize: 12, marginTop: 3 },
  replayButton: { padding: 10 },
  replayText: { color: '#FFFFFF', fontSize: 23 },
  questionCard: { borderRadius: radius.large, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 18 },
  questionImage: { width: '100%', height: 220, borderRadius: radius.medium, backgroundColor: palette.canvas, marginBottom: 16 },
  passage: { padding: 14, borderRadius: radius.small, backgroundColor: palette.canvas, marginBottom: 16 },
  passageText: { color: palette.ink, fontSize: 14, lineHeight: 22 },
  questionText: { color: palette.ink, fontSize: 19, lineHeight: 28, fontWeight: '750' as '700' },
  answers: { gap: 10, marginTop: 18 },
  answer: { minHeight: 58, borderRadius: radius.medium, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', padding: 10 },
  answerSelected: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  optionKey: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
  optionKeySelected: { backgroundColor: palette.primary },
  optionKeyText: { color: palette.ink, fontWeight: '800' },
  optionKeyTextSelected: { color: '#FFFFFF' },
  answerText: { flex: 1, color: palette.ink, fontSize: 15, lineHeight: 21, marginLeft: 12 },
  answerTextSelected: { color: palette.primaryDark, fontWeight: '600' },
  error: { color: palette.danger, textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: 12 },
  partsNote: { color: palette.muted, textAlign: 'center', fontSize: 11, marginTop: 16 },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.surface, flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: radius.medium, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: palette.ink, fontWeight: '700' },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: radius.medium, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.4 },
});
