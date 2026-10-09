"use client";

import { FormEvent, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import AppHeader from "@/app/components/AppHeader";
import { apiFailureMessage } from '@/shared/response-diagnostics';

const starterQuestions = [
  "Phân biệt another, other và the other trong Part 5",
  "Cách bắt từ khóa ở Part 2 mà không cần dịch hết",
  "Chiến thuật chia thời gian 75 phút cho Reading",
  "Khi nào dùng V-ing và khi nào dùng to V?",
];

export default function CoachPage() {
  const { status } = useSession();
  const [part, setPart] = useState("Tổng hợp");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function askCoach(event?: FormEvent) {
    event?.preventDefault();
    if (status !== "authenticated") {
      await signIn("google", { callbackUrl: "/coach" });
      return;
    }
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, part }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(apiFailureMessage(response, data, "Không thể nhận câu trả lời."));
      setAnswer(data.answer);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-shell coach-page">
        <section className="coach-intro">
          <span className="coach-orb" aria-hidden="true">AI</span>
          <div><p className="eyebrow">TRỢ GIẢNG TOEIC</p><h1>Hỏi để hiểu, không chỉ để biết đáp án</h1><p>Nhờ AI phân tích ngữ pháp, từ vựng, chiến thuật hoặc một câu bạn đang mắc.</p></div>
        </section>

        <div className="coach-layout">
          <aside className="coach-prompts">
            <span className="step-kicker">GỢI Ý ĐỂ BẮT ĐẦU</span>
            {starterQuestions.map((question) => <button type="button" key={question} onClick={() => setMessage(question)}>{question}<span>→</span></button>)}
            <div className="coach-note"><strong>Cách hỏi tốt</strong><p>Gửi cả câu hỏi, bốn lựa chọn và đáp án bạn đã chọn để được giải thích sát nhất.</p></div>
          </aside>

          <section className="coach-workspace">
            <div className="coach-scope">
              <label htmlFor="coach-part">Đang học</label>
              <select id="coach-part" value={part} onChange={(event) => setPart(event.target.value)}>
                <option>Tổng hợp</option>{[1,2,3,4,5,6,7].map((value) => <option key={value}>Part {value}</option>)}
              </select>
            </div>
            <div className={`answer-surface ${answer ? "has-answer" : ""}`} aria-live="polite">
              {loading ? <div className="coach-thinking"><span /><span /><span /> AI đang phân tích cách giải dễ hiểu nhất…</div> : answer ? <div className="coach-answer"><span className="answer-label">AI COACH TRẢ LỜI</span><p>{answer}</p></div> : <div className="coach-empty"><span>?</span><strong>Bạn đang vướng điều gì?</strong><p>Câu trả lời sẽ ưu tiên cách hiểu và cách áp dụng vào bài thi.</p></div>}
            </div>
            <form className="coach-form" onSubmit={askCoach}>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="Ví dụ: Vì sao câu này dùng ‘has been postponed’ thay vì ‘was postponing’?" aria-label="Câu hỏi cho AI Coach" />
              <div><span>{message.length}/2000</span><button type="submit" disabled={loading || !message.trim()}>{status === "authenticated" ? "Gửi câu hỏi" : "Đăng nhập để hỏi"} <span aria-hidden="true">↑</span></button></div>
            </form>
            {error && <p className="inline-error" role="alert">{error}</p>}
          </section>
        </div>
      </main>
    </div>
  );
}
