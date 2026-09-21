import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "TOEIC Mini Trainer", template: "%s · TOEIC Mini Trainer" },
  description: "Phòng luyện TOEIC cá nhân với mini test, theo dõi tiến độ và trợ giảng AI.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><Providers>{children}</Providers></body></html>;
}
