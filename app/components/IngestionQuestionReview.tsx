"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { validateUploadDescriptor, UPLOAD_RULES } from "@/app/lib/upload-policy";

export type ExtractedGroup = {
  group?: {
    groupType?: string;
    passageText?: string | null;
    audioUrl?: string | null;
    imageUrl?: string | null;
    audioAssetId?: string | null;
    imageAssetId?: string | null;
  } | null;
  questions: Array<{ part: number; content?: string | null; options: Record<string, string>; correctAnswer: string }>;
};

type DraftQuestion = {
  part: number;
  content: string;
  options: Record<string, string>;
  correctAnswer: string;
};

type ReviewEntry = {
  groupIndex: number;
  questionIndex: number;
  decision: "PENDING" | "APPROVE" | "SKIP";
  question: DraftQuestion;
};

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

function initialEntries(groups: ExtractedGroup[]): ReviewEntry[] {
  return groups.flatMap((group, groupIndex) => group.questions.map((question, questionIndex) => ({
    groupIndex,
    questionIndex,
    decision: "PENDING" as const,
    question: {
      part: question.part,
      content: question.content || "",
      options: { ...question.options },
      correctAnswer: question.correctAnswer,
    },
  })));
}

function validationMessage(question: DraftQuestion): string | null {
  if (!Number.isInteger(question.part) || question.part < 1 || question.part > 7) return "Part phải từ 1 đến 7.";
  if (question.content.trim().length > 10_000) return "Nội dung câu hỏi quá dài.";
  if (question.part >= 3 && !question.content.trim()) return "Câu hỏi Part 3–7 cần có nội dung.";
  const filled = OPTION_KEYS.filter((key) => question.options[key]?.trim());
  if (filled.length < 2) return "Cần ít nhất hai phương án có nội dung.";
  if (filled.some((key) => question.options[key].trim().length > 4_000)) return "Phương án quá dài.";
  if (!filled.includes(question.correctAnswer as (typeof OPTION_KEYS)[number])) return "Đáp án đúng phải là một phương án có nội dung.";
  return null;
}

function cleanedQuestion(question: DraftQuestion) {
  return {
    part: question.part,
    content: question.content.trim() || null,
    options: Object.fromEntries(OPTION_KEYS.flatMap((key) => {
      const value = question.options[key]?.trim();
      return value ? [[key, value]] : [];
    })),
    correctAnswer: question.correctAnswer,
  };
}

export function buildReviewedContribution(groups: ExtractedGroup[], entries: ReviewEntry[]) {
  return {
    data: groups.flatMap((group, groupIndex) => {
      const questions = entries
        .filter((entry) => entry.groupIndex === groupIndex && entry.decision === "APPROVE")
        .map((entry) => cleanedQuestion(entry.question));
      if (!questions.length) return [];
      return [{
        group: group.group ? { ...group.group, audioUrl: null, imageUrl: null } : null,
        questions,
      }];
    }),
  };
}

export default function IngestionQuestionReview({
  groups,
  jobId,
  pageRange,
  forSharedLibrary = false,
  resubmission,
}: {
  groups: ExtractedGroup[];
  jobId: string;
  pageRange: { start: number; end: number } | null;
  forSharedLibrary?: boolean;
  resubmission?: { contributionId: string; expectedUpdatedAt: string };
}) {
  const [entries, setEntries] = useState(() => initialEntries(groups));
  const [reviewGroups, setReviewGroups] = useState(groups);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const counts = useMemo(() => ({
    approved: entries.filter((entry) => entry.decision === "APPROVE").length,
    skipped: entries.filter((entry) => entry.decision === "SKIP").length,
    pending: entries.filter((entry) => entry.decision === "PENDING").length,
  }), [entries]);
  const active = entries[activeIndex];
  const activeGroup = active ? reviewGroups[active.groupIndex].group : null;
  const activeError = active ? validationMessage(active.question)
    || (forSharedLibrary && active.question.part === 1 && !activeGroup?.imageAssetId ? "Câu Part 1 cần gắn ảnh trước khi duyệt cho Kho bài." : null)
    || (forSharedLibrary && active.question.part <= 4 && !activeGroup?.audioAssetId ? "Câu nghe cần gắn audio trước khi duyệt cho Kho bài." : null) : null;
  const canSave = counts.pending === 0 && counts.approved > 0 && !busy && !imported;
  const canSubmit = counts.pending === 0 && counts.approved > 0 && rightsConfirmed && !busy && !submittedForReview;

  async function readJson(response: Response) {
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || "Không thể xử lý media.");
    return data;
  }

  async function previewMedia(groupIndex: number, assetId: string, kind: "IMAGE" | "AUDIO") {
    const data = await readJson(await fetch(`/api/v1/uploads/${assetId}`, { cache: "no-store" }));
    (kind === "IMAGE" ? setImageUrls : setAudioUrls)(current => ({ ...current, [groupIndex]: data.asset.url }));
  }

  async function attachMedia(file: File | null, kind: "IMAGE" | "AUDIO") {
    if (!active || busy || imported || submittedForReview) return;
    const groupIndex = active.groupIndex;
    const contentType = file?.type || (kind === "AUDIO" ? ({ mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" }[file?.name.split(".").pop()?.toLowerCase() as "mp3" | "m4a" | "wav"] || "") : "");
    if (file && !validateUploadDescriptor({ kind, contentType, sizeBytes: file.size }).valid) {
      setError(kind === "IMAGE" ? "Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MiB." : "Chọn audio MP3, M4A hoặc WAV, tối đa 100 MiB.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    let attached = false;
    try {
      let assetId: string | null = null;
      if (file) {
        const intent = await readJson(await fetch("/api/v1/uploads", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, fileName: file.name, contentType, sizeBytes: file.size }),
        }));
        const uploaded = await fetch(intent.upload.url, { method: "PUT", headers: intent.upload.headers, body: file });
        if (!uploaded.ok) throw new Error("Upload media thất bại. Hãy thử lại.");
        await readJson(await fetch(`/api/v1/uploads/${intent.asset.id}/complete`, { method: "POST" }));
        assetId = intent.asset.id;
      }
      const field = kind === "IMAGE" ? "imageAssetId" : "audioAssetId";
      const result = await readJson(await fetch(`/api/v1/ingestions/${jobId}/${kind.toLowerCase()}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupIndex, [field]: assetId }),
      }));
      attached = true;
      setReviewGroups(current => current.map((group, index) => index === groupIndex ? { ...group, group: result.group } : group));
      setEntries(current => current.map(entry => entry.groupIndex === groupIndex ? { ...entry, decision: "PENDING" } : entry));
      setRightsConfirmed(false);
      (kind === "IMAGE" ? setImageUrls : setAudioUrls)(current => ({ ...current, [groupIndex]: "" }));
      const selectedId = result.group[field] as string | null;
      setMessage(kind === "IMAGE"
        ? (assetId ? "Đã lưu ảnh vào tác vụ. Kiểm tra ảnh và duyệt lại các câu trong nhóm; mở lại tài liệu vẫn giữ ảnh." : "Đã bỏ ảnh khỏi nhóm của tác vụ. File gốc vẫn riêng tư.")
        : (assetId ? "Đã lưu audio riêng của nhóm. Nghe đối chiếu và duyệt lại các câu; mở lại tài liệu vẫn giữ audio." : selectedId ? "Đã dùng lại audio nguồn của tác vụ. Nghe đối chiếu và duyệt lại nhóm." : "Tác vụ không có audio nguồn. Hãy gắn audio cho nhóm trước khi duyệt."));
      if (selectedId) await previewMedia(groupIndex, selectedId, kind);
    } catch (uploadError) {
      setError((attached ? "Media đã được lưu nhưng chưa mở được bản xem trước. " : "") + (uploadError instanceof Error ? uploadError.message : "Lỗi kết nối."));
    } finally { setBusy(false); }
  }

  async function openMedia(kind: "IMAGE" | "AUDIO") {
    const assetId = kind === "IMAGE" ? activeGroup?.imageAssetId : activeGroup?.audioAssetId;
    if (!active || !assetId || busy) return;
    setBusy(true); setError("");
    try { await previewMedia(active.groupIndex, assetId, kind); }
    catch (mediaError) { setError(mediaError instanceof Error ? mediaError.message : "Không mở được media."); }
    finally { setBusy(false); }
  }

  function editQuestion(update: (question: DraftQuestion) => DraftQuestion) {
    if (busy || imported || submittedForReview) return;
    setEntries((current) => current.map((entry, index) => index === activeIndex
      ? { ...entry, question: update(entry.question), decision: "PENDING" }
      : entry));
    setError("");
    setMessage("");
  }

  function decide(decision: "APPROVE" | "SKIP") {
    if (!active || busy || imported || submittedForReview || (decision === "APPROVE" && activeError)) return;
    const updated = entries.map((entry, index) => index === activeIndex ? { ...entry, decision } : entry);
    setEntries(updated);
    const next = updated.findIndex((entry, index) => index > activeIndex && entry.decision === "PENDING");
    const first = next >= 0 ? next : updated.findIndex((entry) => entry.decision === "PENDING");
    if (first >= 0) setActiveIndex(first);
    setError("");
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/ingestions/${jobId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews: entries.map((entry) => entry.decision === "APPROVE"
          ? { groupIndex: entry.groupIndex, questionIndex: entry.questionIndex, decision: "APPROVE", question: cleanedQuestion(entry.question) }
          : { groupIndex: entry.groupIndex, questionIndex: entry.questionIndex, decision: "SKIP" }) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message || "Không thể lưu câu hỏi.");
      setImported(true);
      setMessage(data.alreadyImported
        ? "Bộ câu hỏi này đã được lưu trước đó; hệ thống không tạo bản trùng."
        : `Đã lưu ${data.questionsAdded} câu đã duyệt vào kho cá nhân.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Lỗi kết nối.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          data: buildReviewedContribution(reviewGroups, entries),
          rightsConfirmed: true,
          ...(resubmission ? { resubmission } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message || "Không thể gửi đóng góp.");
      setSubmittedForReview(true);
      setMessage("Đã chuyển sang bước xuất bản. Mở trang Duyệt nội dung, kiểm tra PDF/audio và bấm Duyệt & công khai để người học chọn được bài.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể gửi đóng góp.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="review-import" aria-labelledby="question-review-title">
      <div className="review-import-head">
        <div>
          <span className="step-kicker">BƯỚC 2</span>
          <h2 id="question-review-title">{resubmission ? "Sửa bộ câu hỏi bị từ chối" : "Sửa và duyệt từng câu"}</h2>
          <p>Kết quả trang {pageRange?.start ?? "?"}–{pageRange?.end ?? "?"}. Đối chiếu PDF gốc; AI có thể chọn sai đáp án.</p>
        </div>
        <div className="text-sm text-slate-700" role="status">
          <strong>{counts.approved} duyệt</strong> · {counts.skipped} bỏ qua · {counts.pending} chưa duyệt
        </div>
      </div>

      {entries.length > 0 && active && (
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Danh sách câu hỏi" className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-3 text-sm font-semibold">{entries.length} câu AI nhận diện</p>
            <div className="grid max-h-[540px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5 lg:grid-cols-2">
              {entries.map((entry, index) => (
                <button
                  key={`${entry.groupIndex}:${entry.questionIndex}`}
                  type="button"
                  aria-current={index === activeIndex ? "step" : undefined}
                  onClick={() => setActiveIndex(index)}
                  className={`rounded-lg border px-2 py-2 text-left text-xs font-semibold ${index === activeIndex ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-200"} ${entry.decision === "APPROVE" ? "bg-green-50 text-green-800" : entry.decision === "SKIP" ? "bg-slate-200 text-slate-600" : "bg-white text-amber-800"}`}
                >
                  Câu {index + 1}<span className="block font-normal">{entry.decision === "APPROVE" ? "Đã duyệt" : entry.decision === "SKIP" ? "Bỏ qua" : "Chưa duyệt"}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold">Câu {activeIndex + 1} / {entries.length}</h3>
              <span className="text-sm text-slate-600">{active.decision === "APPROVE" ? "Đã duyệt" : active.decision === "SKIP" ? "Sẽ bỏ qua" : "Chưa duyệt"}</span>
            </div>
            {activeGroup && (
              <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <strong>Ngữ cảnh nhóm ({activeGroup.groupType || "TEXT"})</strong>
                {activeGroup.passageText && <p className="mt-2 whitespace-pre-wrap">{activeGroup.passageText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</p>}
                {activeGroup.audioUrl && <audio className="mt-2 w-full" controls preload="metadata" src={activeGroup.audioUrl} />}
                <p className="mt-2 text-xs">Đoạn văn và cách chia nhóm chưa chỉnh sửa ở bước này; nếu sai, hãy bỏ qua các câu liên quan.</p>
              </div>
            )}
            <div className="mb-4 rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">Ảnh Part 1 hoặc biểu đồ · Nhóm {active.groupIndex + 1}</p>
              <p className="mt-1 text-xs text-slate-600">Chọn ảnh đã cắt từ tài liệu. Ảnh áp dụng cho toàn bộ {reviewGroups[active.groupIndex].questions.length} câu trong nhóm; nếu có nhiều ảnh, ghép đủ ảnh và giữ số câu để đối chiếu. Hệ thống chưa tự cắt ảnh từ PDF.</p>
              <label className="mt-3 grid gap-1 font-semibold">{activeGroup?.imageAssetId ? "Thay ảnh của nhóm" : "Gắn ảnh cho nhóm"}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || imported || submittedForReview || Boolean(resubmission)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void attachMedia(file, "IMAGE"); }} />
              </label>
              <p className="mt-1 text-xs text-slate-500">JPG/PNG/WebP, tối đa {UPLOAD_RULES.IMAGE.maxBytes / 1024 / 1024} MiB. Ảnh đã gắn được lưu cùng tác vụ, không sửa câu hỏi đã nhập trước đó.</p>
              {activeGroup?.imageAssetId && <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy} className="ghost-button" onClick={() => void openMedia("IMAGE")}>Xem ảnh đã gắn</button>
                <button type="button" disabled={busy || imported || submittedForReview || Boolean(resubmission)} className="ghost-button" onClick={() => void attachMedia(null, "IMAGE")}>Bỏ ảnh khỏi nhóm</button>
              </div>}
              {imageUrls[active.groupIndex] && <Image unoptimized src={imageUrls[active.groupIndex]} alt={`Ảnh nhóm câu ${active.groupIndex + 1}`} width={1200} height={900} className="mt-3 max-h-[32rem] w-full object-contain" />}
            </div>
            {entries.some(entry => entry.groupIndex === active.groupIndex && entry.question.part <= 4) && <div className="mb-4 rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">Audio · Nhóm {active.groupIndex + 1}</p>
              <p className="mt-1 text-xs text-slate-600">Gắn đoạn audio khớp toàn bộ câu trong nhóm để người học không phải tìm câu trong file nguyên bài. Hệ thống chưa tự xác định điểm cắt audio.</p>
              <label className="mt-3 grid gap-1 font-semibold">Gắn audio riêng cho nhóm
                <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,.mp3,.m4a,.wav" disabled={busy || imported || submittedForReview || Boolean(resubmission)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void attachMedia(file, "AUDIO"); }} />
              </label>
              <p className="mt-1 text-xs text-slate-500">MP3/M4A/WAV, tối đa {UPLOAD_RULES.AUDIO.maxBytes / 1024 / 1024} MiB. Audio lưu cùng tác vụ, không sửa câu hỏi đã nhập trước đó.</p>
              {activeGroup?.audioAssetId && <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy} className="ghost-button" onClick={() => void openMedia("AUDIO")}>Nghe audio của nhóm</button>
                <button type="button" disabled={busy || imported || submittedForReview || Boolean(resubmission)} className="ghost-button" onClick={() => void attachMedia(null, "AUDIO")}>Dùng audio nguồn</button>
              </div>}
              {audioUrls[active.groupIndex] && <audio key={audioUrls[active.groupIndex]} className="mt-3 w-full" controls preload="none" src={audioUrls[active.groupIndex]}>Trình duyệt không hỗ trợ phát audio.</audio>}
            </div>}
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm font-semibold" htmlFor="review-part">
                Part
                <select id="review-part" value={active.question.part} disabled={busy || imported || submittedForReview} onChange={(event) => editQuestion((question) => ({ ...question, part: Number(event.target.value) }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                  {[1, 2, 3, 4, 5, 6, 7].map((part) => <option key={part} value={part}>Part {part}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold" htmlFor="review-content">
                Nội dung câu hỏi
                <textarea id="review-content" rows={4} maxLength={10_000} value={active.question.content} disabled={busy || imported || submittedForReview} onChange={(event) => editQuestion((question) => ({ ...question, content: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <fieldset className="grid gap-3">
                <legend className="mb-2 text-sm font-semibold">Phương án và đáp án đúng</legend>
                {!active.question.correctAnswer && <p className="text-sm text-amber-800">Chưa có đáp án từ tài liệu. Đối chiếu answer key hoặc nguồn hợp lệ rồi chọn đáp án trước khi duyệt; AI không nghe audio để xác định đáp án.</p>}
                {OPTION_KEYS.map((key) => (
                  <div className="flex items-center gap-2" key={key}>
                    <input type="radio" name={`review-answer-${activeIndex}`} aria-label={`Đáp án đúng ${key}`} checked={active.question.correctAnswer === key} disabled={busy || imported || submittedForReview || !active.question.options[key]?.trim()} onChange={() => editQuestion((question) => ({ ...question, correctAnswer: key }))} />
                    <label htmlFor={`review-option-${key}`} className="w-5 text-sm font-bold">{key}</label>
                    <input id={`review-option-${key}`} value={active.question.options[key] || ""} maxLength={4_000} disabled={busy || imported || submittedForReview} onChange={(event) => editQuestion((question) => ({ ...question, options: { ...question.options, [key]: event.target.value } }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder={`Phương án ${key}`} />
                  </div>
                ))}
                <p className="text-xs text-slate-600">Chọn nút tròn cạnh phương án đúng. Có thể để trống phương án không dùng.</p>
              </fieldset>
            </div>
            {activeError && <p className="mt-3 text-sm text-red-700" role="alert">{activeError}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="ghost-button" disabled={busy || activeIndex === 0} onClick={() => setActiveIndex(activeIndex - 1)}>← Câu trước</button>
              <button type="button" className="ghost-button" disabled={busy || activeIndex === entries.length - 1} onClick={() => setActiveIndex(activeIndex + 1)}>Câu sau →</button>
              <button type="button" className="ghost-button" disabled={busy || imported || submittedForReview} onClick={() => decide("SKIP")}>Bỏ qua câu này</button>
              <button type="button" className="primary-button" disabled={busy || imported || submittedForReview || !!activeError} onClick={() => decide("APPROVE")}>Duyệt câu này</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-600">{counts.pending > 0 ? `Còn ${counts.pending} câu cần quyết định.` : counts.approved === 0 ? "Cần duyệt ít nhất một câu để lưu." : "Đã duyệt toàn bộ. Chỉ câu được duyệt mới được lưu."}</p>
        {!forSharedLibrary && <button type="button" className="save-bank-button" disabled={!canSave} onClick={() => void save()}>{busy ? "Đang lưu…" : imported ? "Đã lưu" : `Lưu ${counts.approved} câu đã duyệt`}</button>}
      </div>
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
        <p className="font-bold text-slate-900">{forSharedLibrary ? "BƯỚC 3 · Xuất bản vào kho bài" : "Muốn đóng góp vào kho chung?"}</p>
        <p className="mt-1">PDF gốc vẫn riêng tư. Sau khi kiểm tra từng câu, chuyển sang trang Duyệt nội dung để nghe lại audio và công khai bài cho người học.</p>
        <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={rightsConfirmed} disabled={busy || submittedForReview} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" /><span>Tôi có quyền chia sẻ nội dung và media này, đã kiểm tra đáp án.</span></label>
        <button type="button" className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!canSubmit} onClick={() => void submitForReview()}>{submittedForReview ? "Đã chuyển sang bước xuất bản" : resubmission ? `Gửi lại ${counts.approved} câu để duyệt` : `Chuyển ${counts.approved} câu sang bước xuất bản`}</button>
        {submittedForReview && <a className="ml-3 inline-block font-semibold text-blue-700 underline" href="/admin/contributions?status=PENDING">Mở trang Duyệt nội dung →</a>}
      </div>
      {message && <p className="success-message mt-3" role="status">✓ {message}</p>}
      {error && <p className="inline-error mt-3" role="alert">{error}</p>}
    </section>
  );
}
