import { LoginForm } from "@/components/auth/login-form";
import { PilotBanner } from "@/components/layout/pilot-banner";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-md space-y-6 rounded-xl border bg-white p-8 shadow-sm">
        <PilotBanner />
        <div>
          <p className="text-sm font-medium text-sky-700">Radyoloji Platformu</p>
          <h1 className="mt-2 text-2xl font-semibold">Oturum aç</h1>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
