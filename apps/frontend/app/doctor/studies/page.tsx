"use client";

import { useQuery } from "@tanstack/react-query";

import { PilotBanner } from "@/components/layout/pilot-banner";
import { listDoctorStudies, type StudyListItem } from "@/features/studies/api";

const categoryLabel = { ACIL: "Acil", YOGUN_BAKIM: "Yoğun Bakım", YATAN: "Yatan", NORMAL: "Normal / Poliklinik" } as const;

function formatSla(study: StudyListItem) {
  if (!study.sla) return "SLA bilgisi yok";
  if (study.sla.state === "OVERDUE") return "Gecikmiş";
  if (typeof study.sla.remainingSeconds === "number") return `${Math.max(0, Math.ceil(study.sla.remainingSeconds / 60))} dk kaldı`;
  return study.sla.state;
}

export default function DoctorStudiesPage() {
  const studies = useQuery({ queryKey: ["studies", "doctor", "unread"], queryFn: listDoctorStudies });

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-950"><div className="mx-auto max-w-7xl space-y-6"><PilotBanner /><div><p className="text-sm font-medium text-sky-700">Doktor çalışma alanı</p><h1 className="text-3xl font-semibold">Okuma havuzu</h1></div>{studies.isLoading ? <p className="rounded-lg border bg-white p-6">Tetkikler yükleniyor…</p> : null}{studies.isError ? <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800" role="alert">Tetkik havuzu yüklenemedi. Lütfen tekrar deneyin.</p> : null}{studies.data?.data.length === 0 ? <p className="rounded-lg border bg-white p-6">Okuma havuzunda uygun tetkik yok.</p> : null}{studies.data?.data.length ? <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-slate-700"><tr><th className="p-3">Hasta</th><th>Accession</th><th>Tetkik</th><th>Hastane</th><th>Kategori</th><th>Durum</th><th>SLA</th></tr></thead><tbody>{studies.data.data.map((study) => <tr className="border-t" key={study.id}><td className="p-3"><p className="font-medium">{study.patient.displayName}</p><p className="text-slate-500">{study.patient.externalPatientId}</p></td><td>{study.accessionNumber}</td><td>{study.studyDescription}{study.modality ? ` (${study.modality})` : ""}</td><td>{study.hospital.shortName}</td><td>{categoryLabel[study.category]}</td><td>{study.status}</td><td>{formatSla(study)}</td></tr>)}</tbody></table></div> : null}</div></main>;
}
