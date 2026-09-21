"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import AppHeader from "@/app/components/AppHeader";

type ExtractedGroup = {
  group?: { groupType?: string; passageText?: string; audioUrl?: string; imageUrl?: string } | null;
  questions: Array<{ part: number; content?: string; options: Record<string, string>; correctAnswer: string }>;
};

export default function AIExtractPage() {
  const { status } = useSession();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<{ data: ExtractedGroup[] } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const questionCount = useMemo(() => extractedData?.data?.reduce((sum, group) => sum + group.questions.length, 0) || 0, [extractedData]);

  async function extract() {
    if (status !== "authenticated") {
      await signIn("google", { callbackUrl: "/admin/extract" });
      return;
    }
    if (!pdfFile) return;
    setLoading(true);
    setError("");
    setMessage("");
    setExtractedData(null);
    const formData = new FormData();
    formData.append("document", pdfFile);
    if (audioFile) formData.append("audio", audioFile);
    try {
      const response = await fetch("/api/extract-ai", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đọc bộ đề.");
      setExtractedData(data.extractedData);
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!extractedData) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/import/questions-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extractedData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể lưu câu hỏi.");
      setMessage(`Đã thêm ${data.questionsAdded} câu hỏi vào kho. Bạn có thể tạo bài luyện ngay.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-shell import-page">
        <section className="import-heading"><div><p className="eyebrow">KHO TÀI LIỆU</p><h1>Biến PDF thành bộ câu hỏi luyện tập</h1><p>AI đọc nội dung, ghép audio và cấu trúc câu hỏi. Bạn luôn kiểm tra lại trước khi lưu.</p></div><Link href="/admin/import" className="ghost-button">Nhập file JSON</Link></section>

        <section className="pipeline-strip" aria-label="Quy trình nhập đề"><div className="is-active"><span>1</span><strong>Tải tài liệu</strong></div><i /><div className={extractedData ? "is-active" : ""}><span>2</span><strong>Kiểm tra dữ liệu</strong></div><i /><div className={message ? "is-active" : ""}><span>3</span><strong>Lưu vào kho</strong></div></section>

        <section className="upload-card">
          <div className="upload-card-head"><div><span className="step-kicker">BƯỚC 1</span><h2>Chọn file nguồn</h2></div><span className="privacy-note">File chỉ dùng để tạo kho câu hỏi cá nhân</span></div>
          <div className="upload-grid">
            <label className={`upload-zone ${pdfFile ? "has-file" : ""}`}>
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => setPdfFile(event.target.files?.[0] || null)} />
              <span className="upload-symbol">PDF</span><strong>{pdfFile?.name || "Đề thi hoặc tài liệu TOEIC"}</strong><small>{pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB · Bấm để chọn lại` : "Kéo thả hoặc chọn file PDF, tối đa 15 MB"}</small>
            </label>
            <label className={`upload-zone audio-zone ${audioFile ? "has-file" : ""}`}>
              <input type="file" accept="audio/*,.mp3,.m4a,.wav" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} />
              <span className="upload-symbol">♪</span><strong>{audioFile?.name || "Audio Listening (không bắt buộc)"}</strong><small>{audioFile ? `${(audioFile.size / 1024 / 1024).toFixed(1)} MB · Bấm để chọn lại` : "MP3, M4A hoặc WAV, tối đa 100 MB"}</small>
            </label>
          </div>
          <div className="upload-action"><p><strong>Lưu ý:</strong> PDF cần có chữ có thể bôi chọn. Bản scan hình ảnh hiện chưa hỗ trợ OCR.</p><button type="button" className="primary-button" onClick={extract} disabled={!pdfFile || loading}>{loading && !extractedData ? "AI đang phân tích…" : status === "authenticated" ? "Phân tích bộ đề →" : "Đăng nhập để tiếp tục"}</button></div>
          {error && <p className="inline-error" role="alert">{error}</p>}
        </section>

        {extractedData?.data && (
          <section className="review-import">
            <div className="review-import-head"><div><span className="step-kicker">BƯỚC 2</span><h2>Kiểm tra {questionCount} câu đã nhận diện</h2><p>Đặc biệt kiểm tra Part, đáp án đúng và cách nhóm đoạn văn/audio.</p></div><button type="button" className="save-bank-button" onClick={save} disabled={loading}>{loading ? "Đang lưu…" : `Lưu ${questionCount} câu vào kho`}</button></div>
            {message && <p className="success-message" role="status">✓ {message}</p>}
            <div className="extracted-list">
              {extractedData.data.map((group, groupIndex) => (
                <div className="extracted-group" key={groupIndex}>
                  {group.group && <div className="group-context"><span>{group.group.groupType || "TEXT"}</span>{group.group.audioUrl && <audio controls preload="metadata" src={group.group.audioUrl} />}{group.group.passageText && <p>{group.group.passageText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</p>}</div>}
                  {group.questions.map((question, questionIndex) => (
                    <article key={questionIndex}><div><span>Part {question.part}</span><strong>Đáp án {question.correctAnswer}</strong></div><h3>{question.content || "Câu hỏi nghe / mô tả tranh"}</h3><div className="mini-options">{Object.entries(question.options || {}).map(([key, value]) => <span key={key} className={key === question.correctAnswer ? "correct" : ""}><b>{key}</b>{value}</span>)}</div></article>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
