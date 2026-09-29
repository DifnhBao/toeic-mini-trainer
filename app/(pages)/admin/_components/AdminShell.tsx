import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";

const links = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/contributions", label: "Duyệt đóng góp" },
  { href: "/admin/ingestions", label: "Tài liệu & xử lý" },
  { href: "/admin/questions", label: "Kho câu hỏi" },
  { href: "/admin/audit", label: "Nhật ký quản trị" },
  { href: "/admin/extract", label: "Nhập PDF" },
  { href: "/admin/import", label: "Nhập JSON" },
];

export default function AdminShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <div className="page-shell grid gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="self-start rounded-2xl bg-slate-900 p-4 text-white lg:sticky lg:top-24">
          <p className="mb-4 px-3 text-[11px] font-bold uppercase tracking-[.2em] text-slate-400">Quản trị hệ thống</p>
          <nav aria-label="Điều hướng quản trị" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {links.map((item) => <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white">{item.label}</Link>)}
          </nav>
          <p className="mt-6 border-t border-slate-700 px-3 pt-4 text-xs leading-relaxed text-slate-400">Chỉ xuất bản nội dung đã kiểm tra bản quyền, đáp án và media.</p>
        </aside>
        <main className="min-w-0 pb-16">
          <div className="mb-7">
            <span className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">TOEIC Mini Trainer / Admin</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
