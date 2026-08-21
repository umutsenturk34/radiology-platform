import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { AppProviders } from "./providers";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Radyoloji Platformu",
  description: "Radyoloji görüntüleme ve raporlama pilotu",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr">
      <body><AppProviders><AppShell>{children}</AppShell></AppProviders></body>
    </html>
  );
}
