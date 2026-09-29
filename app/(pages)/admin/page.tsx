import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import AdminShell from "./_components/AdminShell";
import { AdminAccessDenied, adminUser } from "./_components/admin-access";

export const runtime = "nodejs";

function countOf<T extends { _count: { _all: number } }>(rows: T[], predicate: (row: T) => boolean) {
  return rows.filter(predicate).reduce((total, row) => total + row._count._all, 0);
}

export default async function AdminDashboard() {
  const admin = await adminUser();
  if (!admin) return <AdminAccessDenied />;

  const [users, contributions, jobs, questions, recentPending, recentJobs, audit] = await Promise.all([
    prisma.user.groupBy({ by: ["role", "status"], _count: { _all: true } }),
    prisma.contentContribution.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ingestionJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.question.groupBy({ by: ["publicationStatus"], where: { ownerId: null }, _count: { _all: true } }),
    prisma.contentContribution.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true, createdAt: true, owner: { select: { name: true, email: true } }, sourceJob: { select: { documentAsset: { select: { originalName: true } } } } } }),
    prisma.ingestionJob.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, createdAt: true, documentAsset: { select: { originalName: true } } } }),
    prisma.authorizationAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, action: true, reason: true, createdAt: true, actor: { select: { name: true, email: true } } } }),
  ]);

  const metrics = [
    { label: "Người dùng", value: countOf(users, () => true), detail: `${countOf(users, (row) => row.status === "SUSPENDED")} bị tạm khóa`, href: "/admin/users" },
    { label: "Chờ duyệt", value: countOf(contributions, (row) => row.status === "PENDING"), detail: "Tài liệu đóng góp", href: "/admin/contributions" },
    { label: "Đang xử lý", value: countOf(jobs, (row) => row.status === "PENDING" || row.status === "PROCESSING"), detail: `${countOf(jobs, (row) => row.status === "FAILED")} lỗi`, href: "/admin/ingestions" },
    { label: "Đã công khai", value: countOf(questions, (row) => row.publicationStatus === "PUBLISHED"), detail: `${countOf(questions, (row) => row.publicationStatus === "LEGACY")} câu cũ cần rà soát`, href: "/admin/questions" },
  ];

  return (
    <AdminShell title="Tổng quan hệ thống" description="Theo dõi những việc cần xử lý trước khi nội dung đến tay người học.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <Link key={metric.label} href={metric.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
          <p className="text-sm font-medium text-slate-500">{metric.label}</p><strong className="mt-2 block text-4xl tracking-tight text-slate-900">{metric.value}</strong><p className="mt-2 text-xs text-slate-500">{metric.detail}</p>
        </Link>)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Đóng góp chờ duyệt</h2><Link className="text-sm font-semibold text-blue-600" href="/admin/contributions">Xem tất cả →</Link></div>
          {recentPending.length ? <ul className="divide-y divide-slate-100">{recentPending.map((item) => <li key={item.id} className="py-3"><p className="truncate text-sm font-semibold">{item.sourceJob.documentAsset.originalName}</p><p className="mt-1 text-xs text-slate-500">{item.owner.name || item.owner.email || "Người dùng"} · {item.createdAt.toLocaleDateString("vi-VN")}</p></li>)}</ul> : <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Không có tài liệu chờ duyệt.</p>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Tài liệu mới xử lý</h2><Link className="text-sm font-semibold text-blue-600" href="/admin/ingestions">Xem tất cả →</Link></div>
          {recentJobs.length ? <ul className="divide-y divide-slate-100">{recentJobs.map((job) => <li key={job.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{job.documentAsset.originalName}</p><p className="mt-1 text-xs text-slate-500">{job.createdAt.toLocaleDateString("vi-VN")}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{job.status}</span></li>)}</ul> : <p className="text-sm text-slate-500">Chưa có tài liệu nào được tải lên.</p>}
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Nhật ký thao tác gần đây</h2><Link className="text-sm font-semibold text-blue-600" href="/admin/audit">Xem tất cả →</Link></div>
        {audit.length ? <ul className="divide-y divide-slate-100">{audit.map((event) => <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"><span><strong>{event.action}</strong> · {event.actor.name || event.actor.email || "Admin"}{event.reason ? <span className="text-slate-500"> — {event.reason}</span> : null}</span><time className="text-xs text-slate-500">{event.createdAt.toLocaleString("vi-VN")}</time></li>)}</ul> : <p className="text-sm text-slate-500">Chưa có thao tác nào.</p>}
      </section>
    </AdminShell>
  );
}
