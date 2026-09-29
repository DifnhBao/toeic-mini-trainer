"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import AppHeader from "@/app/components/AppHeader";

type ExtractedGroup = {
  group?: {
    groupType?: string;
    passageText?: string | null;
    audioUrl?: string | null;
    imageUrl?: string | null;
    audioAssetId?: string | null;
    imageAssetId?: string | null;
  } | null;
  questions: Array<{ part: number; content?: string; options: Record<string, string>; correctAnswer: string }>;
};

type UploadIntent = {
  asset: { id: string };
  upload: { method: "PUT"; url: string; headers: Record<string, string> };
};

type IngestionJob = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "IMPORTING" | "IMPORTED" | "FAILED";
  errorCode: string | null;
  result: { data: ExtractedGroup[] } | null;
};

export default function AIExtractPage() {
  const { status } = useSession();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<{ data: ExtractedGroup[] } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);

  const questionCount = useMemo(() => extractedData?.data?.reduce((sum, group) => sum + group.questions.length, 0) || 0, [extractedData]);

  async function readJson(response: Response) {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.error || "Máy chủ không thể xử lý yêu cầu.");
    }
    return data;
  }

  async function uploadAsset(file: File, kind: "DOCUMENT" | "AUDIO") {
    const intent = (await readJson(
      await fetch("/api/v1/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      }),
    )) as UploadIntent;

    const uploadResponse = await fetch(intent.upload.url, {
      method: intent.upload.method,
      headers: intent.upload.headers,
      body: file,
    });
    if (!uploadResponse.ok) throw new Error(`Upload ${file.name} thất bại (${uploadResponse.status}).`);

    await readJson(await fetch(`/api/v1/uploads/${intent.asset.id}/complete`, { method: "POST" }));
    return intent.asset.id;
  }

  async function waitForJob(id: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const response = (await readJson(await fetch(`/api/v1/ingestions/${id}`))) as { job: IngestionJob };
      if (response.job.status === "COMPLETED" && response.job.result) return response.job.result;
      if (response.job.status === "FAILED") {
        throw new Error(`Không thể phân tích tài liệu (${response.job.errorCode || "INGESTION_FAILED"}).`);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    }
    throw new Error("Quá trình phân tích mất quá nhiều thời gian. Bạn có thể thử lại sau.");
  }

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
    setJobId(null);
    setRightsConfirmed(false);
    setSubmittedForReview(false);
    try {
      setMessage("Đang upload PDF vào kho riêng tư…");
      const documentAssetId = await uploadAsset(pdfFile, "DOCUMENT");
      const audioAssetId = audioFile ? await uploadAsset(audioFile, "AUDIO") : null;
      setMessage("Đã upload an toàn. AI đang phân tích trong nền…");
      const created = (await readJson(
        await fetch("/api/v1/ingestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentAssetId, audioAssetId }),
        }),
      )) as { job: { id: string } };
      setJobId(created.job.id);
      const result = await waitForJob(created.job.id);
      setExtractedData(result);
      setMessage("Phân tích hoàn tất. Hãy kiểm tra kỹ trước khi lưu.");
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!extractedData || !jobId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await readJson(
        await fetch(`/api/v1/ingestions/${jobId}/import`, { method: "POST" }),
      );
      setMessage(
        data.alreadyImported
          ? "Bộ câu hỏi này đã được lưu trước đó; hệ thống không tạo bản trùng."
          : `Đã thêm ${data.questionsAdded} câu hỏi vào kho cá nhân. Bạn có thể tạo bài luyện ngay.`,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function submitForReview() {
    if (!extractedData || !jobId || !rightsConfirmed || submittedForReview) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await readJson(await fetch("/api/v1/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, data: extractedData, rightsConfirmed: true }),
      }));
      setSubmittedForReview(true);
      setMessage("Đã gửi tài liệu vào hàng chờ duyệt. Nội dung chưa công khai cho người học.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể gửi đóng góp.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-shell import-page">
        <section className="import-heading"><div><p className="eyebrow">KHO TÀI LIỆU</p><h1>Biến PDF thành bộ câu hỏi luyện tập</h1><p>AI đọc nội dung, ghép audio và cấu trúc câu hỏi. Bạn luôn kiểm tra lại trước khi lưu.</p></div><Link href="/admin/import" className="ghost-button">Nhập file JSON</Link></section>

        <section className="pipeline-strip" aria-label="Quy trình nhập đề"><div className="is-active"><span>1</span><strong>Tải tài liệu</strong></div><i /><div className={extractedData ? "is-active" : ""}><span>2</span><strong>Kiểm tra dữ liệu</strong></div><i /><div className={message ? "is-active" : ""}><span>3</span><strong>Lưu hoặc gửi duyệt</strong></div></section>

        <section className="upload-card">
          <div className="upload-card-head"><div><span className="step-kicker">BƯỚC 1</span><h2>Chọn file nguồn</h2></div><span className="privacy-note">File được lưu riêng tư và chỉ mở bằng link tạm thời</span></div>
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
            <div className="review-import-head"><div><span className="step-kicker">BƯỚC 2</span><h2>Kiểm tra {questionCount} câu đã nhận diện</h2><p>Đặc biệt kiểm tra Part, đáp án đúng và cách nhóm đoạn văn/audio.</p></div><button type="button" className="save-bank-button" onClick={save} disabled={loading}>{loading ? "Đang lưu…" : `Lưu ${questionCount} câu vào kho cá nhân`}</button></div>
            {message && <p className="success-message" role="status">✓ {message}</p>}
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-900">Muốn đóng góp vào kho chung?</p>
              <p className="mt-1">PDF gốc vẫn riêng tư. Câu hỏi và audio đính kèm chỉ công khai sau khi admin kiểm tra và duyệt.</p>
              <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={rightsConfirmed} disabled={loading || submittedForReview} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" /><span>Tôi có quyền chia sẻ nội dung và media này, đã kiểm tra đáp án.</span></label>
              <button type="button" className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!rightsConfirmed || loading || submittedForReview} onClick={() => void submitForReview()}>{submittedForReview ? "Đã gửi chờ duyệt" : "Gửi để admin duyệt"}</button>
            </div>
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
