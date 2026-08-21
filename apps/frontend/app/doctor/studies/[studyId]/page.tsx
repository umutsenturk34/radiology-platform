"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PilotBanner } from "@/components/layout/pilot-banner";
import { ApiClientError } from "@/lib/api";
import { getStudyDetail, getStudyLock, startReading } from "@/features/studies/api";

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default function DoctorStudyWorkspacePage() {
  const params = useParams<{ studyId: string }>();
  const studyId = params.studyId;
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["study", studyId], queryFn: () => getStudyDetail(studyId) });
  const lock = useQuery({ queryKey: ["study", studyId, "lock"], queryFn: () => getStudyLock(studyId), retry: false });
  const reading = useMutation({
    mutationFn: () => startReading(studyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "lock"] });
      void queryClient.invalidateQueries({ queryKey: ["studies", "doctor"] });
    },
  });

  if (detail.isLoading) return <main className="p-6">Tetkik yükleniyor…</main>;
  if (detail.isError || !detail.data) return <main className="p-6" role="alert">Tetkik ayrıntısı yüklenemedi.</main>;

  const study = detail.data;
  const lockDetails = reading.error instanceof ApiClientError && reading.error.code === "STUDY_LOCKED"
    ? reading.error.details
    : undefined;
  const lockError = Boolean(lockDetails);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <PilotBanner />
        <Link className="text-sm font-medium text-sky-800 hover:underline" href="/doctor/studies">← Okuma havuzu</Link>
        <header className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="text-xs font-semibold uppercase tracking-wide text-sky-800">{study.category} · {study.status}</p><h1 className="mt-1 text-2xl font-semibold">{study.study.description ?? "Tetkik tanımı yok"}</h1><p className="mt-1 font-mono text-sm text-slate-600">Accession: {study.accessionNumber}</p></div>{study.status === "UNREAD" ? <button className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={reading.isPending} onClick={() => reading.mutate()} type="button">{reading.isPending ? "Okuma başlatılıyor…" : "Okumayı başlat"}</button> : null}</div>
          {lockError ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">Tetkik kilitli. Sahip: {String(lockDetails?.ownerDisplayName ?? "bilinmiyor")} · Rol: {String(lockDetails?.ownerRole ?? "bilinmiyor")} · Kilit zamanı: {formatDate(typeof lockDetails?.lockedAt === "string" ? lockDetails.lockedAt : null)}</p> : null}
        </header>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Hasta</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Ad</dt><dd>{study.patient.displayName}</dd></div><div><dt className="text-slate-500">Hasta ID</dt><dd>{study.patient.externalPatientId}</dd></div><div><dt className="text-slate-500">Doğum tarihi</dt><dd>{study.patient.birthDate ?? "—"}</dd></div><div><dt className="text-slate-500">Cinsiyet</dt><dd>{study.patient.gender ?? "—"}</dd></div></dl></div>
          <div className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Tetkik ve SLA</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Hastane</dt><dd>{study.hospital.name}</dd></div><div><dt className="text-slate-500">Modality</dt><dd>{study.study.modality ?? "—"}</dd></div><div><dt className="text-slate-500">Geliş</dt><dd>{formatDate(study.arrivalAt)}</dd></div><div><dt className="text-slate-500">SLA son zamanı</dt><dd>{formatDate(study.sla.deadlineAt)}</dd></div></dl></div>
        </section>
        <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Çalışma kilidi</h2>{lock.isLoading ? <p className="mt-2 text-sm">Kilit durumu yükleniyor…</p> : null}{lock.isError ? <p className="mt-2 text-sm text-red-800" role="alert">Kilit durumu alınamadı; çalışma güvenli kabul edilmez.</p> : null}{lock.data ? <p className="mt-2 text-sm">{lock.data.locked ? `Kilitli · ${lock.data.ownerDisplayName ?? "Bilinmeyen sahip"} (${lock.data.ownerRole ?? "—"}) · ${formatDate(lock.data.lockedAt)}` : "Kilit yok"}</p> : null}</section>
        <p className="text-sm text-slate-600">Klinik bilgi ve PACS viewer verisi mevcut study sözleşmesinde henüz sağlanmadığı için bu ekranda gösterilmez.</p>
      </div>
    </main>
  );
}
