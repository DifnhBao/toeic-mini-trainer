import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette, radius } from '@/constants/design';
import { ApiError } from '@/lib/api';
import { ingestionDrafts } from '@/lib/local-ingestion-store';
import { assertReviewProtocol, buildReviewPayload, editEntry, initialEntries, OPTION_KEYS, reviewCounts, validationMessage, type DraftQuestion, type ReviewEntry } from '@/lib/question-review';
import { useAuth } from '@/providers/auth-provider';
import type { IngestionJob } from '@/types/learning';

export default function IngestionQuestionReview({ job, namespace, onChanged, onBusyChange }: {
  job: IngestionJob; namespace: string;
  onChanged: (job: IngestionJob) => void; onBusyChange: (busy: boolean) => void;
}) {
  const { authorizedFetch } = useAuth();
  const groups = job.result!.data;
  const [entries, setEntries] = useState<ReviewEntry[]>(() => initialEntries(groups));
  const [activeIndex, setActiveIndex] = useState(0);
  const [sourceHash, setSourceHash] = useState('');
  const [loadedSourceJson, setLoadedSourceJson] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [storageStatus, setStorageStatus] = useState('Đang khôi phục bản nháp…');
  const [storageFailed, setStorageFailed] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(job.contribution));
  const [contributionOnly, setContributionOnly] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const actionRunning = useRef(false);
  const sourceJson = useMemo(() => JSON.stringify(groups), [groups]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, sourceJson);
      const restored = await ingestionDrafts.read(namespace, job.id, hash, JSON.parse(sourceJson));
      if (cancelled) return;
      setSourceHash(hash);
      if (restored.draft) {
        setEntries(restored.draft.entries);
        setActiveIndex(restored.draft.activeIndex);
        setMessage('Đã khôi phục chỉnh sửa và các quyết định duyệt trước đó.');
      } else if (restored.discarded) {
        setMessage('Bản nháp cũ không khớp hoặc bị hỏng. Hãy kiểm tra và duyệt lại từng câu.');
        setEntries(initialEntries(JSON.parse(sourceJson)));
        setActiveIndex(0);
      }
      setRestoreError('');
      setLoadedSourceJson(sourceJson);
      setStorageStatus('Đang lưu bản nháp trên máy…');
      setReady(true);
    })().catch(() => {
      if (!cancelled) setRestoreError('Không đọc được bản nháp. Hãy thử lại để tránh ghi đè chỉnh sửa cũ.');
    });
    return () => { cancelled = true; };
  }, [job.id, namespace, sourceJson, restoreAttempt]);

  useEffect(() => {
    if (!ready || loadedSourceJson !== sourceJson) return;
    let cancelled = false;
    void ingestionDrafts.write(namespace, job.id, {
      version: 1, sourceHash, entries, activeIndex, savedAt: new Date().toISOString(),
    }).then(() => { if (!cancelled) { setStorageFailed(false); setStorageStatus('Đã lưu bản nháp trên máy.'); } })
      .catch(() => { if (!cancelled) { setStorageFailed(true); setStorageStatus('Chưa lưu được bản nháp! Không đóng app; hãy giải phóng bộ nhớ và thử lưu lại.'); } });
    return () => { cancelled = true; };
  }, [ready, loadedSourceJson, sourceJson, namespace, job.id, sourceHash, entries, activeIndex, saveAttempt]);

  const counts = reviewCounts(entries);
  const active = entries[activeIndex];
  const group = active ? groups[active.groupIndex]?.group : null;
  const activeError = active ? validationMessage(active.question) : null;
  const imported = job.status === 'IMPORTED';
  const locked = busy || (imported && !contributionOnly) || submitted || Boolean(job.contribution);
  const valid = ready && loadedSourceJson === sourceJson && counts.pending === 0 && counts.approved > 0 &&
    !entries.some((entry) => entry.decision === 'APPROVE' && validationMessage(entry.question));
  const protocolReady = job.reviewProtocol === 1;
  const canSave = protocolReady && valid && !busy && (job.status === 'COMPLETED' || job.importStalled);
  const canSubmit = protocolReady && valid && !busy && rightsConfirmed && !submitted && !job.contribution &&
    ['COMPLETED', 'IMPORTED'].includes(job.status);

  function edit(update: Partial<DraftQuestion>) {
    if (locked || !active) return;
    setStorageStatus('Đang lưu bản nháp trên máy…');
    setEntries(editEntry(entries, activeIndex, { ...active.question, ...update }));
    setError('');
  }
  function decide(decision: 'APPROVE' | 'SKIP') {
    if (locked || !active || (decision === 'APPROVE' && activeError)) return;
    setStorageStatus('Đang lưu bản nháp trên máy…');
    const next = entries.map((entry, index) => index === activeIndex ? { ...entry, decision } : entry);
    setEntries(next);
    const pending = next.findIndex((entry, index) => index > activeIndex && entry.decision === 'PENDING');
    const first = pending >= 0 ? pending : next.findIndex((entry) => entry.decision === 'PENDING');
    if (first >= 0) setActiveIndex(first);
  }

  function navigate(index: number) {
    setStorageStatus('Đang lưu bản nháp trên máy…');
    setActiveIndex(index);
  }

  async function send(kind: 'import' | 'contribute') {
    if (actionRunning.current || !(kind === 'import' ? canSave : canSubmit)) return;
    actionRunning.current = true;
    setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try {
      // Check immediately before writing too: an API rollback must not silently
      // send new reviewed payloads to the old bodyless import implementation.
      const preflight = await authorizedFetch<{ job: IngestionJob }>(`/api/v1/ingestions/${job.id}`);
      if (!mounted.current) return;
      assertReviewProtocol(preflight.job);
      if (JSON.stringify(preflight.job.result?.data) !== sourceJson) throw new Error('Kết quả phân tích đã thay đổi. Hãy mở lại tác vụ và duyệt lại.');
      const payload = buildReviewPayload(entries);
      if (kind === 'import') {
        const response = await authorizedFetch<{ importedAt?: string; alreadyImported?: boolean; questionsAdded?: number }>(
          `/api/v1/ingestions/${job.id}/import`, { method: 'POST', body: JSON.stringify(payload) });
        if (!mounted.current) return;
        onChanged({ ...job, status: 'IMPORTED', importStalled: false, importedAt: response.importedAt || new Date().toISOString() });
        setMessage(response.alreadyImported ? 'Bộ câu hỏi đã được lưu trước đó; không lưu trùng.' : `Đã lưu ${response.questionsAdded ?? counts.approved} câu đã duyệt vào kho cá nhân.`);
      } else {
        const response = await authorizedFetch<{ contribution: NonNullable<IngestionJob['contribution']> }>(
          '/api/v1/contributions', { method: 'POST', body: JSON.stringify({ jobId: job.id, ...payload, rightsConfirmed: true }) });
        if (!mounted.current) return;
        setSubmitted(true);
        onChanged({ ...job, contribution: response.contribution });
        setMessage('Đã gửi các câu đã duyệt. Chỉ vào kho chung sau khi admin duyệt.');
      }
    } catch (sendError) {
      if (!mounted.current) return;
      setError(sendError instanceof Error ? sendError.message : 'Không thể lưu. Chỉnh sửa vẫn được giữ lại.');
      if (sendError instanceof ApiError && sendError.code === 'ALREADY_SUBMITTED') setSubmitted(true);
      // Resolve a lost response without creating data or invoking AI again.
      try {
        const latest = await authorizedFetch<{ job: IngestionJob }>(`/api/v1/ingestions/${job.id}`);
        if (mounted.current) { onChanged(latest.job); if (latest.job.contribution) setSubmitted(true); }
      } catch { /* Keep the draft and let the user retry after connectivity returns. */ }
    } finally {
      actionRunning.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }

  if (!ready || loadedSourceJson !== sourceJson) return <View style={styles.card}>
    <Text style={styles.title}>Sửa và duyệt từng câu</Text>
    {restoreError ? <><Text style={styles.error}>{restoreError}</Text><Pressable style={styles.button} onPress={() => setRestoreAttempt((value) => value + 1)}><Text style={styles.buttonText}>Thử đọc lại bản nháp</Text></Pressable></> : <ActivityIndicator color={palette.primary} />}
  </View>;

  return <View style={styles.card}>
    <Text style={styles.title}>Sửa và duyệt từng câu</Text>
    <Text style={styles.copy}>{counts.approved} đã duyệt · {counts.skipped} bỏ qua · {counts.pending} chưa duyệt</Text>
    <Text style={styles.copy}>{storageStatus}</Text>
    {storageFailed && <Pressable style={styles.outline} onPress={() => { setStorageFailed(false); setStorageStatus('Đang lưu bản nháp trên máy…'); setSaveAttempt((value) => value + 1); }}><Text style={styles.label}>Thử lưu bản nháp lại</Text></Pressable>}
    {!protocolReady && <Text style={styles.error}>API chưa hỗ trợ duyệt từng câu. Cập nhật server rồi mở lại tác vụ trước khi lưu/gửi.</Text>}
    <Text style={styles.copy}>Bản nháp chỉ nằm trên điện thoại này, chưa đồng bộ. Chỉ đóng app khi báo đã lưu.</Text>
    {!!message && <Text style={styles.success}>{message}</Text>}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {active && <>
      <View style={styles.row}>
        <Pressable accessibilityLabel="Câu trước" disabled={activeIndex === 0 || busy} onPress={() => navigate(activeIndex - 1)} style={styles.smallButton}><Text style={styles.label}>←</Text></Pressable>
        <Text style={styles.label}>Câu {activeIndex + 1}/{entries.length} · {active.decision === 'APPROVE' ? 'Đã duyệt' : active.decision === 'SKIP' ? 'Bỏ qua' : 'Chưa duyệt'}</Text>
        <Pressable accessibilityLabel="Câu tiếp theo" disabled={activeIndex === entries.length - 1 || busy} onPress={() => navigate(activeIndex + 1)} style={styles.smallButton}><Text style={styles.label}>→</Text></Pressable>
      </View>
      {!!group?.passageText && <Text style={styles.passage}>{group.passageText.replace(/<[^>]*>/g, ' ')}</Text>}
      {!!group?.audioAssetId && <Text style={styles.copy}>Nhóm có audio đính kèm; thông tin nhóm/media được giữ nguyên.</Text>}
      <Text style={styles.label}>Part</Text>
      <View style={styles.row}>{[1, 2, 3, 4, 5, 6, 7].map((part) => <Pressable key={part} disabled={locked} accessibilityLabel={`Part ${part}`} accessibilityState={{ selected: active.question.part === part, disabled: locked }} onPress={() => edit({ part })} style={[styles.part, active.question.part === part && styles.selected]}><Text style={styles.label}>{part}</Text></Pressable>)}</View>
      <Text style={styles.label}>Nội dung câu hỏi</Text>
      <TextInput accessibilityLabel="Nội dung câu hỏi" multiline maxLength={10000} editable={!locked} value={active.question.content} onChangeText={(content) => edit({ content })} style={styles.input} />
      {OPTION_KEYS.map((key) => <View key={key} style={styles.option}>
        <Pressable accessibilityLabel={`Đáp án đúng ${key}`} accessibilityRole="radio" accessibilityState={{ checked: active.question.correctAnswer === key, disabled: locked }} disabled={locked} onPress={() => edit({ correctAnswer: key })} style={[styles.part, active.question.correctAnswer === key && styles.selected]}><Text style={styles.label}>{key}</Text></Pressable>
        <TextInput accessibilityLabel={`Phương án ${key}`} multiline maxLength={4000} editable={!locked} value={active.question.options[key] || ''} placeholder="Có thể để trống phương án không dùng" onChangeText={(text) => edit({ options: { ...active.question.options, [key]: text } })} style={[styles.input, styles.optionInput]} />
      </View>)}
      {!!activeError && <Text style={styles.error}>{activeError}</Text>}
      {!locked && <View style={styles.row}>
        <Pressable disabled={!!activeError} onPress={() => decide('APPROVE')} style={[styles.button, styles.flex, !!activeError && styles.disabled]}><Text style={styles.buttonText}>Duyệt câu này</Text></Pressable>
        <Pressable onPress={() => decide('SKIP')} style={[styles.outline, styles.flex]}><Text style={styles.label}>Bỏ qua câu này</Text></Pressable>
      </View>}
    </>}
    {imported && <Text style={styles.success}>Bộ câu hỏi đã lưu. Màn hình này không sửa câu trong kho cá nhân đã lưu.</Text>}
    {imported && !submitted && !job.contribution && !contributionOnly && <Pressable disabled={busy} onPress={() => setContributionOnly(true)} style={styles.outline}><Text style={styles.label}>Duyệt / sửa riêng cho bản đóng góp</Text></Pressable>}
    {contributionOnly && <Text style={styles.copy}>Chỉnh sửa tiếp theo chỉ áp dụng khi gửi đóng góp mới, không cập nhật các câu đã lưu vào kho cá nhân.</Text>}
    {(submitted || job.contribution) && <Text style={styles.success}>Bộ câu hỏi đã gửi đóng góp; không gửi trùng.</Text>}
    {job.status === 'IMPORTING' && <Text style={styles.copy}>{job.importStalled ? 'Lần lưu bị gián đoạn; có thể thử lại, không tạo câu trùng.' : 'Đang lưu. Hãy kiểm tra trạng thái trước khi tiếp tục.'}</Text>}
    {!imported && <Pressable disabled={!canSave} onPress={() => void send('import')} style={[styles.button, !canSave && styles.disabled]}><Text style={styles.buttonText}>Lưu {counts.approved} câu đã duyệt</Text></Pressable>}
    {!submitted && !job.contribution && <>
      <Text style={styles.copy}>Đóng góp sẽ gửi cùng những câu đã duyệt. PDF riêng tư; admin có thể xem nguồn để kiểm tra.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: rightsConfirmed, disabled: busy }} disabled={busy} onPress={() => setRightsConfirmed(!rightsConfirmed)} style={styles.row}><Text style={styles.label}>{rightsConfirmed ? '☑' : '☐'} Tôi có quyền chia sẻ câu hỏi và audio.</Text></Pressable>
      <Pressable disabled={!canSubmit} onPress={() => void send('contribute')} style={[styles.outline, !canSubmit && styles.disabled]}><Text style={styles.label}>Gửi {counts.approved} câu đã duyệt để admin duyệt</Text></Pressable>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.surface, borderRadius: radius.large, padding: 16, gap: 12, borderWidth: 1, borderColor: palette.line },
  title: { fontSize: 20, fontWeight: '800', color: palette.ink },
  copy: { fontSize: 12, lineHeight: 18, color: palette.muted },
  label: { fontSize: 13, fontWeight: '700', color: palette.primary },
  passage: { backgroundColor: palette.canvas, padding: 12, color: palette.ink, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: palette.line, borderRadius: radius.small, padding: 12, minHeight: 52, color: palette.ink, textAlignVertical: 'top' },
  option: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  optionInput: { flex: 1 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  part: { padding: 10, minWidth: 36, borderRadius: radius.small, borderWidth: 1, borderColor: palette.line },
  selected: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
  button: { padding: 14, minHeight: 48, borderRadius: radius.medium, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  outline: { padding: 14, minHeight: 48, borderRadius: radius.medium, borderWidth: 1, borderColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  smallButton: { padding: 12, borderRadius: radius.small, backgroundColor: palette.canvas },
  flex: { flex: 1 }, disabled: { opacity: 0.4 },
  error: { color: palette.danger, lineHeight: 19 }, success: { color: palette.primary, lineHeight: 20 },
});
