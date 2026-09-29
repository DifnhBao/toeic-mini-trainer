"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { PDFDocument } from "pdf-lib";
import AppHeader from "@/app/components/AppHeader";
import IngestionQuestionReview, { type ExtractedGroup } from "@/app/components/IngestionQuestionReview";
import { MAX_INGESTION_PAGES } from "@/app/lib/ingestion-limits";

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
  const pdfSelectionVersion = useRef(0);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(MAX_INGESTION_PAGES);
  const [uploadedPdf, setUploadedPdf] = useState<{ file: File; id: string } | null>(null);
  const [uploadedAudio, setUploadedAudio] = useState<{ file: File; id: string } | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<{ data: ExtractedGroup[] } | null>(null);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [processedRange, setProcessedRange] = useState<{ start: number; end: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobFailureCode, setJobFailureCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const invalidPageRange = pdfPageCount !== null && (
    !Number.isSafeInteger(pageStart) || !Number.isSafeInteger(pageEnd) ||
    pageStart < 1 || pageEnd < pageStart || pageEnd > pdfPageCount ||
    pageEnd - pageStart + 1 > MAX_INGESTION_PAGES
  );

  async function selectPdf(file: File | null) {
    const selectionVersion = ++pdfSelectionVersion.current;
    setPdfFile(file);
    setPdfPageCount(null);
    setUploadedPdf(null);
    setExtractedData(null);
    setProcessedRange(null);
    setJobId(null);
    setJobFailureCode(null);
    setMessage("");
    setError("");
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("PDF vượt quá 15 MB.");
      return;
    }
    try {
      const document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      if (selectionVersion !== pdfSelectionVersion.current) return;
      const count = document.getPageCount();
      if (count < 1 || count > 1_000) throw new Error("Số trang PDF không hợp lệ.");
      setPdfPageCount(count);
      setPageStart(1);
      setPageEnd(Math.min(count, MAX_INGESTION_PAGES));
    } catch {
      if (selectionVersion === pdfSelectionVersion.current) {
        setError("Không đọc được cấu trúc PDF. Hãy kiểm tra file có bị khóa hoặc hỏng không.");
      }
    }
  }

  function ingestionErrorMessage(code: string | null) {
    const messages: Record<string, string> = {
      DOCUMENT_PARSE_FAILED: "PDF bị hỏng hoặc không thể đọc. Hãy thử xuất lại PDF.",
      DOCUMENT_TEXT_EMPTY: "PDF không có lớp chữ. Hãy chạy lại sau khi cập nhật để AI đọc bản scan.",
      DOCUMENT_PAGE_RANGE_INVALID: "Khoảng trang không hợp lệ. Chọn lại tối đa 4 trang liên tiếp.",
      DOCUMENT_SECTION_TOO_LONG: "Các trang đã chọn có quá nhiều chữ. Hãy chọn ít trang hơn.",
      DOCUMENT_OCR_TOO_LARGE: "Trang scan quá nặng để đọc ảnh. Hãy nén PDF hoặc chọn ít trang hơn.",
      DOCUMENT_NO_QUESTIONS: "Không tìm thấy câu hỏi trong các trang đã chọn. Hãy chọn trang khác.",
      AI_RATE_LIMITED: "Dịch vụ AI đang giới hạn lượt gọi. Hãy thử lại sau.",
      AI_PROVIDER_UNAVAILABLE: "Dịch vụ AI tạm thời không phản hồi. Hãy thử lại sau.",
      AI_RESPONSE_INVALID: "AI chưa trả về câu hỏi đúng cấu trúc. Hãy thử khoảng trang ngắn hơn hoặc đổi file.",
      WORKER_TIMEOUT: "Tác vụ xử lý quá lâu. Hãy thử kiểm tra lại trước khi tạo lượt phân tích mới.",
    };
    return messages[code || ""] || `Không thể phân tích tài liệu (${code || "INGESTION_FAILED"}).`;
  }

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
          contentType: file.type || (kind === "DOCUMENT" ? "application/pdf" : ""),
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
        setJobFailureCode(response.job.errorCode || "INGESTION_FAILED");
        throw new Error(ingestionErrorMessage(response.job.errorCode));
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
    if (!pdfFile || pdfPageCount === null || invalidPageRange) return;
    setLoading(true);
    setError("");
    setMessage("");
    setExtractedData(null);
    setProcessedRange(null);
    setJobId(null);
    setJobFailureCode(null);
    try {
      setMessage("Đang upload PDF vào kho riêng tư…");
      const documentAssetId = uploadedPdf?.file === pdfFile
        ? uploadedPdf.id : await uploadAsset(pdfFile, "DOCUMENT");
      setUploadedPdf({ file: pdfFile, id: documentAssetId });
      const audioAssetId = audioFile
        ? uploadedAudio?.file === audioFile
          ? uploadedAudio.id : await uploadAsset(audioFile, "AUDIO")
        : null;
      if (audioFile && audioAssetId) setUploadedAudio({ file: audioFile, id: audioAssetId });
      setMessage("Đã upload an toàn. AI đang phân tích trong nền…");
      const created = (await readJson(
        await fetch("/api/v1/ingestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentAssetId, audioAssetId, pageStart, pageEnd }),
        }),
      )) as { job: { id: string } };
      setJobId(created.job.id);
      setProcessedRange({ start: pageStart, end: pageEnd });
      const result = await waitForJob(created.job.id);
      setJobFailureCode(null);
      setExtractedData(result);
      setReviewVersion((version) => version + 1);
      setMessage("Phân tích hoàn tất. Hãy kiểm tra kỹ trước khi lưu.");
    } catch (extractError) {
      setMessage("");
      setError(extractError instanceof Error ? extractError.message : "Lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  async function resumeJob() {
    if (!jobId || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await waitForJob(jobId);
      setJobFailureCode(null);
      setExtractedData(result);
      setReviewVersion((version) => version + 1);
      setMessage("Phân tích hoàn tất. Hãy kiểm tra kỹ trước khi lưu.");
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Không thể kiểm tra tác vụ.");
    } finally {
      setLoading(false);
    }
  }

  async function retryJob() {
    if (!jobId || !jobFailureCode || loading) return;
    setLoading(true);
    setError("");
    try {
      await readJson(await fetch(`/api/v1/ingestions/${jobId}/retry`, { method: "POST" }));
      setJobFailureCode(null);
      const result = await waitForJob(jobId);
      setExtractedData(result);
      setReviewVersion((version) => version + 1);
      setMessage("Phân tích hoàn tất. Hãy kiểm tra kỹ trước khi lưu.");
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Không thể thử lại tác vụ.");
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
              <input type="file" accept="application/pdf,.pdf" disabled={loading} onChange={(event) => void selectPdf(event.target.files?.[0] || null)} />
              <span className="upload-symbol">PDF</span><strong>{pdfFile?.name || "Đề thi hoặc tài liệu TOEIC"}</strong><small>{pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB · Bấm để chọn lại` : "Kéo thả hoặc chọn file PDF, tối đa 15 MB"}</small>
            </label>
            <label className={`upload-zone audio-zone ${audioFile ? "has-file" : ""}`}>
              <input type="file" accept="audio/*,.mp3,.m4a,.wav" disabled={loading} onChange={(event) => { setAudioFile(event.target.files?.[0] || null); setUploadedAudio(null); }} />
              <span className="upload-symbol">♪</span><strong>{audioFile?.name || "Audio Listening (không bắt buộc)"}</strong><small>{audioFile ? `${(audioFile.size / 1024 / 1024).toFixed(1)} MB · Bấm để chọn lại` : "MP3, M4A hoặc WAV, tối đa 100 MB"}</small>
            </label>
          </div>
          {pdfPageCount !== null && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold">PDF có {pdfPageCount} trang. Mỗi lượt phân tích tối đa {MAX_INGESTION_PAGES} trang liên tiếp.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label htmlFor="page-start">Từ trang</label>
                <input id="page-start" type="number" min="1" max={pdfPageCount} value={pageStart} disabled={loading} onChange={(event) => setPageStart(Number(event.target.value))} className="w-20 rounded border border-slate-300 bg-white px-2 py-1" />
                <label htmlFor="page-end">đến trang</label>
                <input id="page-end" type="number" min={pageStart} max={pdfPageCount} value={pageEnd} disabled={loading} onChange={(event) => setPageEnd(Number(event.target.value))} className="w-20 rounded border border-slate-300 bg-white px-2 py-1" />
              </div>
              {invalidPageRange && <p className="mt-2 text-red-700">Chọn từ 1 đến {MAX_INGESTION_PAGES} trang hợp lệ trong PDF.</p>}
              <p className="mt-2">PDF scan sẽ được AI đọc ảnh. Với tài liệu dài, hãy lưu kết quả hiện tại trước khi chọn các trang tiếp theo; file đã upload được dùng lại.</p>
            </div>
          )}
          <div className="upload-action"><p><strong>Lưu ý:</strong> AI có thể đọc sai chữ, đáp án hoặc bỏ sót câu. Bạn cần kiểm tra toàn bộ trước khi lưu.</p><button type="button" className="primary-button" onClick={extract} disabled={!pdfFile || pdfPageCount === null || invalidPageRange || loading}>{loading && !extractedData ? "AI đang phân tích…" : status === "authenticated" ? "Phân tích trang đã chọn →" : "Đăng nhập để tiếp tục"}</button></div>
          {message && !extractedData && <p role="status">{message}</p>}
          {jobId && !extractedData && !loading && (
            jobFailureCode === null
              ? <button type="button" className="ghost-button" onClick={() => void resumeJob()}>Kiểm tra lại tác vụ hiện tại</button>
              : ["AI_RATE_LIMITED", "AI_PROVIDER_UNAVAILABLE", "AI_EXTRACTION_FAILED", "AI_RESPONSE_INVALID", "WORKER_TIMEOUT"].includes(jobFailureCode)
                ? <button type="button" className="ghost-button" onClick={() => void retryJob()}>Thử lại tác vụ hiện tại</button>
                : null
          )}
          {error && <p className="inline-error" role="alert">{error}</p>}
        </section>

        {extractedData?.data && jobId && (
          <IngestionQuestionReview key={`${jobId}:${reviewVersion}`} groups={extractedData.data} jobId={jobId} pageRange={processedRange} />
        )}
      </main>
    </div>
  );
}
