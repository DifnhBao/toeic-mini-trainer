import Link from "next/link";
import AppHeader from "@/app/components/AppHeader";
import { currentWebUser } from "@/app/lib/request-user";
import LibraryList from "./LibraryList";

export default async function LibraryPage() {
  const user = await currentWebUser();
  return <div className="app-page"><AppHeader /><main className="page-shell py-10">
    <p className="eyebrow">KHO BÀI</p><h1 className="text-3xl font-bold">Chọn bài có sẵn để luyện</h1>
    <p className="mt-3 text-slate-600">Quản trị viên chuẩn bị và kiểm duyệt đề, đáp án cùng audio. Bạn chỉ cần chọn bài và bắt đầu.</p>
    {user ? <LibraryList key={user.id} isAdmin={user.role === "ADMIN"} /> : <Link className="primary-button mt-6 inline-flex" href="/api/auth/signin?callbackUrl=/library">Đăng nhập để chọn bài</Link>}
  </main></div>;
}
