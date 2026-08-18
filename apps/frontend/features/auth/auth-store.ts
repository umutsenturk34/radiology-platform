"use client";

import { create } from "zustand";

import type { AuthUser, CurrentUser } from "./api";

type SessionStatus = "checking" | "authenticated" | "anonymous";

interface AuthState {
  user?: AuthUser | CurrentUser;
  status: SessionStatus;
  setUser: (user: AuthUser | CurrentUser) => void;
  setAnonymous: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "checking",
  setUser: (user) => set({ user, status: "authenticated" }),
  setAnonymous: () => set({ user: undefined, status: "anonymous" }),
}));
