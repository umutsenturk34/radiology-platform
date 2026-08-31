"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PilotBanner } from "@/components/layout/pilot-banner";
import { ForbiddenState } from "@/components/layout/forbidden-state";
import { ApiClientError } from "@/lib/api";
import { BrowserAudioRecorder } from "@/features/studies/browser-audio-recorder";
import { useAuthStore } from "@/features/auth/auth-store";
import {
  getStudyDetail,
  completeReading as completeStudyReading,
  getStudyPacsViewer,
  listStudyDictations,
  listStudyInformation,
  listStudyPacsSeries,
  startReading,
} from "@/features/studies/api";

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function formatDuration(value: number | null) {
  if (value === null) return "—";
  const totalSeconds = Math.round(value / 1000);
  return `${Math.floor(totalSeconds / 60)} dk ${totalSeconds % 60} sn`;
}

function formatSeconds(value: number | null) {
  if (value === null) return "—";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours > 0 ? `${hours} sa ${minutes} dk` : `${minutes} dk`;
}

function completionErrorMessage(error: unknown) {
  if (!(error instanceof ApiClientError)) return "Okuma tamamlanamadı. Lütfen bağlantınızı kontrol edip tekrar deneyin.";

  switch (error.code) {
    case "LOCK_NOT_OWNED":
      return "Çalışma kilidi size ait değil. Okumayı tamamlamak için size ait geçerli bir kilit gerekir.";
    case "STUDY_LOCKED": {
      const owner = typeof error.details?.ownerDisplayName === "string" ? error.details.ownerDisplayName : "başka bir kullanıcı";
      return `Çalışma ${owner} tarafından kilitli. Kilit sahibi olmadan okuma tamamlanamaz.`;
    }
    case "DICTATION_REQUIRED":
      return "Backend tamamlanmış bir dikte bulamadı. Dikte kaydının COMPLETED durumda olduğunu doğrulayıp tekrar deneyin.";
    case "INVALID_STATE_TRANSITION": {
      const currentStatus = typeof error.details?.currentStatus === "string" ? error.details.currentStatus : undefined;
      return currentStatus
        ? `Tetkik artık ${currentStatus} durumunda; okuma yalnız READING durumunda tamamlanabilir.`
        : "Tetkik artık okuma tamamlamaya uygun durumda değil. Güncel tetkik bilgisini kontrol edin.";
    }
    case "STUDY_NOT_ASSIGNED_TO_USER":
      return "Bu tetkik size atanmadığı için okuma tamamlanamaz.";
    case "EXTERNAL_LOCK_CONFLICT":
      return "Tetkik hastane hekimi iş akışı tarafından tutuluyor; okuma tamamlanamaz.";
    default:
      return `Okuma backend tarafından reddedildi (${error.code}). ${error.message}`;
  }
}

export default function DoctorStudyWorkspacePage() {
  const params = useParams<{ studyId: string }>();
  const studyId = params.studyId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.id;
  const detail = useQuery({ queryKey: ["study", studyId], queryFn: () => getStudyDetail(studyId) });
  const dictations = useQuery({ queryKey: ["study", studyId, "dictations"], queryFn: () => listStudyDictations(studyId), retry: false });
  const pacsViewer = useQuery({ queryKey: ["study", studyId, "pacs", "viewer"], queryFn: () => getStudyPacsViewer(studyId), retry: false });
  const pacsSeries = useQuery({ queryKey: ["study", studyId, "pacs", "series"], queryFn: () => listStudyPacsSeries(studyId), retry: false });
  const information = useQuery({ queryKey: ["study", studyId, "information"], queryFn: () => listStudyInformation(studyId), retry: false });
  const reading = useMutation({
    mutationFn: () => startReading(studyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      void queryClient.invalidateQueries({ queryKey: ["studies", "doctor"] });
    },
  });
  const completion = useMutation({
    mutationFn: () => {
      const completedDictation = dictations.data?.find((dictation) => dictation.status === "COMPLETED");
      if (!completedDictation) throw new Error("Completed dictation is required.");
      return completeStudyReading(studyId, completedDictation.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["studies", "doctor"] });
      router.replace("/doctor/studies");
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "dictations"] });
    },
  });

  if (detail.isLoading) return <main className="p-6">Tetkik yükleniyor…</main>;
  if (detail.isError && detail.error instanceof ApiClientError && detail.error.status === 403) return <main className="p-6"><ForbiddenState /></main>;
  if (detail.isError || !detail.data) return <main className="p-6" role="alert">Tetkik ayrıntısı yüklenemedi.</main>;

  const study = detail.data;
  const lockDetails = reading.error instanceof ApiClientError && reading.error.code === "STUDY_LOCKED"
    ? reading.error.details
    : undefined;
  const lockError = Boolean(lockDetails);
  const completedDictation = dictations.data?.find((dictation) => dictation.status === "COMPLETED");
  const hasOwnDoctorLock = currentUser?.role === "DOCTOR"
    && study.lock.locked
    && study.lock.ownerUserId === currentUserId
    && study.lock.ownerRole === "DOCTOR";
  const canCompleteReading = study.status === "READING" && Boolean(completedDictation) && hasOwnDoctorLock;
  const completionDisabledReason = !completedDictation
    ? "Tamamlanmış dikte kaydı bulunmadığı için okuma tamamlanamaz."
    : currentUser?.role !== "DOCTOR"
      ? "Aktif doktor oturumu doğrulanamadığı için okuma tamamlanamaz."
    : !study.lock.locked
      ? "Çalışma kilidi yok. READING durumunda kilidi yeniden alma için mevcut API sözleşmesinde güvenli bir action bulunmuyor."
      : !hasOwnDoctorLock
        ? `Çalışma kilidi ${study.lock.ownerDisplayName ?? "başka bir kullanıcı"} (${study.lock.ownerRole ?? "rol bilinmiyor"}) kullanıcısına ait. Yalnız kilit sahibi okuma tamamlayabilir.`
        : null;

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
          <div className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Tetkik ve SLA</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Hastane</dt><dd>{study.hospital.name}</dd></div><div><dt className="text-slate-500">Modality</dt><dd>{study.study.modality ?? "—"}</dd></div><div><dt className="text-slate-500">Geliş</dt><dd>{formatDate(study.arrivalAt)}</dd></div><div><dt className="text-slate-500">SLA son zamanı</dt><dd>{formatDate(study.sla.deadlineAt)}</dd></div><div><dt className="text-slate-500">SLA durumu</dt><dd>{study.sla.state ?? "—"}</dd></div><div><dt className="text-slate-500">Kalan süre</dt><dd>{formatSeconds(study.sla.remainingSeconds)}</dd></div><div><dt className="text-slate-500">Study UID</dt><dd className="break-all">{study.study.studyInstanceUid ?? "—"}</dd></div><div><dt className="text-slate-500">Harici order</dt><dd>{study.study.externalOrderId ?? "—"}</dd></div></dl></div>
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Atama ve iş akışı</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Doktor</dt><dd>{study.assignment.doctor?.displayName ?? "Atanmamış"}</dd></div><div><dt className="text-slate-500">Raportör</dt><dd>{study.assignment.reporter?.displayName ?? "Atanmamış"}</dd></div><div><dt className="text-slate-500">Görüntüler hazır</dt><dd>{formatDate(study.timestamps.imagesAvailableAt)}</dd></div><div><dt className="text-slate-500">Okuma başlangıcı</dt><dd>{formatDate(study.timestamps.readingStartedAt)}</dd></div></dl></div>
          <div className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Dikte kayıtları</h2>{dictations.isLoading ? <p className="mt-2 text-sm">Dikte kayıtları yükleniyor…</p> : null}{dictations.isError ? <p className="mt-2 text-sm text-red-800" role="alert">Dikte kayıtları alınamadı.</p> : null}{dictations.data?.length === 0 ? <p className="mt-2 text-sm text-slate-600">Bu study için henüz dikte kaydı yok.</p> : null}{dictations.data?.length ? <ul className="mt-2 space-y-2 text-sm">{dictations.data.map((dictation) => <li className="rounded border border-slate-200 p-2" key={dictation.id}><p className="font-medium">{dictation.status} · {dictation.doctor.displayName}</p><p className="text-slate-600">Başlangıç: {formatDate(dictation.startedAt)} · Süre: {formatDuration(dictation.durationMs)}</p>{dictation.failureReason ? <p className="mt-1 text-red-800">Hata: {dictation.failureReason}</p> : null}</li>)}</ul> : null}<p className="mt-3 text-xs text-slate-500">Tarayıcıdan kayıt alma FRONTEND-009 kapsamında eklenir.</p></div>
        </section>
        <BrowserAudioRecorder enabled={study.status === "READING" && hasOwnDoctorLock} onCompleted={() => void queryClient.invalidateQueries({ queryKey: ["study", studyId, "dictations"] })} studyId={studyId} />
        {study.status === "READING" ? <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Okumayı tamamla</h2><p className="mt-2 text-sm text-slate-600">Backend yalnız tamamlanmış bir dikte ve size ait geçerli doktor kilidi ile tetkiki raportör kuyruğuna aktarır.</p>{completion.error ? <p className="mt-2 text-sm text-red-800" role="alert">{completionErrorMessage(completion.error)}</p> : null}<button className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!canCompleteReading || completion.isPending} onClick={() => completion.mutate()} type="button">{completion.isPending ? "Tamamlanıyor…" : "Okumayı tamamla"}</button>{completionDisabledReason ? <p className="mt-2 text-xs text-slate-600">{completionDisabledReason}</p> : null}</section> : null}
        <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Çalışma kilidi</h2><p className="mt-2 text-sm">{study.lock.locked ? `Kilitli · ${study.lock.ownerDisplayName ?? "Bilinmeyen sahip"} (${study.lock.ownerRole ?? "—"}) · ${formatDate(study.lock.lockedAt)}` : "Kilit yok"}</p>{study.lock.locked && study.lock.expiresInSeconds !== null ? <p className="mt-1 text-xs text-slate-600">Kalan kilit süresi: {formatSeconds(study.lock.expiresInSeconds)}</p> : null}</section>
        <section className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-slate-300 bg-white p-4 text-sm"><h2 className="font-semibold">Klinik bilgi</h2>{study.clinicalData ? <dl className="mt-2 space-y-2"><div><dt className="text-slate-500">Ön tanı</dt><dd>{study.clinicalData.preDiagnosis ?? "Gönderilmedi"}</dd></div><div><dt className="text-slate-500">İstem nedeni</dt><dd>{study.clinicalData.requestReason ?? "Gönderilmedi"}</dd></div><div><dt className="text-slate-500">Hasta şikâyeti</dt><dd>{study.clinicalData.patientComplaint ?? "Gönderilmedi"}</dd></div><div><dt className="text-slate-500">İsteyen hekim / bölüm</dt><dd>{study.clinicalData.requestingPhysician ?? "Gönderilmedi"} · {study.clinicalData.department ?? "Gönderilmedi"}</dd></div></dl> : <p className="mt-2 text-slate-600">Hastane bu tetkik için klinik bilgi göndermedi.</p>}</section>
          <section className="rounded-lg border border-slate-300 bg-white p-4 text-sm"><h2 className="font-semibold">PACS</h2>{pacsViewer.isLoading || pacsSeries.isLoading ? <p className="mt-2">PACS bilgisi yükleniyor…</p> : null}{pacsViewer.isError || pacsSeries.isError ? <p className="mt-2 text-red-800" role="alert">PACS bilgisi alınamadı.</p> : null}{pacsViewer.data && !pacsViewer.data.available ? <p className="mt-2 text-slate-600">Viewer kullanılamıyor{pacsViewer.data.reason ? `: ${pacsViewer.data.reason}` : "."}</p> : null}{pacsViewer.data?.available && pacsViewer.data.viewerUrl ? <a className="mt-2 inline-block font-medium text-sky-800 hover:underline" href={pacsViewer.data.viewerUrl} rel="noreferrer" target="_blank">PACS viewer&apos;ı aç</a> : null}{pacsSeries.data?.length === 0 ? <p className="mt-2 text-slate-600">PACS serisi bulunmuyor.</p> : null}{pacsSeries.data?.length ? <ul className="mt-2 space-y-1 text-slate-700">{pacsSeries.data.map((series) => <li key={series.seriesInstanceUid}>{series.seriesNumber ?? "—"}. {series.seriesDescription ?? "Tanımsız seri"} · {series.imageCount ?? "—"} görüntü</li>)}</ul> : null}</section>
          <section className="rounded-lg border border-slate-300 bg-white p-4 text-sm"><h2 className="font-semibold">Information</h2>{information.isLoading ? <p className="mt-2">Notlar yükleniyor…</p> : null}{information.isError ? <p className="mt-2 text-red-800" role="alert">Information notları alınamadı.</p> : null}{information.data?.length === 0 ? <p className="mt-2 text-slate-600">Bu study için Information notu yok.</p> : null}{information.data?.length ? <ul className="mt-2 space-y-2">{information.data.map((note) => <li className="rounded border border-slate-200 p-2" key={note.id}><p>{note.content}</p><p className="mt-1 text-xs text-slate-600">{note.author.displayName} · {formatDate(note.updatedAt)} · v{note.versionCount}</p></li>)}</ul> : null}</section>
        </section>
        <section className="rounded-lg border border-slate-300 bg-white p-4 text-sm"><h2 className="font-semibold">Operasyonel işaretler</h2><ul className="mt-2 flex flex-wrap gap-2 text-slate-700"><li className="rounded bg-slate-100 px-2 py-1">Information: {study.flags.hasInformation ? "var" : "yok"}</li><li className="rounded bg-slate-100 px-2 py-1">Görüntü eksik: {study.flags.imageMissing ? "evet" : "hayır"}</li><li className="rounded bg-slate-100 px-2 py-1">Revizyon: {study.flags.hasRevisionRequest ? "var" : "yok"}</li><li className="rounded bg-slate-100 px-2 py-1">Açık kardeş tetkik: {study.flags.hasUnreportedSiblingStudy ? "var" : "yok"}</li></ul></section>
      </div>
    </main>
  );
}
