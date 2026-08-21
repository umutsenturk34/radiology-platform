"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { STUDY_STATUSES, type PatientCategory, type StudyStatus } from "@radiology/shared";

import { PilotBanner } from "@/components/layout/pilot-banner";
import { listDoctorStudies, type DoctorStudiesQuery, type StudyListItem } from "@/features/studies/api";

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

function categoryClass(category: PatientCategory) {
  return category === "ACIL" || category === "YOGUN_BAKIM"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

export default function DoctorStudiesPage() {
  const [query, setQuery] = useState<DoctorStudiesQuery>({ page: 1 });
  const [searchDraft, setSearchDraft] = useState("");
  const studies = useQuery({
    queryKey: ["studies", "doctor", "unread", query],
    queryFn: () => listDoctorStudies(query),
    refetchOnMount: "always",
  });

  const hospitals = useMemo(() => {
    const entries = studies.data?.data ?? [];
    return [...new Map(entries.map((study) => [study.hospital.id, study.hospital])).values()];
  }, [studies.data]);

  function updateQuery(update: Partial<DoctorStudiesQuery>) {
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
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Doktor çalışma alanı</p>
            <h1 className="text-2xl font-semibold tracking-tight">Okuma havuzu</h1>
          </div>
          {meta ? <p className="text-sm tabular-nums text-slate-600">Bu sorguda {meta.total} tetkik</p> : null}
        </header>

        <section className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm" aria-label="Tetkik filtreleri">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            {categories.map((category) => (
              <button
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${query.category === category.value ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                key={category.label}
                onClick={() => updateQuery({ category: category.value })}
                type="button"
              >
                {category.label}
              </button>
            ))}
          </div>
          <form className="mt-3 grid gap-2 lg:grid-cols-[minmax(280px,1fr)_180px_180px_auto]" onSubmit={submitSearch}>
            <input
              aria-label="Accession, hasta veya tetkik ara"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Accession, hasta veya tetkik ara"
              value={searchDraft}
            />
            <select aria-label="Hastane filtresi" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => updateQuery({ hospitalId: event.target.value || undefined })} value={query.hospitalId ?? ""}>
              <option value="">Tüm görünen hastaneler</option>
              {hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.shortName ?? hospital.code}</option>)}
            </select>
            <select aria-label="Durum filtresi" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => updateQuery({ status: (event.target.value || undefined) as StudyStatus | undefined })} value={query.status ?? ""}>
              <option value="">Okuma havuzu (UNREAD)</option>
              {STUDY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Ara</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Modality filtresi ve kategori sayaçları backend sözleşmesinde sağlanmadığı için gösterilmez.</p>
        </section>

        {studies.isLoading ? <p className="rounded-lg border bg-white p-6">Tetkikler yükleniyor…</p> : null}
        {studies.isError ? <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800" role="alert">Tetkik havuzu yüklenemedi. Lütfen tekrar deneyin.</p> : null}
        {studies.data?.data.length === 0 ? <p className="rounded-lg border bg-white p-6">Bu filtrelerle uygun tetkik yok.</p> : null}
        {studies.data?.data.length ? (
          <section className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white"><tr><th className="px-3 py-2">Öncelik</th><th className="px-3 py-2">Hasta / ID</th><th className="px-3 py-2">Tetkik</th><th className="px-3 py-2">Accession</th><th className="px-3 py-2">Hastane</th><th className="px-3 py-2">Geliş</th><th className="px-3 py-2">SLA son zamanı</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2 text-right">Çalışma alanı</th></tr></thead>
              <tbody>
                {studies.data.data.map((study) => (
                  <tr className="border-t border-slate-200 hover:bg-sky-50" key={study.id}>
                    <td className="px-3 py-2"><span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${categoryClass(study.category)}`}>{categoryLabel[study.category]}</span></td>
                    <td className="px-3 py-2"><p className="font-medium">{study.patient.displayName}</p><p className="text-xs text-slate-500">{study.patient.externalPatientId}</p></td>
                    <td className="px-3 py-2"><p className="font-medium">{study.studyDescription ?? "Tetkik tanımı yok"}</p><p className="text-xs text-slate-500">{study.modality ?? "Modality yok"}</p></td>
                    <td className="px-3 py-2 font-mono text-xs">{study.accessionNumber}</td>
                    <td className="px-3 py-2">{study.hospital.shortName ?? study.hospital.code}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{formatDate(study.arrivalAt)}</td>
                    <td className="px-3 py-2 text-xs font-medium tabular-nums">{formatSla(study)}</td>
                    <td className="px-3 py-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{study.status}</span></td>
                    <td className="px-3 py-2 text-right"><Link className="rounded-md border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50" href={`/doctor/studies/${study.id}`}>Aç</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        {meta && meta.totalPages > 1 ? <nav aria-label="Sayfalama" className="flex items-center justify-end gap-2"><button className="rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50" disabled={meta.page === 1} onClick={() => updateQuery({ page: meta.page - 1 })} type="button">Önceki</button><span className="text-sm tabular-nums text-slate-600">Sayfa {meta.page} / {meta.totalPages}</span><button className="rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50" disabled={meta.page === meta.totalPages} onClick={() => updateQuery({ page: meta.page + 1 })} type="button">Sonraki</button></nav> : null}
      </div>
    </main>
  );
}
