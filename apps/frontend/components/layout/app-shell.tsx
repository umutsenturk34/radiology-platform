"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { UserRole } from "@radiology/shared";

import { logout } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/auth-store";

const navigationByRole: Record<UserRole, Array<{ href: string; label: string }>> = {
  DOCTOR: [
    { href: "/doctor/studies", label: "Okuma havuzu" },
    { href: "/doctor/approvals", label: "Onay bekleyenler" },
  ],
  REPORTER: [
    { href: "/reporter/studies", label: "Yazılmayanlar" },
    { href: "/reporter/studies", label: "Aktif çalışma" },
  ],
  OPERATION: [
    { href: "/operation", label: "Operasyon" },
    { href: "/operation", label: "HBYS hataları" },
    { href: "/operation", label: "SLA" },
  ],
  MANAGER: [
    { href: "/manager", label: "Dashboard" },
    { href: "/manager/users", label: "Kullanıcılar" },
    { href: "/manager", label: "DevTools" },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setAnonymous = useAuthStore((state) => state.setAnonymous);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (pathname === "/login" || !user) return children;

  const items = navigationByRole[user.role];

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setAnonymous();
      router.replace("/login");
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="border-b border-slate-700 bg-slate-950 px-4 py-4 text-slate-100 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div>
            <p className="text-sm font-semibold">Radyoloji Platformu</p>
            <p className="mt-1 text-xs text-slate-400">{user.role}</p>
          </div>
          <p className="max-w-32 truncate text-right text-xs text-slate-300 lg:mt-4 lg:max-w-full lg:text-left">{user.firstName} {user.lastName}</p>
        </div>
        <nav aria-label="Ana navigasyon" className="mt-4 flex gap-2 overflow-x-auto lg:block lg:space-y-1">
          {items.map((item) => {
            const active = pathname === item.href;
            return <Link className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:block ${active ? "bg-sky-700 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`} href={item.href} key={`${item.href}-${item.label}`}>{item.label}</Link>;
          })}
        </nav>
        <button className="mt-4 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50" disabled={isLoggingOut} onClick={handleLogout} type="button">
          {isLoggingOut ? "Oturum kapatılıyor…" : "Oturumu kapat"}
        </button>
      </aside>
      <div>{children}</div>
    </div>
  );
}
