"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

async function postJson(path: string, body: object) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `Yêu cầu thất bại (${response.status}).`);
  return payload;
}

export function UserControls({ id, currentRole, currentStatus, isSelf }: { id: string; currentRole: string; currentStatus: string; isSelf: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function change(kind: "role" | "status") {
    if (reason.trim().length < 5) { setNotice("Cần ghi lý do ít nhất 5 ký tự."); return; }
    const status = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (!window.confirm(kind === "role" ? `Xác nhận đổi vai trò thành ${role}?` : `Xác nhận đổi trạng thái thành ${status}?`)) return;
    setBusy(true); setNotice("");
    try {
      await postJson(`/api/v1/admin/users/${id}/${kind}`, kind === "role" ? { role, reason: reason.trim() } : { status, reason: reason.trim() });
      setNotice("Đã cập nhật và ghi nhật ký."); setReason(""); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể cập nhật."); }
    finally { setBusy(false); }
  }

  return <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_auto_auto]">
    <label className="sr-only" htmlFor={`role-${id}`}>Vai trò</label>
    <select id={`role-${id}`} aria-label="Vai trò" className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={role} disabled={busy || isSelf} onChange={(event) => setRole(event.target.value)}><option value="USER">USER</option><option value="REVIEWER">REVIEWER</option><option value="ADMIN">ADMIN</option></select>
    <button type="button" disabled={busy || isSelf || role === currentRole} onClick={() => void change("role")} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Đổi quyền</button>
    <button type="button" disabled={busy || isSelf} onClick={() => void change("status")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40">{currentStatus === "ACTIVE" ? "Tạm khóa" : "Mở khóa"}</button>
    <input aria-label="Lý do thay đổi" className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-3" value={reason} disabled={busy || isSelf} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={isSelf ? "Không thể tự thay đổi tài khoản" : "Lý do thay đổi (bắt buộc)"} />
    {notice ? <p role="status" className="text-xs text-slate-600 sm:col-span-3">{notice}</p> : null}
  </div>;
}

export function ContributionControls({ id, hasAudio, hasImages = false }: { id: string; hasAudio: boolean; hasImages?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audios, setAudios] = useState<Array<{ assetId: string; groupNumbers: number[]; url: string; fileName?: string }>>([]);
  const [images, setImages] = useState<Array<{ assetId: string; groupNumbers: number[]; url: string }>>([]);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  async function openSource() {
    setBusy(true); setNotice(""); setSourceUrl("");
    try {
      const response = await fetch(`/api/v1/contributions/${id}/source`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) throw new Error(payload?.error?.message || "Không thể lấy PDF nguồn.");
      setSourceUrl(payload.url);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể mở PDF."); }
    finally { setBusy(false); }
  }

  async function openAudio() {
    setBusy(true); setNotice(""); setAudioUrl(""); setAudios([]); setImages([]);
    try {
      const response = await fetch(`/api/v1/contributions/${id}/media`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "Không thể lấy media.");
      setAudios(payload.audios || []);
      setAudioUrl(payload.audios?.length ? "" : payload.audioUrl || "");
      setImages(payload.images || []);
      if (!payload.audios?.length && !payload.audioUrl && !payload.images?.length) throw new Error("Không có media sẵn sàng. Kiểm tra lại trước khi công khai.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể mở audio."); }
    finally { setBusy(false); }
  }

  async function review(decision: "APPROVE" | "REJECT") {
    if (decision === "APPROVE" && !reviewConfirmed) { setNotice("Hãy xác nhận đã kiểm tra nguồn và nội dung trước khi duyệt."); return; }
    if (decision === "REJECT" && note.trim().length < 5) { setNotice("Cần ghi lý do từ chối ít nhất 5 ký tự."); return; }
    if (!window.confirm(decision === "APPROVE" ? "Bạn đã kiểm tra PDF nguồn, bản quyền, đáp án và media? Nội dung sẽ công khai ngay." : "Xác nhận từ chối tài liệu này?")) return;
    setBusy(true); setNotice("");
    try {
      await postJson(`/api/v1/contributions/${id}/review`, { decision, note: note.trim() });
      setNotice("Đã xử lý và ghi nhật ký."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể duyệt tài liệu."); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 border-t border-slate-100 pt-4">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => void openSource()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Lấy PDF nguồn</button>
      {sourceUrl ? <a className="text-sm font-semibold text-blue-600 underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">Mở PDF (link 5 phút)</a> : null}
      {hasAudio || hasImages ? <button type="button" disabled={busy} onClick={() => void openAudio()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Lấy audio và ảnh</button> : null}
    </div>
    {audioUrl ? <audio className="mt-3 w-full" controls preload="none" src={audioUrl}>Trình duyệt không hỗ trợ phát audio.</audio> : null}
    {audios.map(audio => <figure key={audio.assetId} className="mt-4 rounded-lg border border-slate-200 p-3">
      <figcaption className="mb-2 break-words text-sm font-semibold">Audio nhóm {audio.groupNumbers.join(", ")}{audio.fileName ? ` · ${audio.fileName}` : ""} · link 5 phút</figcaption>
      <audio className="w-full" controls preload="none" src={audio.url}>Trình duyệt không hỗ trợ phát audio.</audio>
    </figure>)}
    {images.map(image => <figure key={image.assetId} className="mt-4 rounded-lg border border-slate-200 p-3">
      <figcaption className="mb-2 text-sm font-semibold">Ảnh nhóm {image.groupNumbers.join(", ")} · link 5 phút</figcaption>
      <Image unoptimized src={image.url} alt={`Ảnh nhóm ${image.groupNumbers.join(", ")}`} width={1200} height={900} className="max-h-[32rem] w-full object-contain" />
    </figure>)}
    <textarea aria-label="Ghi chú duyệt" className="mt-3 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" value={note} disabled={busy} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú khi duyệt; lý do bắt buộc khi từ chối" />
    <label className="mt-2 flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={reviewConfirmed} disabled={busy} onChange={(event) => setReviewConfirmed(event.target.checked)} /><span>Tôi đã kiểm tra PDF nguồn, nội dung, đáp án, media và quyền chia sẻ.</span></label>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void review("APPROVE")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Duyệt & công khai</button><button type="button" disabled={busy} onClick={() => void review("REJECT")} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Từ chối</button></div>
    {notice ? <p role="status" className="mt-2 text-sm text-slate-600">{notice}</p> : null}
  </div>;
}

export function QuestionControls({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const action = status === "PUBLISHED" ? "archive" : "publish";
  async function apply() {
    if (reason.trim().length < 5) { setNotice("Cần ghi lý do ít nhất 5 ký tự."); return; }
    if (!window.confirm(action === "publish" ? "Xác nhận đã kiểm tra bản quyền, đáp án, nội dung và media trước khi công khai?" : "Ẩn câu hỏi này khỏi kho chung?")) return;
    setBusy(true); setNotice("");
    try { await postJson(`/api/v1/admin/questions/${id}/${action}`, { reason: reason.trim() }); setNotice("Đã cập nhật."); router.refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Không thể cập nhật câu hỏi."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
    <input aria-label="Lý do xuất bản hoặc ẩn" className="min-w-44 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={reason} disabled={busy} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Lý do (bắt buộc)" />
    <button type="button" disabled={busy} onClick={() => void apply()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{action === "publish" ? "Xuất bản" : "Ẩn câu hỏi"}</button>
    {notice ? <p role="status" className="w-full text-xs text-slate-600">{notice}</p> : null}
  </div>;
}
