"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFailureMessage } from "@/shared/response-diagnostics";
import { skillTaxonomy, tagsForPart } from "@/app/lib/skill-taxonomy";

type Tag = { id: string; name: string };

export default function QuestionSkillControls({ id, part, initialTags }: { id: string; part: number; initialTags: Tag[] }) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [keys, setKeys] = useState<string[]>(skillTaxonomy.filter(tag => initialTags.some(item => item.name === tag.name)).map(tag => tag.key));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const legacy = tags.filter(item => !skillTaxonomy.some(tag => tag.name === item.name));

  async function save() {
    if (reason.trim().length < 5) { setNotice("Ghi lý do ít nhất 5 ký tự sau khi đối chiếu câu và đáp án."); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/v1/admin/questions/${id}/skills`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys, expectedTagIds: tags.map(tag => tag.id), reason: reason.trim() }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) setStale(true);
        throw new Error(apiFailureMessage(response, data, "Không thể lưu nhãn kỹ năng."));
      }
      setTags(data.tags); setReason(""); setNotice(data.changed ? "Đã lưu nhãn và ghi nhật ký." : "Nhãn không thay đổi."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể lưu nhãn."); }
    finally { setBusy(false); }
  }

  return <details className="mt-4 rounded-xl border border-slate-200 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">Kỹ năng · {tags.length ? tags.map(tag => tag.name).join(", ") : "Chưa gắn nhãn"}</summary>
    <p className="mt-3 text-xs text-slate-600">Chọn tối đa 5 nhãn chuẩn cho kỹ năng thực sự cần để trả lời câu này. Không gán nhãn chỉ vì câu khó. Nhãn cập nhật sẽ được dùng khi phân tích cả lịch sử đã làm; không thay đáp án hoặc xuất bản câu.</p>
    <fieldset disabled={busy || stale} className="mt-3 grid gap-3 sm:grid-cols-2"><legend className="sr-only">Chọn kỹ năng của câu hỏi</legend>
      {tagsForPart(part).map(tag => <label key={tag.key} className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={keys.includes(tag.key)} disabled={!keys.includes(tag.key) && keys.length >= 5} onChange={event => setKeys(current => event.target.checked ? [...current, tag.key] : current.filter(key => key !== tag.key))} />
        <span><span className="font-medium">{tag.name}</span><span className="mt-1 block text-xs text-slate-500">{tag.guide}</span></span>
      </label>)}
    </fieldset>
    <button type="button" disabled={busy || stale || !keys.length} onClick={() => setKeys([])} className="mt-3 text-xs font-semibold text-blue-700 underline disabled:opacity-50">Bỏ chọn các nhãn chuẩn</button>
    {legacy.length ? <p className="mt-3 text-xs text-amber-800">Nhãn cũ được giữ nguyên: {legacy.map(tag => tag.name).join(", ")}. Cần rà soát riêng trước khi chuẩn hóa.</p> : null}
    <input aria-label="Lý do gắn nhãn kỹ năng" value={reason} maxLength={500} disabled={busy || stale} onChange={event => setReason(event.target.value)} placeholder="Lý do sau khi kiểm tra câu và đáp án" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    <button type="button" disabled={busy || stale || reason.trim().length < 5} onClick={() => void save()} className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Đang lưu…" : "Lưu nhãn kỹ năng"}</button>
    {stale ? <button type="button" onClick={() => window.location.reload()} className="ml-3 text-sm font-semibold text-blue-700 underline">Tải lại câu</button> : null}
    {notice ? <p role="status" className="mt-2 text-sm text-slate-600">{notice}</p> : null}
  </details>;
}
