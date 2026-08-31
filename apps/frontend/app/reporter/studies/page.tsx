"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { type PatientCategory } from "@radiology/shared";

import { PilotBanner } from "@/components/layout/pilot-banner";
import { ForbiddenState } from "@/components/layout/forbidden-state";
import { ApiClientError, getApiClient } from "@/lib/api";
import { listReporterStudies, type ReporterStudiesQuery, type StudyListItem } from "@/features/studies/api";
import { useAuthStore } from "@/features/auth/auth-store";

const categories: Array<{ value: PatientCategory | undefined; label: string }> = [
  { value: undefined, label: "Tümü" },
  { value: "ACIL", label: "Acil" },
  { value: "YOGUN_BAKIM", label: "Yoğun bakım" },
  { value: "YATAN", label: "Yatan" },
  { value: "NORMAL", label: "Normal" },
];

const categoryLabel: Record<PatientCategory, string> = {
  ACIL: "Acil",
  YOGUN_BAKIM: "Yoğun bakım",
  YATAN: "Yatan",
  NORMAL: "Normal",
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function formatSla(study: StudyListItem) {
  return study.sla.deadlineAt ? formatDate(study.sla.deadlineAt) : "SLA tanımlı değil";
}

export default function ReporterStudiesPage() {
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const setAnonymous = useAuthStore((state) => state.setAnonymous);
  const [query, setQuery] = useState<ReporterStudiesQuery>({ page: 1 });
  const [searchDraft, setSearchDraft] = useState("");
  const studies = useQuery({
    queryKey: ["studies", "reporter", "waiting-transcription", query],
    queryFn: () => listReporterStudies(query),
    refetchOnMount: "always",
    retry: false,
    enabled: authStatus === "authenticated" && Boolean(getApiClient().getAccessToken()),
  });

  useEffect(() => {
    if (studies.error instanceof ApiClientError && studies.error.status === 401) {
      setAnonymous();
      router.replace("/login");
    }
  }, [router, setAnonymous, studies.error]);

  const hospitals = useMemo(() => {
    const entries = studies.data?.data ?? [];
    return [...new Map(entries.map((study) => [study.hospital.id, study.hospital])).values()];
  }, [studies.data]);

  function updateQuery(update: Partial<ReporterStudiesQuery>) {
    setQuery((current) => ({ ...current, ...update, page: update.page ?? 1 }));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateQuery({ search: searchDraft || undefined });
  }

  const meta = studies.data?.meta;

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 lg:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <PilotBanner />
        <header className="flex flex-col justify-between gap-3 border-b border-slate-300 pb-4 lg:flex-row lg:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Raportör çalışma alanı</p><h1 className="text-2xl font-semibold tracking-tight">Yazım kuyruğu</h1><p className="mt-1 text-sm text-slate-600">Yalnız backend&apos;in WAITING_TRANSCRIPTION havuzundaki tetkikler gösterilir.</p></div>
          {meta ? <p className="text-sm tabular-nums text-slate-600">Bu sorguda {meta.total} tetkik</p> : null}
        </header>

        <section className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm" aria-label="Yazım kuyruğu filtreleri">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            {categories.map((category) => <button className={`rounded-md border px-3 py-1.5 text-sm font-medium ${query.category === category.value ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`} key={category.label} onClick={() => updateQuery({ category: category.value })} type="button">{category.label}</button>)}
          </div>
          <form className="mt-3 grid gap-2 lg:grid-cols-[minmax(280px,1fr)_180px_auto]" onSubmit={submitSearch}>
            <input aria-label="Accession, hasta veya tetkik ara" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setSearchDraft(event.target.value)} placeholder="Accession, hasta veya tetkik ara" value={searchDraft} />
            <select aria-label="Hastane filtresi" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => updateQuery({ hospitalId: event.target.value || undefined })} value={query.hospitalId ?? ""}><option value="">Tüm görünen hastaneler</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.shortName ?? hospital.code}</option>)}</select>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Ara</button>
          </form>
        </section>

        {studies.isLoading ? <p className="rounded-lg border bg-white p-6">Yazım kuyruğu yükleniyor…</p> : null}
        {studies.isError && studies.error instanceof ApiClientError && studies.error.status === 403 ? <ForbiddenState /> : null}
        {studies.isError && !(studies.error instanceof ApiClientError && studies.error.status === 403) ? <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800" role="alert">Yazım kuyruğu yüklenemedi. Lütfen tekrar deneyin.</p> : null}
        {studies.data?.data.length === 0 ? <p className="rounded-lg border bg-white p-6">Yazım bekleyen tetkik yok.</p> : null}
        {studies.data?.data.length ? <section className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wide text-white"><tr><th className="px-3 py-2">Öncelik</th><th className="px-3 py-2">Hasta / ID</th><th className="px-3 py-2">Tetkik</th><th className="px-3 py-2">Accession</th><th className="px-3 py-2">Hastane</th><th className="px-3 py-2">SLA son zamanı</th><th className="px-3 py-2">Durum</th></tr></thead><tbody>{studies.data.data.map((study) => <tr className="border-t border-slate-200 hover:bg-sky-50" key={study.id}><td className="px-3 py-2"><span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{categoryLabel[study.category]}</span></td><td className="px-3 py-2"><p className="font-medium">{study.patient.displayName}</p><p className="text-xs text-slate-500">{study.patient.externalPatientId}</p></td><td className="px-3 py-2"><p className="font-medium">{study.studyDescription ?? "Tetkik tanımı yok"}</p><p className="text-xs text-slate-500">{study.modality ?? "Modality yok"}</p></td><td className="px-3 py-2 font-mono text-xs">{study.accessionNumber}</td><td className="px-3 py-2">{study.hospital.shortName ?? study.hospital.code}</td><td className="px-3 py-2 text-xs font-medium tabular-nums">{formatSla(study)}</td><td className="px-3 py-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{study.status}</span></td></tr>)}</tbody></table></section> : null}
        {meta && meta.totalPages > 1 ? <nav aria-label="Sayfalama" className="flex items-center justify-end gap-2"><button className="rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50" disabled={meta.page === 1} onClick={() => updateQuery({ page: meta.page - 1 })} type="button">Önceki</button><span className="text-sm tabular-nums text-slate-600">Sayfa {meta.page} / {meta.totalPages}</span><button className="rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50" disabled={meta.page === meta.totalPages} onClick={() => updateQuery({ page: meta.page + 1 })} type="button">Sonraki</button></nav> : null}
      </div>
    </main>
  );
}
