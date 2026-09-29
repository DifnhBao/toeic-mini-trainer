import Link from "next/link";
import { currentWebUser } from "@/app/lib/request-user";
import AppHeader from "@/app/components/AppHeader";

export async function adminUser() {
  const user = await currentWebUser();
  return user?.role === "ADMIN" ? user : null;
}

export function AdminAccessDenied() {
  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-shell mx-auto max-w-2xl py-20">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Khu vực quản trị</span>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Bạn chưa có quyền truy cập</h1>
          <p className="mt-3 text-slate-600">Vui lòng đăng nhập bằng tài khoản ADMIN. Dữ liệu quản trị không được tải khi tài khoản không có quyền.</p>
          <Link className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white" href="/api/auth/signin?callbackUrl=/admin">Đăng nhập</Link>
        </div>
      </main>
    </div>
  );
}
