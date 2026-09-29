"use client";

import { useMemo, useState } from "react";

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

export default function IngestionQuestionReview({
  groups,
  jobId,
  pageRange,
}: {
  groups: ExtractedGroup[];
  jobId: string;
  pageRange: { start: number; end: number } | null;
}) {
  const [entries, setEntries] = useState(() => initialEntries(groups));
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const counts = useMemo(() => ({
    approved: entries.filter((entry) => entry.decision === "APPROVE").length,
    skipped: entries.filter((entry) => entry.decision === "SKIP").length,
    pending: entries.filter((entry) => entry.decision === "PENDING").length,
  }), [entries]);
  const active = entries[activeIndex];
  const activeGroup = active ? groups[active.groupIndex].group : null;
  const activeError = active ? validationMessage(active.question) : null;
  const canSave = counts.pending === 0 && counts.approved > 0 && !busy && !imported;

  function editQuestion(update: (question: DraftQuestion) => DraftQuestion) {
    setEntries((current) => current.map((entry, index) => index === activeIndex
      ? { ...entry, question: update(entry.question), decision: "PENDING" }
      : entry));
    setError("");
    setMessage("");
  }

  function decide(decision: "APPROVE" | "SKIP") {
    if (!active || busy || imported || (decision === "APPROVE" && activeError)) return;
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

  return (
    <section className="review-import" aria-labelledby="question-review-title">
      <div className="review-import-head">
        <div>
          <span className="step-kicker">BƯỚC 2</span>
          <h2 id="question-review-title">Sửa và duyệt từng câu</h2>
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
                <p className="mt-2 text-xs">Ngữ cảnh nhóm chưa chỉnh sửa ở bước này; nếu sai, hãy bỏ qua các câu liên quan.</p>
              </div>
            )}
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm font-semibold" htmlFor="review-part">
                Part
                <select id="review-part" value={active.question.part} disabled={busy || imported} onChange={(event) => editQuestion((question) => ({ ...question, part: Number(event.target.value) }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                  {[1, 2, 3, 4, 5, 6, 7].map((part) => <option key={part} value={part}>Part {part}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold" htmlFor="review-content">
                Nội dung câu hỏi
                <textarea id="review-content" rows={4} maxLength={10_000} value={active.question.content} disabled={busy || imported} onChange={(event) => editQuestion((question) => ({ ...question, content: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <fieldset className="grid gap-3">
                <legend className="mb-2 text-sm font-semibold">Phương án và đáp án đúng</legend>
                {OPTION_KEYS.map((key) => (
                  <div className="flex items-center gap-2" key={key}>
                    <input type="radio" name={`review-answer-${activeIndex}`} aria-label={`Đáp án đúng ${key}`} checked={active.question.correctAnswer === key} disabled={busy || imported || !active.question.options[key]?.trim()} onChange={() => editQuestion((question) => ({ ...question, correctAnswer: key }))} />
                    <label htmlFor={`review-option-${key}`} className="w-5 text-sm font-bold">{key}</label>
                    <input id={`review-option-${key}`} value={active.question.options[key] || ""} maxLength={4_000} disabled={busy || imported} onChange={(event) => editQuestion((question) => ({ ...question, options: { ...question.options, [key]: event.target.value } }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder={`Phương án ${key}`} />
                  </div>
                ))}
                <p className="text-xs text-slate-600">Chọn nút tròn cạnh phương án đúng. Có thể để trống phương án không dùng.</p>
              </fieldset>
            </div>
            {activeError && <p className="mt-3 text-sm text-red-700" role="alert">{activeError}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="ghost-button" disabled={busy || imported || activeIndex === 0} onClick={() => setActiveIndex(activeIndex - 1)}>← Câu trước</button>
              <button type="button" className="ghost-button" disabled={busy || imported || activeIndex === entries.length - 1} onClick={() => setActiveIndex(activeIndex + 1)}>Câu sau →</button>
              <button type="button" className="ghost-button" disabled={busy || imported} onClick={() => decide("SKIP")}>Bỏ qua câu này</button>
              <button type="button" className="primary-button" disabled={busy || imported || !!activeError} onClick={() => decide("APPROVE")}>Duyệt câu này</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-600">{counts.pending > 0 ? `Còn ${counts.pending} câu cần quyết định.` : counts.approved === 0 ? "Cần duyệt ít nhất một câu để lưu." : "Đã duyệt toàn bộ. Chỉ câu được duyệt mới được lưu."}</p>
        <button type="button" className="save-bank-button" disabled={!canSave} onClick={() => void save()}>{busy ? "Đang lưu…" : imported ? "Đã lưu" : `Lưu ${counts.approved} câu đã duyệt`}</button>
      </div>
      {message && <p className="success-message mt-3" role="status">✓ {message}</p>}
      {error && <p className="inline-error mt-3" role="alert">{error}</p>}
    </section>
  );
}
