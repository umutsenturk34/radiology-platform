"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClientError } from "@/lib/api";
import { login } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/auth-store";

const destinationByRole = {
  DOCTOR: "/doctor/studies",
  REPORTER: "/reporter/studies",
  OPERATION: "/operation",
  MANAGER: "/manager",
} as const;

export function LoginForm() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError("E-posta ve parola zorunludur.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Geçerli bir e-posta adresi girin.");
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await login({ email: normalizedEmail, password });
      setUser(user);
      router.replace(destinationByRole[user.role]);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setError(
          cause.code === "INVALID_CREDENTIALS"
            ? "E-posta veya parola hatalı."
            : cause.message,
        );
      } else {
        setError("Oturum açılamadı. Lütfen tekrar deneyin.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-slate-800">
        E-posta
        <input className="mt-1 block w-full rounded-md border bg-white px-3 py-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Parola
        <input className="mt-1 block w-full rounded-md border bg-white px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      </label>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      <button className="w-full rounded-md bg-sky-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Oturum açılıyor…" : "Oturum aç"}
      </button>
    </form>
  );
}
