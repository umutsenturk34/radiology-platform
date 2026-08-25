"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { restoreSession } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/auth-store";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const setUser = useAuthStore((state) => state.setUser);
  const setAnonymous = useAuthStore((state) => state.setAnonymous);

  useEffect(() => {
    let active = true;

    void restoreSession().then(
      (user) => {
        if (active) setUser(user);
      },
      () => {
        if (active) setAnonymous();
      },
    );

    return () => {
      active = false;
    };
  }, [setAnonymous, setUser]);

  useEffect(() => {
    if (status === "anonymous" && pathname !== "/login") {
      router.replace("/login");
    }
  }, [pathname, router, status]);

  if (pathname !== "/login" && status === "checking") {
    return <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-slate-700">Oturum doğrulanıyor…</main>;
  }

  if (pathname !== "/login" && status === "anonymous") {
    return <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-slate-700">Giriş ekranına yönlendiriliyorsunuz…</main>;
  }

  return children;
}
