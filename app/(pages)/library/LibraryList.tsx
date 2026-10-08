"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LibraryCatalogue } from "@/types/library";

async function read<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "Chưa thể tải kho bài. Hãy thử lại.");
  return data;
}
export default function LibraryList({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [catalogue, setCatalogue] = useState<LibraryCatalogue>({ lessons: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const busy = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    void read<LibraryCatalogue>("/api/v1/library", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setCatalogue(data); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Chưa tải được kho bài."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function load(more = false) {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const data = await read<LibraryCatalogue>(`/api/v1/library${more && catalogue.nextCursor ? `?cursor=${catalogue.nextCursor}` : ""}`, { signal: lifecycle.current?.signal });
      if (lifecycle.current?.signal.aborted) return;
      setCatalogue((current) => ({ ...data, lessons: more ? [...current.lessons, ...data.lessons.filter((lesson) => !current.lessons.some((old) => old.id === lesson.id))] : data.lessons }));
    } catch (failure) { if (!lifecycle.current?.signal.aborted) setError(failure instanceof Error ? failure.message : "Chưa tải được kho bài."); }
    finally { if (!lifecycle.current?.signal.aborted) setLoading(false); }
  }
  async function start(id: string) {
    if (busy.current) return;
    busy.current = true; setCreating(id); setError("");
    try {
      const data = await read<{ test: { id: string } }>(`/api/v1/library/${id}/test`, { method: "POST", signal: lifecycle.current?.signal });
      if (!lifecycle.current?.signal.aborted) router.push(`/tests/${data.test.id}`);
    } catch (failure) { if (!lifecycle.current?.signal.aborted) setError(failure instanceof Error ? failure.message : "Chưa tạo được bài."); }
    finally { busy.current = false; if (!lifecycle.current?.signal.aborted) setCreating(null); }
  }
  return <section className="mt-7">
    <div className="mb-5 flex flex-wrap gap-3"><button className="ghost-button" disabled={loading} onClick={() => void load()}>Tải lại kho bài</button><Link className="ghost-button" href="/">Luyện ngẫu nhiên theo Part</Link>{isAdmin && <Link className="primary-button" href="/admin/extract">Nhập đề và audio</Link>}</div>
    {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
    {loading && <p role="status">Đang tải kho bài…</p>}
    {!loading && !error && catalogue.lessons.length === 0 && <p className="rounded-xl border bg-white p-6">Quản trị viên đang chuẩn bị các bài đã kiểm duyệt. Bạn có thể luyện ngẫu nhiên từ những câu hiện có.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{catalogue.lessons.map((lesson) => <article key={lesson.id} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold">{lesson.title} · Part {lesson.parts.join(", ")}</h2><p className="mt-2 text-sm text-slate-600">{lesson.questionCount > 50 ? "Trên 50" : lesson.questionCount} câu{lesson.hasAudio ? " · Có audio" : ""}{lesson.hasImage ? " · Có hình ảnh" : ""}</p>
      <p className="mt-2 text-xs text-slate-500">Cập nhật {new Date(lesson.createdAt).toLocaleDateString("vi-VN")}</p>
      <button className="primary-button mt-4" disabled={!lesson.playable || creating !== null} onClick={() => void start(lesson.id)}>{creating === lesson.id ? "Đang tạo bài…" : lesson.playable ? "Luyện bài này" : lesson.unavailableReason}</button>
    </article>)}</div>
    {catalogue.nextCursor && <button className="ghost-button mt-6" disabled={loading} onClick={() => void load(true)}>Xem thêm bài</button>}
  </section>;
}
