"use client";

import { useEffect, useRef, useState } from "react";

import { createStudyDictation, uploadStudyDictation } from "./api";

type RecorderState = "idle" | "requesting" | "recording" | "uploading" | "completed" | "failed";

interface BrowserAudioRecorderProps {
  studyId: string;
  enabled: boolean;
  onCompleted: () => void;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function getSupportedMimeType() {
  return MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function BrowserAudioRecorder({ studyId, enabled, onCompleted }: BrowserAudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const startedAtRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);

  const stopMedia = () => {
    if (timerRef.current !== undefined) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
  };

  useEffect(() => () => stopMedia(), []);

  const start = async () => {
    if (!enabled || state === "requesting" || state === "recording" || state === "uploading") return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("failed");
      setError("Bu tarayıcı ses kaydını desteklemiyor.");
      return;
    }

    const preferredMimeType = getSupportedMimeType();
    if (!preferredMimeType) {
      setState("failed");
      setError("Tarayıcı backendin kabul ettiği bir ses biçimini desteklemiyor.");
      return;
    }

    setState("requesting");
    setError(undefined);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
      const mimeType = recorder.mimeType || preferredMimeType;
      const dictation = await createStudyDictation(studyId, mimeType);
      const chunks: BlobPart[] = [];

      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        stopMedia();
        setState("failed");
        setError("Tarayıcı kaydı sırasında hata oluştu; ses yüklendi sayılmıyor.");
      };
      recorder.onstop = () => {
        stopMedia();
        const durationMs = Math.max(0, Date.now() - (startedAtRef.current ?? Date.now()));
        const audio = new Blob(chunks, { type: mimeType });

        if (audio.size === 0) {
          setState("failed");
          setError("Ses verisi oluşmadı; kayıt tamamlandı sayılmıyor.");
          return;
        }

        setState("uploading");
        void uploadStudyDictation(dictation.id, audio, durationMs).then(
          () => {
            setState("completed");
            onCompleted();
          },
          () => {
            setState("failed");
            setError("Ses yüklenemedi; kayıt tamamlandı sayılmıyor.");
            onCompleted();
          },
        );
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed(Date.now() - (startedAtRef.current ?? Date.now())), 250);
      recorder.start();
      setState("recording");
    } catch (caught) {
      stopMedia();
      setState("failed");
      setError(caught instanceof DOMException && caught.name === "NotAllowedError" ? "Mikrofon izni verilmedi." : "Kayıt başlatılamadı; backend dikteyi tamamlanmış saymaz.");
    }
  };

  const stop = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const busy = state === "requesting" || state === "uploading";
  const canStart = enabled && state !== "recording" && !busy;

  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">
      <h2 className="font-semibold text-slate-950">Tarayıcı ses kaydı</h2>
      {!enabled ? <p className="mt-2 text-slate-700">Kayıt yalnızca READING durumundaki ve backend kilidi doğrulanmış tetkikte başlatılabilir.</p> : null}
      {state === "recording" ? <p className="mt-2 font-mono text-base text-red-800">Kayıt sürüyor · {formatElapsed(elapsed)}</p> : null}
      {state === "uploading" ? <p className="mt-2 text-slate-700">Ses backend&apos;e yükleniyor…</p> : null}
      {state === "completed" ? <p className="mt-2 text-emerald-800">Dikte backend tarafından tamamlandı olarak döndü.</p> : null}
      {error ? <p className="mt-2 text-red-800" role="alert">{error}</p> : null}
      <div className="mt-3 flex gap-2"><button className="rounded-md bg-sky-700 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={!canStart} onClick={() => void start()} type="button">{state === "requesting" ? "Mikrofon hazırlanıyor…" : "Kaydı başlat"}</button><button className="rounded-md border border-slate-400 px-3 py-2 font-medium disabled:opacity-50" disabled={state !== "recording"} onClick={stop} type="button">Kaydı durdur</button></div>
      <p className="mt-3 text-xs text-slate-600">Ses kalıcılığı DEVOPS-004 object storage çözülene kadar redeploy sonrası garanti edilmez.</p>
    </section>
  );
}
