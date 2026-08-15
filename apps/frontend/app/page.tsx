import { PilotBanner } from "@/components/layout/pilot-banner";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-8">
        <PilotBanner />
        <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-sky-700">Radyoloji Platformu</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pilot uygulama hazırlanıyor</h1>
          <p className="mt-4 max-w-xl text-slate-600">
            Güvenli oturum ve çalışma alanları backend API&apos;siyle doğrulandıktan sonra burada kullanılabilir olacak.
          </p>
        </section>
      </div>
    </main>
  );
}
