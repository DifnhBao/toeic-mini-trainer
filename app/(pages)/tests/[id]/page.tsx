"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SafePassage from "@/app/components/SafePassage";
import { restoreWebTestDraft } from "@/app/lib/web-test-draft";

type Question = {
  id: string;
  part: number;
  content: string | null;
  options: Record<string, string>;
  group: {
    id: string;
    groupType: string;
    passageText: string | null;
    audioUrl: string | null;
    imageUrl: string | null;
  } | null;
};

type TestData = {
  id: string;
  title: string;
  questions: Array<{ orderIndex: number; question: Question }>;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export default function TestTakingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: testId } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<TestData | null>(null);
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "D">>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [storageError, setStorageError] = useState(false);
  const submissionInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/mini-tests/${testId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể tải bài luyện.");
        return data;
      })
      .then((data: TestData) => {
        if (controller.signal.aborted) return;
        let saved: string | null = null;
        try { saved = window.localStorage.getItem(`toeic-draft-${testId}`); }
        catch { setStorageError(true); }
        const draft = restoreWebTestDraft(saved, data.questions.map((item) => item.question), crypto.randomUUID());
        setTest(data);
        setAnswers(draft.answers);
        setSubmissionId(draft.clientSubmissionId);
        setElapsed(draft.elapsed);
        setCurrentIndex(draft.currentIndex);
      })
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") setError(fetchError.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [testId]);

  useEffect(() => {
    if (!test || submitting) return;
    const timer = window.setInterval(() => setElapsed((value) => Math.min(value + 1, 86_400)), 1000);
    return () => window.clearInterval(timer);
  }, [test, submitting]);

  useEffect(() => {
    if (!test || !submissionId || submitting) return;
    const save = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`toeic-draft-${testId}`, JSON.stringify({
          version: 1, clientSubmissionId: submissionId, answers, elapsed, currentIndex,
        }));
        setStorageError(false);
      } catch { setStorageError(true); }
    }, 0);
    return () => window.clearTimeout(save);
  }, [answers, testId, test, submissionId, elapsed, currentIndex, submitting]);

  const question = test?.questions[currentIndex]?.question;
  const answeredCount = Object.keys(answers).length;
  const progress = test?.questions.length ? Math.round((answeredCount / test.questions.length) * 100) : 0;
  const questionGroups = useMemo(() => {
    if (!test) return [];
    return Array.from(new Set(test.questions.map((item) => item.question.part)));
  }, [test]);

  function chooseAnswer(questionId: string, answer: string) {
    if (!["A", "B", "C", "D"].includes(answer) || submissionInFlight.current) return;
    setAnswers((current) => ({ ...current, [questionId]: answer as "A" | "B" | "C" | "D" }));
  }

  async function submitTest() {
    if (!test || !submissionId || submissionInFlight.current) return;
    if (answeredCount < test.questions.length && !window.confirm(`Bạn còn ${test.questions.length - answeredCount} câu chưa trả lời. Vẫn nộp bài?`)) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setError("");
    // Persist synchronously before sending, including when the last selection
    // was made before the pending autosave callback could run.
    try {
      window.localStorage.setItem(`toeic-draft-${testId}`, JSON.stringify({
        version: 1, clientSubmissionId: submissionId, answers, elapsed, currentIndex,
      }));
    } catch { setStorageError(true); }
    try {
      const response = await fetch(`/api/mini-tests/${testId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, clientSubmissionId: submissionId, durationSeconds: elapsed }),
      });
      const data = await response.json();
      if (!response.ok || !data.attemptId) throw new Error(data.error || "Không thể nộp bài.");
      try { window.localStorage.removeItem(`toeic-draft-${testId}`); } catch { /* The saved ID still makes retries safe. */ }
      router.push(`/attempts/${data.attemptId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Lỗi kết nối.");
      setSubmitting(false);
      submissionInFlight.current = false;
    }
  }

  if (loading) return <div className="test-state"><span className="loading-mark">TM</span><p>Đang chuẩn bị bài luyện…</p></div>;
  if (error && !test) return <div className="test-state"><strong>Không mở được bài luyện</strong><p>{error}</p><Link href="/">Về trang chủ</Link></div>;
  if (!test || !question) return <div className="test-state">Bài luyện không có câu hỏi.</div>;

  return (
    <div className="test-page">
      <header className="test-header">
        <Link href="/" className="test-brand"><span>TM</span><strong>TOEIC Mini Trainer</strong></Link>
        <div className="test-meta"><span>{test.title}</span><span className="timer-pill" aria-label={`Thời gian ${formatTime(elapsed)}`}>◷ {formatTime(elapsed)}</span></div>
        <button type="button" className="exit-test" onClick={() => { if (window.confirm("Thoát bài? Câu trả lời đã chọn vẫn được lưu trên thiết bị này.")) router.push("/"); }}>Thoát</button>
      </header>

      <div className="test-layout">
        <aside className="question-sidebar">
          <div className="question-sidebar-head"><span>TIẾN ĐỘ BÀI LÀM</span><strong>{answeredCount}/{test.questions.length}</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="question-legend"><span><i className="answered-dot" />Đã trả lời</span><span><i />Chưa làm</span></div>
          {questionGroups.map((part) => (
            <div className="question-part" key={part}>
              <span>PART {part}</span>
              <div className="question-number-grid">
                {test.questions.map((item, index) => item.question.part === part && (
                  <button type="button" key={item.question.id} onClick={() => setCurrentIndex(index)} className={`${index === currentIndex ? "is-current" : ""} ${answers[item.question.id] ? "is-answered" : ""}`} aria-label={`Đi đến câu ${index + 1}`}>{index + 1}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="autosave-note" role={storageError ? "alert" : undefined}>{storageError
            ? "Chưa lưu được bản nháp trên thiết bị. Giữ trang mở và thử lại sau khi giải phóng bộ nhớ."
            : "✓ Đáp án được tự động lưu trên thiết bị"}</div>
        </aside>

        <main className="question-workspace">
          <div className="question-topline"><span>PART {question.part}</span><span>CÂU {currentIndex + 1} / {test.questions.length}</span></div>

          {question.group?.audioUrl && (
            <section className="audio-panel">
              <div><span className="audio-icon" aria-hidden="true">♪</span><div><strong>Audio câu hỏi</strong><small>Nghe kỹ trước khi chọn đáp án</small></div></div>
              <audio controls preload="metadata" src={question.group.audioUrl}>Trình duyệt không hỗ trợ phát audio.</audio>
            </section>
          )}

          <article className="question-card">
            {question.group?.imageUrl && <img className="question-image" src={question.group.imageUrl} alt={`Hình minh họa cho câu ${currentIndex + 1}`} />}
            {question.group?.passageText && <SafePassage html={question.group.passageText} className="passage" />}
            <h1>{question.content || (question.part === 1 ? "Chọn câu mô tả đúng nhất cho hình ảnh." : "Chọn đáp án đúng nhất.")}</h1>
            <div className="answer-list" role="radiogroup" aria-label={`Đáp án câu ${currentIndex + 1}`}>
              {Object.entries(question.options || {}).map(([key, value]) => (
                <button type="button" role="radio" aria-checked={answers[question.id] === key} key={key} onClick={() => chooseAnswer(question.id, key)} className={answers[question.id] === key ? "is-selected" : ""}>
                  <span className="option-key">{key}</span><span>{value}</span><i aria-hidden="true" />
                </button>
              ))}
            </div>
          </article>

          {error && <p className="inline-error" role="alert">{error}</p>}
          <footer className="question-footer">
            <button type="button" className="secondary-action" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0}>← Câu trước</button>
            {currentIndex < test.questions.length - 1 ? (
              <button type="button" className="primary-button" onClick={() => setCurrentIndex((index) => Math.min(test.questions.length - 1, index + 1))}>Câu tiếp theo →</button>
            ) : (
              <button type="button" className="submit-test" onClick={submitTest} disabled={submitting}>{submitting ? "Đang chấm…" : "Nộp bài"}</button>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
