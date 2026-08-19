# PROGRESS.md
## Radyoloji Platformu — Geliştirme İlerleme ve Devam Noktası

> **Doküman Türü:** Shared Agent Progress / Resume State  
> **Amaç:** Claude ve Codex’in mevcut proje durumunu hızlıca anlayabilmesi ve önceki oturumun kaldığı yerden güvenli şekilde devam edebilmesi.  
> **Güncelleyenler:** Claude Code, Codex  
> **Ana Referans:** `docs/TASK_QUEUE.md`

---

# 1. CURRENT PILOT STATUS

**Overall Status:** IN DEVELOPMENT — full backend clinical chain live against Railway  
**Pilot Release:** NOT READY  
**Current Version:** pre-v0.1.0-pilot  
**Environment:** Local backend + Railway PostgreSQL/Redis (production environment)  
**Deployment:** Backend not deployed yet; databases provisioned  
**Last Updated:** 2026-08-16 (Claude / backend)

Ana hedef:

```text
Mock First HL7
↓
Mock Second HL7
↓
Images Available
↓
Doctor Reading
↓
Dictation
↓
Reporter Transcription
↓
Doctor Approval
↓
HBYS Delivery
```

---

# 2. CURRENT REPOSITORY STATE

Repository structure:

```text
apps/
├── backend/
└── frontend/

packages/
└── shared/

docs/
```

Root agent files:

```text
AGENTS.md
CLAUDE.md
CLAUDE_BACKEND_PROMPT.md
CODEX_FRONTEND_PROMPT.md
PROGRESS.md
README.md
```

---

# 3. DOCUMENTATION STATUS

Ana spesifikasyon dokümanları:

```text
[x] docs/MASTER_SPEC.md
[x] docs/ARCHITECTURE.md
[x] docs/WORKFLOW_STATE_MACHINE.md
[x] docs/DATA_MODEL.md
[x] docs/API_CONTRACT.md
[x] docs/AUTH_ROLES_PERMISSIONS.md
[x] docs/INTEGRATIONS.md
[x] docs/IMPLEMENTATION_PLAN.md
[x] docs/TASK_QUEUE.md
[x] docs/QUALITY_GATES.md
[x] docs/FAILURE_RECOVERY.md
[x] docs/BACKEND.md
[x] docs/FRONTEND.md
[x] docs/REALTIME_EVENTS.md
[x] docs/TEST_SCENARIOS.md
[x] docs/DEPLOYMENT_PILOT.md
```

Agent operating files:

```text
[x] AGENTS.md
[x] CLAUDE.md
[x] CLAUDE_BACKEND_PROMPT.md
[x] CODEX_FRONTEND_PROMPT.md
[x] PROGRESS.md
```

---

# 4. CURRENT DEVELOPMENT PHASE

Current phase:

```text
PHASE 2
Study domain — hospital scope, study queries, mock HL7 and the central
workflow engine are done; frontend not started
```

Next phase:

```text
PHASE 3
Doctor workflow — Redis study locking, start reading, dictation
```

Primary next milestone:

```text
Redis study lock
+
Start reading
+
Lock heartbeat / release / force release
+
Doctor lock concurrency test
```

---

# 5. BACKEND PROGRESS

## Current Backend Status

```text
FULL CLINICAL CHAIN LIVE — a study travels
First HL7 -> Second HL7 -> Images Available -> UNREAD -> READING
-> dictation recorded and uploaded -> WAITING_TRANSCRIPTION
-> TRANSCRIBING -> report submitted -> WAITING_APPROVAL
-> doctor final approval -> FINAL -> HBYS_PENDING -> HBYS_SENT
against the real Railway database, Redis, object storage and BullMQ.
The HBYS failure path (FAIL -> HBYS_FAILED -> manual retry -> HBYS_SENT)
is verified too. Remaining P0 backend work is the test tasks; PACS, SLA,
information notes, realtime and the manager APIs are P1.
```

## Current Backend Task

```text
BACKEND-055 (Workflow Unit Tests) — next to claim
```

## Next Recommended Backend Task

```text
BACKEND-055 Workflow unit tests      (P0, largely covered already)
-> BACKEND-056 Permission tests      (P0)
-> BACKEND-057 HL7 integration tests (P0)
-> BACKEND-058 HBYS integration tests(P0)
-> BACKEND-039 SLA engine            (P1)
-> BACKEND-041 Information notes     (P1)
-> BACKEND-045 WebSocket gateway     (P1)
```

## Recently Completed Backend Tasks

```text
SHARED-001  Root monorepo setup                DONE
SHARED-002  Shared contracts package           DONE
BACKEND-001 NestJS application bootstrap       DONE
BACKEND-002 PostgreSQL + Prisma setup          DONE
BACKEND-003 Redis setup                        DONE
BACKEND-004 Core database models phase 1       DONE
BACKEND-005 Seed system                        DONE  (0127958)
BACKEND-006 Authentication                     DONE  (dfd6219)
BACKEND-007 Role guard                         DONE  (45f0620)
BACKEND-008 Hospital access guard              DONE  (7dbf906)
BACKEND-009 Study query service                DONE  (7dbf906)
BACKEND-010 HL7 adapter contract               DONE  (ad57b52)
BACKEND-011 Mock first HL7                     DONE  (9e18658)
BACKEND-012 Mock second HL7                    DONE  (9e18658)
BACKEND-013 Images available simulation        DONE  (9e18658)
BACKEND-014 Workflow service                   DONE  (9e18658)
BACKEND-050 DevTools security                  DONE  (9e18658)
BACKEND-015 Redis study lock service           DONE  (aa2c896)
BACKEND-016 Start reading                      DONE  (aa2c896)
BACKEND-017 Lock heartbeat / release           DONE  (aa2c896)
BACKEND-018 Doctor lock concurrency test       DONE  (aa2c896)
BACKEND-021 Dictation model                    DONE  (2126bba)
BACKEND-022 Object storage abstraction         DONE  (2126bba)
BACKEND-023 Dictation API                      DONE  (2126bba)
BACKEND-024 Complete reading                   DONE  (2126bba)
BACKEND-025 Report data models                 DONE  (5a8e5ee)
BACKEND-026 Start transcription                DONE  (5a8e5ee)
BACKEND-027 Reporter concurrency test          DONE  (5a8e5ee)
BACKEND-028 Report draft API                   DONE  (5a8e5ee)
BACKEND-029 Submit report                      DONE  (5a8e5ee)
BACKEND-030 Start approval                     DONE  (35a0b01)
BACKEND-031 Return to reporter                 DONE  (35a0b01)
BACKEND-032 Finalize report                    DONE  (35a0b01)
BACKEND-034 HBYS data models                   DONE  (35a0b01)
BACKEND-033 BullMQ foundation                  DONE  (b694dcf)
BACKEND-035 HBYS adapter contract              DONE  (b694dcf)
BACKEND-036 Mock HBYS adapter                  DONE  (b694dcf)
BACKEND-037 HBYS delivery worker               DONE  (b694dcf)
BACKEND-038 Manual HBYS retry                  DONE  (b694dcf)
```

## Backend Blockers

```text
None blocking. The earlier BLOCKED_TECHNICAL (no PostgreSQL/Redis) is RESOLVED:
the pilot now uses the Railway "strong-courtesy" project, production environment.
```

## Backend Known Issues

```text
corepack cannot run pnpm on Node 22.22.2
(ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING).
Workaround applied: npm i -g pnpm@10 (currently pnpm 10.34.5).

npm registry throughput on this machine is ~20-40 KB/s.
Installs take minutes; run them in the background and be patient
rather than cancelling and retrying.

The local backend talks to the Railway PRODUCTION environment databases.
There is no separate test database yet, which is why the e2e suite stubs
PrismaService/RedisService instead of connecting. Integration tests that need
real persistence will require a dedicated test database first.

Connecting to Railway PostgreSQL through the TCP proxy can take 3-7s per
connection. Prisma's default pool (cpus*2+1 = 21) cannot be filled inside the
default 10s pool timeout, and startup then fails with P2024. DATABASE_URL now
carries connection_limit=5&pool_timeout=30 locally. Tracked as DISCOVERED-002.

Restarting the backend needs the previous process to be gone AND its
connections drained; starting a second instance immediately can exhaust the
pool and make both fail.

Auth endpoints have no rate limiting yet (DISCOVERED-001).

Prisma's default 5s interactive-transaction limit was too short over the
Railway TCP proxy and aborted a workflow transition (no partial state — the
transaction rolled back). Now configurable via DATABASE_TRANSACTION_TIMEOUT_MS
(default 15000). Tracked under DISCOVERED-002.

Normalized HL7 clinical data has no model yet; it is preserved in the audit
metadata and is not returned by GET /studies/:id (DISCOVERED-003).

StudyDetail does not yet carry lock / pacs / derived SLA state / flags —
their models do not exist yet (DISCOVERED-004).
```

## Backend Infrastructure Notes

```text
Railway project: strong-courtesy / production
Access from a developer machine goes through TCP proxies, not the
*.railway.internal hostnames (those resolve only inside Railway).

PostgreSQL: public proxy existed already; sslmode=require is MANDATORY
            (without it Prisma fails with P1001).
Redis:      had no public endpoint; created with
            railway tcp-proxy create --port 6379 --service Redis

When the backend is deployed to Railway (DEVOPS-001) switch both URLs back to
the internal hostnames and the TCP proxies can be removed.
```

## Backend Resume Pointer

```text
Current Task:
BACKEND-055 — Workflow Unit Tests (not claimed yet)

Current State:
The complete pilot clinical chain runs against the real Railway services:
  First HL7 -> Second HL7 -> Images Available -> UNREAD
  -> READING (doctor lock) -> dictation recorded + uploaded
  -> WAITING_TRANSCRIPTION -> TRANSCRIBING (reporter lock)
  -> report submitted -> WAITING_APPROVAL
  -> doctor final approval -> FINAL -> HBYS_PENDING -> HBYS_SENT
The failure path is verified too: FAIL and TIMEOUT both end in HBYS_FAILED,
and an Operation manual retry takes it to HBYS_SENT with the earlier attempts
preserved.

Last Successful Command:
pnpm lint / pnpm typecheck / pnpm build  -> PASS
backend unit tests 300 PASS, e2e tests 245 PASS

Current Problem:
None. Work paused at a green, committed checkpoint (b694dcf).

Next Action:
1. BACKEND-055/056/057/058 are the remaining P0 tasks. Much of what they ask
   for already exists (workflow table tests, permission tests across the e2e
   suites, HL7 duplicate/mismatch tests, HBYS success/fail/timeout/retry), so
   the work is mostly to check each listed case against the suites and add
   whatever is genuinely missing rather than duplicating coverage.
2. Then the P1 block: BACKEND-039 SLA engine, BACKEND-041 information notes,
   BACKEND-042/043/044 special workflow states, BACKEND-045 realtime,
   BACKEND-046/047 manager APIs, BACKEND-019/020 PACS.
3. DEVOPS-004 (a real object storage bucket) is still open; the pilot writes
   dictation audio to a local directory that does not survive a redeploy.

Local run notes:
- Start: cd apps/backend && node dist/main.js  (reads apps/backend/.env)
- Before restarting, make sure the old process is gone and give the Railway
  connections a few seconds to drain, otherwise Prisma fails with P2024.
- The local .env raises DATABASE_TRANSACTION_TIMEOUT_MS to 45000: finalize is
  a ~15 statement transaction and the proxy round trip is about a second.
  It also shortens HBYS_RETRY_DELAYS_MS so the retry path is observable.
- Seed accounts: doctor, doctor2, reporter, reporter2, operation, manager
  (all @test.local, one shared dev password).
```

---

# 6. FRONTEND PROGRESS

## Current Frontend Status

```text
IN PROGRESS — FRONTEND-002, FRONTEND-003 ve FRONTEND-005 canlı Railway API doğrulamasını bekliyor.
```

## Current Frontend Task

```text
FRONTEND-002 — API Client Foundation
FRONTEND-003 — Authentication UI
FRONTEND-005 — Study List Foundation
```

## Next Recommended Frontend Task

Frontend should begin after or in parallel with root workspace foundation.

Likely first task:

```text
FRONTEND-001 — Next.js Application Bootstrap
```

after required workspace dependency is available.

## Recently Completed Frontend Tasks

```text
FRONTEND-001 — Next.js Application Bootstrap (commit: 00f2e5b)
```

## Frontend Blockers

```text
Canlı acceptance testi için Railway API'nin gerçek public base URL'si gerekli.
Bu değer repo veya environment'ta yok; dokümandaki örnek URL health isteğinde
Railway `Application not found` (404 fallback) dönüyor.
```

## Frontend Known Issues

```text
Next.js production build, kök ESLint yapılandırmasında Next eklentisi algılanmadığına
dair bilgilendirici bir uyarı yayımlıyor; lint/typecheck/build yine de başarılı.
`* 2.*` adlı kullanıcı dosyaları TypeScript'in `.next` generated tipleriyle çakışıyordu;
silinmeden `tsconfig.json` exclude listesine eklendi.
```

## Frontend Resume Pointer

```text
Read:
AGENTS.md
docs/TASK_QUEUE.md
docs/FRONTEND.md

Then:
Gerçek `NEXT_PUBLIC_API_URL` ile seed kullanıcılarıyla login, /auth/me, refresh
rotation, logout ve Doctor `GET /studies` akışını doğrula; ardından FRONTEND-002,
FRONTEND-003 ve FRONTEND-005'i acceptance'a göre güncelle.
```

---

# 7. SHARED / MONOREPO PROGRESS

## Status

```text
DONE — SHARED-001 and SHARED-002 complete
```

```text
root package.json          [x]
pnpm-workspace.yaml        [x]
TypeScript base config     [x]  strict
lint/format configuration  [x]  flat ESLint 9 + Prettier
workspace scripts          [x]  lint / typecheck / build / test
@radiology/shared          [x]  8 enums + ApiError / PaginatedResponse
```

Shared package is consumed by the backend. The frontend does not exist yet, so
its import is unverified (Codex closes that under FRONTEND-002).

---

# 8. DATABASE PROGRESS

**Status:** LIVE — schema, migration and seed applied

```text
PostgreSQL (Railway strong-courtesy / production)
Prisma 6.19.3
```

```text
Prisma configured   [x]
Core models         [x]  10 models
Migration           [x]  20260814144451_init
Seed                [x]  idempotent, verified by a second run
```

---

# 9. REDIS PROGRESS

**Status:** CONNECTED — not yet used by a feature

Expected responsibilities:

```text
Study Locks           (BACKEND-015)
BullMQ                (BACKEND-033)
Ephemeral Coordination
```

Redis 8.2.8 reachable via TCP proxy; health endpoint reports it up.
No lock or queue implementation exists yet.

---

# 10. AUTH PROGRESS

**Status:** DONE for the pilot scope (BACKEND-006, BACKEND-007)

Required pilot roles:

```text
DOCTOR      [x] logs in against the real database
REPORTER    [x]
OPERATION   [x]
MANAGER     [x]
```

Required endpoints:

```text
login   [x] POST /api/v1/auth/login
refresh [x] POST /api/v1/auth/refresh   (rotating session)
logout  [x] POST /api/v1/auth/logout    (204, revokes session)
me      [x] GET  /api/v1/auth/me
```

Enforcement:

```text
JwtAuthGuard  global, deny by default, @Public() opts out
RolesGuard    global, @Roles(...) restricts a route to specific roles
```

Not done yet:

```text
hospital scope guard  (BACKEND-008)
rate limiting         (DISCOVERED-001)
```

---

# 11. HL7 INTEGRATION PROGRESS

**Status:** DONE for the pilot scope (BACKEND-010, 011, 012)

Pilot target:

```text
MockHl7Adapter   [x] registered as the default HL7 adapter
```

Required flows:

```text
First HL7                    [x] patient + study created, WAITING_ACCEPTANCE
Second HL7                   [x] IMAGES_PENDING, SLA clock starts
Accession Number matching    [x] hospitalId + accessionNumber only
Duplicate protection         [x] no second study, state never rewound
Patient mismatch protection  [x] 409 HL7_PATIENT_MISMATCH, study untouched
```

Verified against the live Railway database through the real dev-tools
endpoints, with the audit chain and status history recorded.

Real hospital HL7:

```text
BLOCKED_EXTERNAL
```

until actual sample messages/specifications are supplied.

---

# 12. PACS PROGRESS

**Status:** NOT STARTED

Pilot target:

```text
Orthanc
```

Preferred.

Fallback:

```text
TestPacsAdapter
```

if Orthanc blocks P0 progress.

Real hospital PACS:

```text
BLOCKED_EXTERNAL
```

until credentials/specification are supplied.

---

# 13. DICTATION PROGRESS

**Status:** DONE for the pilot scope (BACKEND-021, 022, 023, 024)

```text
record            [x] POST /studies/:id/dictations  (doctor + lock owner)
upload            [x] POST /dictations/:id/upload   (multipart)
persist metadata  [x] storageKey / size / checksum / duration in PostgreSQL
playback          [x] GET /dictations/:id/playback  (short-lived token URL)
```

Audio lives in object storage, never in PostgreSQL. The pilot uses a local
directory driver because no bucket is provisioned (DEVOPS-004); those files do
not survive a container rebuild.

VAD is not implemented and is not required for the pilot workflow.

---

# 14. REPORT WORKFLOW PROGRESS

**Status:** IN PROGRESS — up to WAITING_APPROVAL

```text
WAITING_TRANSCRIPTION  [x]
TRANSCRIBING           [x] reporter lock + first draft version
Report Draft           [x] autosave, draft-only edits
WAITING_APPROVAL       [x] submit completes the version, releases the lock
Doctor Final           [ ] BACKEND-030 / BACKEND-032
```

Report versions are append-only: a completed or finalized version is never
edited in place.

---

# 15. HBYS PROGRESS

**Status:** DONE for the pilot scope (BACKEND-033..038)

Pilot target:

```text
MockHbysAdapter
```

Modes:

```text
SUCCESS
FAIL
TIMEOUT
```

Required:

```text
BullMQ              [x] dedicated Redis connections, 30s/2m/5m schedule
delivery attempts   [x] every attempt kept, metadata only
automatic retry     [x] retryable failures only
manual retry        [x] OPERATION/MANAGER, reason mandatory, history kept
HBYS_SENT           [x]
HBYS_FAILED         [x] never hidden
```

Real hospital HBYS:

```text
BLOCKED_EXTERNAL
```

until API/specification/access is supplied.

---

# 16. REALTIME PROGRESS

**Status:** NOT STARTED

Target:

```text
NestJS Socket.IO
+
Frontend central socket client
```

Minimum event set defined in:

```text
docs/REALTIME_EVENTS.md
```

Fallback if deployment blocks realtime:

```text
REST polling/refetch
```

---

# 17. SLA PROGRESS

**Status:** NOT STARTED

Known pilot defaults:

```text
ACIL = 120 min
YATAN = 720 min
NORMAL = 1440 min
Warning = 20 min
```

Unresolved:

```text
YOGUN_BAKIM exact SLA duration
```

Status:

```text
BLOCKED_SPEC
```

only for the undefined exact duration.

Other SLA work may proceed.

---

# 18. DEPLOYMENT PROGRESS

## Frontend

```text
Vercel: NOT DEPLOYED
```

## Backend

```text
Railway: NOT DEPLOYED (runs locally against Railway databases)
```

## PostgreSQL

```text
PROVISIONED — Railway strong-courtesy / production
Migration applied, reachable via TCP proxy with sslmode=require
```

## Redis

```text
PROVISIONED — Railway strong-courtesy / production
Redis 8.2.8, reachable via TCP proxy created for port 6379
```

## Object Storage

```text
NOT CONFIGURED
```

## Pilot URL

```text
None
```

---

# 19. LATEST QUALITY GATE RESULTS

No development quality gate has been run yet.

Current status:

Measured on 2026-08-15 (backend):

```text
Lint: PASS
Typecheck: PASS
Backend Unit Tests: 300 PASS / 0 FAIL
Backend E2E Tests: 245 PASS / 0 FAIL
Backend Build: PASS
Integration Tests: NOT_RUN (no test database yet)
Frontend Tests: NOT_RUN
Frontend Build: NOT_RUN
```

Live infrastructure verification (real Railway services, 2026-08-14):

```text
Prisma migration 20260814144451_init: APPLIED
Tables created: 11 (10 models + _prisma_migrations)
Unique indexes: 19, foreign keys: 17
GET /api/v1/health -> 200, database up (255ms), redis up (248ms)
Redis PING -> PONG on Redis 8.2.8
Unreachable database -> structured error + exit code 1, no credential logged
Unreachable Redis -> fails closed, process exits
```

Live seed + auth verification (real Railway database, 2026-08-15):

```text
Seed run twice -> 1 hospital, 4 users, 4 access rows, 3 active SLA policies
All four @test.local hashes verify with argon2id; wrong password rejected

doctor/reporter/operation/manager login -> 200 with the correct role
wrong password            -> 401 INVALID_CREDENTIALS
unknown email             -> 401, body byte-identical to wrong password
GET /auth/me              -> 200, hospitals [TEST_HOSPITAL], no passwordHash
GET /auth/me without token-> 401 UNAUTHORIZED
POST /auth/refresh        -> 200, refresh cookie rotated
replayed rotated cookie   -> 401 (all sessions revoked, reuse detected)
POST /auth/logout         -> 204; refresh AND the old access token then 401
malformed login body      -> 422 VALIDATION_ERROR with details.fields
server log scanned for password/token/hash patterns -> 0 matches
```

Agents must replace these values only with actual command results.

Never fabricate PASS.

---

# 20. E2E TEST STATUS

## Happy Path

```text
BACKEND HALF PASS — verified live against Railway on a single study

First HL7 -> Second HL7 -> Images -> Doctor reading -> Dictation
-> Reporter transcription -> Report -> Doctor final -> HBYS_SENT

Ten status transitions recorded, report versions preserved, one HBYS
delivery with a deterministic idempotency key, full audit chain.

E2E-001 as a whole stays open: it also needs the frontend (FRONTEND-021).
```

Required:

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

## HBYS Failure Path

```text
BACKEND HALF PASS — verified live against Railway with the real worker

FAIL mode      -> 1 attempt, no retry, HBYS_FAILED
TIMEOUT mode   -> 4 attempts (1 + 3 automatic retries), then HBYS_FAILED
Manual retry   -> Operation only (doctor 403), study back to HBYS_PENDING
               -> HBYS_SENT, with attempt 1 FAILED and attempt 2 SENT both kept

E2E-002 as a whole stays open: it also needs the frontend (FRONTEND-021).
```

## Doctor Lock Conflict

```text
PASS — backend level (BACKEND-018)

Doctor A start-reading -> 200 READING
Doctor B start-reading -> 423 STUDY_LOCKED
Simultaneous requests  -> exactly one 200, one 423
Verified in the e2e suite and live against Railway + Redis with the two
seeded doctor accounts. The frontend half (FRONTEND-006) is still open,
so E2E-003 as a whole is not closed.
```

## Reporter Lock Conflict

```text
PASS — backend level (BACKEND-027)

Reporter A start-transcription -> 200 TRANSCRIBING
Reporter B start-transcription -> 423 STUDY_LOCKED
Reporter B draft save / submit -> 423 LOCK_NOT_OWNED
Simultaneous requests          -> exactly one 200, one 423
Verified in the e2e suite and live against Railway + Redis with the two
seeded reporter accounts. E2E-004 also needs the frontend half.
```

## Cross-Hospital Security

```text
NOT_RUN
```

---

# 21. ACTIVE BLOCKERS

## RESOLVED

### BACKEND-002 / BACKEND-003 — no PostgreSQL or Redis available

```text
Resolved on 2026-08-14.
```

The pilot now uses the Railway `strong-courtesy` project (production
environment) reached through TCP proxies. Migration `20260814144451_init` was
applied, and `GET /api/v1/health` reports both `database` and `redis` as `up`
against the live services.

Retained lesson: `*.railway.internal` hostnames resolve only inside Railway.
Developer-machine access needs a TCP proxy, and PostgreSQL additionally
requires `sslmode=require`.

---

## BLOCKED_SPEC

### YOGUN_BAKIM SLA

Problem:

```text
Exact YOGUN_BAKIM SLA duration is not defined.
```

Impact:

```text
Cannot finalize a fixed production/default ICU SLA value.
```

Safe work that can continue:

```text
ACIL
YATAN
NORMAL
SLA engine
warning logic
test mode
```

Required action:

```text
Healthcare team confirmation.
```

---

## BLOCKED_SPEC

### Compensation Formula

Problem:

```text
Exact physician/reporter financial compensation formula is not defined.
```

Impact:

```text
Financial amount calculation cannot be implemented safely.
```

Safe work:

```text
monthly case counts
category counts
performance statistics
```

---

## BLOCKED_SPEC / BLOCKED_EXTERNAL

### Addendum HBYS Behavior

Problem:

```text
Two-month addendum rule is known,
but exact real HBYS/billing integration behavior is not yet specified.
```

Safe work:

```text
addendum domain foundation can be designed later
```

Do not invent the external protocol.

---

## BLOCKED_EXTERNAL

### Real Hospital Integrations

Missing:

```text
real HL7 samples
real PACS credentials
real HBYS documentation
real hospital test network/VPN
```

Safe fallback:

```text
Mock HL7
Test PACS / Orthanc
Mock HBYS
```

Pilot development should continue.

---

# 22. KNOWN PILOT ASSUMPTIONS

These assumptions are already documented and must not be silently changed.

## Doctor Study Selection

Pilot:

```text
Manual self-selection
```

Future:

```text
FIFO may be introduced
```

Frontend must not implement its own FIFO algorithm.

---

## SLA Clinical Completion

Pilot assumption:

```text
Doctor final approval = clinical completion
```

HBYS failure does not make the Study clinically unread again.

---

## Test Data

Pilot:

```text
TEST DATA ONLY
```

No real patient data.

---

## Infrastructure

Pilot:

```text
Vercel + Railway
```

Not enterprise production.

---

# 23. KNOWN SAFETY RULES

Must remain true during development:

```text
No cross-hospital data leak
No Reporter final approval
No Operation clinical final
No Manager clinical final unless separately authorized as Doctor
No duplicate concurrent Study editing
No final report overwrite
No hidden HBYS failure
No Information history deletion
No critical audit deletion
No fake frontend workflow success
```

---

# 24. CURRENT TASK QUEUE SUMMARY

At project start, expected highest priority order is:

```text
SHARED-001
SHARED-002

BACKEND-001
BACKEND-002
BACKEND-003
BACKEND-004
BACKEND-005
BACKEND-006
...

FRONTEND-001
FRONTEND-002
FRONTEND-003
...
```

This section is only a summary.

Actual task status/source of truth:

```text
docs/TASK_QUEUE.md
```

---

# 25. AGENT BRANCH STATUS

## Backend

Preferred:

```text
agent/backend
```

Actual current branch (verified 2026-08-15):

```text
agent/backend
```

Backend work runs in the `radiology-backend` git worktree.

## Frontend

Preferred:

```text
agent/frontend
```

Actual current branch:

```text
UNKNOWN — agent must inspect with git branch --show-current
```

Do not overwrite these with assumptions.

Record actual branches after agent setup.

---

# 26. WORKTREE STATUS

Recommended:

```text
Backend worktree
Frontend worktree
```

Current:

```text
NOT YET CONFIRMED
```

Agents must inspect actual environment before assuming separate worktrees exist.

---

# 27. RECENT COMMITS

Backend milestones (real hashes):

```text
45f0620 feat(auth): add role guard and role decorator
dfd6219 feat(auth): implement jwt authentication and refresh sessions
0127958 feat(seed): run and verify idempotent pilot seed
55ed15c feat(infra): connect prisma and redis to live railway services
7dda6d6 feat(persistence): prisma schema, database and redis service layer
bd5718f feat(foundation): pnpm monorepo, shared contracts and NestJS bootstrap
```

Agents may record important recent milestone commits using real hashes only.

Example format:

```text
abc1234 feat(auth): implement jwt authentication
def5678 feat(locks): add redis locking
```

Do not invent hashes.

---

# 28. COMPLETED MILESTONES

Current:

```text
[x] Business/technical specification documentation
[x] Agent operating instructions
[x] Backend agent prompt
[x] Frontend agent prompt

[x] Monorepo initialized
[x] Backend initialized
[ ] Frontend initialized
[x] Database initialized
[x] Redis initialized
[x] Auth completed
[x] HL7 mock completed
[x] Doctor workflow completed
[x] Reporter workflow completed
[x] Approval workflow completed
[x] HBYS mock completed
[ ] Operation workflow completed
[ ] Manager basic completed
[ ] E2E passed
[ ] Pilot deployed
```

---

# 29. CURRENT PILOT READINESS CHECKLIST

```text
[x] Auth
[x] Roles
[x] Hospital Scope

[x] Patient
[x] Study

[x] First HL7
[x] Second HL7
[x] Images Available

[x] Doctor Queue
[x] Doctor Lock
[x] Dictation

[x] Reporter Queue
[x] Reporter Lock
[x] Audio Playback
[x] Report

[x] Doctor Approval
[x] Finalization

[x] Mock HBYS
[x] HBYS Success
[x] HBYS Failure
[x] Manual Retry

[ ] SLA
[ ] Information Notes
[ ] Image Missing
[ ] Hospital Doctor

[ ] Audit

[ ] Happy Path E2E
[ ] Failure Path E2E
[ ] Lock E2E
[ ] Cross-Hospital Security

[ ] Railway
[ ] Vercel
[ ] Object Storage
[ ] Deployed Audio
```

---

# 30. BACKEND RESUME TEMPLATE

Claude should update this block before ending a session if work is unfinished.

```text
Current Task:
NONE

Task Status:
NONE

Current Branch:
UNKNOWN

Last Successful Command:
NONE

Latest Test Result:
NOT_RUN

Current Problem:
NONE

Next Action:
Claim SHARED-001 or next available backend/shared P0 task.
```

---

# 31. FRONTEND RESUME TEMPLATE

Codex should update this block before ending a session if work is unfinished.

```text
Current Task:
NONE

Task Status:
NONE

Current Branch:
UNKNOWN

Last Successful Command:
NONE

Latest Test Result:
NOT_RUN

Current Backend Dependency:
NONE

Current Problem:
NONE

Next Action:
Claim first available frontend P0 task after required workspace dependency.
```

---

# 32. BLOCKER UPDATE RULE

When a blocker is added, use:

```text
### BLOCKER: <TASK-ID>

Type:
BLOCKED_SPEC | BLOCKED_EXTERNAL | BLOCKED_TECHNICAL

Problem:
...

Evidence:
...

Attempts:
1. ...
2. ...

Impact:
...

Safe independent work:
...

Required next action:
...
```

Do not write vague entries such as:

```text
Something doesn't work.
```

---

# 33. QUALITY RESULT UPDATE RULE

Use actual values only.

Example:

```text
Lint: PASS
Typecheck: PASS
Backend Unit Tests: 42 PASS / 0 FAIL
Backend Integration Tests: 8 PASS / 0 FAIL
Frontend Tests: 15 PASS / 0 FAIL
Backend Build: PASS
Frontend Build: PASS
```

If failing:

```text
Backend Integration Tests:
7 PASS / 1 FAIL

Failing:
reporter concurrency
```

Do not hide failures.

---

# 34. KNOWN ISSUE FORMAT

```text
### ISSUE: <short title>

Severity:
BLOCKER | CRITICAL | MAJOR | MINOR

Area:
Backend | Frontend | Integration | Deployment

Description:
...

Workaround:
...

Data/Security Impact:
...

Task:
DISCOVERED-XXX
```

---

# 35. DISCOVERED TASKS

If new necessary work is discovered, add it to:

```text
docs/TASK_QUEUE.md
```

using:

```text
DISCOVERED-XXX
```

Then reference it here if important.

Do not silently expand scope without a task.

---

# 36. DAILY SUMMARY TEMPLATE

Agents may append/update:

```text
## Daily Summary — YYYY-MM-DD

Completed:
- ...

Tests:
- ...

Blocked:
- ...

Known Issues:
- ...

Next:
- ...
```

Use actual date and real results.

---

# 37. DEPLOYMENT STATUS TEMPLATE

When deployment starts, update:

```text
Backend Railway:
NOT_DEPLOYED

Frontend Vercel:
NOT_DEPLOYED

Database:
NOT_PROVISIONED

Redis:
NOT_PROVISIONED

Object Storage:
NOT_CONFIGURED

Migration:
NOT_RUN

Seed:
NOT_RUN

Health:
NOT_RUN

Deployed Happy Path:
NOT_RUN

Deployed Failure Path:
NOT_RUN
```

---

# 38. PILOT URL HANDOFF TEMPLATE

When ready:

```text
Frontend URL:
...

Backend Health URL:
...

Pilot Version:
...

Doctor Test User:
configured

Reporter Test User:
configured

Operation Test User:
configured

Manager Test User:
configured

Known Issues:
...
```

Passwords must not be stored in this file.

---

# 39. RELEASE BLOCKERS

Pilot cannot be marked ready if any of the following is true:

```text
BLOCKER > 0
CRITICAL > 0
P0 Happy Path fails
Doctor lock fails
Reporter lock fails
Cross-hospital security fails
Final report can be overwritten
HBYS delivery can be silently lost
Audio upload/playback is broken
Production build fails
```

---

# 40. PILOT READY DEFINITION

Set:

```text
Overall Status: PILOT READY
```

only when:

```text
P0 requirements completed
P0 E2E PASS
BLOCKER = 0
CRITICAL = 0
deployed happy path PASS
deployed failure path PASS
```

---

# 41. SOURCE OF TRUTH

This file is not the source of truth for business rules.

It is the source of truth for:

```text
current implementation progress
current blockers
actual tests run
actual known issues
resume state
deployment status
```

Business rules remain in `docs/`.

Task definitions remain in:

```text
docs/TASK_QUEUE.md
```

---

# 42. AGENT START RULE

Every agent session should use this file to answer:

```text
What is currently done?
What is currently being worked on?
What is blocked?
What tests actually passed?
What should I do next?
```

If this file is stale, update it based on:

```text
git status
git log
TASK_QUEUE
actual test results
```

before continuing.

---

# 43. AGENT END RULE

Before ending meaningful work:

```text
update task status
update this file
record actual tests
record blocker if present
record resume pointer
commit safe completed work
```

Do not leave the next agent guessing.

---

# 44. INITIAL RESUME POINTER

At the time this file is first created:

```text
Project documentation is complete enough to begin implementation.

No implementation task is assumed completed.

Recommended first action:
Start autonomous development setup and execute SHARED-001.

Backend:
Read CLAUDE_BACKEND_PROMPT.md

Frontend:
Read CODEX_FRONTEND_PROMPT.md
```

---

# 45. FINAL RULE

`PROGRESS.md` must remain short enough to scan quickly and accurate enough to resume work safely.

Do not turn it into a second specification document.

Keep it focused on:

```text
what is done
what is active
what is broken
what was tested
what comes next
```
