import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { AuthSessionProvider } from "@/components/auth/auth-session-provider";

export const metadata: Metadata = {
  title: "Radyoloji Platformu",
  description: "Radyoloji görüntüleme ve raporlama pilotu",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr">
      <body><AuthSessionProvider>{children}</AuthSessionProvider></body>
    </html>
  );
}
