# TASK_QUEUE.md
## Radyoloji Görüntüleme ve Raporlama Platformu — AI Agent Görev Kuyruğu

> **Doküman Türü:** Autonomous Development Task Queue  
> **Üst Referanslar:**  
> `MASTER_SPEC.md`  
> `ARCHITECTURE.md`  
> `WORKFLOW_STATE_MACHINE.md`  
> `DATA_MODEL.md`  
> `API_CONTRACT.md`  
> `AUTH_ROLES_PERMISSIONS.md`  
> `INTEGRATIONS.md`  
> `IMPLEMENTATION_PLAN.md`
>
> **Backend Agent:** Claude Code  
> **Frontend Agent:** Codex  
> **Pilot Hedef:** 5 günlük yoğun çalışma sonunda sağlık ekibinin ana akışı test edebilmesi

---

# 1. DOSYANIN AMACI

Bu dosya Claude ve Codex'in hangi işi hangi sırayla yapacağını belirler.

Ajanlar rastgele görev seçmemelidir.

Bir görev ancak:

- bağımlılıkları tamamlanmışsa,
- mevcut öncelik sırasında uygunsa,
- BLOCKED değilse

başlatılmalıdır.

---

# 2. TASK STATUS DEĞERLERİ

Her görev aşağıdaki durumlardan birini taşır:

```text
TODO
IN_PROGRESS
DONE
BLOCKED_EXTERNAL
BLOCKED_SPEC
BLOCKED_TECHNICAL
```

---

# 3. STATUS KURALI

Bir ajan göreve başladığında:

```text
TODO
→ IN_PROGRESS
```

yapmalıdır.

Tüm acceptance criteria geçtiğinde:

```text
IN_PROGRESS
→ DONE
```

yapmalıdır.

Test başarısızsa görev DONE yapılamaz.

---

# 4. BLOCKED_EXTERNAL

Dış bilgi veya credential gerekiyorsa:

```text
BLOCKED_EXTERNAL
```

kullanılır.

Örnek:

- gerçek PACS credential yok,
- gerçek HBYS dokümanı yok,
- VPN yok.

Bu durumda ajan başka bağımsız göreve geçer.

---

# 5. BLOCKED_SPEC

İş kuralı belirsizse:

```text
BLOCKED_SPEC
```

kullanılır.

Ajan kendi klinik/operasyonel kuralını üretmez.

---

# 6. BLOCKED_TECHNICAL

Kütüphane, build veya altyapı problemi çözülemiyorsa:

```text
BLOCKED_TECHNICAL
```

kullanılır.

Ajan problemi `PROGRESS.md` içine açıkça yazar.

---

# 7. ÖNCELİKLER

```text
P0 = Pilot blocker
P1 = Pilot important
P2 = Nice to have
P3 = Post pilot
```

Ajan P0 görevleri tamamlanmadan gereksiz P2/P3 işlere geçmemelidir.

---

# 8. OWNER

Görev sahibi:

```text
BACKEND
FRONTEND
SHARED
DEVOPS
```

olarak belirtilir.

Claude ağırlıklı olarak:

```text
BACKEND
SHARED
DEVOPS backend tarafı
```

Codex ağırlıklı olarak:

```text
FRONTEND
```

işlerini yapar.

---

# 9. GLOBAL DONE KURALI

Her görev tamamlandığında ajan minimum:

```text
lint
typecheck
ilgili testler
```

çalıştırmalıdır.

Uygun görevlerde:

```text
build
integration test
E2E
```

de çalıştırılır.

---

# 10. FOUNDATION TASKS

---

## SHARED-001 — Root Monorepo Setup

**Owner:** SHARED  
**Priority:** P0  
**Status:** DONE  
**Depends On:** none

### Amaç

pnpm monorepo temelini oluştur.

### Yapılacaklar

- root `package.json`
- `pnpm-workspace.yaml`
- root TypeScript config
- root lint config
- root prettier config
- `.gitignore`
- workspace scripts

### Acceptance

- `pnpm install` başarılı
- workspace frontend/backend/shared paketlerini görüyor
- root lint komutu çalışıyor
- root typecheck komutu çalışıyor

### Completed

- pnpm workspace (`apps/*`, `packages/*`), root `package.json`, `pnpm-workspace.yaml`
- `tsconfig.base.json` (strict), flat ESLint 9 config, Prettier, `.gitignore`, `.npmrc`
- Verified: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass
- Note: pnpm was installed via `npm i -g pnpm@10` because corepack fails on Node 22.22.2
  (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`)

---

## SHARED-002 — Shared Package Setup

**Owner:** SHARED  
**Priority:** P0  
**Status:** DONE  
**Depends On:** SHARED-001

### Amaç

`packages/shared` paketini oluştur.

### Minimum Exportlar

- `UserRole`
- `UserStatus`
- `PatientCategory`
- `StudyStatus`
- `ReportStatus`
- `ReportSource`
- `DictationStatus`
- `HbysDeliveryStatus`
- `ApiError`
- `PaginatedResponse`

### Acceptance

- backend shared package import edebiliyor
- frontend shared package import edebiliyor
- duplicate enum yazılmıyor

### Completed

- `@radiology/shared` with all 8 required enums + `ApiError` / `PaginatedResponse`
- Enums modelled as const object + union type (usable as value and type, no Prisma leakage)
- Also exported: `ApiErrorCode`, `ApiErrorResponse`, `ApiResponse`, `PaginationMeta`,
  `SortOrder`, `REQUEST_ID_HEADER`, pagination defaults
- Backend import verified by `pnpm typecheck` + passing backend tests
- Frontend import is verified by Codex under FRONTEND-002 (frontend app does not exist yet)

---

# 11. BACKEND FOUNDATION

---

## BACKEND-001 — NestJS Application Bootstrap

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** SHARED-001

### Yapılacaklar

- NestJS app
- TypeScript strict mode
- `/api/v1` prefix
- global validation
- global exception filter
- CORS config
- request ID
- structured logging foundation

### Acceptance

```text
GET /api/v1/health
```

200 dönüyor.

### Completed

- NestJS 11 modular monolith, TypeScript strict, `/api/v1` global prefix
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted) emitting
  `422 VALIDATION_ERROR` with `details.fields` per API_CONTRACT section 112
- `AllExceptionsFilter` producing the standard error envelope; stack traces never leave the server
- `ResponseEnvelopeInterceptor` wrapping payloads in `{ data }`, passing `{ data, meta }` through
- CORS origin allowlist + credentials (no wildcard), `X-Request-Id` correlation via
  `AsyncLocalStorage`, structured JSON logging
- Health endpoint has a pluggable indicator registry so Prisma/Redis can report real state;
  returns 503 when a dependency is down
- Verified: 7 unit tests, 6 e2e tests, lint, typecheck, `nest build`, and a live server
  returning `200 {"data":{"status":"ok",...}}` on `GET /api/v1/health`

---

## BACKEND-002 — PostgreSQL + Prisma Setup

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-001

### Yapılacaklar

- Prisma install
- PostgreSQL connection
- schema foundation
- migration setup
- database service

### Acceptance

- migration çalışıyor
- backend database'e bağlanıyor
- connection failure düzgün hata veriyor

### Completed

- Prisma 6.19.3 + PrismaService (startup'ta `$connect`, health için `SELECT 1`)
- Migration `20260814144451_init` gerçek Railway PostgreSQL üzerinde uygulandı
  (11 tablo: 10 model + `_prisma_migrations`, 6 enum tipi)
- Canlı doğrulama: `GET /api/v1/health` → `database: {status: "up", latencyMs: 255}`
- Connection failure: erişilemez DATABASE_URL ile yapılandırılmış `error` logu üretip
  exit code 1 ile kapanıyor; connection string / parola loglanmıyor (doğrulandı: 0 eşleşme)
- Railway public erişimi TCP proxy üzerinden; `sslmode=require` gerekli
  (SSL olmadan P1001 alınıyor)

---

## BACKEND-003 — Redis Setup

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-001

### Yapılacaklar

- Redis client
- health check
- connection abstraction

### Acceptance

- Redis ping başarılı
- health response Redis durumunu gösterebiliyor

### Completed

- ioredis 6 tabanlı RedisService; `lazyConnect` + startup'ta explicit connect & PING
- Railway Redis 8.2.8'e karşı doğrulandı: `PING -> PONG` (252ms), SET/GET/DEL çalışıyor
- Canlı doğrulama: `GET /api/v1/health` → `redis: {status: "up", latencyMs: 248}`
- Redis erişilemezken uygulama fail-closed davranıyor: hata loglanıp process sonlanıyor,
  "kilit yok" varsayımı yapılmıyor (CLAUDE.md section 17)
- `maxRetriesPerRequest: null` ayarı BullMQ (BACKEND-033) ile uyumlu olacak şekilde seçildi
- Railway Redis'te public erişim yoktu; `railway tcp-proxy create --port 6379 --service Redis`
  ile TCP proxy oluşturuldu

---

## BACKEND-004 — Core Database Models Phase 1

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-002, SHARED-002

### Modeller

- User
- UserSession
- Hospital
- UserHospitalAccess
- Patient
- Study
- StudyStatusHistory
- StudyAssignment
- AuditLog
- SlaPolicy

### Acceptance

- Prisma migration başarılı
- ilişkiler DATA_MODEL ile uyumlu
- `hospitalId + accessionNumber` unique

---

## BACKEND-005 — Seed System

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-004

### Seed

- Test Hospital
- Doctor
- Reporter
- Operation
- Manager
- SLA policies

### Test Users

```text
doctor@test.local
reporter@test.local
operation@test.local
manager@test.local
```

### Acceptance

- seed birden fazla çalıştırılınca duplicate oluşturmuyor
- tüm test hesapları login için kullanılabilir

---

# 12. AUTH TASKS

---

## BACKEND-006 — Authentication

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-005

### Endpointler

- POST `/auth/login`
- POST `/auth/refresh`
- POST `/auth/logout`
- GET `/auth/me`

### Gereksinimler

- password hashing
- JWT access token
- refresh session
- HttpOnly refresh cookie
- inactive user rejection

### Acceptance

- dört rol login oluyor
- yanlış parola reddediliyor
- refresh çalışıyor
- logout refresh session revoke ediyor

---

## BACKEND-007 — Role Guard

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-006

### Acceptance

- Reporter finalize endpointine erişemiyor
- Doctor manager endpointine erişemiyor
- unauthorized request 403

---

## BACKEND-008 — Hospital Access Guard

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-006

### Acceptance

- user yetkisiz hastane Study'sini UUID ile açamıyor
- 403 `HOSPITAL_ACCESS_DENIED`
- query listesinde yetkisiz Study görünmüyor

---

# 13. FRONTEND FOUNDATION

---

## FRONTEND-001 — Next.js Application Bootstrap

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** SHARED-001

### Yapılacaklar

- Next.js
- TypeScript
- Tailwind
- shadcn/ui
- basic app shell

### Acceptance

- dev server çalışıyor
- production build geçiyor

---

## FRONTEND-002 — API Client Foundation

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-001, SHARED-002

### Yapılacaklar

- centralized API client
- base URL env
- auth header
- standardized error parse
- refresh support

### Acceptance

- API_CONTRACT response envelope destekleniyor
- 401 refresh akışı çalışmaya hazır

---

## FRONTEND-003 — Authentication UI

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-002, BACKEND-006

### Yapılacaklar

- login page
- loading
- invalid credentials
- logout
- session restore

### Acceptance

- gerçek backend login kullanılıyor
- hard-coded auth yok

---

## FRONTEND-004 — Role Based App Shell

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-003

### Navigasyon

Doctor:

- Okuma Havuzu
- Onay Bekleyenler

Reporter:

- Yazılmayanlar
- Aktif Çalışma

Operation:

- Operasyon
- HBYS Hataları
- SLA

Manager:

- Dashboard
- Kullanıcılar
- DevTools

### Acceptance

- rol bazında navigation doğru
- backend 403 yine ayrıca ele alınıyor

---

# 14. HL7 + STUDY FOUNDATION

---

## BACKEND-009 — Study Query Service

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-004, BACKEND-008

### Endpointler

- GET `/studies`
- GET `/studies/:id`

### Filtreler

- hospital
- status
- category
- pool
- search
- pagination
- sort

### Acceptance

- hospital scope uygulanıyor
- FIFO için `arrivalAt ASC` destekleniyor

---

## BACKEND-010 — HL7 Adapter Contract

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-004

### Yapılacaklar

- Hl7Adapter interface
- normalized first event
- normalized second event
- common validation

### Acceptance

- core service ham mock payload bilmiyor

---

## BACKEND-011 — Mock First HL7

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-010

### Endpoint

POST `/dev-tools/hl7/first`

### Flow

```text
Mock
→ Adapter
→ Patient
→ Study
→ WAITING_ACCEPTANCE
```

### Acceptance

- Patient oluşturuluyor
- Study oluşturuluyor
- audit var
- duplicate Study yok

---

## BACKEND-012 — Mock Second HL7

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-011

### Endpoint

POST `/dev-tools/hl7/second`

### Matching

```text
hospitalId + accessionNumber
```

### Acceptance

- doğru Study eşleşiyor
- `IMAGES_PENDING`
- patient ID mismatch güvenli hata üretiyor

---

## BACKEND-013 — Images Available Simulation

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-012

### Endpoint

POST `/dev-tools/studies/:id/images-available`

### Transition

```text
IMAGES_PENDING
→ UNREAD
```

### Acceptance

- status history oluşuyor
- audit oluşuyor

---

## FRONTEND-005 — Study List Foundation

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-004, BACKEND-009

### Gösterilecek

- patient
- accession
- study
- hospital
- category
- status
- arrival
- SLA placeholder

### Acceptance

- pagination çalışıyor
- filter çalışıyor
- empty/error/loading state var

---

# 15. WORKFLOW ENGINE

---

## BACKEND-014 — Workflow Service

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-004, BACKEND-013

### Amaç

Tüm Study transitionları merkezi servis üzerinden yürüsün.

### Minimum Transitionlar

```text
WAITING_ACCEPTANCE → IMAGES_PENDING
IMAGES_PENDING → UNREAD
UNREAD → READING
READING → READ
READ → WAITING_TRANSCRIPTION
WAITING_TRANSCRIPTION → TRANSCRIBING
TRANSCRIBING → WAITING_APPROVAL
WAITING_APPROVAL → FINAL
FINAL → HBYS_PENDING
HBYS_PENDING → HBYS_SENT
HBYS_PENDING → HBYS_FAILED
```

### Acceptance

- invalid transition reddediliyor
- controller direct status update yapmıyor
- status history yazılıyor

---

# 16. LOCKING

---

## BACKEND-015 — Redis Study Lock Service

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-003, BACKEND-014

### Fonksiyonlar

- acquire
- heartbeat
- release
- forceRelease
- getLock

### Default Pilot

```text
TTL = 60s
heartbeat = 20s
```

### Acceptance

- atomic acquire
- ikinci kullanıcı lock alamıyor
- stale lock TTL ile gidiyor

---

## BACKEND-016 — Start Reading

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-015

### Endpoint

POST `/studies/:id/start-reading`

### Acceptance

- only Doctor
- UNREAD required
- hospital permission
- lock acquired
- Doctor assigned
- READING
- audit

---

## BACKEND-017 — Lock Heartbeat / Release

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-015

### Endpointler

- POST `/studies/:id/lock/heartbeat`
- POST `/studies/:id/lock/release`
- POST `/studies/:id/lock/force-release`

### Acceptance

- only owner heartbeat
- force release reason zorunlu
- force release audit var

---

## BACKEND-018 — Doctor Lock Concurrency Test

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-016

### Test

Doctor A açar.

Doctor B açmaya çalışır.

### Expected

```text
423 STUDY_LOCKED
```

### Acceptance

Test otomatik geçiyor.

---

## FRONTEND-006 — Lock UI

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-005, BACKEND-016

### Gösterilecek

- locked
- owner
- role
- lockedAt

### Acceptance

423 response anlaşılır gösteriliyor.

---

# 17. DOCTOR WORKSPACE

---

## FRONTEND-007 — Doctor Study Workspace

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-006

### Bölümler

- patient
- clinical info
- study info
- PACS area
- dictation
- Information
- SLA
- lock

### Acceptance

tek çalışma ekranında kritik veriler var.

---

# 18. PACS

---

## BACKEND-019 — PACS Adapter Contract

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-013

### Fonksiyonlar

- findStudy
- listSeries
- getViewerAccess
- checkAvailability

### Acceptance

core service vendor detayı bilmiyor.

---

## BACKEND-020 — Pilot PACS Adapter

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-019

### Preferred

Orthanc.

### Fallback

Test metadata adapter.

### Acceptance

GET `/studies/:id/pacs/viewer` çalışıyor.

---

## FRONTEND-008 — PACS Viewer Area

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** FRONTEND-007, BACKEND-020

### Acceptance

- viewer available state
- error state
- launch/open behavior

---

# 19. DICTATION

---

## BACKEND-021 — Dictation Model

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-004

### Model

Dictation.

### Acceptance

migration çalışıyor.

---

## BACKEND-022 — Object Storage Abstraction

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-021

### Interface

- upload
- getSignedPlaybackUrl
- delete disabled for clinical normal path

### Acceptance

storage implementation replace edilebilir.

---

## BACKEND-023 — Dictation API

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-022, BACKEND-016

### Endpointler

- POST `/studies/:id/dictations`
- POST `/dictations/:id/upload`
- GET `/studies/:id/dictations`
- GET `/dictations/:id/playback`

### Acceptance

- only appropriate user
- completed upload metadata DB'de
- playback çalışıyor

---

## FRONTEND-009 — Browser Audio Recorder

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-007, BACKEND-023

### Özellikler

- permission
- start
- stop
- timer
- upload
- error
- success

### Acceptance

gerçek mikrofon kaydı backend'e gidiyor.

---

## FRONTEND-010 — Audio Recording Recovery UX

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** FRONTEND-009

### Acceptance

- permission denied gösteriliyor
- upload fail gösteriliyor
- kullanıcı yanlışlıkla kaydı tamamlandı sanmıyor

---

## BACKEND-024 — Complete Reading

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-023, BACKEND-014

### Endpoint

POST `/studies/:id/complete-reading`

### Koşul

completed dictation.

### Flow

```text
READING
→ READ
→ WAITING_TRANSCRIPTION
```

### Acceptance

- lock release
- timestamps
- audit
- Reporter queue'a düşüyor

---

## FRONTEND-011 — Complete Reading Action

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-009, BACKEND-024

### Acceptance

- upload tamamlanmadan bitirilemez
- success sonrası queue'dan çıkar

---

# 20. REPORTER WORKFLOW

---

## BACKEND-025 — Report Data Models

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-004

### Models

- Report
- ReportVersion

### Acceptance

- one main report per Study
- many versions
- final version overwrite edilmiyor

---

## BACKEND-026 — Start Transcription

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-025, BACKEND-015

### Endpoint

POST `/studies/:id/start-transcription`

### Acceptance

- only Reporter
- WAITING_TRANSCRIPTION
- Reporter assignment
- Reporter lock
- TRANSCRIBING

---

## BACKEND-027 — Reporter Concurrency Test

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-026

### Acceptance

Reporter A aldıktan sonra Reporter B 423 alıyor.

---

## BACKEND-028 — Report Draft API

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-025, BACKEND-026

### Endpointler

- GET `/studies/:id/report`
- PUT `/studies/:id/report/draft`

### Acceptance

- only lock owner edit
- draft persistence
- timestamp response

---

## FRONTEND-012 — Reporter Queue

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-005, BACKEND-026

### Acceptance

WAITING_TRANSCRIPTION Study'leri gösteriyor.

---

## FRONTEND-013 — Reporter Workspace

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-012, BACKEND-028

### Aynı Ekranda

- patient
- study
- clinical info
- dictation player
- report editor
- information

### Acceptance

sağlık ekibinin ana gereksinimi olan “aynı ekrandan ses + rapor” sağlanıyor.

---

## FRONTEND-014 — Audio Player

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-013, BACKEND-023

### Özellikler

- play
- pause
- seek
- duration

### Acceptance

gerçek uploaded dictation oynuyor.

---

## FRONTEND-015 — Report Autosave

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-013, BACKEND-028

### Acceptance

- debounce
- saving
- saved
- error
- no false success

---

## BACKEND-029 — Submit Report

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-028

### Endpoint

POST `/studies/:id/submit-report`

### Flow

```text
TRANSCRIBING
→ WAITING_APPROVAL
```

### Acceptance

- Reporter lock release
- completed report version
- audit

---

## FRONTEND-016 — Submit Report

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-015, BACKEND-029

### Acceptance

submit sonrası Study approval queue'a gidiyor.

---

# 21. DOCTOR APPROVAL

---

## BACKEND-030 — Start Approval

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-029

### Endpoint

POST `/studies/:id/start-approval`

### Acceptance

- assigned Doctor
- approval lock
- WAITING_APPROVAL korunuyor

---

## BACKEND-031 — Return to Reporter

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-030

### Endpoint

POST `/studies/:id/return-to-reporter`

### Acceptance

- reason zorunlu
- WAITING_TRANSCRIPTION
- notification/audit

---

## BACKEND-032 — Finalize Report

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-030, BACKEND-025

### Endpoint

POST `/studies/:id/finalize`

### Acceptance

- only assigned Doctor
- WAITING_APPROVAL
- final ReportVersion
- finalizedAt
- Study FINAL
- HBYS Delivery created
- HBYS_PENDING
- lock release

---

## FRONTEND-017 — Doctor Approval Queue

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-029

### Acceptance

- only current Doctor approval Study'leri
- badge/count

---

## FRONTEND-018 — Approval Workspace

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-017, BACKEND-030

### İçerik

- report
- study
- patient
- clinical data
- viewer access
- finalize
- return to reporter

---

## FRONTEND-019 — Finalize Action

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** FRONTEND-018, BACKEND-032

### Acceptance

finalization sonrası HBYS_PENDING gösteriliyor.

---

# 22. HBYS

---

## BACKEND-033 — BullMQ Foundation

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-003

### Acceptance

test job enqueue/worker çalışıyor.

---

## BACKEND-034 — HBYS Data Models

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-004

### Models

- HbysDelivery
- HbysDeliveryAttempt

### Acceptance

migration başarılı.

---

## BACKEND-035 — HBYS Adapter Contract

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-034

### Acceptance

normalized send contract var.

---

## BACKEND-036 — Mock HBYS Adapter

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-035

### Modes

- SUCCESS
- FAIL
- TIMEOUT

### Acceptance

üç mode deterministic test edilebiliyor.

---

## BACKEND-037 — HBYS Delivery Worker

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-033, BACKEND-034, BACKEND-036, BACKEND-032

### Acceptance

- finalize job enqueue
- attempts persist
- SUCCESS → HBYS_SENT
- failure retry
- exhausted → HBYS_FAILED

---

## BACKEND-038 — Manual HBYS Retry

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-037

### Endpoint

POST `/hbys-deliveries/:id/retry`

### Acceptance

- Operation/Manager only
- reason
- new attempt
- HBYS_PENDING

---

## FRONTEND-020 — HBYS Status UI

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-037

### Acceptance

- pending
- sent
- failed

açık şekilde gösteriliyor.

---

## FRONTEND-021 — HBYS Retry UI

**Owner:** FRONTEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-038

### Acceptance

Operation/Manager retry yapabiliyor.

---

# 23. SLA

---

## BACKEND-039 — SLA Engine

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-004

### Policy

```text
ACIL 120 min
YATAN 720 min
NORMAL 1440 min
warning 20 min
```

### Acceptance

- deadline
- remaining
- overdue
- completed

hesaplanıyor.

---

## BACKEND-040 — Accelerated SLA Dev Mode

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-039

### Acceptance

test için dakika bazında hızlandırılabiliyor.

Production policy etkilenmiyor.

---

## FRONTEND-022 — SLA Display

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-039

### Gösterim

- Geliş
- Kalan
- Gecikme
- warning visual state

---

# 24. INFORMATION NOTES

---

## BACKEND-041 — Information Models + API

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-004

### Models

- InformationNote
- InformationNoteVersion

### Endpointler

- GET
- POST
- PUT
- versions

### Acceptance

- delete yok
- history korunuyor

---

## FRONTEND-023 — Information Component

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-041

### Acceptance

- note list
- create
- update
- history indicator

---

# 25. SPECIAL WORKFLOW STATES

---

## BACKEND-042 — Image Missing

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-014

### Flow

```text
READING → IMAGE_MISSING
IMAGE_MISSING → UNREAD
```

### Acceptance

- reason
- incident
- audit
- lock release

---

## FRONTEND-024 — Image Missing UI

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-042

### Acceptance

Doctor report edebiliyor.

Operation resolve edebiliyor.

---

## BACKEND-043 — Wont Report

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-014

### Flow

```text
UNREAD → WONT_REPORT
WONT_REPORT → UNREAD
```

### Acceptance

reason/history korunuyor.

---

## FRONTEND-025 — Wont Report UI

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-043

---

## BACKEND-044 — External Hospital Doctor Lock

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-014

### Flow

```text
UNREAD
→ HOSPITAL_DOCTOR
→ UNREAD
```

### Acceptance

- persistent external lock
- start-reading reddediliyor
- conflict audit

---

## FRONTEND-026 — Hospital Doctor State UI

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-044

---

# 26. REALTIME

---

## BACKEND-045 — WebSocket Gateway

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-001

### Minimum Events

- status changed
- locked
- unlocked
- waiting approval
- HBYS sent
- HBYS failed
- SLA warning
- information added

---

## FRONTEND-027 — Realtime Client

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-045

### Acceptance

event sonrası TanStack Query update/invalidate oluyor.

Reconnect sonrası REST refetch var.

---

# 27. OPERATION

---

## FRONTEND-028 — Operation Dashboard

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** FRONTEND-005, BACKEND-039, BACKEND-037

### Sekmeler

- Active
- SLA Warning
- Overdue
- HBYS Failed
- Image Missing
- Hospital Doctor

---

# 28. MANAGER

---

## BACKEND-046 — Manager Dashboard API

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-009

### Endpoint

GET `/manager/dashboard`

### Acceptance

category + workflow counts.

---

## FRONTEND-029 — Manager Dashboard

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-046

---

## BACKEND-047 — Manager Users API

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-006

### Endpointler

- list
- create
- update
- hospital access

---

## FRONTEND-030 — Manager User Management

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-047

---

## BACKEND-048 — Performance API

**Owner:** BACKEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-014

### Acceptance

- Doctor count
- Doctor avg duration
- Reporter count
- Reporter avg duration

---

## FRONTEND-031 — Performance UI

**Owner:** FRONTEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-048

---

## BACKEND-049 — Compensation Counts API

**Owner:** BACKEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-009

### Acceptance

monthly category counts.

No financial formula.

---

## FRONTEND-032 — Compensation UI

**Owner:** FRONTEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-049

---

# 29. DEVTOOLS

---

## BACKEND-050 — DevTools Security

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-006

### Kural

```text
DEV_TOOLS_ENABLED=true
+
MANAGER
```

### Acceptance

production flag false ise route disabled.

---

## FRONTEND-033 — DevTools UI

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-011, BACKEND-012, BACKEND-013, BACKEND-036, BACKEND-040, BACKEND-044

### Kontroller

- First HL7
- Second HL7
- Images available
- HBYS mode
- SLA mode
- external lock/unlock

---

# 30. AUDIT

---

## BACKEND-051 — Audit Service Consolidation

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-004

### Acceptance

critical actions central audit service kullanıyor.

---

## BACKEND-052 — Study Audit API

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-051

### Endpoint

GET `/studies/:id/audit`

---

## FRONTEND-034 — Audit Timeline

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-052

---

# 31. REVISION — PILOT OPTIONAL

---

## BACKEND-053 — Revision Foundation

**Owner:** BACKEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-025, BACKEND-037

### Minimum

- RevisionRequest
- new ReportVersion
- old final preserved

---

## FRONTEND-035 — Revision Indicator

**Owner:** FRONTEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-053

---

# 32. SPECIAL LISTS — PILOT OPTIONAL

---

## BACKEND-054 — Special Lists

**Owner:** BACKEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-004

### Minimum

LIST_1–LIST_6.

---

## FRONTEND-036 — Special List Filter

**Owner:** FRONTEND  
**Priority:** P2  
**Status:** TODO  
**Depends On:** BACKEND-054

---

# 33. TESTING TASKS

---

## BACKEND-055 — Workflow Unit Tests

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-014

### Minimum Testler

```text
UNREAD → READING PASS
UNREAD → FINAL REJECT
TRANSCRIBING → WAITING_APPROVAL PASS
WAITING_APPROVAL → FINAL PASS
HBYS_FAILED → HBYS_PENDING PASS
```

---

## BACKEND-056 — Permission Tests

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-007, BACKEND-008

### Testler

Reporter finalize → 403

Doctor HBYS retry → 403

Unauthorized hospital → 403

---

## BACKEND-057 — HL7 Integration Tests

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-012

### Testler

- First HL7
- duplicate First
- Second match
- wrong accession
- patient mismatch

---

## BACKEND-058 — HBYS Integration Tests

**Owner:** BACKEND  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-037

### Testler

- success
- fail
- timeout
- retry
- manual retry

---

## FRONTEND-037 — Critical Component Tests

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** main P0 frontend tasks

### Testler

- login
- lock error
- audio state
- report autosave error
- HBYS status

---

# 34. END-TO-END

---

## E2E-001 — Happy Path

**Owner:** SHARED  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-037, FRONTEND-021

### Senaryo

```text
First HL7
Second HL7
Images
Doctor
Dictation
Reporter
Report
Doctor Final
HBYS Success
```

### Acceptance

Study final:

```text
HBYS_SENT
```

Audit chain mevcut.

---

## E2E-002 — HBYS Failure Path

**Owner:** SHARED  
**Priority:** P0  
**Status:** TODO  
**Depends On:** E2E-001

### Senaryo

```text
HBYS FAIL
→ HBYS_FAILED
→ Operation
→ change mock SUCCESS
→ Retry
→ HBYS_SENT
```

---

## E2E-003 — Doctor Lock Conflict

**Owner:** SHARED  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-018, FRONTEND-006

### Acceptance

ikinci Doctor 423.

---

## E2E-004 — Reporter Lock Conflict

**Owner:** SHARED  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-027

---

## E2E-005 — Image Missing

**Owner:** SHARED  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-042, FRONTEND-024

### Senaryo

```text
READING
→ IMAGE_MISSING
→ Operation Resolve
→ UNREAD
```

---

# 35. DEPLOYMENT TASKS

---

## DEVOPS-001 — Backend Railway Preparation

**Owner:** DEVOPS  
**Priority:** P0  
**Status:** TODO  
**Depends On:** main backend P0 tasks

### Acceptance

- production build
- start command
- health endpoint
- env documentation

---

## DEVOPS-002 — Railway PostgreSQL

**Owner:** DEVOPS  
**Priority:** P0  
**Status:** TODO  
**Depends On:** DEVOPS-001

### Acceptance

migration Railway üzerinde çalışıyor.

---

## DEVOPS-003 — Railway Redis

**Owner:** DEVOPS  
**Priority:** P0  
**Status:** TODO  
**Depends On:** DEVOPS-001

### Acceptance

lock + BullMQ remote Redis üzerinde çalışıyor.

---

## DEVOPS-004 — Pilot Object Storage

**Owner:** DEVOPS  
**Priority:** P0  
**Status:** TODO  
**Depends On:** BACKEND-022

### Acceptance

remote audio upload/playback.

---

## DEVOPS-005 — Frontend Vercel

**Owner:** DEVOPS  
**Priority:** P0  
**Status:** TODO  
**Depends On:** main frontend P0 tasks

### Acceptance

public pilot URL.

---

## DEVOPS-006 — Vercel ↔ Railway Auth

**Owner:** DEVOPS  
**Priority:** P0  
**Status:** TODO  
**Depends On:** DEVOPS-001, DEVOPS-005

### Test

- login
- refresh
- logout
- CORS
- cookies

---

## DEVOPS-007 — WebSocket Production Test

**Owner:** DEVOPS  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-045, FRONTEND-027

---

# 36. PILOT HARDENING

---

## HARDEN-001 — Security Sanity Check

**Owner:** SHARED  
**Priority:** P0  
**Status:** TODO  
**Depends On:** main P0 tasks

### Kontrol

- secrets repo içinde değil
- passwordHash API'de yok
- DevTools gated
- unauthorized hospital blocked
- report final cannot be overwritten normally

---

## HARDEN-002 — Error UX

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** main frontend P0 tasks

### Kontrol

- 401
- 403
- 423
- 500
- network error
- audio upload error
- HBYS failure

---

## HARDEN-003 — Empty / Loading States

**Owner:** FRONTEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** main frontend P0 tasks

---

## HARDEN-004 — Mobile Not Required

**Owner:** FRONTEND  
**Priority:** P3  
**Status:** TODO  
**Depends On:** none

İlk pilot desktop-first olacaktır.

Bu görev pilot boyunca yapılmamalıdır.

---

# 37. POST PILOT TASKS

Aşağıdaki görevler ilk 5 günlük pilotu geciktirmemelidir.

---

## POST-001 — AI Report Draft

**Owner:** BACKEND / FRONTEND  
**Priority:** P3  
**Status:** TODO

---

## POST-002 — External Emergency Revision Portal

**Owner:** BACKEND / FRONTEND  
**Priority:** P3  
**Status:** TODO

---

## POST-003 — Full Addendum Workflow

**Owner:** BACKEND / FRONTEND  
**Priority:** P3  
**Status:** TODO

---

## POST-004 — Production Anonymization

**Owner:** BACKEND / FRONTEND  
**Priority:** P3  
**Status:** TODO

---

## POST-005 — Real Hospital HL7

**Owner:** BACKEND  
**Priority:** P3  
**Status:** BLOCKED_EXTERNAL

Requires hospital sample messages.

---

## POST-006 — Real Hospital PACS

**Owner:** BACKEND  
**Priority:** P3  
**Status:** BLOCKED_EXTERNAL

Requires PACS documentation/access.

---

## POST-007 — Real Hospital HBYS

**Owner:** BACKEND  
**Priority:** P3  
**Status:** BLOCKED_EXTERNAL

Requires HBYS API documentation/access.

---

# 38. AJAN ÇALIŞMA SIRASI — CLAUDE

Claude backend görevlerini kabaca şu sırayla yürütmelidir:

```text
SHARED-001
SHARED-002

BACKEND-001
BACKEND-002
BACKEND-003
BACKEND-004
BACKEND-005

BACKEND-006
BACKEND-007
BACKEND-008

BACKEND-009
BACKEND-010
BACKEND-011
BACKEND-012
BACKEND-013
BACKEND-014

BACKEND-015
BACKEND-016
BACKEND-017
BACKEND-018

BACKEND-021
BACKEND-022
BACKEND-023
BACKEND-024

BACKEND-025
BACKEND-026
BACKEND-027
BACKEND-028
BACKEND-029
BACKEND-030
BACKEND-032

BACKEND-033
BACKEND-034
BACKEND-035
BACKEND-036
BACKEND-037
BACKEND-038
```

Sonra P1.

---

# 39. AJAN ÇALIŞMA SIRASI — CODEX

Codex frontend görevlerini kabaca şu sırayla yürütmelidir:

```text
FRONTEND-001
FRONTEND-002
FRONTEND-003
FRONTEND-004

FRONTEND-005
FRONTEND-006
FRONTEND-007

FRONTEND-009
FRONTEND-011

FRONTEND-012
FRONTEND-013
FRONTEND-014
FRONTEND-015
FRONTEND-016

FRONTEND-017
FRONTEND-018
FRONTEND-019

FRONTEND-020
FRONTEND-021
```

Sonra P1.

---

# 40. FRONTEND ENDPOINT BEKLEME KURALI

Backend dependency henüz hazır değilse Codex:

- component structure,
- API hook,
- types,
- loading/error state

hazırlayabilir.

Ancak görevi:

```text
DONE
```

yapamaz.

Gerçek endpoint ile test edilmeden:

```text
IN_PROGRESS
```

veya uygun durumda bekler.

---

# 41. BACKEND FRONTEND BEKLEME KURALI

Claude hiçbir backend görevini:

> “frontend hazır değil”

diye durdurmamalıdır.

Contract ve backend testleri ile ilerler.

---

# 42. TASK CLAIM KURALI

Ajan göreve başlarken:

```text
Status: TODO
```

değerini:

```text
Status: IN_PROGRESS
```

yapar.

Aynı owner'dan ikinci ajan aynı görevi almamalıdır.

---

# 43. TASK COMPLETION KURALI

Ajan DONE yapmadan önce görevin altına kısa completion notu ekleyebilir:

```text
Completed:
- implementation
- tests
- commit: abc123
```

---

# 44. COMMIT KURALI

Her anlamlı task veya çok yakın task grubu commitlenir.

Örnek:

```text
feat(auth): implement authentication and sessions
```

Bir gün boyunca commit yapmadan çalışılmamalıdır.

---

# 45. PROGRESS UPDATE

Her 2–4 görevden sonra veya önemli milestone sonunda:

```text
PROGRESS.md
```

güncellenir.

---

# 46. TEST FAIL DURUMU

Test fail olursa:

```text
task remains IN_PROGRESS
```

Ajan hata nedeni belirginse düzeltir.

Bağımsız problemse:

```text
BLOCKED_TECHNICAL
```

yapar ve başka işe geçer.

---

# 47. SPEC CONFLICT

Task ile doküman çelişirse:

> task değil üst spesifikasyon kazanır.

Öncelik:

```text
MASTER_SPEC
WORKFLOW_STATE_MACHINE
AUTH_ROLES_PERMISSIONS
API_CONTRACT
TASK_QUEUE
```

---

# 48. YENİ GÖREV EKLEME

Ajan yeni iş keşfederse doğrudan plansız uygulamamalıdır.

Bu dosyanın sonuna:

```text
DISCOVERED-XXX
```

olarak ekleyebilir.

Öncelik vermelidir.

---

# 49. DISCOVERED TASK ÖRNEĞİ

```text
DISCOVERED-001
Owner: BACKEND
Priority: P1
Status: TODO

Issue:
Refresh session concurrency problem discovered during auth tests.
```

---

# 50. 5 GÜNLÜK PİLOT BLOCKER CHECKLIST

Aşağıdakiler DONE olmadan pilot hazır değildir:

```text
[ ] Auth
[ ] Roles
[ ] Hospital scope

[ ] First HL7
[ ] Second HL7
[ ] Accession match
[ ] Images available

[ ] Doctor queue
[ ] Doctor lock
[ ] Dictation

[ ] Reporter queue
[ ] Reporter lock
[ ] Audio playback
[ ] Report

[ ] Doctor approval
[ ] Final

[ ] Mock HBYS
[ ] HBYS success
[ ] HBYS failure
[ ] Manual retry

[ ] End-to-end happy path
[ ] End-to-end failure path

[ ] Railway backend
[ ] Vercel frontend
```

---

# 51. PILOT READY TANIMI

Pilot yalnızca:

> “frontend açılıyor”

diye hazır kabul edilmez.

Pilot ready:

```text
Doctor
↓
Reporter
↓
Doctor Final
↓
HBYS
```

zinciri gerçek backend state'leri ile çalışıyorsa geçerlidir.

---

# 52. SON KURAL

Ajanların temel çalışma döngüsü:

```text
Read docs
↓
Find highest priority available task
↓
Claim task
↓
Implement
↓
Test
↓
Fix
↓
Commit
↓
Mark DONE
↓
Update progress
↓
Select next task
```

şeklinde olacaktır.

Kullanıcı bilgisayar başında değilken de mümkün olduğunca bu döngü sürdürülmelidir.

Ajan yalnızca gerçekten dış bilgi, spesifikasyon belirsizliği veya çözülemeyen teknik engel olduğunda durmalıdır.