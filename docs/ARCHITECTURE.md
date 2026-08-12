# ARCHITECTURE.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Teknik Mimari

> **Doküman Türü:** Teknik Mimari  
> **Üst Referans:** `MASTER_SPEC.md`  
> **Proje:** `radiology-platform`  
> **Pilot Hedef:** 2–3 kullanıcının sistemi internet üzerinden uçtan uca test edebilmesi  
> **Mimari Yaklaşım:** Modüler Monolith + Adapter-Based Integrations  
> **Frontend:** Next.js + React + TypeScript  
> **Backend Runtime:** Node.js  
> **Backend Framework:** NestJS  
> **Database:** PostgreSQL  
> **ORM:** Prisma  
> **Cache / Lock / Queue Infrastructure:** Redis  
> **Background Jobs:** BullMQ  
> **Realtime:** WebSocket / Socket.IO  
> **Object Storage:** S3-Compatible Storage  
> **Pilot Frontend Hosting:** Vercel  
> **Pilot Backend Hosting:** Railway  
> **Pilot Integrations:** Mock HL7 + Test PACS + Mock HBYS

---

# 1. DOKÜMANIN AMACI

Bu doküman `MASTER_SPEC.md` içerisinde tanımlanan iş kurallarının teknik sistem mimarisine nasıl dönüştürüleceğini tanımlar.

Bu doküman:

- frontend ve backend sınırlarını,
- uygulama servislerini,
- veri akışını,
- entegrasyon katmanlarını,
- locking altyapısını,
- realtime iletişimi,
- background job yapısını,
- object storage kullanımını,
- pilot deployment modelini,
- hata toleransı yaklaşımını

belirler.

Bu dosya iş kuralı tanımlamaz.

İş kuralı için ana kaynak:

> `MASTER_SPEC.md`

olacaktır.

---

# 2. MİMARİ PRENSİP

İlk pilot sürüm için microservice mimarisi kullanılmayacaktır.

Backend:

> Modüler Monolith

olarak geliştirilecektir.

Amaç:

- hızlı geliştirme,
- düşük deployment karmaşıklığı,
- AI ajanları tarafından daha kolay yönetilebilir kod tabanı,
- test edilebilirlik,
- ileride servis ayrıştırmaya uygun modüler yapı

sağlamaktır.

Backend tek uygulama olarak deploy edilse bile iş mantığı domain bazlı modüllere ayrılacaktır.

---

# 3. ÜST SEVİYE SİSTEM MİMARİSİ

```text
                    ┌──────────────────────────┐
                    │        USERS             │
                    │                          │
                    │ Doctor                   │
                    │ Reporter                 │
                    │ Operation                │
                    │ Manager                  │
                    └────────────┬─────────────┘
                                 │
                                 │ HTTPS
                                 ▼
                    ┌──────────────────────────┐
                    │       FRONTEND           │
                    │                          │
                    │ Next.js                  │
                    │ React                    │
                    │ TypeScript               │
                    │                          │
                    │ Hosted on Vercel         │
                    └────────────┬─────────────┘
                                 │
                    REST API + WebSocket
                                 │
                                 ▼
              ┌────────────────────────────────────┐
              │            BACKEND                 │
              │                                    │
              │ Node.js                            │
              │ NestJS                             │
              │ TypeScript                         │
              │                                    │
              │ Hosted on Railway                  │
              └─────────────┬──────────────────────┘
                            │
          ┌─────────────────┼──────────────────────┐
          │                 │                      │
          ▼                 ▼                      ▼
   ┌────────────┐    ┌────────────┐       ┌───────────────┐
   │ PostgreSQL │    │   Redis    │       │ Object Storage│
   │            │    │            │       │               │
   │ Main Data  │    │ Locks      │       │ Audio Files   │
   │ Audit      │    │ Queue      │       │ Attachments   │
   │ Reports    │    │ Cache      │       │               │
   └────────────┘    └────────────┘       └───────────────┘

                            │
                            ▼
                ┌───────────────────────┐
                │ Integration Layer     │
                │                       │
                │ HL7 Adapter           │
                │ PACS Adapter          │
                │ HBYS Adapter          │
                └───────┬───────┬───────┘
                        │       │
             ┌──────────┘       └────────────┐
             ▼                               ▼
        Mock / Test                     Real Hospital
        Integrations                    Integrations
```

---

# 4. REPOSITORY YAPISI

Proje monorepo olarak tutulacaktır.

Önerilen yapı:

```text
radiology-platform/
│
├── apps/
│   │
│   ├── frontend/
│   │   └── Next.js application
│   │
│   └── backend/
│       └── NestJS application
│
├── packages/
│   │
│   └── shared/
│       ├── shared types
│       ├── enums
│       ├── API types
│       └── validation schemas
│
├── docs/
│   ├── MASTER_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── WORKFLOW_STATE_MACHINE.md
│   ├── DATA_MODEL.md
│   ├── API_CONTRACT.md
│   ├── AUTH_ROLES_PERMISSIONS.md
│   ├── INTEGRATIONS.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── TASK_QUEUE.md
│   ├── QUALITY_GATES.md
│   ├── FAILURE_RECOVERY.md
│   ├── BACKEND.md
│   ├── FRONTEND.md
│   ├── REALTIME_EVENTS.md
│   ├── TEST_SCENARIOS.md
│   └── DEPLOYMENT_PILOT.md
│
├── AGENTS.md
├── CLAUDE.md
├── CLAUDE_BACKEND_PROMPT.md
├── CODEX_FRONTEND_PROMPT.md
├── README.md
│
├── package.json
├── pnpm-workspace.yaml
└── .gitignore
```

---

# 5. PACKAGE MANAGER

Projede package manager olarak:

> pnpm

önerilmektedir.

Sebep:

- monorepo desteği,
- workspace yönetimi,
- hızlı dependency install,
- düşük disk kullanımı,
- ortak paket kullanım kolaylığı.

Workspace yapısı:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

# 6. FRONTEND MİMARİSİ

Frontend:

> Next.js + React + TypeScript

kullanacaktır.

Frontend sorumlulukları:

- kullanıcı arayüzü,
- kullanıcı interaction,
- API çağrıları,
- realtime event tüketimi,
- local UI state,
- form yönetimi,
- audio recording,
- audio playback,
- rapor editörü,
- hasta/tetkik listeleri,
- manager ekranları,
- operasyon ekranları,
- dev-tools ekranı.

Frontend iş kurallarının sahibi değildir.

Örneğin:

Frontend:

> "Bu tetkik açılabilir mi?"

kararını kendi başına vermemelidir.

Backend:

> yetki + state + lock durumunu

kontrol ederek karar vermelidir.

---

# 7. FRONTEND LIBRARY STACK

Önerilen temel frontend stack:

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Zustand
React Hook Form
Zod
Socket.IO Client
```

---

# 8. FRONTEND STATE AYRIMI

Frontend state üç kategoriye ayrılmalıdır.

## Server State

Backend'den gelen veriler.

Örnek:

- studies
- reports
- users
- hospitals
- notifications

TanStack Query ile yönetilir.

---

## UI State

Sadece kullanıcı arayüzüne ait state.

Örnek:

- açık modal
- seçili tab
- panel genişliği
- audio player state

Zustand veya local React state ile tutulabilir.

---

## Realtime State

WebSocket eventleri ile değişen server state.

Örnek:

- study lock
- study status
- HBYS result
- SLA alert
- revision alert

Realtime event geldiğinde ilgili query invalidate veya update edilmelidir.

---

# 9. BACKEND MİMARİSİ

Backend:

> Node.js + NestJS + TypeScript

kullanacaktır.

NestJS'in kullanılma nedenleri:

- modüler yapı,
- dependency injection,
- guard sistemi,
- interceptor sistemi,
- WebSocket desteği,
- validation desteği,
- test edilebilir servis yapısı,
- büyük projelerde kod organizasyonu.

---

# 10. BACKEND HTTP SERVER

NestJS üzerinde:

> Fastify Adapter

tercih edilebilir.

Sebep:

- düşük overhead,
- yüksek performans,
- iyi JSON throughput.

Ancak Fastify kullanımı geliştirme sürecini zorlaştırırsa NestJS default adapter ile devam edilebilir.

Bu tercih iş mantığını değiştiremez.

---

# 11. BACKEND DOMAIN MODÜLLERİ

Backend aşağıdaki modüllere ayrılacaktır.

```text
src/
│
├── auth/
├── users/
├── hospitals/
├── patients/
├── studies/
├── clinical-data/
├── reports/
├── dictations/
├── workflow/
├── locks/
├── sla/
├── notifications/
├── revisions/
├── addendums/
├── audit/
├── hl7/
├── pacs/
├── hbys/
├── integrations/
├── manager/
├── operation/
├── dev-tools/
└── health/
```

---

# 12. AUTH MODULE

Auth module sorumlulukları:

- login
- logout
- access token
- refresh token
- password validation
- session management
- user status validation

Pilot sürümde email/username + password authentication yeterlidir.

---

# 13. USERS MODULE

Users module:

- kullanıcı oluşturma,
- kullanıcı güncelleme,
- role assignment,
- active/inactive,
- hospital access,
- profile

işlemlerinden sorumludur.

Temel roller:

- DOCTOR
- REPORTER
- OPERATION
- MANAGER

---

# 14. HOSPITALS MODULE

Hospitals module:

- hastane tanımı,
- hastane kodu,
- hospital integration configuration,
- user-hospital authorization,
- test / production state

işlemlerini yönetir.

Yeni hastane eklendiğinde core application değişmemelidir.

---

# 15. PATIENTS MODULE

Patient entity kimlik ve temel hasta bilgilerini yönetir.

Patient:

> tetkik işi değildir.

Bir Patient birden fazla Study içerebilir.

Hasta bilgilerinin erişimi RBAC ve hospital authorization ile sınırlandırılmalıdır.

---

# 16. STUDIES MODULE

Study sistemin temel operasyon nesnesidir.

Bir Study:

- Accession Number
- patient
- hospital
- category
- modality
- clinical information
- PACS reference
- status
- assigned doctor
- assigned reporter
- SLA
- report
- dictation

ile ilişkilendirilebilir.

İş akışının ana merkezi Study olacaktır.

---

# 17. WORKFLOW MODULE

Workflow module:

> Study state machine

kurallarını uygular.

Diğer modüller doğrudan rastgele status değiştirmemelidir.

Örneğin:

```text
UNREAD
→ READING
```

geçişi workflow service tarafından gerçekleştirilmelidir.

Yanlış geçiş:

```text
UNREAD
→ HBYS_SENT
```

backend tarafından reddedilmelidir.

Kesin geçişler:

> `WORKFLOW_STATE_MACHINE.md`

dosyasında tanımlanacaktır.

---

# 18. LOCK MODULE

Lock altyapısı Redis üzerinde çalışacaktır.

Lock key örneği:

```text
lock:study:{studyId}
```

Lock value:

```json
{
  "userId": "...",
  "role": "DOCTOR",
  "lockedAt": "...",
  "sessionId": "..."
}
```

Lock mekanizması:

- acquire
- heartbeat
- renew
- release
- force release

fonksiyonlarını desteklemelidir.

---

# 19. LOCK HEARTBEAT

Kullanıcı aktif çalışırken frontend periyodik heartbeat gönderebilir.

Örnek:

```text
15–30 saniye
```

Backend Redis TTL'yi uzatır.

Tarayıcı kapanırsa heartbeat durur.

TTL sona erdiğinde lock otomatik silinir.

Böylece orphan lock oluşması engellenir.

---

# 20. DISTRIBUTED LOCK PRENSİBİ

Pilot tek backend instance ile çalışabilir.

Ancak lock altyapısı:

> backend instance memory'sinde değil Redis'te

tutulmalıdır.

Bu sayede ileride birden fazla backend instance çalıştırıldığında da locking davranışı korunur.

---

# 21. REPORT MODULE

Report module:

- draft rapor,
- reporter content,
- doctor edit,
- finalization,
- report versioning,
- report status,
- source

işlemlerini yönetir.

Rapor silinmemelidir.

Revizyonlarda yeni version oluşturulmalıdır.

---

# 22. REPORT VERSION MODELİ

Örnek:

```text
Report
│
├── Version 1
│
├── Version 2
│
└── Version 3
```

Her version:

- createdBy
- createdAt
- source
- content
- reason
- status

bilgisi taşıyabilir.

---

# 23. DICTATION MODULE

Dictation module:

- audio metadata
- audio storage path
- duration
- doctor
- study
- creation date
- upload state

tutacaktır.

Audio binary PostgreSQL'e kaydedilmemelidir.

---

# 24. AUDIO STORAGE

Ses dosyaları S3-compatible object storage içerisinde tutulmalıdır.

Örnek key:

```text
dictations/{hospitalId}/{studyId}/{dictationId}.webm
```

Database:

```text
storageKey
mimeType
duration
size
checksum
```

tutabilir.

---

# 25. SES KAYIT FORMAT

Pilot için browser MediaRecorder'ın desteklediği:

- WebM
- Opus

kombinasyonu tercih edilebilir.

Sistem gelecekte farklı formatları destekleyebilecek şekilde mimeType metadata tutmalıdır.

---

# 26. VAD / SESSİZLİK ALGILAMA

Voice Activity Detection frontend veya ayrı processing katmanında uygulanabilir.

Pilot için öncelik:

- kayıt çalışsın,
- kayıt güvenli upload olsun,
- raportör dinleyebilsin.

VAD sistemi ilk implementasyonda karmaşık hale gelirse basit silence trimming veya post-processing kullanılabilir.

Ancak API ve storage modeli VAD'den bağımsız olmalıdır.

---

# 27. POSTGRESQL

Ana relational database:

> PostgreSQL

olacaktır.

PostgreSQL içerisinde:

- users
- hospitals
- patients
- studies
- reports
- report versions
- dictations metadata
- clinical data
- notes
- assignments
- revisions
- SLA information
- HBYS delivery attempts
- audit logs

tutulacaktır.

---

# 28. ORM

ORM olarak:

> Prisma

önerilmektedir.

Prisma:

- schema yönetimi,
- migration,
- type safety,
- relations

için kullanılacaktır.

Veri modeli kesin olarak:

> `DATA_MODEL.md`

dosyasında tanımlanacaktır.

---

# 29. REDIS

Redis üç temel amaç için kullanılacaktır.

## Locking

Study lock.

## Queue Infrastructure

BullMQ job queue.

## Cache / Ephemeral Data

Gerekli kısa ömürlü veriler.

Redis:

> source of truth database değildir.

Kalıcı kritik klinik veri sadece Redis'te tutulmamalıdır.

---

# 30. BULLMQ

Background işlemler BullMQ üzerinden yürütülebilir.

Temel queue'lar:

```text
hbys-delivery
sla-check
notifications
audio-processing
integration-retry
```

Pilot için bazı queue'lar birleştirilebilir.

---

# 31. HBYS QUEUE

Hekim final onayı verdikten sonra:

```text
Report Finalized
      ↓
HBYS Job Created
      ↓
BullMQ
      ↓
HBYS Adapter
      ↓
SUCCESS / FAIL / TIMEOUT
```

UI request'i HBYS'nin cevap vermesini beklememelidir.

Gönderim async background job olarak yürütülmelidir.

---

# 32. RETRY

Integration retry policy uygulanmalıdır.

Örnek:

```text
Attempt 1
↓
fail

Attempt 2
↓
fail

Attempt 3
↓
fail

HBYS_FAILED
```

Exact retry policy `INTEGRATIONS.md` içerisinde tanımlanacaktır.

Manual retry desteklenmelidir.

---

# 33. SLA ENGINE

SLA hesaplama backend'de yapılmalıdır.

Frontend sadece sonucu göstermelidir.

Örnek data:

```json
{
  "arrivalAt": "...",
  "deadlineAt": "...",
  "remainingSeconds": 4200,
  "isWarning": false,
  "isOverdue": false
}
```

Frontend kendi saatine güvenerek business deadline üretmemelidir.

---

# 34. SLA BACKGROUND CHECK

Backend belirli aralıklarla SLA durumlarını kontrol edebilir.

Örnek:

```text
every 1 minute
```

Yaklaşan deadline:

> SLA_WARNING

Overdue:

> SLA_OVERDUE

event oluşturabilir.

---

# 35. REALTIME

Realtime altyapı için:

> Socket.IO / WebSocket

kullanılabilir.

Realtime olaylar:

- lock acquired
- lock released
- study changed
- approval waiting
- SLA warning
- HBYS failed
- HBYS sent
- revision requested
- information note added

Kesin event contract:

> `REALTIME_EVENTS.md`

içerisinde tanımlanacaktır.

---

# 36. REALTIME SOURCE OF TRUTH

WebSocket sadece notification / sync mekanizmasıdır.

Client bağlantısı kaçırırsa frontend REST API üzerinden doğru son durumu tekrar alabilmelidir.

Yani:

> WebSocket database yerine geçmez.

---

# 37. AUDIT MODULE

Audit log critical eventleri immutable mantıkta saklamalıdır.

Normal kullanıcı audit kayıtlarını değiştirememelidir.

Audit event:

```text
eventType
userId
userRole
hospitalId
studyId
timestamp
metadata
```

tutabilir.

Audit sisteminin failure'ı ana klinik işlemi mümkün olduğunca engellememeli, ancak kritik failure loglanmalıdır.

---

# 38. INFORMATION NOTES

Not sistemi normal report content'ten ayrı tutulmalıdır.

Not:

- silinmemeli,
- geçmişi korunmalı,
- edit varsa yeni version/history kaydı üretmelidir.

---

# 39. HL7 INTEGRATION LAYER

HL7 core workflow'tan ayrılmalıdır.

Örnek interface:

```ts
interface Hl7Adapter {
  receiveMessage(input: unknown): Promise<NormalizedHl7Message>;
}
```

Normalized message:

```text
hospital
patient
accessionNumber
order
category
eventType
```

içermelidir.

---

# 40. MOCK HL7

Pilot ortamda:

> MockHl7Adapter

kullanılacaktır.

DevTools üzerinden test mesajı üretilebilir.

Mock adapter gerçek workflow service'i çağırmalıdır.

Sistemin başka bir mock data yolu olmamalıdır.

---

# 41. REAL HL7

Gerçek hastane entegrasyonunda:

```text
HospitalAHl7Adapter
HospitalBHl7Adapter
```

gibi adapterlar eklenebilir.

Core business logic değişmemelidir.

---

# 42. PACS INTEGRATION

PACS adapter aşağıdaki sorumlulukları kapsayabilir:

- study lookup
- series metadata
- viewer launch data
- image availability
- PACS status

Örnek interface:

```ts
interface PacsAdapter {
  getStudy(studyRef: string): Promise<PacsStudy>;
  getViewerUrl(studyRef: string): Promise<string>;
  checkAvailability(studyRef: string): Promise<boolean>;
}
```

---

# 43. TEST PACS

Pilot ortamda:

> Orthanc

ve gerektiğinde web viewer kullanılabilir.

Test görüntüleri gerçek hasta verisi olmamalıdır.

---

# 44. HBYS INTEGRATION LAYER

HBYS adapter:

```ts
interface HbysAdapter {
  sendReport(input: HbysReportPayload): Promise<HbysDeliveryResult>;
}
```

Her hastane kendi implementasyonuna sahip olabilir.

Örnek:

```text
MockHbysAdapter
HospitalAHbysAdapter
HospitalBHbysAdapter
```

---

# 45. MOCK HBYS

Mock HBYS aşağıdaki davranışları desteklemelidir:

```text
SUCCESS
FAIL
TIMEOUT
```

Test ortamında manager/dev-tools üzerinden mod değiştirilebilir.

---

# 46. HASTANE LOCK EVENT ADAPTER

Hastane HBYS'nin:

> Bu tetkiki hastane hekimi aldı

event'i core sisteme normalized event olarak gelmelidir.

Örnek:

```text
EXTERNAL_STUDY_LOCKED
EXTERNAL_STUDY_RELEASED
```

Core workflow yalnızca normalized event görmelidir.

---

# 47. INTEGRATION NORMALIZATION

Farklı hastanelerden gelen formatlar doğrudan business service'lere aktarılmamalıdır.

Akış:

```text
Hospital Specific Payload
        ↓
Hospital Adapter
        ↓
Normalized Internal Model
        ↓
Core Workflow
```

Bu mimari çok hastaneli kiralama modeli için zorunlu kabul edilmelidir.

---

# 48. API DESIGN

Frontend-backend iletişimi:

> REST API

ile yapılacaktır.

Realtime:

> WebSocket

ile sağlanacaktır.

API prefix:

```text
/api/v1
```

örnek olarak kullanılabilir.

Kesin endpointler:

> `API_CONTRACT.md`

içerisinde tanımlanacaktır.

---

# 49. API RESPONSE PRENSİBİ

API tutarlı response formatı kullanmalıdır.

Örnek success:

```json
{
  "data": {},
  "meta": {}
}
```

Örnek error:

```json
{
  "error": {
    "code": "STUDY_LOCKED",
    "message": "Study is currently locked.",
    "details": {}
  }
}
```

Kesin hata contractları `API_CONTRACT.md` içerisinde tanımlanacaktır.

---

# 50. AUTHORIZATION

Backend her request'te:

- authentication
- role
- hospital permission
- resource permission
- workflow permission

kontrol etmelidir.

Frontend'de buton gizlemek security değildir.

Örnek:

Doctor UI'de manager butonu görünmese bile backend:

```text
403 FORBIDDEN
```

döndürmelidir.

---

# 51. SHARED TYPES

Frontend ve backend ortak TypeScript type'larını kullanmalıdır.

Örnek:

```text
packages/shared/
│
├── enums/
├── types/
├── api/
└── schemas/
```

Ortak tanımlar:

- StudyStatus
- PatientCategory
- UserRole
- HbysDeliveryStatus
- ReportStatus
- RevisionStatus

gibi.

---

# 52. VALIDATION

Request validation backend'de zorunlu olacaktır.

Zod veya NestJS validation pipeline kullanılabilir.

Shared schemas mümkün olduğunda frontend'de de kullanılabilir.

Frontend validation:

> kullanıcı deneyimi

Backend validation:

> güvenlik ve veri bütünlüğü

amaçlıdır.

Backend validation hiçbir zaman kaldırılmamalıdır.

---

# 53. DEV TOOLS MİMARİSİ

`/dev-tools` fonksiyonları yalnızca:

- development
- staging
- pilot

ortamlarında kullanılmalıdır.

Production config:

```text
DEV_TOOLS_ENABLED=false
```

olduğunda bu endpointler tamamen kapatılmalıdır.

---

# 54. PILOT ENVIRONMENT

Pilot environment örneği:

```text
Frontend
Vercel

Backend
Railway

Database
Railway PostgreSQL

Redis
Railway Redis or compatible managed Redis

Object Storage
S3-Compatible Service

Test PACS
Separate Orthanc instance

Mock HL7
Backend module

Mock HBYS
Backend module
```

---

# 55. ENVIRONMENT AYRIMI

En az:

```text
development
pilot
production
```

environment düşünülmelidir.

İlk etapta:

- local development
- pilot

aktif olacaktır.

---

# 56. ENV VARIABLES

Secrets code içine yazılmamalıdır.

Örnek:

```text
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_REFRESH_SECRET
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
OBJECT_STORAGE_BUCKET
FRONTEND_URL
DEV_TOOLS_ENABLED
```

Gerçek değerler `.env` üzerinden sağlanmalıdır.

`.env` repository'ye commit edilmemelidir.

---

# 57. FRONTEND DEPLOYMENT

Frontend:

> Vercel

üzerinden deploy edilecektir.

Vercel yalnızca frontend application'ı host eder.

Frontend environment:

```text
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_WS_URL
```

gibi backend adreslerini kullanabilir.

---

# 58. BACKEND DEPLOYMENT

Backend:

> Railway

üzerinde çalışacaktır.

Pilot için tek backend service yeterlidir.

Backend:

- API
- WebSocket
- queue producer

işlevlerini sağlayabilir.

Worker aynı process içerisinde veya ayrı Railway service olarak başlayabilir.

---

# 59. WORKER DEPLOYMENT

Pilotun ilk günlerinde worker backend process ile birlikte çalışabilir.

Sistem stabil hale geldiğinde:

```text
backend-api
backend-worker
```

iki ayrı Railway service olarak ayrılabilir.

Bu ayrım kod mimarisini değiştirmemelidir.

---

# 60. DATABASE MIGRATION

Prisma migration kullanılacaktır.

Production/pilot schema değişiklikleri migration ile yapılmalıdır.

Direct manual DB modification normal geliştirme yöntemi olmamalıdır.

---

# 61. SEED DATA

Pilot ortam için seed script oluşturulmalıdır.

Örnek hesaplar:

```text
doctor@test.local
reporter@test.local
operation@test.local
manager@test.local
```

Seed:

- test hospital
- test users
- test configuration

oluşturabilir.

Şifreler production default olarak kullanılmamalıdır.

---

# 62. OBSERVABILITY

İlk pilotta minimum logging zorunludur.

Backend structured log oluşturmalıdır.

Örnek:

```json
{
  "level": "info",
  "event": "HBYS_SEND_ATTEMPT",
  "studyId": "...",
  "hospitalId": "...",
  "timestamp": "..."
}
```

Pilot için gelişmiş observability sistemi zorunlu değildir.

---

# 63. HEALTH CHECK

Backend health endpoint bulunmalıdır.

Örnek:

```text
GET /health
```

Aşağıdaki bileşenleri kontrol edebilir:

- application
- database
- Redis

External integration health ayrı gösterilebilir.

---

# 64. ERROR HANDLING

Teknik error ile business error ayrılmalıdır.

Business example:

```text
STUDY_LOCKED
INVALID_STATE_TRANSITION
NOT_AUTHORIZED_FOR_HOSPITAL
```

Technical example:

```text
DATABASE_UNAVAILABLE
REDIS_UNAVAILABLE
HBYS_TIMEOUT
```

Frontend kullanıcıya teknik stack trace göstermemelidir.

---

# 65. FAIL SAFE PRENSİBİ

Kritik sağlık workflow'larında veri kaybı yerine hata tercih edilmelidir.

Örneğin:

Rapor kaydedilemediyse:

> kullanıcıya başarı mesajı gösterilmemelidir.

Lock doğrulanamadıysa:

> aynı dosyada ikinci editör açılmamalıdır.

---

# 66. IDEMPOTENCY

HL7 ve HBYS işlemlerinde duplicate request ihtimali düşünülmelidir.

Örnek:

Aynı HL7 iki kez gelirse:

> duplicate patient/study oluşturmamalıdır.

Ana deduplication alanı:

> Accession Number + hospital context

olabilir.

Kesin data rule `DATA_MODEL.md` ve `INTEGRATIONS.md` içerisinde tanımlanacaktır.

---

# 67. HBYS IDEMPOTENCY

HBYS retry aynı final report'u yanlışlıkla birden fazla ayrı rapor olarak oluşturmamalıdır.

Adapter mümkün olduğunca idempotency key kullanmalıdır.

Örnek:

```text
studyId + reportVersionId
```

---

# 68. SECURITY

Pilot için minimum güvenlik:

- HTTPS
- password hashing
- access token
- refresh token
- role guard
- hospital guard
- validation
- CORS
- rate limit
- secure headers
- environment secrets
- audit trail

uygulanmalıdır.

---

# 69. PATIENT DATA

Pilot ortam:

> gerçek hasta verisi içermemelidir.

Test hasta verileri açıkça fake olmalıdır.

Gerçek hastane entegrasyonuna geçmeden önce:

- KVKK
- veri saklama
- log masking
- backup
- encryption
- access policy

ayrıca ele alınmalıdır.

---

# 70. FRONTEND-BACKEND GELİŞTİRME AYRIMI

Claude:

> backend ana geliştiricisi

Codex:

> frontend ana geliştiricisi

olarak çalışacaktır.

Ancak iki ajan:

- `MASTER_SPEC.md`
- `WORKFLOW_STATE_MACHINE.md`
- `API_CONTRACT.md`
- shared types

üzerinde aynı anlayışa sahip olmalıdır.

---

# 71. CLAUDE ÇALIŞMA SINIRI

Claude temel olarak:

```text
/apps/backend
/packages/shared
```

üzerinde çalışacaktır.

Frontend dosyalarında geniş kapsamlı değişiklik yapmamalıdır.

---

# 72. CODEX ÇALIŞMA SINIRI

Codex temel olarak:

```text
/apps/frontend
```

üzerinde çalışacaktır.

Backend business logic'i frontend içinde tekrar implement etmemelidir.

---

# 73. API CONTRACT DEĞİŞİKLİĞİ

Claude veya Codex API değişikliğine ihtiyaç duyarsa doğrudan kendi istediği endpoint'i üretmemelidir.

Önce:

> `API_CONTRACT.md`

güncellenmelidir.

Sonrasında iki taraf aynı contract'a göre implementasyon yapmalıdır.

---

# 74. PILOT ARCHITECTURE GOAL

Pilot mimarinin temel amacı:

> Gerçek hastaneyi beklemeden core workflow'u gerçek kod üzerinde test etmek.

Bunun için:

```text
Mock HL7
↓
Core Backend
↓
Test PACS
↓
Doctor
↓
Dictation
↓
Reporter
↓
Report
↓
Doctor Final
↓
Mock HBYS
```

zinciri gerçek uygulama servislerini kullanmalıdır.

---

# 75. MOCK PRENSİBİ

Mock sistemler UI'de hard-coded başarı gösterimi şeklinde yazılmamalıdır.

Yanlış yaklaşım:

```text
button click
→ setStatus("HBYS_SENT")
```

Doğru yaklaşım:

```text
Frontend
→ Backend
→ HBYS Queue
→ MockHbysAdapter
→ Result
→ Database
→ Realtime Event
→ Frontend
```

Bu sayede gerçek HBYS bağlandığında frontend değişmez.

---

# 76. TESTABILITY

Her backend domain module unit test yazılabilir olmalıdır.

Özellikle:

- workflow
- locking
- SLA
- report versioning
- HL7 matching
- HBYS retry
- permissions

yüksek test önceliğine sahiptir.

---

# 77. E2E TEST

Ana pilot akışı E2E olarak test edilmelidir.

Örnek:

```text
login doctor
→ create test study
→ acquire lock
→ finish reading
→ login reporter
→ create report
→ submit
→ login doctor
→ final approve
→ mock HBYS success
→ assert HBYS_SENT
```

---

# 78. SCALABILITY

İlk pilot 2–3 kullanıcı içindir.

Ancak mimari aşağıdaki ölçekleme yolunu engellememelidir:

```text
1 backend
↓
multiple backend instances

1 worker
↓
multiple workers

single hospital
↓
multiple hospitals
```

Redis ve PostgreSQL bu nedenle merkezi servisler olarak tasarlanmıştır.

---

# 79. MICROSERVICE GEÇİŞİ

İleride ihtiyaç oluşursa aşağıdaki modüller ayrılabilir:

- HL7 Gateway
- HBYS Delivery
- Notification Worker
- Audio Processing
- PACS Gateway

Ancak pilot aşamada bunların ayrı servis olması yasak değildir fakat zorunlu da değildir.

Öncelik:

> sadelik.

---

# 80. ARCHITECTURE DECISION RULE

Yeni bir teknoloji eklenmeden önce şu sorular cevaplanmalıdır:

1. Pilot için gerçekten gerekli mi?
2. Var olan stack ile çözülebilir mi?
3. Deployment karmaşıklığını artırıyor mu?
4. Claude ve Codex geliştirme akışını zorlaştırıyor mu?
5. Gerçek hastane entegrasyonuna fayda sağlıyor mu?

Gerekli değilse teknoloji eklenmemelidir.

---

# 81. PILOTTA KULLANILMAYACAK KARMAŞIKLIKLAR

İlk pilotta zorunlu değildir:

- Kubernetes
- Kafka
- RabbitMQ
- Elasticsearch
- service mesh
- GraphQL
- multi-region deployment
- database sharding
- microservice orchestration
- custom identity server

Bunlar gerçek ihtiyaç çıkmadan eklenmemelidir.

---

# 82. FINAL ARCHITECTURE SUMMARY

Pilot teknik stack:

```text
Frontend
Next.js + React + TypeScript
↓
Vercel

Backend
Node.js + NestJS + TypeScript
↓
Railway

Database
PostgreSQL

ORM
Prisma

Redis
Locking + Queue + Cache

Jobs
BullMQ

Realtime
WebSocket / Socket.IO

Storage
S3-Compatible Object Storage

HL7
Adapter Architecture
Mock in Pilot

PACS
Adapter Architecture
Test PACS in Pilot

HBYS
Adapter Architecture
Mock in Pilot
```

---

# 83. ANA MİMARİ KURAL

Core workflow:

> hiçbir hastanenin özel HBYS, PACS veya HL7 implementasyonuna bağımlı olmayacaktır.

Her dış sistem:

> adapter

üzerinden core sisteme bağlanacaktır.

Bu karar projenin ileride farklı hastanelere aylık hizmet olarak sunulabilmesinin temel teknik gereksinimlerinden biridir.

---

# 84. DOKÜMAN BAĞIMLILIKLARI

Bu dosyanın ardından aşağıdaki teknik dokümanlar hazırlanmalıdır:

1. `WORKFLOW_STATE_MACHINE.md`
2. `DATA_MODEL.md`
3. `API_CONTRACT.md`
4. `AUTH_ROLES_PERMISSIONS.md`
5. `INTEGRATIONS.md`

Bu dokümanlar tamamlanmadan backend ve frontend geliştirmeye tam kapsamlı başlanmamalıdır.

---

# 85. SON KURAL

Claude, Codex veya başka bir geliştirici mimari içerisinde tanımlanmamış yeni bir temel teknoloji, servis veya altyapı bileşeni eklemek isterse:

- neden gerekli olduğunu belirtmelidir,
- mevcut mimari ile çözülemeyen problemi açıklamalıdır,
- ilgili doküman güncellenmeden kritik mimari değişiklik yapmamalıdır.

`MASTER_SPEC.md` iş kurallarının,

`ARCHITECTURE.md` ise teknik sistem yapısının

ana referansıdır.