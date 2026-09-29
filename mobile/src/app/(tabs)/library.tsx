import { File } from 'expo-file-system';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { pollIngestionJob } from '@/lib/ingestion-poll';
import { uploadPrivateFile } from '@/lib/uploads';
import { useAuth } from '@/providers/auth-provider';
import type { ExtractedQuestionGroup, IngestionJob } from '@/types/learning';

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_INGESTION_PAGES = 4;

type ContributionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type ContributionSummary = {
  id: string;
  sourceJobId: string;
  status: ContributionStatus;
  reviewNote: string | null;
  createdAt: string;
};
type PendingContribution = {
  id: string;
  createdAt: string;
  data: { data: ExtractedQuestionGroup[] };
  owner: { name: string | null; email: string | null };
};
type ContributionsResponse = {
  mine: ContributionSummary[];
  isReviewer: boolean;
  pending: PendingContribution[];
};

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ContributionAudio({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable onPress={() => status.playing ? player.pause() : player.play()} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{status.playing ? 'Tạm dừng audio' : 'Nghe audio để kiểm tra'}</Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const { authorizedFetch } = useAuth();
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [pageStartText, setPageStartText] = useState('1');
  const [uploadedDocument, setUploadedDocument] = useState<{ file: File; id: string } | null>(null);
  const [uploadedAudio, setUploadedAudio] = useState<{ file: File; id: string } | null>(null);
  const [job, setJob] = useState<IngestionJob | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [contributions, setContributions] = useState<ContributionsResponse | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewAudioUrl, setReviewAudioUrl] = useState<string | null>(null);
  const [reviewDocumentUrl, setReviewDocumentUrl] = useState<string | null>(null);
  const [reviewExpanded, setReviewExpanded] = useState(false);

  const questionCount = useMemo(
    () => job?.result?.data.reduce((sum, group) => sum + group.questions.length, 0) || 0,
    [job],
  );

  const refreshContributions = async () => {
    const response = await authorizedFetch<ContributionsResponse>('/api/v1/contributions');
    setContributions(response);
  };

  useEffect(() => {
    void authorizedFetch<ContributionsResponse>('/api/v1/contributions')
      .then(setContributions)
      .catch(() => undefined);
  }, [authorizedFetch]);

  const submitContribution = async () => {
    if (!job?.result || !rightsConfirmed || !reviewExpanded || busy) return;
    setBusy(true);
    setError('');
    try {
      await authorizedFetch('/api/v1/contributions', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, data: job.result, rightsConfirmed: true }),
      });
      setStatusText('Đã gửi đóng góp. Câu hỏi chỉ vào kho chung sau khi được duyệt.');
      await refreshContributions();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể gửi đóng góp.');
    } finally {
      setBusy(false);
    }
  };

  const reviewContribution = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    if (busy || (decision === 'REJECT' && reviewNote.trim().length < 5)) {
      if (decision === 'REJECT') setError('Hãy ghi lý do từ chối ít nhất 5 ký tự.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authorizedFetch(`/api/v1/contributions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, ...(reviewNote.trim() ? { note: reviewNote.trim() } : {}) }),
      });
      setSelectedPendingId(null);
      setReviewAudioUrl(null);
      setReviewDocumentUrl(null);
      setReviewNote('');
      await refreshContributions();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Không thể duyệt đóng góp.');
    } finally {
      setBusy(false);
    }
  };

  const togglePending = async (id: string) => {
    if (selectedPendingId === id) {
      setSelectedPendingId(null);
      setReviewAudioUrl(null);
      setReviewDocumentUrl(null);
      return;
    }
    setSelectedPendingId(id);
    setReviewAudioUrl(null);
    setReviewDocumentUrl(null);
    setReviewNote('');
    try {
      const [media, source] = await Promise.all([
        authorizedFetch<{ audioUrl: string | null }>(`/api/v1/contributions/${id}/media`),
        authorizedFetch<{ url: string }>(`/api/v1/contributions/${id}/source`),
      ]);
      setReviewAudioUrl(media.audioUrl);
      setReviewDocumentUrl(source.url);
    } catch {
      setError('Không thể mở tài liệu để kiểm tra. Đừng duyệt khi chưa xác minh nội dung.');
    }
  };

  const openReviewSource = async (id: string) => {
    try {
      // Fetch on tap: the reviewer might leave a card open past the URL's 5-minute lifetime.
      const source = await authorizedFetch<{ url: string }>(`/api/v1/contributions/${id}/source`);
      await WebBrowser.openBrowserAsync(source.url);
    } catch {
      setError('Không thể mở PDF nguồn. Hãy tải lại trước khi duyệt.');
    }
  };

  const pickDocument = async () => {
    const picked = await File.pickFileAsync({ mimeTypes: 'application/pdf' });
    if (picked.canceled) return;
    if (picked.result.size > MAX_PDF_BYTES) {
      setError('PDF phải nhỏ hơn hoặc bằng 15 MB.');
      return;
    }
    setDocumentFile(picked.result);
    setUploadedDocument(null);
    setJob(null);
    setActiveJobId(null);
    setReviewExpanded(false);
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
    setUploadedAudio(null);
    setJob(null);
    setActiveJobId(null);
    setReviewExpanded(false);
    setError('');
  };

  const pollJob = async (jobId: string) => {
    return pollIngestionJob({
      read: async () => (await authorizedFetch<{ job: IngestionJob }>(`/api/v1/ingestions/${jobId}`)).job,
      onJob: setJob,
      onTransientError: () => setStatusText('Kết nối gián đoạn, đang thử lại…'),
    });
  };

  const refreshJob = async (jobId: string) => {
    const latest = await authorizedFetch<{ job: IngestionJob }>(`/api/v1/ingestions/${jobId}`);
    setJob(latest.job);
  };

  const startIngestion = async () => {
    if (!documentFile || busy) return;
    const pageStart = Number(pageStartText);
    if (!Number.isSafeInteger(pageStart) || pageStart < 1 || pageStart > 1_000) {
      setError('Trang bắt đầu phải là số từ 1 đến 1000.');
      return;
    }
    setBusy(true);
    setError('');
    setJob(null);
    setReviewExpanded(false);
    setActiveJobId(null);
    try {
      setStatusText('Đang upload PDF…');
      const documentAssetId = uploadedDocument?.file === documentFile
        ? uploadedDocument.id
        : await uploadPrivateFile(documentFile, 'DOCUMENT', authorizedFetch, setProgress);
      setUploadedDocument({ file: documentFile, id: documentAssetId });
      let audioAssetId: string | null = null;
      if (audioFile) {
        setStatusText('Đang upload audio…');
        setProgress(0);
        audioAssetId = uploadedAudio?.file === audioFile
          ? uploadedAudio.id
          : await uploadPrivateFile(audioFile, 'AUDIO', authorizedFetch, setProgress);
        setUploadedAudio({ file: audioFile, id: audioAssetId });
      }

      setStatusText('AI đang đọc và cấu trúc bộ đề…');
      setProgress(1);
      const created = await authorizedFetch<{ job: { id: string } }>('/api/v1/ingestions', {
        method: 'POST',
        body: JSON.stringify({ documentAssetId, audioAssetId, pageStart }),
      });
      setActiveJobId(created.job.id);
      const completed = await pollJob(created.job.id);
      setStatusText(`Đã nhận diện ${completed.result?.data.length || 0} nhóm câu hỏi.`);
    } catch (ingestionError) {
      setError(ingestionError instanceof Error ? ingestionError.message : 'Không thể nhập tài liệu.');
      setStatusText('');
    } finally {
      setBusy(false);
    }
  };

  const resumePolling = async () => {
    if (!activeJobId || busy) return;
    setBusy(true);
    setError('');
    setStatusText('Đang kiểm tra tác vụ…');
    try {
      await pollJob(activeJobId);
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : 'Không thể kiểm tra tác vụ.');
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
      setStatusText(`Đã thêm ${response.questionsAdded ?? questionCount} câu vào kho cá nhân.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Không thể lưu câu hỏi.');
      await refreshJob(job.id).catch(() => undefined);
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
          <Text style={styles.subtitle}>Chọn PDF hoặc bản scan và audio nếu có. PDF gốc luôn riêng tư; audio chỉ được chia sẻ nếu bạn chủ động gửi đóng góp và được duyệt.</Text>
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

        <View style={styles.fileCard}>
          <Text style={styles.fileLabel}>KHOẢNG TRANG PHÂN TÍCH</Text>
          <Text style={styles.reviewCopy}>Mỗi lượt đọc tối đa {MAX_INGESTION_PAGES} trang, bắt đầu từ trang bạn chọn. Hãy lưu kết quả trước khi chuyển sang lượt tiếp theo. AI có thể đọc sai bản scan và đáp án.</Text>
          <TextInput value={pageStartText} onChangeText={setPageStartText} keyboardType="number-pad" placeholder="Trang bắt đầu (ví dụ: 1)" style={styles.pageInput} editable={!busy} />
        </View>

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

        {activeJobId && !busy && (!job || ['PENDING', 'PROCESSING'].includes(job.status)) && (
          <Pressable onPress={resumePolling} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Kiểm tra lại tác vụ</Text>
          </Pressable>
        )}

        {job?.status === 'IMPORTING' && !busy && (
          <Pressable onPress={() => {
            void refreshJob(job.id).catch((refreshError) =>
              setError(refreshError instanceof Error ? refreshError.message : 'Không thể kiểm tra trạng thái lưu.'),
            );
          }} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Kiểm tra trạng thái lưu</Text>
          </Pressable>
        )}

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
            <Text style={styles.reviewCopy}>AI có thể đọc sai. Mở toàn bộ để kiểm tra nội dung và đáp án trước khi gửi đóng góp.</Text>
            <Pressable onPress={() => setReviewExpanded((value) => !value)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{reviewExpanded ? 'Thu gọn' : `Xem toàn bộ ${questionCount} câu`}</Text>
            </Pressable>
            {reviewExpanded ? job.result.data.map((group, groupIndex) => (
              <View key={groupIndex} style={styles.contributionRow}>
                <Text style={styles.questionPart}>Nhóm {groupIndex + 1} · {group.group?.groupType || 'TEXT'}</Text>
                {!!group.group?.passageText && <Text style={styles.reviewCopy}>{group.group.passageText.replace(/<[^>]*>/g, ' ')}</Text>}
                {group.questions.map((question, questionIndex) => (
                  <View key={questionIndex} style={styles.contributionRow}>
                    <Text style={styles.checkText}>P{question.part} · {question.content || 'Câu hỏi nghe'}</Text>
                    {Object.entries(question.options).map(([key, value]) => <Text key={key} style={styles.reviewCopy}>{key}. {value}</Text>)}
                    <Text style={styles.answerKey}>Đáp án: {question.correctAnswer}</Text>
                  </View>
                ))}
              </View>
            )) : job.result.data.flatMap((group) => group.questions).slice(0, 20).map((question, index) => (
              <View key={`${index}-${question.part}`} style={styles.questionRow}>
                <Text style={styles.questionPart}>P{question.part}</Text>
                <Text numberOfLines={2} style={styles.questionText}>{question.content || 'Câu hỏi nghe'}</Text>
                <Text style={styles.answerKey}>{question.correctAnswer}</Text>
              </View>
            ))}
            {job.status === 'IMPORTING' && !job.importStalled && (
              <Text style={styles.reviewCopy}>Đang lưu câu hỏi. Vui lòng chờ…</Text>
            )}
            {job.importStalled && (
              <Text style={styles.error}>Lần lưu trước bị gián đoạn. Bạn có thể thử lưu lại.</Text>
            )}
            {(job.status === 'COMPLETED' || job.importStalled) ? (
              <Pressable onPress={importQuestions} disabled={busy} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{job.importStalled ? 'Thử lưu lại' : `Lưu ${questionCount} câu vào kho cá nhân`}</Text>
              </Pressable>
            ) : job.status === 'IMPORTED' ? (
              <Text style={styles.success}>✓ Bộ câu hỏi đã được lưu.</Text>
            ) : null}
            {['COMPLETED', 'IMPORTED'].includes(job.status) && !contributions?.mine.some((item) => item.sourceJobId === job.id) && (
              <View style={styles.contributionBox}>
                <Text style={styles.reviewTitle}>Gửi vào kho đóng góp chung</Text>
                <Text style={styles.reviewCopy}>Bạn cần có quyền chia sẻ nội dung câu hỏi và audio đính kèm. Admin sẽ xem PDF nguồn để duyệt, nhưng PDF không tự công khai cho người học.</Text>
                <Pressable onPress={() => setRightsConfirmed((value) => !value)} style={styles.checkRow}>
                  <Text style={styles.checkMark}>{rightsConfirmed ? '☑' : '☐'}</Text>
                  <Text style={styles.checkText}>Tôi xác nhận có quyền chia sẻ nội dung này.</Text>
                </Pressable>
                <Pressable onPress={submitContribution} disabled={busy || !rightsConfirmed || !reviewExpanded} style={[styles.secondaryButton, (busy || !rightsConfirmed || !reviewExpanded) && styles.disabled]}>
                  <Text style={styles.secondaryButtonText}>Gửi {questionCount} câu để duyệt</Text>
                </Pressable>
              </View>
            )}
            {job.status === 'IMPORTED' && (
              <Pressable onPress={() => { setJob(null); setActiveJobId(null); }} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Chọn trang khác để phân tích</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Đóng góp của tôi</Text>
          {contributions?.mine.length ? contributions.mine.map((item) => (
            <View key={item.id} style={styles.contributionRow}>
              <Text style={styles.checkText}>{new Date(item.createdAt).toLocaleDateString('vi-VN')} · {item.status === 'PENDING' ? 'Chờ duyệt' : item.status === 'APPROVED' ? 'Đã vào kho chung' : 'Bị từ chối'}</Text>
              {!!item.reviewNote && <Text style={styles.reviewCopy}>Ghi chú: {item.reviewNote}</Text>}
            </View>
          )) : <Text style={styles.reviewCopy}>Chưa gửi bộ câu hỏi nào.</Text>}
          <Pressable onPress={() => void refreshContributions().catch(() => setError('Không thể tải trạng thái đóng góp.'))} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cập nhật trạng thái</Text>
          </Pressable>
        </View>

        {contributions?.isReviewer && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Hàng chờ duyệt ({contributions.pending.length})</Text>
            {contributions.pending.map((item) => (
              <View key={item.id} style={styles.contributionRow}>
                <Text style={styles.checkText}>{item.owner.name || item.owner.email || 'Người đóng góp'} · {item.data.data.reduce((sum, group) => sum + group.questions.length, 0)} câu</Text>
                <Pressable onPress={() => void togglePending(item.id)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{selectedPendingId === item.id ? 'Thu gọn' : 'Xem toàn bộ câu hỏi'}</Text>
                </Pressable>
                {selectedPendingId === item.id && (
                  <View style={styles.contributionBox}>
                    {reviewDocumentUrl && (
                      <Pressable onPress={() => void openReviewSource(item.id)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Mở PDF nguồn để kiểm tra</Text>
                      </Pressable>
                    )}
                    {reviewAudioUrl && <ContributionAudio url={reviewAudioUrl} />}
                    {item.data.data.map((group, groupIndex) => (
                      <View key={groupIndex} style={styles.contributionRow}>
                        <Text style={styles.questionPart}>Nhóm {groupIndex + 1} · {group.group?.groupType || 'TEXT'}{group.group?.audioAssetId ? ' · có audio' : ''}</Text>
                        {!!group.group?.passageText && <Text style={styles.reviewCopy}>{group.group.passageText.replace(/<[^>]*>/g, ' ')}</Text>}
                        {group.questions.map((question, questionIndex) => (
                          <View key={questionIndex} style={styles.contributionRow}>
                            <Text style={styles.checkText}>P{question.part} · {question.content || 'Câu hỏi nghe'}</Text>
                            {Object.entries(question.options).map(([key, value]) => <Text key={key} style={styles.reviewCopy}>{key}. {value}</Text>)}
                            <Text style={styles.answerKey}>Đáp án: {question.correctAnswer}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                    <TextInput value={reviewNote} onChangeText={setReviewNote} placeholder="Lý do từ chối hoặc ghi chú (tuỳ chọn khi duyệt)" multiline maxLength={1000} style={styles.noteInput} />
                    <Pressable onPress={() => void reviewContribution(item.id, 'APPROVE')} disabled={busy} style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>Duyệt vào kho chung</Text>
                    </Pressable>
                    <Pressable onPress={() => void reviewContribution(item.id, 'REJECT')} disabled={busy} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Từ chối</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
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
  contributionBox: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  contributionRow: { gap: 5, paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.line },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  checkMark: { fontSize: 22, color: palette.primary },
  checkText: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 19 },
  noteInput: { borderWidth: 1, borderColor: palette.line, borderRadius: radius.medium, padding: 12, minHeight: 64, color: palette.ink },
  pageInput: { borderWidth: 1, borderColor: palette.line, borderRadius: radius.medium, padding: 12, color: palette.ink },
});
