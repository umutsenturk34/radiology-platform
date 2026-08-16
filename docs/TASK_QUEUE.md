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
**Status:** DONE  
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

### Completed

- 10 model migration `20260814144451_init` ile Railway PostgreSQL'e uygulandı
- Canlı veritabanından doğrulandı: 19 unique index, 17 foreign key
- `studies_hospitalId_accessionNumber_key` mevcut — accession number global unique
  DEĞİL, yalnızca hastane içinde unique (DATA_MODEL section 16)
- Diğer doğrulanan unique kısıtlar: `patients (hospitalId, externalPatientId)`,
  `user_hospital_access (userId, hospitalId)`, `users.email`, `users.username`,
  `hospitals.code`, `user_sessions.refreshTokenHash`
- FIFO havuz sorgusu için `studies (hospitalId, status, arrivalAt)` index'i mevcut
- SLA snapshot alanları (`arrivalAt`, `slaDeadlineAt`) Study üzerinde tutuluyor

---

## BACKEND-005 — Seed System

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

doctor2@test.local      (BACKEND-018 / E2E-003 icin sonradan eklendi)
reporter2@test.local    (BACKEND-027 / E2E-004 icin sonradan eklendi)
```

Lock cakismasi senaryolari ayni rolden ikinci bir hesap olmadan
calistirilamadigi icin iki hesap sonradan eklendi.

### Acceptance

- seed birden fazla çalıştırılınca duplicate oluşturmuyor
- tüm test hesapları login için kullanılabilir

### Completed

- `src/prisma/seed.ts`: test hastanesi, 4 rol kullanıcısı, 3 SLA policy
- Idempotency gerçek unique kısıtlar üzerinden upsert ile kuruldu
  (`hospitals.code`, `users.email`, `user_hospital_access (userId, hospitalId)`);
  SlaPolicy'de unique olmadığı için önce aktif kayıt aranıyor
- Re-run mevcut kullanıcıların parolasını sıfırlamıyor (kullanımdaki
  credential'ı sessizce değiştirmemek için)
- argon2id (`@node-rs/argon2`) ile hashleme; parola hiçbir yere loglanmıyor
- `YOGUN_BAKIM` bilerek seed edilmedi (BLOCKED_SPEC — süre tanımsız)
- `apps/backend/package.json`: `pnpm seed` script'i + `prisma.seed` konfigürasyonu
- `.env.example`: `SEED_DEFAULT_PASSWORD` dokümante edildi; production'da zorunlu

Canlı doğrulama (Railway PostgreSQL, seed **iki kez** çalıştırıldı):

```text
hospitals(TEST_HOSPITAL) = 1     (toplam hospital = 1)
users(*@test.local)      = 4     (toplam user = 4)
user_hospital_access     = 4
sla_policies (active)    = 3     ACIL=120, YATAN=720, NORMAL=1440, warning=20
```

- Dört hesabın da saklanan hash'i seed parolası ile doğrulanıyor
  (`argon2.verify -> true`), yanlış parola reddediliyor → hesaplar login'e hazır
- `src/prisma/seed.spec.ts`: 8 birim testi (idempotency, parola sıfırlanmaması,
  YOGUN_BAKIM'ın seed edilmemesi, production parola zorunluluğu)

Gates: lint PASS, typecheck PASS, unit 15 PASS, e2e 8 PASS, build PASS

---

# 12. AUTH TASKS

---

## BACKEND-006 — Authentication

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `src/auth/`: AuthModule, AuthController, AuthService, TokenService,
  JwtAuthGuard, `@Public()` / `@CurrentUser()` decorator'ları
- `JwtAuthGuard` **global** guard olarak kayıtlı → default deny
  (AUTH_ROLES_PERMISSIONS section 85). Yalnızca `@Public()` işaretli route'lar
  (health, login, refresh, logout) token'sız erişilebilir
- Access token 15 dk (JWT_SECRET), refresh token 7 gün (JWT_REFRESH_SECRET);
  iki secret farklı olmak zorunda, production'da ikisi de zorunlu
- Refresh token yalnızca HttpOnly cookie ile taşınıyor (`Path=/api/v1/auth`,
  production'da `Secure` + `SameSite=None`); response body'sinde asla dönmüyor
- `UserSession.refreshTokenHash` = SHA-256(token); plain token DB'ye yazılmıyor
- Refresh **rotation**: eski session revoke edilir, yeni session açılır.
  Revoke edilmiş bir token tekrar sunulursa hırsızlık kabul edilip kullanıcının
  **tüm** session'ları revoke edilir
- Her guarded istekte session + user birlikte okunur → logout ve hesap
  pasifleştirme anında etkili (access token'ın süresi dolması beklenmez)
- Kullanıcı sayımı (enumeration) engellendi: bilinmeyen e-posta için de argon2
  doğrulaması yapılır ve yanlış parola ile birebir aynı yanıt döner
- Hesap durumu parola doğrulandıktan sonra kontrol edilir →
  `USER_INACTIVE` / `USER_SUSPENDED` (403), yanlış kimlik `INVALID_CREDENTIALS` (401)

Testler: 79 unit (`configuration`, `seed`, `token.service`, `auth.service`),
36 e2e (`health`, `auth`).

Canlı doğrulama (Railway PostgreSQL + gerçek seed hesapları):

```text
doctor/reporter/operation/manager login -> 200, doğru rol
yanlış parola  -> 401 INVALID_CREDENTIALS
bilinmeyen e-posta -> 401, gövdesi birebir aynı
GET /auth/me -> 200, hospitals: [TEST_HOSPITAL], passwordHash yok
GET /auth/me token'sız -> 401 UNAUTHORIZED
refresh (cookie) -> 200, cookie rotate ediliyor
rotate edilmiş cookie replay -> 401
logout -> 204, sonrasında refresh 401 ve eski access token 401
malformed body -> 422 VALIDATION_ERROR + details.fields
sunucu logunda parola/token/hash eşleşmesi: 0
```

Frontend etkisi (FRONTEND-002/003 için):
`refresh` çağrısından sonra dönen **yeni** access token kullanılmalıdır; rotation
eski session'ı kapattığı için önceki access token anında geçersiz olur.

Gates: lint PASS, typecheck PASS, unit 79 PASS, e2e 36 PASS, build PASS

---

## BACKEND-007 — Role Guard

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-006

### Acceptance

- Reporter finalize endpointine erişemiyor
- Doctor manager endpointine erişemiyor
- unauthorized request 403

### Completed

- `@Roles(...)` decorator'ı + `RolesGuard`; `JwtAuthGuard`'dan **sonra** global
  guard olarak kayıtlı (sıra önemli: principal önce request'e ekleniyor)
- `@Roles` taşımayan route'lar rol kısıtı olmadan geçer — bu route'lar kendi
  daha ince kontrollerine (hospital scope, assignment, lock) bırakılır
- Rol yalnızca doğrulanmış token + veritabanından okunur; request body'sindeki
  `role` alanı hiçbir zaman dikkate alınmaz
- MANAGER, DOCTOR gerektiren bir action'a otomatik erişemez
  (CLAUDE.md section 22)
- Hem `@Public()` hem `@Roles()` taşıyan bir route fail-closed reddedilir
- Kimlik doğrulama rol kontrolünden önce gelir → token yoksa 403 değil **401**

### Testler

- `src/auth/guards/roles.guard.spec.ts`: 11 birim testi
- `test/roles.e2e-spec.ts`: 21 e2e testi. Rotalar yalnızca teste özel
  `test/fixtures/roles-probe.controller.ts` üzerinden geliyor — finalize /
  manager users / HBYS retry rol gereksinimlerini birebir yansıtıyor, böylece
  API_CONTRACT'ta tanımlı olmayan production endpoint'i uydurulmuyor

Doğrulanan matris (AUTH_ROLES_PERMISSIONS section 57):

```text
finalize (DOCTOR)                -> DOCTOR 201 | REPORTER/OPERATION/MANAGER 403
manager users (MANAGER)          -> MANAGER 200 | DOCTOR/REPORTER/OPERATION 403
hbys retry (OPERATION|MANAGER)   -> OPERATION/MANAGER 201 | DOCTOR/REPORTER 403
rol kısıtsız route               -> 4 rol de 200, token'sız 401
token yok / bozuk token          -> 401 UNAUTHORIZED
```

Gates: lint PASS, typecheck PASS, unit 89 PASS, e2e 57 PASS, build PASS

---

## BACKEND-008 — Hospital Access Guard

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-006

### Acceptance

- user yetkisiz hastane Study'sini UUID ile açamıyor
- 403 `HOSPITAL_ACCESS_DENIED`
- query listesinde yetkisiz Study görünmüyor

### Completed

BACKEND-009 ile birlikte, sıkı bağlı bir grup olarak uygulandı: kabul
kriterleri gerçek `/studies` endpoint'lerini gerektiriyor.

- `HospitalScopeService`: `isAllowed`, `assertAllowed`, `buildFilter`
  - `MANAGER = all hospitals` (AUTH_ROLES_PERMISSIONS section 46, pilot
    varsayılanı). Başka hiçbir rol — OPERATION dahil — otomatik olarak tüm
    hastaneleri görmez (section 32)
  - Hiç hastane yetkisi olmayan kullanıcı için filtre `{ in: [] }` üretilir →
    fail-closed; sorgu asla filtresiz çalışmaz
  - Yetkisiz `hospitalId` filtresi sessizce boş liste değil, **403** üretir
- `HospitalAccessGuard`: hastaneyi doğrudan request'te taşıyan route'lar için
  (`@UseGuards`, global değil). Param > query > body sırasıyla okur, böylece
  body ile kontrol genişletilemez; hiç `hospitalId` yoksa 422 ile reddeder
- Kaynak üzerinden gelen kapsam (Study, Report) servis katmanında
  `HospitalScopeService` ile uygulanır

### Testler

- `src/auth/hospital-scope.service.spec.ts` — 14 birim testi
- `src/auth/guards/hospital-access.guard.spec.ts` — 11 birim testi
- `test/studies.e2e-spec.ts` — iki hastaneye yayılmış fixture'larla gerçek HTTP

Doğrulanan davranış:

```text
GET /studies            doctor/reporter/operation -> yalnızca TEST_HOSPITAL (2 kayıt)
                        manager                   -> her iki hastane (3 kayıt)
GET /studies?hospitalId=<yetkisiz>  -> 403 HOSPITAL_ACCESS_DENIED
GET /studies?search=<diğer hastanedeki hasta> -> boş liste (kapsam aşılmıyor)
GET /studies/:id  yetkisiz hastane, doğru UUID -> 403 HOSPITAL_ACCESS_DENIED
                                                  (gövdede hiç study verisi yok)
GET /studies/:id  manager                      -> 200
```

Canlı doğrulama (Railway): yetkisiz `hospitalId` filtresi 403, manager 200.
Veritabanında henüz Study kaydı yok (HL7 BACKEND-011'de geliyor), bu yüzden
çok-kayıtlı izolasyon e2e fixture'ları ile doğrulandı.

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
**Status:** DONE  
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

### Completed

- `src/studies/`: StudiesModule, StudiesController, StudiesService, mapper, DTO
- Varsayılan sıralama `arrivalAt ASC` (FIFO); ikincil anahtar `id ASC` ile
  sayfalama deterministik. `sortBy` yalnızca izinli kolonları kabul eder
- Sayfalama varsayılanları API_CONTRACT section 15'ten: page=1, pageSize=25,
  tavan 100; `count` ile `findMany` **aynı** where'i kullanır, aksi halde
  toplam sayı görülemeyen kayıtları da sayardı
- `pool` presetleri backend'de gerçek statülere çevrilir (section 25).
  `FINALIZED` = FINAL + HBYS_PENDING + HBYS_SENT + HBYS_FAILED — HBYS hatası
  Study'yi klinik olarak yeniden okunmamış yapmaz (TEST_SCENARIOS TS-053)
- `assignedDoctorId=me` / `assignedReporterId=me` alias'ı çağıranın id'sine
  çözülür (section 57)
- `search`: accessionNumber, studyDescription, hasta adı/soyadı ve
  externalPatientId üzerinde; hospital scope'un **üstüne** eklenir, yerine değil
- Prisma satırları hiçbir zaman doğrudan dönmez; mapper `hospitalId`,
  `patientId`, `assignedDoctorId` gibi persistence alanlarını dışarı vermez
- Geçersiz `studyId` 400 yerine 422 VALIDATION_ERROR üretir (section 112)

### Kapsam notu (fabrikasyon yok)

API_CONTRACT section 26/28 ayrıca `clinicalData`, `pacs`, `lock`, türetilmiş
SLA state'i ve `flags` alanlarını tanımlıyor. Bunların arkasındaki modeller
henüz yok, bu yüzden **uydurulmadı**; kendi görevleriyle gelecekler:

```text
lock            -> BACKEND-015
pacs            -> BACKEND-019 / BACKEND-020
sla.state       -> BACKEND-039   (şu an yalnızca saklanan deadlineAt dönüyor)
flags           -> BACKEND-041 (information) ve revision görevleri
clinicalData    -> ilgili model eklendiğinde
```

Paylaşılan sözleşme `packages/shared/src/api/study.ts` içine eklendi
(`StudyListItem`, `StudyDetail`, `StudyPool`, `StudySortField`,
`StudyListQuery`) — API_CONTRACT section 121 bunları zaten shared type olarak
listeliyor. Frontend etkisi: yukarıdaki eksik alanlar sonradan eklenecek.

### Testler

- `src/studies/studies.service.spec.ts` — 25 birim testi
- `test/studies.e2e-spec.ts` — gerçek HTTP üzerinden liste, filtre, sayfalama,
  sıralama, arama, detay ve hastane izolasyonu

Gates: lint PASS, typecheck PASS, unit 140 PASS, e2e 91 PASS, build PASS

---

## BACKEND-010 — HL7 Adapter Contract

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-004

### Yapılacaklar

- Hl7Adapter interface
- normalized first event
- normalized second event
- common validation

### Acceptance

- core service ham mock payload bilmiyor

### Completed

- `src/integrations/contracts/hl7.contract.ts`: `Hl7Adapter` arayüzü,
  `NormalizedHl7FirstEvent`, `NormalizedHl7SecondEvent`,
  `NormalizedClinicalData`, `HL7_ADAPTER` injection token'ı
- `src/integrations/contracts/integration.errors.ts`: INTEGRATIONS section 17'deki
  HL7 hata kodları + exception sınıfları. Bu kodlar **bilerek**
  `packages/shared`'daki `ApiErrorCode` enum'una eklenmedi; yalnızca pilot
  dev-tools ingestion endpoint'lerinden dönüyorlar ve API_CONTRACT'ta tanımlı
  değiller (AGENTS.md section 7 — sözleşme değişikliği doküman güncellemesi ister)
- `src/integrations/hl7/hl7-normalization.ts`: tüm adapter'ların paylaştığı
  doğrulama/normalizasyon
- `src/integrations/integration-registry.service.ts`:
  `getHl7Adapter(hospitalId)` (INTEGRATIONS section 4) — hastaneye özgü seçim
  controller/workflow içine dağılmıyor

Kritik güvenlik kararları:

```text
Adapter saf çeviridir: state okumaz, yazmaz.
Geçersiz timestamp "şimdi" ile doldurulmaz  -> SLA deadline'ı sessizce kaymaz.
Eşlenmemiş kategori kodu tahmin edilmez     -> yanlış SLA'ya bağlanmaz.
Bilinmeyen hastane alanları düşürülmez      -> clinicalData.additionalData'ya taşınır.
Eksik alanlar tek tek değil topluca raporlanır.
```

Adapter implementasyonu, registry wiring'i ve modül BACKEND-011 ile geliyor.

Testler: `src/integrations/hl7/hl7-normalization.spec.ts` — 32 birim testi.

---

## BACKEND-011 — Mock First HL7

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `MockHl7Adapter` (`src/integrations/hl7/mock-hl7.adapter.ts`) — saf çeviri,
  state okumaz/yazmaz. Hastane kategori kodlarını (`E`, `EMERG`, `ICU`, `I`,
  `O`) internal enum'a çevirir
- `Hl7Service.processFirstEvent` — patient find/create, Study create,
  `INITIAL -> WAITING_ACCEPTANCE` geçişi **WorkflowService üzerinden**
- DevTools endpoint'i Study status'una hiç dokunmaz; akış
  `DevTools -> MockHl7Adapter -> normalized event -> Hl7Service -> WorkflowService`
  (INTEGRATIONS section 18, WORKFLOW_STATE_MACHINE section 47)
- Idempotency: `hospitalId + accessionNumber` unique kısıtı üzerinden.
  Tekrar gelen mesaj ikinci patient/study yaratmaz ve **state'i resetlemez**;
  eşzamanlı iki mesajda unique violation yakalanıp duplicate olarak işlenir
- Mevcut hastanın demografisi tekrar gelen order ile sessizce ezilmez
- `arrivalAt` / `slaDeadlineAt` ilk HL7'de **bilerek** set edilmez: SLA saati
  ikinci HL7'de başlar (WORKFLOW_STATE_MACHINE section 60)
- Audit zinciri: `HL7_FIRST_RECEIVED`, `PATIENT_CREATED`, `STUDY_CREATED`,
  `STUDY_STATUS_CHANGED`

Canlı doğrulama (Railway, gerçek endpoint):

```text
POST /dev-tools/hl7/first (category "E")  -> 201, status WAITING_ACCEPTANCE
tekrar aynı mesaj                          -> 201, duplicate: true, aynı studyId
veritabanında accession için study sayısı  -> 1
audit: HL7_FIRST_RECEIVED, STUDY_CREATED, STUDY_STATUS_CHANGED
status history: INITIAL -> WAITING_ACCEPTANCE
```

Testler: 21 adapter birim testi, 12 Hl7Service birim testi (gerçek
WorkflowService + AuditService ile).

---

## BACKEND-012 — Mock Second HL7

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `Hl7Service.processSecondEvent` — eşleştirme yalnızca
  `hospitalId + accessionNumber` üzerinden (INTEGRATIONS section 10)
- `externalPatientId` eşleştirme için **kullanılmaz**; yalnızca çelişki
  kontrolü için karşılaştırılır. Çelişki varsa
  `409 HL7_PATIENT_MISMATCH` + audit, Study'ye dokunulmaz
  (INTEGRATIONS section 11, CLAUDE.md section 16)
- Eşleşen Study yoksa `409 HL7_ACCESSION_CONFLICT`
- `WAITING_ACCEPTANCE -> IMAGES_PENDING` geçişi WorkflowService üzerinden
- SLA saati burada başlar: `arrivalAt = acceptedAt`,
  `slaDeadlineAt = arrivalAt + aktif policy süresi` (snapshot, DATA_MODEL 66).
  `YOGUN_BAKIM` için aktif policy yok → deadline **null** bırakılır ve loglanır
  (BLOCKED_SPEC — süre uydurulmaz)
- Tekrar gelen ikinci HL7 Study'yi geri sarmaz; duplicate olarak audit edilir
  ve `arrivalAt` değişmez (geç gelen duplicate SLA'yı uzatamaz)

Canlı doğrulama:

```text
mismatched externalPatientId -> 409 HL7_PATIENT_MISMATCH, status değişmedi
doğru mesaj                  -> 200, IMAGES_PENDING
                                arrivalAt 22:22:13Z, slaDeadlineAt 00:22:13Z (ACIL=120dk)
tekrar aynı mesaj            -> 200, duplicate: true, arrivalAt aynı
```

---

## BACKEND-013 — Images Available Simulation

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `StudyImagesService.markImagesAvailable` — production'da PACS'in ürettiği
  event (INTEGRATIONS section 25); dev-tools endpoint'i aynı servise iner,
  yani simüle edilen yol ile gerçek yol tek implementasyondur
- `IMAGES_PENDING -> UNREAD` geçişi WorkflowService üzerinden; uygun olmayan
  state'ten çağrılırsa `409 INVALID_STATE_TRANSITION`
- `imagesAvailableAt` ve opsiyonel `studyInstanceUid` aynı transaction'da yazılır
- Hospital scope kontrol edilir (Manager tüm hastaneleri görse de kural
  bu tesadüfe bırakılmadı)
- Audit: `IMAGES_AVAILABLE` + `STUDY_STATUS_CHANGED`; status history yazılır

Canlı doğrulama:

```text
POST /dev-tools/studies/:id/images-available -> 200, UNREAD
tekrar çağrı                                  -> 409 INVALID_STATE_TRANSITION
doktor GET /studies?pool=UNREAD               -> Study listede görünüyor
```

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
**Status:** DONE  
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

### Completed

- `src/workflow/`: `WorkflowService` + `workflow.transitions.ts`
- Geçiş tablosu WORKFLOW_STATE_MACHINE section 38'den birebir alındı; tabloda
  olmayan her geçiş reddedilir (fail-closed)
- Tek transaction içinde: Study update + `StudyStatusHistory` + `AuditService`
  kaydı (section 43). Geçersiz geçişte hiçbir şey yazılmaz
- Controller'lar status yazmaz; genel amaçlı "set status" API'si **yoktur**
  (modül bilerek controller içermiyor)
- `studyData` ile çağıranın ek kolonları aynı update'te yazılır, ancak
  `status` her zaman doğrulanmış hedef ile ezilir — çağıran tabloyu atlayamaz
- Workflow timestamp'leri (`readingStartedAt`, `finalizedAt`, ...) geçişte
  damgalanır. `imagesAvailableAt` bilerek tabloda değil: UNREAD'e
  IMAGE_MISSING ve WONT_REPORT üzerinden de gelinir, damgalamak olmayan bir
  görüntü gelişini kaydederdi

Testler: 34 birim testi — tablo (22 izinli/reddedilen geçiş), tam happy path
(INITIAL → HBYS_SENT), HBYS fail + manual retry yolu, geçersiz geçişte
yazma yapılmaması, `studyData` ile status ezilememesi.

---

# 16. LOCKING

---

## BACKEND-015 — Redis Study Lock Service

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `src/locks/`: `StudyLockService` — `acquire`, `heartbeat`, `release`,
  `forceRelease`, `getLock`, `describe`
- Acquire tek bir atomik `SET NX PX`; ayrı kontrol+yazma yok, dolayısıyla
  TOCTOU yarışı yok (WORKFLOW_STATE_MACHINE section 31)
- Release ve heartbeat **Lua compare-and-act** ile: aradaki sürede lock süresi
  dolup başkasına geçtiyse onun kilidi silinmez/uzatılmaz
- TTL 60 sn, heartbeat 20 sn (config: `LOCK_TTL_SECONDS`,
  `LOCK_HEARTBEAT_SECONDS`). Heartbeat >= TTL yapılandırması başlangıçta
  reddedilir — aksi halde aktif kullanıcı kilidini kaybederdi
- Redis erişilemezse **her** işlem 503 ile fail-closed; "kilit yok" varsayımı
  hiçbir yolda yapılmaz (CLAUDE.md section 17). Bozuk lock değeri de
  "unlocked" olarak okunmaz
- `acquire` sonucu `alreadyOwned` taşır: çağıran hata durumunda yalnızca
  kendi aldığı kilidi bırakır, sahibin geçerli kilidini düşürmez

Testler: 24 birim testi — ikinci doktor 423, ikinci raportör 423, stale lock
TTL ile düşüyor, heartbeat TTL'i uzatıyor, süresi dolmuş kilit üzerinde
heartbeat reddediliyor, geç gelen release başkasının kilidini silmiyor,
Redis çöktüğünde 5 işlemin hepsi 503.

---

## BACKEND-016 — Start Reading

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `POST /studies/:id/start-reading` — `StudyActionsService.startReading`
- Kontrol sırası API_CONTRACT section 30'daki gibi: authorization → hospital →
  lock → state. **Sıra önemli:** doktor A okumaya başladıktan sonra status
  artık UNREAD değildir; state önce kontrol edilseydi doktor B'ye 423 yerine
  409 dönerdi (BACKEND-018 kabul kriteri 423 istiyor)
- Lock alındıktan sonra transaction: audit + `StudyAssignment` +
  `UNREAD -> READING` (WorkflowService üzerinden, `assignedDoctorId` ile)
- Transaction başarısız olursa **bu çağrının aldığı** kilit geri bırakılır;
  Redis transaction dışındadır ve telafi gerektirir (WORKFLOW section 43)
- Response API_CONTRACT section 31 ile uyumlu: `lock.heartbeatIntervalSeconds`
  dahil

---

## BACKEND-017 — Lock Heartbeat / Release

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-015

### Endpointler

- POST `/studies/:id/lock/heartbeat`
- POST `/studies/:id/lock/release`
- POST `/studies/:id/lock/force-release`

### Acceptance

- only owner heartbeat
- force release reason zorunlu
- force release audit var

### Completed

- `POST /studies/:id/lock/heartbeat` — yalnızca lock sahibi, aksi 423
  `LOCK_NOT_OWNED`
- `POST /studies/:id/lock/release` — yalnızca sahibi. Study status'u
  **değiştirmez** (API_CONTRACT section 34): çalışma ekranından çıkmak klinik
  ilerlemeyi geri almaz
- `POST /studies/:id/lock/force-release` — yalnızca OPERATION / MANAGER,
  `reason` zorunlu, önceki sahip ve rolü ile birlikte audit edilir
  (CLAUDE.md section 18)
- `GET /studies/:id/lock` — sahip, rol ve kalan süre; frontend 423'ü
  anlaşılır gösterebilsin diye (API_CONTRACT section 104)
- Hepsinde hospital scope kontrol ediliyor

---

## BACKEND-018 — Doctor Lock Concurrency Test

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

`test/study-locks.e2e-spec.ts` — iki gerçek doktor hesabıyla, gerçek HTTP
üzerinden 29 test. Kilit her testte sıfırdan başlar (test başına ayrı uygulama).

Doğrulanan zorunlu davranışlar:

```text
doktor A start-reading            -> 200, READING, lock A'da
doktor B start-reading            -> 423 STUDY_LOCKED (+ sahip bilgisi)
eşzamanlı iki istek               -> tam olarak biri 200, diğeri 423
reddedilen ikinci denemeden sonra -> Study hala A'da, status READING
doktor B heartbeat/release        -> 423 LOCK_NOT_OWNED
doktor B force-release            -> 403 FORBIDDEN
operation force-release reason'sız-> 422 VALIDATION_ERROR
```

Canlı doğrulama (Railway PostgreSQL + Redis, seed'deki iki doktor hesabı):
yukarıdaki zincirin tamamı gerçek servislere karşı aynı sonuçları verdi.

Seed notu: bu senaryo için ikinci bir doktor hesabı gerekiyordu, bu yüzden
seed'e `doctor2@test.local` ve (E2E-004 için) `reporter2@test.local` eklendi.
Seed yeniden çalıştırıldı: 6 kullanıcı, 6 hospital access, duplicate yok.

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
**Status:** DONE  
**Depends On:** BACKEND-004

### Model

Dictation.

### Acceptance

migration çalışıyor.

### Completed

- `Dictation` modeli + migration `20260815235012_add_dictation` Railway'de
  uygulandı (additive; mevcut tablolara dokunulmadı)
- Alanlar DATA_MODEL section 30 ile birebir; ek olarak `failureReason`:
  yükleme başarısız olduğunda kayıt `FAILED` olur ve neden saklanır, böylece
  hekime "tamamlandı" görünmez
- `DictationStatus` enum'u: RECORDING / UPLOADING / COMPLETED / FAILED
- Study 1 → N Dictation (DATA_MODEL section 33)
- Ses binary'si tabloda **yok**; yalnızca `storageKey`, `fileSize`, `checksum`

---

## BACKEND-022 — Object Storage Abstraction

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-021

### Interface

- upload
- getSignedPlaybackUrl
- delete disabled for clinical normal path

### Acceptance

storage implementation replace edilebilir.

### Completed

- `src/storage/object-storage.contract.ts`: `upload`, `createReadStream`,
  `getSize`, `getSignedUrl`. **Delete yok** — klinik kaydı silmek normal
  workflow'un parçası değil, bu yüzden yetenek hiç tanımlanmadı
- `LocalObjectStorageAdapter`: pilot için yerel dizin. Key'ler backend
  tarafından üretilse de path traversal kontrolü var
- `OBJECT_STORAGE_DRIVER=s3` seçilirse uygulama **başlangıçta hata verir**;
  sessizce yerel diske yazıp "bucket'a yazıyorum" sanmaz. Gerçek bucket
  DEVOPS-004 ile geliyor
- Production'da `local` sürücü seçiliyse startup uyarısı: dosyalar redeploy'da
  kaybolur

### Bilinen sınır

Yerel sürücü Railway container'ı yeniden kurulduğunda kayıtları kaybeder.
Pilot test kayıtları için kabul edilebilir; DEVOPS-004 bu yüzden açık.

---

## BACKEND-023 — Dictation API

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `POST /studies/:id/dictations` — DOCTOR + **lock sahibi** + Study READING
- `POST /dictations/:id/upload` — multipart; yalnızca kaydı başlatan hekim.
  Tamamlanmış bir kaydın üzerine yazmak 409 ile reddedilir: raportörün
  dinlemiş olabileceği klinik ses sessizce değiştirilemez
- Yükleme hata verirse kayıt `FAILED` + `failureReason` olur
- `GET /studies/:id/dictations` — hospital scope; raportör de görebilir
- `GET /dictations/:id/playback` — kısa ömürlü URL (varsayılan 300 sn)
- `GET /dictations/:id/audio` — `<audio>` elementi Authorization header
  gönderemediği için `@Public()`, ancak yetki tamamen imzalı token'dan gelir:
  token dictation'a ve kullanıcıya bağlı, HMAC ile imzalı, süreli; stream
  başlamadan önce kullanıcının hospital scope'u yeniden kontrol edilir
- MIME whitelist; boyut tavanı `MAX_DICTATION_UPLOAD_BYTES`

Testler: 11 playback-token birim testi + 24 e2e.

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
**Status:** DONE  
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

### Completed

- `POST /studies/:id/complete-reading` — DOCTOR + lock sahibi + Study READING
- **Tamamlanmış dictation zorunlu**; yoksa `422 DICTATION_REQUIRED`. Aksi halde
  raportör kuyruğuna dinleyecek sesi olmayan bir dosya düşerdi
- Tek transaction içinde `READING -> READ -> WAITING_TRANSCRIPTION` (READ kısa
  ömürlü internal state, API_CONTRACT section 43) + doctor assignment release
  + audit
- Lock **commit sonrası** bırakılır: önce bırakılsaydı commit başarısız
  olduğunda hala READING olan bir Study'yi başka hekim alabilirdi

Canlı doğrulama (Railway + yerel object storage):

```text
complete-reading (ses yok)   -> 422 DICTATION_REQUIRED, status READING kalıyor
dictation create             -> 201 RECORDING
upload (1088 bayt)           -> 200 COMPLETED, checksum kaydedildi
raportör playback            -> 200, kısa ömürlü token'lı URL
audio token ile              -> 200, 1088 bayt (byte-exact)
audio token'sız              -> 401
complete-reading             -> 200 WAITING_TRANSCRIPTION, lockReleased true
lock                         -> locked false
raportör kuyruğu             -> Study görünüyor
veritabanı satırı            -> yalnızca storageKey/fileSize/checksum, ses yok
audit zinciri                -> 14 kayıt, DICTATION_STARTED/UPLOADED dahil
```

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
**Status:** DONE  
**Depends On:** BACKEND-004

### Models

- Report
- ReportVersion

### Acceptance

- one main report per Study
- many versions
- final version overwrite edilmiyor

### Completed

- `Report` (studyId unique) + `ReportVersion` modelleri, migration
  `20260816000728_add_report_models` Railway'de uygulandı
- `(reportId, versionNumber)` unique (DATA_MODEL section 38)
- `Report.currentVersionId` yalnızca hızlı erişim pointer'ı; eski versiyonlar
  silinmez (section 41)
- `supersedesVersionId` ile versiyon zinciri korunuyor
- Final/completed versiyon **yerinde düzenlenmez**: içerik değişikliği yeni
  versiyon gerektirir (section 40, CLAUDE.md section 21). Servis katmanı
  düzenlenebilir statüleri DRAFT/REVISION_DRAFT ile sınırlıyor

---

## BACKEND-026 — Start Transcription

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-025, BACKEND-015

### Endpoint

POST `/studies/:id/start-transcription`

### Acceptance

- only Reporter
- WAITING_TRANSCRIPTION
- Reporter assignment
- Reporter lock
- TRANSCRIBING

### Completed

- `POST /studies/:id/start-transcription` — REPORTER + WAITING_TRANSCRIPTION
- Lock state'ten **önce** alınıyor (start-reading ile aynı gerekçe): raportör A
  başladıktan sonra status TRANSCRIBING olur; state önce bakılsaydı raportör B
  423 yerine 409 alırdı
- Reporter assignment + `assignedReporterId` + ilk DRAFT versiyon aynı
  transaction'da oluşturuluyor
- Rapor yoksa oluşturulur; varsa ve mevcut versiyon düzenlenebilir değilse
  bir sonraki versiyon numarasıyla yeni DRAFT açılır

---

## BACKEND-027 — Reporter Concurrency Test

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-026

### Acceptance

Reporter A aldıktan sonra Reporter B 423 alıyor.

### Completed

`test/reports.e2e-spec.ts` içinde iki gerçek raportör hesabıyla doğrulandı:

```text
raportör A start-transcription      -> 200 TRANSCRIBING
raportör B start-transcription      -> 423 STUDY_LOCKED (+ sahip bilgisi)
eşzamanlı iki istek                 -> tam olarak biri 200, diğeri 423
raportör B draft save               -> 423 LOCK_NOT_OWNED
raportör B submit                   -> 423 LOCK_NOT_OWNED
reddedilen denemeden sonra          -> Study hala A'da
```

Canlı doğrulama (Railway + Redis, seed'deki `reporter` ve `reporter2`):
aynı sonuçlar gerçek servislere karşı alındı.

---

## BACKEND-028 — Report Draft API

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-025, BACKEND-026

### Endpointler

- GET `/studies/:id/report`
- PUT `/studies/:id/report/draft`

### Acceptance

- only lock owner edit
- draft persistence
- timestamp response

### Completed

- `GET /studies/:id/report` — hospital scope; hekim de okuyabilir
- `PUT /studies/:id/report/draft` — yalnızca lock sahibi raportör, yalnızca
  TRANSCRIBING durumunda, yalnızca DRAFT/REVISION_DRAFT versiyona
- Boş içerik autosave için **kabul edilir**: raportör yazarken tetiklenen
  autosave'i reddetmek istemciye yanlış "kaydedilemedi" gösterirdi
- Tamamlanmış/final versiyona yazma girişimi 409 ile reddedilir
- Başkasının draft'ına yazma girişimi 403

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
**Status:** DONE  
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

### Completed

- `POST /studies/:id/submit-report` — REPORTER + lock sahibi + TRANSCRIBING
- Versiyon `COMPLETED` + `completedAt`; Report `WAITING_APPROVAL`;
  `currentVersionId` işaretlenir
- Reporter assignment release edilir, `TRANSCRIBING -> WAITING_APPROVAL`
  geçişi WorkflowService üzerinden, hepsi tek transaction'da
- Lock **commit sonrası** bırakılır
- Boş/yalnızca boşluk içeren rapor 422 ile reddedilir: onay kuyruğuna
  onaylanacak içeriği olmayan bir dosya düşmemeli
- Audit'e rapor metni değil yalnızca uzunluğu yazılır (CLAUDE.md section 42)

Canlı doğrulama:

```text
boş submit          -> 422, Study TRANSCRIBING kalıyor
submit              -> 200 WAITING_APPROVAL, lockReleased true
hekim onay kuyruğu  -> Study görünüyor
submit sonrası draft-> 409, içerik değişmedi (version 1 COMPLETED)
```

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
**Status:** DONE  
**Depends On:** BACKEND-029

### Endpoint

POST `/studies/:id/start-approval`

### Acceptance

- assigned Doctor
- approval lock
- WAITING_APPROVAL korunuyor

### Completed

- `POST /studies/:id/start-approval` — DOCTOR + WAITING_APPROVAL + approval lock
- Study status **WAITING_APPROVAL olarak kalır**; onay için ayrı state
  üretilmez (WORKFLOW_STATE_MACHINE section 15)
- Study başka bir hekime atanmışsa `403 STUDY_NOT_ASSIGNED_TO_USER`
- İkinci hekim 423 STUDY_LOCKED
- `PUT /studies/:id/report/approval-draft` (API_CONTRACT section 59):
  hekim düzeltmesi raportörün tamamlanmış versiyonunun **üzerine yazmaz**,
  yeni bir versiyon açar (`supersedesVersionId` ile bağlı). Aynı hekim ikinci
  kez kaydederse kendi draft'ı güncellenir, her seferinde yeni versiyon açılmaz

---

## BACKEND-031 — Return to Reporter

**Owner:** BACKEND  
**Priority:** P1  
**Status:** DONE  
**Depends On:** BACKEND-030

### Endpoint

POST `/studies/:id/return-to-reporter`

### Acceptance

- reason zorunlu
- WAITING_TRANSCRIPTION
- notification/audit

### Completed

- `POST /studies/:id/return-to-reporter` — DOCTOR + lock sahibi +
  WAITING_APPROVAL; `reason` zorunlu (raportör neyi düzelteceğini bilmeli)
- `WAITING_APPROVAL -> WAITING_TRANSCRIPTION` WorkflowService üzerinden,
  audit ile; lock bırakılır
- Raportör tekrar aldığında yeni bir DRAFT versiyon açılır, tamamlanmış
  versiyon yerinde düzenlenmez

Not: realtime bildirim BACKEND-045 (WebSocket gateway) ile gelecek.

---

## BACKEND-032 — Finalize Report

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
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

### Completed

- `POST /studies/:id/finalize` — yalnızca **ilgili DOCTOR** + lock sahibi +
  WAITING_APPROVAL
- Tek transaction içinde: final ReportVersion + `finalizedAt` + Report FINAL +
  `WAITING_APPROVAL -> FINAL` + HbysDelivery (PENDING) + `FINAL -> HBYS_PENDING`
  + audit. Finalize edilmiş bir rapor **hiçbir zaman** gönderimi olmadan
  var olamaz (CLAUDE.md section 23)
- Metin değiştirilmeden onaylanırsa mevcut versiyon FINAL olur; hekim metni
  değiştirirse yeni versiyon FINAL olur ve eski versiyon `SUPERSEDED` işaretlenir
  — üzerine yazılmaz (CLAUDE.md section 21)
- Boş rapor 422; ikinci finalize 409 ve **ikinci delivery oluşmaz**
- REPORTER / OPERATION / MANAGER için 403 (CLAUDE.md sections 22, 62)
- HBYS beklenmez: yanıt `HBYS_PENDING` döner (API_CONTRACT section 63)

Canlı doğrulama (Railway, tam zincir tek Study üzerinde):

```text
reporter/operation/manager finalize -> 403 FORBIDDEN (delivery oluşmadı)
doktor start-approval               -> 200, status WAITING_APPROVAL olarak kaldı
ikinci doktor start-approval        -> 423 STUDY_LOCKED
hekim approval-draft                -> 200, version 2 açıldı
finalize                            -> 200, HBYS_PENDING, delivery PENDING
ikinci finalize                     -> 409, delivery sayısı hala 1

veritabanı:
  v1 REPORTER/COMPLETED  "Raportor metni..."      (korundu)
  v2 MANUAL/FINAL        "Hekim duzeltmesi..."    (v1'i supersede ediyor)
  delivery: PENDING, attemptCount 0, deterministik idempotencyKey
  10 transition INITIAL -> HBYS_PENDING, 24 audit kaydı
```

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
**Status:** DONE  
**Depends On:** BACKEND-003

### Acceptance

test job enqueue/worker çalışıyor.

### Completed

- `src/queues/`: BullMQ `Queue` (`hbys-delivery`) + `HbysDeliveryWorker`
- Kuyruk ve worker **ayrı Redis bağlantıları** kullanıyor: BullMQ blocking
  komutlar çalıştırır, uygulamanın paylaşılan client'ını kullansaydı Study
  kilitleri bloke olurdu. `RedisService.createConnection()` bu bağlantıları
  açıyor ve shutdown'da kapatıyor
- Retry programı dokümandaki gibi (30 sn / 2 dk / 5 dk), üstel eğri değil;
  `HBYS_RETRY_DELAYS_MS` ile yapılandırılabilir. Attempt sayısı = gecikme
  sayısı + 1
- Job geçmişi sınırlı (`removeOnComplete: 100`); kalıcı kayıt PostgreSQL'deki
  `HbysDeliveryAttempt` satırlarıdır, job değil

---

## BACKEND-034 — HBYS Data Models

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-004

### Models

- HbysDelivery
- HbysDeliveryAttempt

### Acceptance

migration başarılı.

### Completed

- `HbysDelivery` + `HbysDeliveryAttempt` modelleri, migration
  `20260816060458_add_hbys_delivery` Railway'de uygulandı
- `idempotencyKey` **unique**: anahtar `sha256(studyId:reportVersionId)` ile
  deterministik üretiliyor, yani aynı finalize edilmiş rapor için ikinci bir
  mantıksal gönderim veritabanı seviyesinde engelleniyor
  (INTEGRATIONS section 42, CLAUDE.md section 26)
- `(deliveryId, attemptNumber)` unique; her deneme ayrı satır — manuel retry
  önceki denemeleri silmez (CLAUDE.md section 25)
- Attempt tablosunda yalnızca metadata tutulur; istek/yanıt gövdeleri
  saklanmaz (DATA_MODEL section 57)

---

## BACKEND-035 — HBYS Adapter Contract

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-034

### Acceptance

normalized send contract var.

### Completed

- `src/integrations/contracts/hbys.contract.ts`: `HbysAdapter`,
  `NormalizedHbysReport`, `HbysDeliverySuccess` / `HbysDeliveryFailure`
- `retryable` bayrağı adapter'dan gelir (INTEGRATIONS section 40): timeout ve
  5xx yeniden denenir, kalıcı red denenmez
- Core servis hastane transport/auth detayını bilmez; credential core'a
  ulaşmaz (section 49)

---

## BACKEND-036 — Mock HBYS Adapter

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-035

### Modes

- SUCCESS
- FAIL
- TIMEOUT

### Acceptance

üç mode deterministic test edilebiliyor.

### Completed

- `MockHbysAdapter` — SUCCESS / FAIL / TIMEOUT, **rastgelelik yok**
  (CLAUDE.md section 27)
- Mod Redis'te tutuluyor, böylece istek ile worker aynı modu görür
- `SUCCESS` → `externalReportId` idempotency key'den türetilir; aynı teslimat
  hep aynı id'yi bildirir
- `FAIL` → `retryable: false` (kalıcı red yeniden denenmez)
- `TIMEOUT` → yapılandırılabilir gecikme + `retryable: true`
- `PUT /dev-tools/mock-hbys` ile mod değiştirilir (MANAGER + DEV_TOOLS_ENABLED)

---

## BACKEND-037 — HBYS Delivery Worker

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-033, BACKEND-034, BACKEND-036, BACKEND-032

### Acceptance

- finalize job enqueue
- attempts persist
- SUCCESS → HBYS_SENT
- failure retry
- exhausted → HBYS_FAILED

### Completed

- Finalize → job enqueue (commit sonrası); worker `HbysDeliveryService`
  üzerinden gönderir
- Her deneme `HbysDeliveryAttempt` olarak kaydedilir; yalnızca metadata,
  istek/yanıt gövdesi saklanmaz
- SUCCESS → delivery SENT + `externalReportId`, Study `HBYS_SENT`
- Retryable hata + bütçe varsa → delivery PENDING'e döner, BullMQ yeniden dener
- Bütçe bittiğinde veya kalıcı hatada → delivery FAILED, Study `HBYS_FAILED`,
  audit yazılır. Hata **gizlenmez** (CLAUDE.md section 25)
- Çift gönderim koruması: `claim()` atomik bir koşullu update
  (PENDING/FAILED → PROCESSING). Zaten gönderilmiş bir teslimat için gelen
  ikinci job hiçbir şey yapmaz

### Canlı testte bulunan ve düzeltilen iki hata

1. **Sabit `jobId`** — job id'si delivery id'sine sabitlenmişti. BullMQ
   tamamlanmış job'u geçmişte tuttuğu için aynı id ile eklenen manuel retry
   job'u **sessizce yok sayılıyordu** ve retry hiç çalışmıyordu. Job id artık
   BullMQ'ya bırakıldı; çift işlemeyi zaten `claim()` engelliyor.
2. **Attempt numarası kuyruktan alınıyordu** — manuel retry yeni bir job
   başlattığı için sayaç 1'e dönüyor ve
   `(deliveryId, attemptNumber)` unique kısıtını ihlal ediyordu; teslimat
   `PROCESSING`'de takılı kalıyordu. Artık kalıcı numara delivery'nin kendi
   sayacından geliyor; kuyruk sayacı yalnızca "yeni otomatik deneme var mı"
   kararında kullanılıyor (manuel retry'a taze bütçe verir).
3. Ek sağlamlık: gönderim sonrası beklenmedik hata olursa claim geri alınır
   (bütçe varsa PENDING, yoksa FAILED). Aksi halde teslimat kalıcı olarak
   `PROCESSING`'de kalır, hiçbir şey onu alamaz ve Study sessizce
   `HBYS_PENDING`'de asılı kalırdı.

---

## BACKEND-038 — Manual HBYS Retry

**Owner:** BACKEND  
**Priority:** P0  
**Status:** DONE  
**Depends On:** BACKEND-037

### Endpoint

POST `/hbys-deliveries/:id/retry`

### Acceptance

- Operation/Manager only
- reason
- new attempt
- HBYS_PENDING

### Completed

- `POST /hbys-deliveries/:id/retry` — OPERATION / MANAGER, `reason` zorunlu
- Yalnızca `FAILED` teslimat yeniden denenebilir; gönderilmiş teslimat için
  `409 HBYS_NOT_RETRYABLE` (aksi halde rapor hastanede mükerrer olurdu)
- Önceki denemeler korunur, rapor versiyonu değişmez; Study `HBYS_PENDING`'e
  döner ve yeni job kuyruğa girer
- `GET /studies/:id/hbys-deliveries` — hastane kapsamı olan her rol görebilir
- `GET /hbys-deliveries/:id/attempts` — OPERATION / MANAGER, rapor içeriği yok

### Canlı doğrulama (Railway + gerçek BullMQ worker)

```text
A) SUCCESS  finalize -> HBYS_PENDING, worker -> HBYS_SENT
            delivery SENT, 1 deneme, externalReportId dolu
B) FAIL     1 deneme, retry yok -> HBYS_FAILED
            attempts: 1:FAILED:MOCK_HBYS_REJECTED
C) RETRY    doctor 403 | operation 200
            -> HBYS_SENT, attempts: 1:FAILED, 2:SENT (geçmiş korundu)
D) TIMEOUT  4 deneme (1 + 3 otomatik retry) -> HBYS_FAILED
            attempts: 1..4 hepsi MOCK_HBYS_TIMEOUT
```

Bu, CLAUDE.md section 60'taki zorunlu hata yolunun tamamıdır:
`FAIL -> retry -> HBYS_FAILED -> manual retry -> HBYS_SENT`.

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
**Status:** DONE  
**Depends On:** BACKEND-006

### Kural

```text
DEV_TOOLS_ENABLED=true
+
MANAGER
```

### Acceptance

production flag false ise route disabled.

### Completed

- `DevToolsGuard` + `@Roles(UserRole.MANAGER)` — **iki bağımsız koşul**
- Flag her istekte okunur; kapalıysa `403 DEV_TOOLS_DISABLED` ve uyarı logu.
  Route'u hiç kaydetmemek yerine açık reddetme seçildi: production'da yanlış
  yapılandırma "route yok" gibi görünmek yerine audit edilebilir bir hata verir
- `DEV_TOOLS_ENABLED=true` tek başına yetmez: DOCTOR/REPORTER/OPERATION
  yine `403 FORBIDDEN` alır

Testler: `test/dev-tools.e2e-spec.ts` — flag kapalı/açık iki ayrı uygulama
başlatılarak her iki koşul tek tek doğrulandı.

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

---

# 53. DISCOVERED TASKS

---

## DISCOVERED-001 — Auth Endpoint Rate Limiting

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-006  
**Keşfedildi:** BACKEND-006 sırasında

### Issue

`docs/BACKEND.md` section 119 auth endpointleri için rate limit istiyor ve
`API_CONTRACT.md` section 113 `429 RATE_LIMITED` yanıtını tanımlıyor, ancak
BACKEND-006 kapsamında uygulanmadı. `POST /auth/login` şu anda sınırsız
denemeye açık.

### Yapılacaklar

- `@nestjs/throttler` ile login/refresh için makul bir pilot limiti
- Limit aşımında `429` + `RATE_LIMITED` (mevcut error envelope ile)
- Sağlık probe'unun (`/health`) limite takılmaması

---

## DISCOVERED-002 — Prisma Connection Pool Configuration

**Owner:** BACKEND / DEVOPS  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-002  
**Keşfedildi:** BACKEND-006 canlı doğrulaması sırasında

### Issue

Railway'e developer makinesinden TCP proxy üzerinden bağlanırken tek bir
PostgreSQL bağlantısının kurulması ~3-7 sn sürebiliyor. Prisma'nın varsayılan
havuzu (`cpu * 2 + 1` = 21) varsayılan 10 sn `pool_timeout` içinde
dolduramadığı için uygulama açılışta `P2024` ile düşüyor.

### Evidence

```text
PrismaClientInitializationError: Timed out fetching a new connection from the
connection pool (Current connection pool timeout: 10, connection limit: 21)

Kontrol: SELECT count(*) FROM pg_stat_activity -> 9,
         max_connections -> 500  (sunucu tarafı tükenmiş DEĞİL)
```

### Workaround (uygulandı)

Yerel `.env` içindeki `DATABASE_URL`'e
`connection_limit=5&pool_timeout=30` eklendi; `.env.example` bunu dokümante
ediyor.

### Yapılacaklar

- Havuz ayarlarını env üzerinden yapılandırılabilir hale getirmek
- DEVOPS-001/002'de Railway içi (internal hostname) deploy için uygun
  değerleri belirlemek — proxy gecikmesi orada olmayacağı için farklı olabilir

### Ek bulgu (BACKEND-011 canlı testinde)

Aynı gecikme Prisma'nın **interactive transaction** varsayılanını da aşıyordu:
bir workflow geçişi Study + status history + audit yazıyor ve 5 sn'lik
varsayılan limit dolduğu için transaction `P2028` ile iptal ediliyordu
(veri bütünlüğü korundu — transaction geri alındı, kısmi state oluşmadı).

Uygulanan çözüm: `DATABASE_TRANSACTION_TIMEOUT_MS` (varsayılan 15000) ve
`DATABASE_TRANSACTION_MAX_WAIT_MS` (varsayılan 10000) env değişkenleri
eklendi; `PrismaService` bunları client'a `transactionOptions` olarak veriyor.
Railway içi deploy'da bu değerler düşürülebilir.

---

## DISCOVERED-003 — Clinical Data Model

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-004  
**Keşfedildi:** BACKEND-011 sırasında

### Issue

`INTEGRATIONS.md` section 15 ve `API_CONTRACT.md` section 28 normalize edilmiş
klinik alanları (`preDiagnosis`, `requestReason`, `patientComplaint`,
`previousStudyInfo`, `requestingPhysician`, `department`, `additionalData`)
tanımlıyor, ancak `DATA_MODEL.md` phase-1 şemasında bunları tutacak bir tablo
yok. HL7 adapter'ı bu alanları normalize ediyor fakat kalıcı bir yeri yok.

### Geçici çözüm (uygulandı)

Normalize edilmiş blok `HL7_FIRST_RECEIVED` / `HL7_SECOND_RECEIVED` audit
kaydının `metadata` alanında saklanıyor — veri kaybolmuyor, ancak
`GET /studies/:id` üzerinden `clinicalData` olarak dönmüyor.

### Yapılacaklar

- `ClinicalData` modeli (Study ile 1-1) veya Study üzerinde JSON alan kararı
- HL7 servisinin bu modele yazması
- `StudyDetail` sözleşmesine `clinicalData` eklenmesi (shared + API_CONTRACT)

---

## DISCOVERED-004 — Study Detail Contract Completion

**Owner:** BACKEND  
**Priority:** P1  
**Status:** TODO  
**Depends On:** BACKEND-015, BACKEND-020, BACKEND-039, BACKEND-041  
**Keşfedildi:** BACKEND-009 sırasında

### Issue

`API_CONTRACT.md` section 26/28'deki `lock`, `pacs`, türetilmiş `sla` state'i
ve `flags` alanları henüz modellenmediği için `StudyListItem` / `StudyDetail`
sözleşmesinde yok. Bunlar ilgili görevler tamamlandıkça eklenmelidir; frontend
sözleşmesi o noktada güncellenecektir.