"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function AppHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const initials = session?.user?.name?.split(" ").slice(-2).map((part) => part[0]).join("").toUpperCase();
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="TOEIC Mini Trainer - Trang chủ">
          <span className="brand-mark" aria-hidden="true"><span>TM</span></span>
          <span className="brand-copy"><strong>TOEIC</strong><small>MINI TRAINER</small></span>
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link href="/" className={pathname === "/" ? "is-active" : ""}>Luyện tập</Link><Link href="/history" className={pathname.startsWith("/history") ? "is-active" : ""}>Lịch sử</Link><Link href="/coach" className={pathname.startsWith("/coach") ? "is-active" : ""}>AI Coach</Link><Link href="/admin/extract" className={pathname.startsWith("/admin") ? "is-active" : ""}>Kho đề</Link>
        </nav>
        <div className="account-area">
          {status === "loading" ? <span className="account-skeleton" aria-label="Đang tải tài khoản" /> : session?.user ? (
            <><button type="button" className="avatar-button" title="Đăng xuất" onClick={() => signOut({ callbackUrl: "/" })}>{session.user.image ? <img src={session.user.image} alt="" /> : <span>{initials || "ME"}</span>}</button><span className="account-name">{session.user.name?.split(" ").at(-1) || "Tài khoản"}</span></>
          ) : <button type="button" className="login-button" onClick={() => signIn("google", { callbackUrl: "/" })}>Đăng nhập</button>}
        </div>
      </div>
    </header>
  );
}
