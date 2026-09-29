import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import AdminShell from "../_components/AdminShell";
import { AdminAccessDenied, adminUser } from "../_components/admin-access";

export const runtime = "nodejs";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const admin = await adminUser();
  if (!admin) return <AdminAccessDenied />;
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10000)) : 1;
  const [total, events] = await Promise.all([
    prisma.authorizationAuditEvent.count(),
    prisma.authorizationAuditEvent.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, select: { id: true, action: true, targetType: true, targetId: true, reason: true, createdAt: true, actor: { select: { name: true, email: true } } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 30));

  return <AdminShell title="Nhật ký quản trị" description="Dấu vết cấp quyền, khóa tài khoản, xem nguồn và duyệt/xuất bản nội dung. Chỉ đọc; không thể sửa qua giao diện.">
    <p className="mb-3 text-sm text-slate-500">{total} sự kiện · Trang {page}/{totalPages}</p>
    <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-5 shadow-sm">{events.map((event) => <li key={event.id} className="py-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-slate-900">{event.action}</p><time className="text-xs text-slate-500">{event.createdAt.toLocaleString("vi-VN")}</time></div><p className="mt-1 text-sm text-slate-600">{event.actor.name || event.actor.email || "Tài khoản quản trị"} · {event.targetType}</p>{event.reason ? <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{event.reason}</p> : null}<p className="mt-2 break-all text-[11px] text-slate-400">Đối tượng: {event.targetId}</p></li>)}</ol>
    {!events.length ? <p className="mt-3 rounded-xl bg-white p-5 text-sm text-slate-500">Chưa có sự kiện.</p> : null}
    <div className="mt-5 flex items-center justify-between text-sm">{page > 1 ? <Link className="font-semibold text-blue-600" href={`/admin/audit?page=${page - 1}`}>← Trang trước</Link> : <span />}{page < totalPages ? <Link className="font-semibold text-blue-600" href={`/admin/audit?page=${page + 1}`}>Trang sau →</Link> : null}</div>
  </AdminShell>;
}
