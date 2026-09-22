import { File } from 'expo-file-system';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { uploadPrivateFile } from '@/lib/uploads';
import { useAuth } from '@/providers/auth-provider';
import type { IngestionJob } from '@/types/learning';

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export default function LibraryScreen() {
  const { authorizedFetch } = useAuth();
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [job, setJob] = useState<IngestionJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const questionCount = useMemo(
    () => job?.result?.data.reduce((sum, group) => sum + group.questions.length, 0) || 0,
    [job],
  );

  const pickDocument = async () => {
    const picked = await File.pickFileAsync({ mimeTypes: 'application/pdf' });
    if (picked.canceled) return;
    if (picked.result.size > MAX_PDF_BYTES) {
      setError('PDF phải nhỏ hơn hoặc bằng 15 MB.');
      return;
    }
    setDocumentFile(picked.result);
    setJob(null);
    setError('');
  };

  const pickAudio = async () => {
    const picked = await File.pickFileAsync({
      mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'],
    });
    if (picked.canceled) return;
    if (picked.result.size > MAX_AUDIO_BYTES) {
      setError('Audio phải nhỏ hơn hoặc bằng 100 MB.');
      return;
    }
    setAudioFile(picked.result);
    setJob(null);
    setError('');
  };

  const pollJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const response = await authorizedFetch<{ job: IngestionJob }>(`/api/v1/ingestions/${jobId}`);
      setJob(response.job);
      if (response.job.status === 'COMPLETED' || response.job.status === 'IMPORTED') {
        return response.job;
      }
      if (response.job.status === 'FAILED') {
        throw new Error(`Không thể phân tích tài liệu (${response.job.errorCode || 'INGESTION_FAILED'}).`);
      }
      await delay(2_000);
    }
    throw new Error('Quá trình phân tích mất quá nhiều thời gian. Hãy mở lại mục Tài liệu sau.');
  };

  const startIngestion = async () => {
    if (!documentFile || busy) return;
    setBusy(true);
    setError('');
    setJob(null);
    try {
      setStatusText('Đang upload PDF…');
      const documentAssetId = await uploadPrivateFile(
        documentFile,
        'DOCUMENT',
        authorizedFetch,
        setProgress,
      );
      let audioAssetId: string | null = null;
      if (audioFile) {
        setStatusText('Đang upload audio…');
        setProgress(0);
        audioAssetId = await uploadPrivateFile(audioFile, 'AUDIO', authorizedFetch, setProgress);
      }

      setStatusText('AI đang đọc và cấu trúc bộ đề…');
      setProgress(1);
      const created = await authorizedFetch<{ job: { id: string } }>('/api/v1/ingestions', {
        method: 'POST',
        body: JSON.stringify({ documentAssetId, audioAssetId }),
      });
      const completed = await pollJob(created.job.id);
      setStatusText(`Đã nhận diện ${completed.result?.data.length || 0} nhóm câu hỏi.`);
    } catch (ingestionError) {
      setError(ingestionError instanceof Error ? ingestionError.message : 'Không thể nhập tài liệu.');
      setStatusText('');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!job || busy) return;
    setBusy(true);
    setError('');
    try {
      await authorizedFetch(`/api/v1/ingestions/${job.id}/retry`, { method: 'POST' });
      setStatusText('Đang thử phân tích lại…');
      await pollJob(job.id);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Không thể thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const importQuestions = async () => {
    if (!job || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await authorizedFetch<{ questionsAdded?: number }>(
        `/api/v1/ingestions/${job.id}/import`,
        { method: 'POST' },
      );
      setJob((current) => current ? { ...current, status: 'IMPORTED', importedAt: new Date().toISOString() } : current);
      setStatusText(`Đã thêm ${response.questionsAdded ?? questionCount} câu vào kho.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Không thể lưu câu hỏi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.kicker}>KHO TÀI LIỆU CÁ NHÂN</Text>
          <Text style={styles.title}>Đưa bộ đề của bạn vào app</Text>
          <Text style={styles.subtitle}>Chọn PDF có thể bôi chữ và audio nghe nếu có. File luôn ở chế độ riêng tư.</Text>
        </View>

        <Pressable onPress={pickDocument} disabled={busy} style={styles.fileCard}>
          <Text style={styles.fileLabel}>PDF BẮT BUỘC</Text>
          <Text style={styles.fileName}>{documentFile?.name || 'Chọn đề hoặc tài liệu TOEIC'}</Text>
          <Text style={styles.fileMeta}>{documentFile ? formatSize(documentFile.size) : 'Tối đa 15 MB'}</Text>
        </Pressable>

        <Pressable onPress={pickAudio} disabled={busy} style={styles.fileCard}>
          <Text style={styles.fileLabel}>AUDIO KHÔNG BẮT BUỘC</Text>
          <Text style={styles.fileName}>{audioFile?.name || 'Chọn MP3, M4A hoặc WAV'}</Text>
          <Text style={styles.fileMeta}>{audioFile ? formatSize(audioFile.size) : 'Tối đa 100 MB'}</Text>
        </Pressable>

        {busy && (
          <View style={styles.progressCard}>
            <ActivityIndicator color={palette.primary} />
            <View style={styles.progressCopy}>
              <Text style={styles.progressTitle}>{statusText}</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} /></View>
            </View>
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!job?.result && (
          <Pressable
            onPress={startIngestion}
            disabled={!documentFile || busy}
            style={[styles.primaryButton, (!documentFile || busy) && styles.disabled]}>
            <Text style={styles.primaryButtonText}>Upload và phân tích</Text>
          </Pressable>
        )}

        {job?.status === 'FAILED' && job.attemptCount < 3 && (
          <Pressable onPress={retry} disabled={busy} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Thử phân tích lại</Text>
          </Pressable>
        )}

        {job?.result && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>AI nhận diện {questionCount} câu</Text>
            <Text style={styles.reviewCopy}>Kiểm tra Part và đáp án trước khi lưu. Hiển thị tối đa 20 câu đầu.</Text>
            {job.result.data.flatMap((group) => group.questions).slice(0, 20).map((question, index) => (
              <View key={`${index}-${question.part}`} style={styles.questionRow}>
                <Text style={styles.questionPart}>P{question.part}</Text>
                <Text numberOfLines={2} style={styles.questionText}>{question.content || 'Câu hỏi nghe'}</Text>
                <Text style={styles.answerKey}>{question.correctAnswer}</Text>
              </View>
            ))}
            {job.status !== 'IMPORTED' ? (
              <Pressable onPress={importQuestions} disabled={busy} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Lưu {questionCount} câu vào kho</Text>
              </Pressable>
            ) : (
              <Text style={styles.success}>✓ Bộ câu hỏi đã được lưu.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 18, gap: 12, paddingBottom: 36 },
  kicker: { color: palette.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: palette.ink, fontSize: 26, lineHeight: 33, fontWeight: '800', marginTop: 5 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  fileCard: { backgroundColor: palette.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.line, borderRadius: radius.medium, padding: 17 },
  fileLabel: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  fileName: { color: palette.ink, fontSize: 15, fontWeight: '700', marginTop: 7 },
  fileMeta: { color: palette.muted, fontSize: 12, marginTop: 4 },
  progressCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: palette.surface, padding: 15, borderRadius: radius.medium },
  progressCopy: { flex: 1 },
  progressTitle: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  track: { height: 5, backgroundColor: palette.line, borderRadius: 5, marginTop: 8, overflow: 'hidden' },
  fill: { height: 5, backgroundColor: palette.primary },
  error: { color: palette.danger, fontSize: 13, lineHeight: 19 },
  primaryButton: { minHeight: 50, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary, marginTop: 4 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { minHeight: 48, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.primary },
  secondaryButtonText: { color: palette.primary, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  reviewCard: { backgroundColor: palette.surface, borderRadius: radius.large, borderWidth: 1, borderColor: palette.line, padding: 16, gap: 9 },
  reviewTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  reviewCopy: { color: palette.muted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.line },
  questionPart: { color: palette.primary, fontSize: 11, fontWeight: '900', width: 27 },
  questionText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 },
  answerKey: { color: palette.primaryDark, fontSize: 13, fontWeight: '900' },
  success: { color: palette.primary, fontSize: 14, fontWeight: '800', textAlign: 'center', padding: 12 },
});
