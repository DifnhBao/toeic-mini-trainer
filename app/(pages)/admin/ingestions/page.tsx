import Link from "next/link";
import type { IngestionStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import AdminShell from "../_components/AdminShell";
import { AdminAccessDenied, adminUser } from "../_components/admin-access";

export const runtime = "nodejs";
const statuses: IngestionStatus[] = ["PENDING", "PROCESSING", "COMPLETED", "IMPORTING", "IMPORTED", "FAILED"];

export default async function IngestionsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const admin = await adminUser();
  if (!admin) return <AdminAccessDenied />;
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status);
  const requestedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10000)) : 1;
  const where = status ? { status } : {};
  const [total, jobs] = await Promise.all([
    prisma.ingestionJob.count({ where }),
    prisma.ingestionJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20, select: { id: true, status: true, attemptCount: true, errorCode: true, createdAt: true, completedAt: true, owner: { select: { name: true, email: true } }, documentAsset: { select: { originalName: true, sizeBytes: true, status: true } }, audioAsset: { select: { originalName: true } }, contribution: { select: { id: true, status: true } } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const href = (target: number) => `/admin/ingestions?${new URLSearchParams({ ...(status ? { status } : {}), page: String(target) })}`;

  return <AdminShell title="Tài liệu & xử lý" description="Theo dõi PDF/audio đã tải lên và trạng thái trích xuất. Tài liệu cá nhân không được mở từ dashboard này nếu người dùng chưa gửi duyệt.">
    <nav aria-label="Lọc trạng thái xử lý" className="mb-5 flex flex-wrap gap-2"><Link href="/admin/ingestions" className={`rounded-full px-3 py-2 text-xs font-semibold ${!status ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`}>Tất cả</Link>{statuses.map((item) => <Link key={item} href={`/admin/ingestions?status=${item}`} className={`rounded-full px-3 py-2 text-xs font-semibold ${status === item ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`}>{item}</Link>)}</nav>
    <p className="mb-3 text-sm text-slate-500">{total} lượt xử lý · Trang {page}/{totalPages}</p>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Tài liệu</th><th className="p-4">Người tải</th><th className="p-4">Trạng thái</th><th className="p-4">Thời gian</th></tr></thead><tbody className="divide-y divide-slate-100">{jobs.map((job) => <tr key={job.id} className="align-top"><td className="p-4"><p className="max-w-xs break-words font-semibold">{job.documentAsset.originalName}</p><p className="mt-1 text-xs text-slate-500">{(job.documentAsset.sizeBytes / 1024 / 1024).toFixed(1)} MB · PDF {job.documentAsset.status}{job.audioAsset ? ` · Audio ${job.audioAsset.originalName}` : ""}</p></td><td className="p-4"><p>{job.owner.name || "Người dùng"}</p><p className="text-xs text-slate-500">{job.owner.email}</p></td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${job.status === "FAILED" ? "bg-red-50 text-red-700" : job.status === "IMPORTED" || job.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{job.status}</span><p className="mt-2 text-xs text-slate-500">Lần xử lý: {job.attemptCount}{job.errorCode ? ` · Lỗi: ${job.errorCode}` : ""}</p>{job.contribution ? <Link className="mt-1 inline-block text-xs font-semibold text-blue-600" href={`/admin/contributions?status=${job.contribution.status}`}>Đóng góp: {job.contribution.status} →</Link> : null}</td><td className="p-4 text-xs text-slate-600">{job.createdAt.toLocaleString("vi-VN")}{job.completedAt ? <p className="mt-1">Xong: {job.completedAt.toLocaleString("vi-VN")}</p> : null}</td></tr>)}</tbody></table>{!jobs.length ? <p className="p-8 text-sm text-slate-500">Chưa có tài liệu phù hợp.</p> : null}</div>
    <div className="mt-5 flex items-center justify-between text-sm">{page > 1 ? <Link className="font-semibold text-blue-600" href={href(page - 1)}>← Trang trước</Link> : <span />}{page < totalPages ? <Link className="font-semibold text-blue-600" href={href(page + 1)}>Trang sau →</Link> : null}</div>
  </AdminShell>;
}
