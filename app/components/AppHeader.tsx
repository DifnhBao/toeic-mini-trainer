"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const identity = session?.user?.id || session?.user?.email || null;
  const [adminAccess, setAdminAccess] = useState<{ identity: string; allowed: boolean } | null>(null);
  useEffect(() => {
    if (status !== "authenticated" || !identity) return;
    const controller = new AbortController();
    fetch("/api/admin/access", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted) setAdminAccess({ identity, allowed: data?.isAdmin === true }); })
      .catch(() => { if (!controller.signal.aborted) setAdminAccess({ identity, allowed: false }); });
    return () => controller.abort();
  }, [status, identity]);
  const isAdmin = status === "authenticated" && adminAccess?.identity === identity && adminAccess.allowed;
  const initials = session?.user?.name?.split(" ").slice(-2).map((part) => part[0]).join("").toUpperCase();
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="TOEIC Mini Trainer - Trang chủ">
          <span className="brand-mark" aria-hidden="true"><span>TM</span></span>
          <span className="brand-copy"><strong>TOEIC</strong><small>MINI TRAINER</small></span>
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link href="/" className={pathname === "/" ? "is-active" : ""}>Luyện tập</Link><Link href="/history" className={pathname.startsWith("/history") ? "is-active" : ""}>Lịch sử</Link><Link href="/coach" className={pathname.startsWith("/coach") ? "is-active" : ""}>AI Coach</Link><Link href="/library" className={pathname === "/library" ? "is-active" : ""}>Kho bài</Link>{isAdmin ? <Link href="/admin" className={pathname === "/admin" || pathname.startsWith("/admin/") ? "is-active" : ""}>Quản trị</Link> : null}
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
