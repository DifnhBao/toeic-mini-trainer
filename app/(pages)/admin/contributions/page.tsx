import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { sharedQuestionDataSchema } from "@/app/lib/content-contributions";
import AdminShell from "../_components/AdminShell";
import { AdminAccessDenied, adminUser } from "../_components/admin-access";
import { ContributionControls } from "../_components/AdminActions";

export const runtime = "nodejs";
const statuses = ["PENDING", "APPROVED", "REJECTED"] as const;

export default async function ContributionsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const admin = await adminUser();
  if (!admin) return <AdminAccessDenied />;
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status) || "PENDING";
  const requestedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10000)) : 1;
  const [total, contributions] = await Promise.all([
    prisma.contentContribution.count({ where: { status } }),
    prisma.contentContribution.findMany({ where: { status }, orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, skip: (page - 1) * 5, take: 5, select: { id: true, status: true, data: true, updatedAt: true, reviewNote: true, createdAt: true, reviewedAt: true, owner: { select: { id: true, name: true, email: true } }, reviewer: { select: { name: true, email: true } }, sourceJob: { select: { documentAsset: { select: { originalName: true, sizeBytes: true } }, audioAsset: { select: { originalName: true } } } } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 5));

  return <AdminShell title="Duyệt đóng góp" description="Kiểm tra PDF nguồn, nội dung, đáp án và quyền chia sẻ trước khi công khai. PDF gốc vẫn riêng tư.">
    <nav aria-label="Lọc đóng góp" className="mb-5 flex flex-wrap gap-2">{statuses.map((item) => <Link key={item} href={`/admin/contributions?status=${item}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${status === item ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{item}</Link>)}</nav>
    <p className="mb-3 text-sm text-slate-500">{total} tài liệu · Trang {page}/{totalPages}</p>
    <div className="grid gap-5">
      {contributions.map((item) => {
        const parsed = sharedQuestionDataSchema.safeParse(item.data);
        const groups = parsed.success ? parsed.data.data : [];
        const count = groups.reduce((sum, group) => sum + group.questions.length, 0);
        return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{item.sourceJob.documentAsset.originalName}</h2><p className="mt-1 text-sm text-slate-600">{item.owner.name || item.owner.email || "Người dùng"} · {item.createdAt.toLocaleString("vi-VN")}</p><p className="mt-1 text-xs text-slate-500">{count} câu · {(item.sourceJob.documentAsset.sizeBytes / 1024 / 1024).toFixed(1)} MB PDF{item.sourceJob.audioAsset ? ` · Audio: ${item.sourceJob.audioAsset.originalName}` : ""}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{item.status}</span></div>
          {!parsed.success ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Dữ liệu câu hỏi không hợp lệ; không nên duyệt.</p> : null}
          {groups.length ? <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-semibold">Xem toàn bộ {count} câu hỏi đã gửi</summary><div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto pr-2">{groups.flatMap((group, groupIndex) => group.questions.map((question, questionIndex) => <div key={`${groupIndex}-${questionIndex}`} className="rounded-lg bg-white p-3 text-sm"><p className="font-semibold">Nhóm {groupIndex + 1} · Part {question.part} · {question.content || "Câu hỏi theo media/đoạn văn"}</p>{group.group?.passageText ? <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-slate-600">{group.group.passageText}</p> : null}<ul className="mt-2 space-y-1 text-slate-600">{Object.entries(question.options).map(([key, value]) => <li key={key}>{key}. {String(value)}</li>)}</ul><p className="mt-2 font-bold text-emerald-700">Đáp án: {question.correctAnswer}</p></div>))}</div></details> : null}
          {item.status === "PENDING" ? <ContributionControls key={item.updatedAt.toISOString()} id={item.id} expectedUpdatedAt={item.updatedAt.toISOString()} hasAudio={groups.some(group => Boolean(group.group?.audioAssetId))} hasImages={groups.some(group => Boolean(group.group?.imageAssetId))} /> : <p className="mt-4 text-xs text-slate-500">{item.reviewedAt?.toLocaleString("vi-VN")} · {item.reviewer?.name || item.reviewer?.email || "Người duyệt"}{item.reviewNote ? ` · ${item.reviewNote}` : ""}</p>}
          {item.status === "REJECTED" && item.owner.id === admin.id ? <Link className="mt-4 inline-block font-semibold text-blue-700 underline" href={`/admin/contributions/${item.id}/edit`}>Sửa và gửi lại bộ câu hỏi →</Link> : null}
        </article>;
      })}
      {!contributions.length ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Không có tài liệu trong trạng thái này.</p> : null}
    </div>
    <div className="mt-5 flex items-center justify-between text-sm">{page > 1 ? <Link className="font-semibold text-blue-600" href={`/admin/contributions?status=${status}&page=${page - 1}`}>← Trang trước</Link> : <span />}{page < totalPages ? <Link className="font-semibold text-blue-600" href={`/admin/contributions?status=${status}&page=${page + 1}`}>Trang sau →</Link> : null}</div>
  </AdminShell>;
}
