"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ForbiddenState } from "@/components/layout/forbidden-state";
import { PilotBanner } from "@/components/layout/pilot-banner";
import { useAuthStore } from "@/features/auth/auth-store";
import {
  getDictationPlayback,
  getStudyDetail,
  getStudyReport,
  heartbeatStudyLock,
  listStudyDictations,
  listStudyInformation,
  listStudyReportVersions,
  resumeTranscription,
  saveStudyReportDraft,
  startTranscription,
} from "@/features/studies/api";
import { ApiClientError } from "@/lib/api";

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function formatDuration(value: number | null) {
  if (value === null) return "—";
  const totalSeconds = Math.round(value / 1000);
  return `${Math.floor(totalSeconds / 60)} dk ${totalSeconds % 60} sn`;
}

function actionErrorMessage(error: unknown, action: "start" | "resume" | "save" | "playback" | "versions") {
  if (!(error instanceof ApiClientError)) return "İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.";
  if (action === "versions" && error.status === 404) {
    return "Rapor sürüm geçmişi backend tarafından henüz yayınlanmadı (GET /studies/:id/report/versions, HTTP 404). Aktif sürüm bilgisi gerçek rapor endpointinden gösterilmeye devam ediyor.";
  }
  if (error.code === "STUDY_LOCKED") {
    const owner = typeof error.details?.ownerDisplayName === "string" ? error.details.ownerDisplayName : "başka bir kullanıcı";
    return `Çalışma ${owner} tarafından kilitli; işlem yapılamaz.`;
  }
  if (error.code === "LOCK_NOT_OWNED") return "Çalışma kilidi size ait değil; taslak değiştirilemez.";
  if (error.code === "INVALID_STATE_TRANSITION") return action === "start" ? "Tetkik artık yazım başlatmaya uygun durumda değil." : action === "resume" ? "Tetkik artık yazıma devam etmeye uygun durumda değil." : "Tetkikin güncel durumu bu işleme izin vermiyor.";
  if (error.code === "STUDY_NOT_ASSIGNED_TO_USER") return "Bu tetkik size atanmadığı için işlem yapılamaz.";
  if (error.code === "FORBIDDEN" || error.code === "HOSPITAL_ACCESS_DENIED") return "Bu tetkik için yetkiniz yok.";
  return `Backend işlemi reddetti (${error.code}). ${error.message}`;
}

export default function ReporterStudyWorkspacePage() {
  const params = useParams<{ studyId: string }>();
  const studyId = params.studyId;
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [draftContent, setDraftContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [failedContent, setFailedContent] = useState<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<"idle" | "scheduled" | "saving" | "saved" | "error">("idle");
  const [heartbeatIntervalSeconds, setHeartbeatIntervalSeconds] = useState<number | null>(null);
  const [heartbeatFailed, setHeartbeatFailed] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const loadedVersionId = useRef<string | null>(null);
  const resumeInFlight = useRef(false);
  const heartbeatStorageKey = `reporter-study-heartbeat:${studyId}`;
  const detail = useQuery({ queryKey: ["study", studyId], queryFn: () => getStudyDetail(studyId) });
  const dictations = useQuery({ queryKey: ["study", studyId, "dictations"], queryFn: () => listStudyDictations(studyId), retry: false });
  const information = useQuery({ queryKey: ["study", studyId, "information"], queryFn: () => listStudyInformation(studyId), retry: false });
  const report = useQuery({ queryKey: ["study", studyId, "report"], queryFn: () => getStudyReport(studyId), enabled: detail.data?.status === "TRANSCRIBING", retry: false });
  const reportVersions = useQuery({ queryKey: ["study", studyId, "report", "versions"], queryFn: () => listStudyReportVersions(studyId), enabled: detail.data?.status === "TRANSCRIBING", retry: false });
  const isReporter = currentUser?.role === "REPORTER";
  const ownsReporterLock = Boolean(isReporter && detail.data?.lock.locked && detail.data.lock.ownerUserId === currentUser.id && detail.data.lock.ownerRole === "REPORTER");
  const start = useMutation({
    mutationFn: () => startTranscription(studyId),
    onSuccess: (result) => {
      setHeartbeatIntervalSeconds(result.lock.heartbeatIntervalSeconds);
      window.sessionStorage.setItem(heartbeatStorageKey, String(result.lock.heartbeatIntervalSeconds));
      setHeartbeatFailed(false);
      void queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "report"] });
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "report", "versions"] });
      void queryClient.invalidateQueries({ queryKey: ["studies", "reporter"] });
    },
  });
  const resume = useMutation({
    mutationFn: () => resumeTranscription(studyId),
    onMutate: () => setIsResuming(true),
    onSuccess: (result) => {
      setHeartbeatIntervalSeconds(result.lock.heartbeatIntervalSeconds);
      window.sessionStorage.setItem(heartbeatStorageKey, String(result.lock.heartbeatIntervalSeconds));
      setHeartbeatFailed(false);
      void queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "report"] });
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "report", "versions"] });
    },
    onSettled: () => {
      resumeInFlight.current = false;
      setIsResuming(false);
    },
  });
  const playback = useMutation({ mutationFn: getDictationPlayback });
  const saveDraft = useMutation({
    mutationFn: (content: string) => saveStudyReportDraft(studyId, content),
    onMutate: () => setAutosaveState("saving"),
    onSuccess: (_result, content) => {
      setLastSavedContent(content);
      setFailedContent(null);
      setAutosaveState("saved");
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "report"] });
      void queryClient.invalidateQueries({ queryKey: ["study", studyId, "report", "versions"] });
    },
    onError: (_error, content) => {
      setFailedContent(content);
      setAutosaveState("error");
    },
  });

  useEffect(() => {
    const currentVersion = report.data?.currentVersion;
    if (!currentVersion || loadedVersionId.current === currentVersion.id) return;

    loadedVersionId.current = currentVersion.id;
    setDraftContent(currentVersion.content);
    setLastSavedContent(currentVersion.content);
    setFailedContent(null);
    setAutosaveState("idle");
  }, [report.data?.currentVersion?.id, report.data?.currentVersion?.content]);

  useEffect(() => {
    const storedInterval = Number(window.sessionStorage.getItem(heartbeatStorageKey));
    setHeartbeatIntervalSeconds(Number.isFinite(storedInterval) && storedInterval > 0 ? storedInterval : null);
    setHeartbeatFailed(false);
  }, [heartbeatStorageKey]);

  useEffect(() => {
    if (!ownsReporterLock || heartbeatIntervalSeconds === null || heartbeatFailed) return;

    const heartbeat = () => {
      void heartbeatStudyLock(studyId).catch(() => {
        setHeartbeatFailed(true);
        setHeartbeatIntervalSeconds(null);
        window.sessionStorage.removeItem(heartbeatStorageKey);
        void queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      });
    };
    const timer = window.setInterval(heartbeat, heartbeatIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [heartbeatFailed, heartbeatIntervalSeconds, heartbeatStorageKey, ownsReporterLock, queryClient, studyId]);

  const canAutosave = Boolean(
    detail.data?.status === "TRANSCRIBING" && ownsReporterLock && !heartbeatFailed,
  );

  useEffect(() => {
    if (!canAutosave || saveDraft.isPending || draftContent === lastSavedContent || failedContent === draftContent) return;

    setAutosaveState("scheduled");
    const timer = window.setTimeout(() => saveDraft.mutate(draftContent), 3000);
    return () => window.clearTimeout(timer);
  }, [canAutosave, draftContent, failedContent, lastSavedContent, saveDraft]);

  if (detail.isLoading) return <main className="p-6">Tetkik yükleniyor…</main>;
  if (detail.isError && detail.error instanceof ApiClientError && detail.error.status === 403) return <main className="p-6"><ForbiddenState /></main>;
  if (detail.isError || !detail.data) return <main className="p-6" role="alert">Tetkik ayrıntısı yüklenemedi.</main>;

  const study = detail.data;
  const completedDictations = dictations.data?.filter((dictation) => dictation.status === "COMPLETED") ?? [];
  const canStart = study.status === "WAITING_TRANSCRIPTION" && isReporter;
  const isAssignedReporter = Boolean(isReporter && currentUser && study.assignment.reporter?.id === currentUser.id);
  const canResume = study.status === "TRANSCRIBING" && isAssignedReporter && !study.lock.locked;
  const canSave = canAutosave;

  function handleDraftChange(content: string) {
    setDraftContent(content);
    setFailedContent(null);
  }

  function handleResume() {
    if (resumeInFlight.current) return;
    resumeInFlight.current = true;
    resume.mutate();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <PilotBanner />
        <Link className="text-sm font-medium text-sky-800 hover:underline" href="/reporter/studies">← Yazım kuyruğu</Link>
        <header className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="text-xs font-semibold uppercase tracking-wide text-sky-800">{study.category} · {study.status}</p><h1 className="mt-1 text-2xl font-semibold">{study.study.description ?? "Tetkik tanımı yok"}</h1><p className="mt-1 font-mono text-sm text-slate-600">Accession: {study.accessionNumber}</p></div>{study.status === "WAITING_TRANSCRIPTION" ? <button className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!canStart || start.isPending} onClick={() => start.mutate()} type="button">{start.isPending ? "Yazım başlatılıyor…" : "Yazımı başlat"}</button> : null}</div>
          {start.error ? <p className="mt-3 text-sm text-red-800" role="alert">{actionErrorMessage(start.error, "start")}</p> : null}
          {study.status === "WAITING_TRANSCRIPTION" && !isReporter ? <p className="mt-3 text-sm text-slate-600">Aktif raportör oturumu doğrulanmadığı için yazım başlatılamaz.</p> : null}
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Hasta ve tetkik</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Hasta</dt><dd>{study.patient.displayName}</dd></div><div><dt className="text-slate-500">Hasta ID</dt><dd>{study.patient.externalPatientId}</dd></div><div><dt className="text-slate-500">Hastane</dt><dd>{study.hospital.name}</dd></div><div><dt className="text-slate-500">Modality</dt><dd>{study.study.modality ?? "—"}</dd></div><div><dt className="text-slate-500">Okuma tamamlanması</dt><dd>{formatDate(study.timestamps.readingCompletedAt)}</dd></div><div><dt className="text-slate-500">SLA son zamanı</dt><dd>{formatDate(study.sla.deadlineAt)}</dd></div></dl></section>
          <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Klinik bilgi</h2>{study.clinicalData ? <dl className="mt-3 space-y-2 text-sm"><div><dt className="text-slate-500">Ön tanı</dt><dd>{study.clinicalData.preDiagnosis ?? "Gönderilmedi"}</dd></div><div><dt className="text-slate-500">İstem nedeni</dt><dd>{study.clinicalData.requestReason ?? "Gönderilmedi"}</dd></div><div><dt className="text-slate-500">Hasta şikâyeti</dt><dd>{study.clinicalData.patientComplaint ?? "Gönderilmedi"}</dd></div><div><dt className="text-slate-500">İsteyen hekim / bölüm</dt><dd>{study.clinicalData.requestingPhysician ?? "Gönderilmedi"} · {study.clinicalData.department ?? "Gönderilmedi"}</dd></div></dl> : <p className="mt-3 text-sm text-slate-600">Hastane klinik bilgi göndermedi.</p>}</section>
        </section>

        <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Raportör kilidi</h2><p className="mt-2 text-sm">{study.lock.locked ? `Kilitli · ${study.lock.ownerDisplayName ?? "Bilinmeyen sahip"} (${study.lock.ownerRole ?? "—"}) · ${formatDate(study.lock.lockedAt)}` : "Kilit yok"}</p>{canResume ? <button className="mt-3 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={isResuming} onClick={handleResume} type="button">{isResuming ? "Yazıma devam ediliyor…" : "Yazıma devam et"}</button> : null}{resume.error ? <p className="mt-2 text-sm text-red-800" role="alert">{actionErrorMessage(resume.error, "resume")}</p> : null}{heartbeatFailed ? <p className="mt-2 text-sm text-red-800" role="alert">Kilit doğrulanamadığı için taslak kaydı kapatıldı. Güncel kilidi backendden yeniden alın.</p> : null}{study.status === "TRANSCRIBING" && !isAssignedReporter ? <p className="mt-2 text-sm text-red-800" role="alert">Bu tetkik size raportör olarak atanmadığı için yazıma devam edilemez.</p> : null}{study.status === "TRANSCRIBING" && study.lock.locked && !ownsReporterLock ? <p className="mt-2 text-sm text-red-800" role="alert">Bu tetkik başka bir kullanıcı tarafından kilitli; yazıma devam edilemez.</p> : null}{study.status === "TRANSCRIBING" && !ownsReporterLock && !heartbeatFailed ? <p className="mt-2 text-sm text-red-800" role="alert">Bu tetkik üzerinde düzenleme için size ait geçerli REPORTER lock gerekir.</p> : null}</section>

        <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Dikte ve playback</h2>{dictations.isLoading ? <p className="mt-2 text-sm">Dikteler yükleniyor…</p> : null}{dictations.isError ? <p className="mt-2 text-sm text-red-800" role="alert">Dikte kayıtları alınamadı.</p> : null}{completedDictations.length === 0 && !dictations.isLoading ? <p className="mt-2 text-sm text-slate-600">Backend tamamlanmış dikte döndürmedi.</p> : null}{completedDictations.length ? <ul className="mt-3 space-y-3 text-sm">{completedDictations.map((dictation) => <li className="rounded border border-slate-200 p-3" key={dictation.id}><p className="font-medium">{dictation.doctor.displayName} · COMPLETED</p><p className="mt-1 text-slate-600">Süre: {formatDuration(dictation.durationMs)} · Tamamlanma: {formatDate(dictation.completedAt)}</p><button className="mt-2 rounded-md border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-800 disabled:opacity-50" disabled={playback.isPending} onClick={() => playback.mutate(dictation.id)} type="button">{playback.isPending ? "Ses bağlantısı alınıyor…" : "Dikte sesini yükle"}</button></li>)}</ul> : null}{playback.error ? <p className="mt-3 text-sm text-red-800" role="alert">{actionErrorMessage(playback.error, "playback")}</p> : null}{playback.data ? <audio className="mt-3 w-full" controls src={playback.data.url}>Tarayıcınız ses oynatmayı desteklemiyor.</audio> : null}</section>

        <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Rapor taslağı ve sürümler</h2>{study.status === "WAITING_TRANSCRIPTION" ? <p className="mt-2 text-sm text-slate-600">Taslak, backend yazımı başlatıp REPORTER lock oluşturduktan sonra kullanılabilir.</p> : null}{report.isLoading ? <p className="mt-2 text-sm">Rapor yükleniyor…</p> : null}{report.isError ? <p className="mt-2 text-sm text-red-800" role="alert">Rapor bilgisi alınamadı.</p> : null}{report.data ? <p className="mt-2 text-sm text-slate-600">Rapor: {report.data.status} · Aktif sürüm: {report.data.currentVersion ? `v${report.data.currentVersion.versionNumber} (${report.data.currentVersion.status})` : "yok"}</p> : null}{study.status === "TRANSCRIBING" ? <><textarea aria-label="Rapor taslağı" className="mt-3 min-h-48 w-full rounded-md border border-slate-300 p-3 text-sm" disabled={!canSave || saveDraft.isPending} onChange={(event) => handleDraftChange(event.target.value)} value={draftContent} /><button className="mt-3 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!canSave || saveDraft.isPending} onClick={() => saveDraft.mutate(draftContent)} type="button">{saveDraft.isPending ? "Kaydediliyor…" : "Taslağı kaydet"}</button>{!canSave ? <p className="mt-2 text-sm text-slate-600">Taslak kaydı yalnız TRANSCRIBING durumunda size ait REPORTER lock ile yapılabilir.</p> : null}{autosaveState === "scheduled" ? <p className="mt-2 text-sm text-slate-600">Taslak değişti; otomatik kayıt hazırlanıyor.</p> : null}{autosaveState === "saving" ? <p className="mt-2 text-sm text-slate-600" role="status">Taslak kaydediliyor…</p> : null}{autosaveState === "saved" && saveDraft.data ? <p className="mt-2 text-sm text-emerald-800" role="status">Taslak backend tarafından {formatDate(saveDraft.data.savedAt)} tarihinde kaydedildi.</p> : null}{autosaveState === "error" && saveDraft.error ? <p className="mt-2 text-sm text-red-800" role="alert">{actionErrorMessage(saveDraft.error, "save")}</p> : null}</> : null}{reportVersions.data?.length ? <ul className="mt-4 space-y-2 text-sm">{reportVersions.data.map((version) => <li className="rounded border border-slate-200 p-2" key={version.id}>v{version.versionNumber} · {version.status} · {version.source} · {version.createdBy.displayName} · {formatDate(version.createdAt)}</li>)}</ul> : null}{reportVersions.isError ? <p className="mt-2 text-sm text-red-800" role="alert">{actionErrorMessage(reportVersions.error, "versions")}</p> : null}</section>

        <section className="rounded-lg border border-slate-300 bg-white p-4"><h2 className="font-semibold">Information</h2>{information.isLoading ? <p className="mt-2 text-sm">Notlar yükleniyor…</p> : null}{information.isError ? <p className="mt-2 text-sm text-red-800" role="alert">Information notları alınamadı.</p> : null}{information.data?.length === 0 ? <p className="mt-2 text-sm text-slate-600">Bu tetkik için Information notu yok.</p> : null}{information.data?.length ? <ul className="mt-3 space-y-2 text-sm">{information.data.map((note) => <li className="rounded border border-slate-200 p-2" key={note.id}><p>{note.content}</p><p className="mt-1 text-xs text-slate-600">{note.author.displayName} · {formatDate(note.updatedAt)} · v{note.versionCount}</p></li>)}</ul> : null}</section>
      </div>
    </main>
  );
}
