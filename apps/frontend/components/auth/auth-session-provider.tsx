"use client";

import { type ReactNode, useEffect } from "react";

import { restoreSession } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/auth-store";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const setAnonymous = useAuthStore((state) => state.setAnonymous);

  useEffect(() => {
    void restoreSession().then(setUser).catch(setAnonymous);
  }, [setAnonymous, setUser]);

  return children;
}
