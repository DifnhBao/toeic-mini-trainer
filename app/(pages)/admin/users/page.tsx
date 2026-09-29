import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import AdminShell from "../_components/AdminShell";
import { AdminAccessDenied, adminUser } from "../_components/admin-access";
import { UserControls } from "../_components/AdminActions";

export const runtime = "nodejs";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const admin = await adminUser();
  if (!admin) return <AdminAccessDenied />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const requestedPage = Number.parseInt(params.page || "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10000)) : 1;
  const where: Prisma.UserWhereInput = q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20, select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, _count: { select: { ingestionJobs: true, contributions: true, testAttempts: true } } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const url = (target: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;

  return <AdminShell title="Người dùng" description="Tìm kiếm, theo dõi hoạt động và quản lý vai trò/trạng thái. Mọi thay đổi cần lý do và được ghi nhật ký.">
    <form action="/admin/users" method="get" className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <input name="q" aria-label="Tìm người dùng" defaultValue={q} maxLength={80} placeholder="Tên hoặc email" className="min-w-52 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white">Tìm kiếm</button>
    </form>
    <p className="mb-3 text-sm text-slate-500">{total} tài khoản · Trang {page}/{totalPages}</p>
    <div className="grid gap-4">
      {users.map((user) => <article key={user.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="font-bold text-slate-900">{user.name || "Chưa có tên"}{user.id === admin.id ? " · Bạn" : ""}</h2><p className="break-all text-sm text-slate-600">{user.email || "Không có email"}</p><p className="mt-1 text-xs text-slate-500">Tham gia {user.createdAt.toLocaleDateString("vi-VN")} · {user._count.ingestionJobs} tài liệu · {user._count.contributions} đóng góp · {user._count.testAttempts} bài làm</p></div>
          <div className="flex gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{user.role}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{user.status}</span></div>
        </div>
        <UserControls id={user.id} currentRole={user.role} currentStatus={user.status} isSelf={user.id === admin.id} />
      </article>)}
      {!users.length ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Không tìm thấy tài khoản phù hợp.</p> : null}
    </div>
    <div className="mt-5 flex items-center justify-between text-sm">{page > 1 ? <Link className="font-semibold text-blue-600" href={url(page - 1)}>← Trang trước</Link> : <span />}{page < totalPages ? <Link className="font-semibold text-blue-600" href={url(page + 1)}>Trang sau →</Link> : null}</div>
  </AdminShell>;
}
