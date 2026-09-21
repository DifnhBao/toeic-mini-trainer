"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import AppHeader from "@/app/components/AppHeader";

type PartStat = { part: number; accuracy: number; total: number };
type ProgressSummary = {
  totalTests: number;
  overallAccuracy: number;
  partStats: PartStat[];
};

const partOptions = [
  { id: "mixed", label: "Tổng hợp", note: "Nghe + đọc" },
  { id: "1", label: "Part 1", note: "Mô tả tranh" },
  { id: "2", label: "Part 2", note: "Hỏi – đáp" },
  { id: "3", label: "Part 3", note: "Hội thoại" },
  { id: "4", label: "Part 4", note: "Bài nói" },
  { id: "5", label: "Part 5", note: "Hoàn thành câu" },
  { id: "6", label: "Part 6", note: "Hoàn thành đoạn" },
  { id: "7", label: "Part 7", note: "Đọc hiểu" },
] as const;

const practiceModes = [
  { id: "mixed", title: "Bài ngắn tổng hợp", detail: "Luyện phản xạ như thi thật", icon: "spark" },
  { id: "listening", title: "Chỉ luyện nghe", detail: "Tập trung Part 1–4", icon: "headphones" },
  { id: "reading", title: "Chỉ luyện đọc", detail: "Tập trung Part 5–7", icon: "book" },
] as const;

function MiniIcon({ name }: { name: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "headphones") {
    return <svg {...common}><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M18 19h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1v6ZM6 19H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1v6Z"/></svg>;
  }
  if (name === "book") {
    return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4v15.5"/><path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5V4A2 2 0 0 1 6 2h.5Z"/></svg>;
  }
  return <svg {...common}><path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6L12 3Z"/><path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8L5 15Z"/></svg>;
}

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<ProgressSummary | null>(null);
  const [testLimit, setTestLimit] = useState(10);
  const [selectedPart, setSelectedPart] = useState("mixed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      setStats(null);
      return;
    }
    const controller = new AbortController();
    fetch("/api/progress/summary", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Không thể tải tiến độ");
        return response.json();
      })
      .then(setStats)
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") console.error(fetchError);
      });
    return () => controller.abort();
  }, [status]);

  const weakestPart = useMemo(() => {
    if (!stats?.partStats.length) return null;
    return [...stats.partStats].sort((a, b) => a.accuracy - b.accuracy)[0];
  }, [stats]);

  function chooseMode(mode: string) {
    setSelectedPart(mode);
  }

  async function handleStartTest() {
    setError("");
    if (status !== "authenticated") {
      await signIn("google", { callbackUrl: "/" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/mini-tests/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: testLimit, part: selectedPart }),
      });
      const data = await response.json();
      if (!response.ok || !data.testId) throw new Error(data.error || "Không thể tạo bài luyện lúc này.");
      router.push(`/tests/${data.testId}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Lỗi kết nối.");
      setLoading(false);
    }
  }

  const selectedLabel = selectedPart === "listening" ? "Listening" : selectedPart === "reading" ? "Reading" : partOptions.find((part) => part.id === selectedPart)?.label;

  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-shell dashboard-shell">
        <section className="welcome-row" aria-labelledby="welcome-title">
          <div>
            <p className="eyebrow">PHÒNG LUYỆN CÁ NHÂN</p>
            <h1 id="welcome-title">{session?.user?.name ? `Chào ${session.user.name.split(" ").at(-1)},` : "Chào bạn,"} hôm nay mình luyện gì?</h1>
            <p className="subcopy">Một phiên 10–15 phút mỗi ngày sẽ dễ duy trì hơn một buổi học thật dài.</p>
          </div>
          <Link href="/admin/extract" className="ghost-button"><span className="button-plus">+</span> Thêm bộ đề</Link>
        </section>

        <section className="dashboard-grid">
          <div className="practice-card">
            <div className="section-heading">
              <div><span className="step-kicker">01 · CHỌN KIỂU LUYỆN</span><h2>Tạo bài luyện nhanh</h2></div>
              <span className="quiet-chip">Kho câu hỏi của bạn</span>
            </div>
            <div className="mode-grid" role="group" aria-label="Kiểu bài luyện">
              {practiceModes.map((mode) => {
                const active = selectedPart === mode.id;
                return (
                  <button key={mode.id} type="button" onClick={() => chooseMode(mode.id)} className={`mode-card ${active ? "is-active" : ""}`}>
                    <span className="mode-icon"><MiniIcon name={mode.icon} /></span>
                    <span><strong>{mode.title}</strong><small>{mode.detail}</small></span>
                    <span className="radio-dot" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="divider" />
            <div className="section-heading compact-heading">
              <div><span className="step-kicker">02 · CHỌN PART</span><h2>Luyện đúng điểm cần cải thiện</h2></div>
              {weakestPart && <button type="button" className="suggestion-link" onClick={() => setSelectedPart(String(weakestPart.part))}>Gợi ý: Part {weakestPart.part} · {weakestPart.accuracy}%</button>}
            </div>
            <div className="part-grid" role="group" aria-label="Chọn TOEIC Part">
              {partOptions.map((part) => (
                <button key={part.id} type="button" onClick={() => setSelectedPart(part.id)} className={`part-button ${selectedPart === part.id ? "is-active" : ""}`}>
                  <span>{part.label}</span><small>{part.note}</small>
                </button>
              ))}
            </div>
            <div className="test-builder-footer">
              <div className="count-picker">
                <span className="field-label">Số câu hỏi</span>
                <div className="count-options">
                  {[5, 10, 20].map((count) => <button type="button" key={count} className={testLimit === count ? "is-active" : ""} onClick={() => setTestLimit(count)}>{count}</button>)}
                  <label className="custom-count"><span className="sr-only">Số câu tùy chỉnh</span><input type="number" min={5} max={50} value={testLimit} onChange={(event) => setTestLimit(Math.min(50, Math.max(5, Number(event.target.value))))} /></label>
                </div>
              </div>
              <button type="button" onClick={handleStartTest} disabled={loading || status === "loading"} className="primary-button start-button">
                {loading ? "Đang soạn bài…" : `Bắt đầu ${selectedLabel} · ${testLimit} câu`}<span aria-hidden="true">→</span>
              </button>
            </div>
            {error && <p className="inline-error" role="alert">{error}</p>}
          </div>

          <aside className="dashboard-side">
            <div className="progress-card dark-card">
              <div className="progress-topline"><span>TIẾN ĐỘ CỦA BẠN</span><Link href="/history">Chi tiết ↗</Link></div>
              {status === "authenticated" ? (
                <>
                  <div className="accuracy-ring" style={{ "--score": `${stats?.overallAccuracy ?? 0}%` } as React.CSSProperties}><div><strong>{stats?.overallAccuracy ?? 0}%</strong><span>chính xác</span></div></div>
                  <div className="progress-metrics"><div><strong>{stats?.totalTests ?? 0}</strong><span>bài đã làm</span></div><div><strong>{stats?.partStats.reduce((sum, item) => sum + item.total, 0) ?? 0}</strong><span>câu đã luyện</span></div></div>
                </>
              ) : (
                <div className="signed-out-progress"><strong>Lưu tiến độ sau mỗi bài</strong><p>Đăng nhập để xem điểm mạnh, điểm yếu và lịch sử lỗi sai.</p><button type="button" onClick={() => signIn("google", { callbackUrl: "/" })}>Đăng nhập với Google</button></div>
              )}
            </div>
            <Link href="/coach" className="coach-card">
              <span className="coach-spark"><MiniIcon name="spark" /></span>
              <div><span className="step-kicker">AI COACH</span><h3>Hỏi như đang học cùng giáo viên</h3><p>Giải thích ngữ pháp, từ vựng và mẹo xử lý từng Part.</p></div>
              <span className="coach-arrow" aria-hidden="true">→</span>
            </Link>
            <div className="daily-tip"><span className="tip-label">MẸO HÔM NAY</span><p>Ở Part 2, đừng cố dịch toàn bộ. Hãy bắt từ để hỏi và thì của câu trước tiên.</p></div>
          </aside>
        </section>
      </main>
    </div>
  );
}
