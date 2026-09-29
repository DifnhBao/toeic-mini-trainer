import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import AdminShell from "../_components/AdminShell";
import { AdminAccessDenied, adminUser } from "../_components/admin-access";
import { QuestionControls } from "../_components/AdminActions";

export const runtime = "nodejs";
const statuses = ["LEGACY", "PUBLISHED", "ARCHIVED"] as const;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const admin = await adminUser();
  if (!admin) return <AdminAccessDenied />;
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status) || "LEGACY";
  const requestedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10000)) : 1;
  const where = { ownerId: null, publicationStatus: status };
  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20, select: { id: true, part: true, content: true, options: true, correctAnswer: true, publicationStatus: true, createdAt: true, group: { select: { passageText: true, audioUrl: true, imageUrl: true, audioAssetId: true, imageAssetId: true, contribution: { select: { status: true } } } } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return <AdminShell title="Kho câu hỏi chung" description="Rà soát từng câu trước khi xuất bản; không tự động công khai dữ liệu cũ. Mọi thao tác có lý do và bản ghi audit.">
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Câu hỏi LEGACY có thể chứa tài liệu chưa xác minh quyền chia sẻ. Hãy kiểm tra PDF nguồn, đáp án và media trước khi xuất bản. Câu có media cũ chưa được duyệt sẽ bị API từ chối.</div>
    <nav aria-label="Lọc trạng thái câu hỏi" className="mb-5 flex flex-wrap gap-2">{statuses.map((item) => <Link key={item} href={`/admin/questions?status=${item}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${status === item ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{item}</Link>)}</nav>
    <p className="mb-3 text-sm text-slate-500">{total} câu · Trang {page}/{totalPages}</p>
    <div className="grid gap-4">{questions.map((question) => {
      const options = question.options && typeof question.options === "object" && !Array.isArray(question.options) ? Object.entries(question.options) : [];
      const hasMedia = Boolean(question.group?.audioAssetId || question.group?.imageAssetId || question.group?.audioUrl || question.group?.imageUrl);
      const mediaNeedsReview = hasMedia && question.group?.contribution?.status !== "APPROVED";
      return <article key={question.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Part {question.part}</p><h2 className="mt-1 font-semibold text-slate-900">{question.content || "Câu hỏi dựa trên audio/hình/đoạn văn"}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{question.publicationStatus}</span></div>
        {question.group?.passageText ? <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Xem đoạn văn / transcript</summary><p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{question.group.passageText}</p></details> : null}
        <ul className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">{options.map(([key, value]) => <li key={key}>{key}. {String(value)}</li>)}</ul>
        <p className="mt-3 text-sm font-bold text-emerald-700">Đáp án: {question.correctAnswer}</p>
        {hasMedia ? <p className={`mt-2 text-xs font-semibold ${mediaNeedsReview ? "text-amber-700" : "text-slate-500"}`}>{mediaNeedsReview ? "Có media cũ/chưa được duyệt — cần xử lý quyền chia sẻ trước" : "Có media từ đóng góp đã duyệt"}</p> : null}
        <p className="mt-2 break-all text-[11px] text-slate-400">ID: {question.id}</p>
        <QuestionControls id={question.id} status={question.publicationStatus} />
      </article>;
    })}{!questions.length ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Không có câu hỏi trong trạng thái này.</p> : null}</div>
    <div className="mt-5 flex items-center justify-between text-sm">{page > 1 ? <Link className="font-semibold text-blue-600" href={`/admin/questions?status=${status}&page=${page - 1}`}>← Trang trước</Link> : <span />}{page < totalPages ? <Link className="font-semibold text-blue-600" href={`/admin/questions?status=${status}&page=${page + 1}`}>Trang sau →</Link> : null}</div>
  </AdminShell>;
}
