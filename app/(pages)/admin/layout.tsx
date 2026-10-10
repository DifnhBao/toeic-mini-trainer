import type { Metadata } from "next";
import { AdminAccessDenied, adminUser } from "./_components/admin-access";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!await adminUser()) return <AdminAccessDenied />;
  return children;
}
