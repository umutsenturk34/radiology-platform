# PROGRESS.md
## Radyoloji Platformu — Geliştirme İlerleme ve Devam Noktası

> **Doküman Türü:** Shared Agent Progress / Resume State  
> **Amaç:** Claude ve Codex’in mevcut proje durumunu hızlıca anlayabilmesi ve önceki oturumun kaldığı yerden güvenli şekilde devam edebilmesi.  
> **Güncelleyenler:** Claude Code, Codex  
> **Ana Referans:** `docs/TASK_QUEUE.md`

---

# 1. CURRENT PILOT STATUS

**Overall Status:** IN DEVELOPMENT — backend DEPLOYED on Railway, reachable by the frontend  
**Pilot Release:** NOT READY  
**Current Version:** pre-v0.1.0-pilot  
**Environment:** Backend deployed on Railway (production environment) + Railway PostgreSQL/Redis  
**Deployment:** Backend live at https://backend-production-b2b6.up.railway.app  
**Last Updated:** 2026-08-18 (Claude / backend)

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
is verified too.

The P0 test block (BACKEND-055..058) is closed and the SLA engine
(BACKEND-039) is in. No P0 backend task is open: the only remaining P0 is
DEVOPS-004, which is BLOCKED_EXTERNAL on a storage bucket credential.
Information notes, PACS, realtime and the manager APIs are the P1 queue.
```

## Current Backend Task

```text
None claimed. The frontend contract handoff (DISCOVERED-003 + DISCOVERED-004)
is DONE; StudyDetail now answers everything API_CONTRACT section 28 asks for
except the two items that have no model (see Blockers).
```

## Next Recommended Backend Task

```text
BACKEND-042 Image missing               (P1, next to claim)
-> BACKEND-040 Accelerated SLA dev mode (P2, builds on BACKEND-039)
-> DISCOVERED-005 External lock model   (P2, unblocks flags.externalLockConflict)
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
DEVOPS-001  Backend Railway preparation        DONE  (93c72db)
DEVOPS-002  Railway PostgreSQL                 DONE  (93c72db)
DEVOPS-003  Railway Redis                      DONE  (93c72db)
BACKEND-041 Information notes                  DONE  (4170e99)
BACKEND-019 PACS adapter contract              DONE  (0c8b514)
BACKEND-020 PACS read endpoints                DONE  (0c8b514)
BACKEND-045 Realtime gateway                   DONE  (63f859e)
DISCOVERED-003 Clinical data model             DONE  (see Frontend handoff)
DISCOVERED-004 Study detail contract           DONE  (see Frontend handoff)
```

## Backend Blockers

```text
DEVOPS-004  BLOCKED_EXTERNAL — pilot object storage
            Needs an S3-compatible bucket and its credentials. The Railway
            project has backend + Postgres + Redis and no bucket service; no
            S3_* variables are set and there is no s3 driver in the code, only
            local-object-storage.adapter.ts. Backend work when a credential
            arrives is one adapter behind the existing ObjectStorage interface.

YOGUN_BAKIM SLA duration  BLOCKED_SPEC — not invented. See Known Issues.

The earlier BLOCKED_TECHNICAL (no PostgreSQL/Redis) is RESOLVED: the pilot
uses the Railway "strong-courtesy" project, production environment.
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

StudyDetail does not yet carry lock / pacs / information flags — their models
do not exist yet (DISCOVERED-004). The derived SLA state part of that is now
resolved by BACKEND-039.

YOGUN_BAKIM has no SLA duration and none was invented (BLOCKED_SPEC). Those
studies carry no deadline, so every derived SLA field is null and they appear
in no slaState list. The moment the health team supplies the duration, seeding
one SlaPolicy row is the whole change — no code edit.

The frontend keeps its OWN copies of StudyListItem / StudyDetail in
radiology-frontend/apps/frontend/features/studies/api.ts instead of importing
from @radiology/shared. Those copies are now behind: the sla object gained
completedAt, remainingSeconds, overdueSeconds and state. Additive, so nothing
breaks, but the duplication is a live drift risk and the reason the shared
package was made canonical for lock / dictation / report / hbys contracts.

The deployed pilot runs with DEV_TOOLS_ENABLED=true. That is deliberate — the
health team tests the workflow through the mock HL7 and HBYS endpoints, and the
database holds test data only — but it MUST be set to false before any real
patient data reaches this environment (API_CONTRACT section 93).

FRONTEND_URL on the deployed service allows all four local dev origins:
http://localhost:3000, http://localhost:3001, http://127.0.0.1:3000 and
http://127.0.0.1:3001.

Two separate mismatches broke the frontend login while the API itself was fine,
and both looked identical from the browser: the server answered 200 and the
browser discarded the response because no Access-Control-Allow-Origin came
back. First the Next dev server had picked port 3001 while only 3000 was
listed; then the tab was open on 127.0.0.1, which is a different origin from
localhost no matter that it is the same host.

It must be extended again when the frontend lands on Vercel (DEVOPS-005): CORS
is an explicit allowlist, and a missing origin fails in the browser, not on the
server, so it does not show up in backend logs as an error.

Dictation audio on the deployed service is written to a container directory and
does NOT survive a redeploy. This is no longer only a risk: audio uploaded
before an earlier redeploy now returns 404 from GET .../audio on the live
service. DEVOPS-004 is BLOCKED_EXTERNAL pending a bucket credential.

The e2e suite used to fail roughly one run in five, and the failure moved
around (a lock assertion, a beforeEach hook, once an entire suite). It was not
a logic bug: the fixture hashed passwords with production Argon2id cost in
every beforeEach and every login verify, so a suite of HTTP assertions was
CPU-bound and blew Jest's 5s default on a loaded machine. Fixed at the source —
test-only Argon2 cost parameters, hashed once per worker instead of per test
(the auth code under test still runs the real Argon2id path, because the cost
parameters are encoded in the hash string). The lock e2e no longer races the
wall clock either: LOCK_TTL_SECONDS is pinned to 600 for the suite, and TTL
expiry semantics stay where they belong, in the unit tests with a controlled
clock. Full e2e run time went from ~25s (135s when it failed) to ~6s.

A third cause was found and fixed on top of those two: supertest leaves
keep-alive sockets open, and Node's server.close() waits for connections to end
rather than ending them. One survivor kept Jest alive past the last assertion.
The harness now calls closeAllConnections() before app.close().

Residual, honestly stated: 25 of 27 measured runs are green in ~6s. The other
two took ~25s, blew a 20s beforeEach hook in the study-locks suite, and then
would not exit. So it is the same slowdown signature as before, not a separate
exit-only bug — the frequency dropped from about 1 in 5 to about 1 in 14, but
it is not gone.

What is known about the remaining case:

```text
--detectOpenHandles reports NO open handles in the suite
the stuck process sits at 0% CPU holding one socket to 127.0.0.1:60720
port 60720 is owned by VS Code (Code Helper), not by anything this repo starts
the study-locks suite builds a full Nest app in every beforeEach (29 times)
```

That points at resource contention on this developer machine plus a descriptor
inherited from the VS Code-spawned shell, rather than test logic. Not proven,
and deliberately not claimed as fixed. The next thing to try, if it matters, is
narrowing the per-test app construction in the largest suite — but that suite
builds a fresh app on purpose, because the lock lives in Redis and state must
not leak between cases, so it is a trade rather than a free win.

The seeded accounts were rotated off the development fallback password when the
service became internet-reachable. Passwords live ONLY as Railway service
variables, never in the repository:

```text
PILOT_DOCTOR_PASSWORD
PILOT_REPORTER_PASSWORD
PILOT_OPERATION_PASSWORD
PILOT_MANAGER_PASSWORD
```

The reporter / operation / manager reset for FRONTEND-004 was done as a
targeted one-off update of those three rows, NOT through the seed's
SEED_FORCE_PASSWORD_RESET path — that path resets every seeded user and would
have invalidated the doctor account already in use by the frontend. Hashing
used @node-rs/argon2 with library defaults, the same call the seed and
AuthService make, so verify() reads the parameters off the stored hash.

No PACS_* variable is set on the service; the defaults are the intended pilot
configuration (driver=test, no viewer). With no viewer configured the endpoint
answers available:false with PACS_VIEWER_NOT_CONFIGURED, which is the honest
answer while no PACS exists — setting a fake viewer URL would be worse than
setting none.
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
None claimed.

Current State:
Deployed and verified. Railway deployment 45124f81, backend Online at
  https://backend-production-b2b6.up.railway.app/api/v1
WebSocket namespace: /realtime (Socket.IO, token in the handshake auth)

Verified live over a real socket after the deploy:

  anonymous connect      refused at the handshake (SOCKET_UNAUTHORIZED)
  invalid token          refused at the handshake
  authenticated connect  two doctors connected concurrently
  study.join             authorized -> ok; unknown study -> STUDY_ROOM_ACCESS_DENIED
  study.status.changed   UNREAD -> READING, delivered with an eventId
  study.locked           reached the SECOND doctor, so the room targeting works
  study.unlocked         reason USER_RELEASED
  information.added      delivered with the note id and WITHOUT the content

Every one of those came from a real REST action, not from a test emitter.

Last Successful Command:
pnpm lint      -> PASS (0 errors, 1 pre-existing warning)
pnpm typecheck -> PASS
pnpm build     -> PASS
backend unit tests 367 PASS
backend e2e tests  338 PASS
prisma migrate deploy -> 20260831120000_add_clinical_data applied to Railway
prisma migrate status -> "Database schema is up to date"

Current Problem:
The Railway pilot database was seeded with a SEED_DEFAULT_PASSWORD that is not
in this worktree's .env, and this worktree is not `railway link`ed, so the new
detail contract could NOT be smoke-tested over live HTTP this session. The
schema change itself was verified directly against the Railway database
(clinical_data table present with all 11 columns; 21 existing studies
untouched). Every endpoint below is covered by the e2e suite over real HTTP.

Next Action:
1. Live-verify the new StudyDetail against Railway once the pilot password is
   available, then redeploy (`railway up --service backend`) so the frontend
   consumes the completed contract. The running deployment is UNAFFECTED by
   the migration — it is a new table the old build never reads.
2. BACKEND-042 Image missing (P1) is next, then BACKEND-040 accelerated SLA
   dev mode, which the sweeper now makes testable.
3. DEVOPS-004 stays BLOCKED_EXTERNAL: still no bucket and no S3_* variable on
   the service. Dictation audio is still lost on every redeploy.
4. When the frontend deploys (DEVOPS-005), add its origin to FRONTEND_URL and
   redeploy. This now matters for the websocket too, not only for REST.
5. Turn DEV_TOOLS_ENABLED off before any real patient data.

Repository housekeeping (pre-existing, not introduced here):
`pnpm format:check` is red across 38 files, including files this session did
not touch (pnpm-workspace.yaml, reports.service.ts, ...). Every file that
fails was already unformatted at be870d2. Left alone on purpose: a repo-wide
`prettier --write` would bury this change. Worth its own commit.

Frontend contract handoff for FRONTEND-007 / FRONTEND-009 — CLOSED:
- `StudyDetail.clinicalData` exists. `ClinicalData` model + migration
  20260831120000_add_clinical_data applied to Railway (additive; the 21
  existing studies were untouched). The HL7 service writes it on both
  messages and enriches rather than overwrites. Null when the hospital sent
  no clinical block at all.
- `flags` is one canonical object on BOTH list and detail:
  hasInformation / imageMissing / hasRevisionRequest /
  hasUnreportedSiblingStudy. The section 26 vs 28 contradiction was resolved
  in API_CONTRACT 28.3, not papered over.
- `StudyDetail.lock` exists and is the same StudyLockInfo the dedicated
  endpoint returns, plus `type: 'INTERNAL' | null`. Consequence: the detail
  read now depends on Redis and fails closed with 503 rather than reporting
  a study as unlocked. The LIST deliberately has no lock, so a Redis outage
  cannot take the whole work list down.
- `pacs` stays out of StudyDetail on purpose (API_CONTRACT 28.4): the viewer
  and series have their own endpoints, so a slow PACS cannot delay the
  patient's own data.
- Dictation multipart field names are now constants in @radiology/shared
  (DICTATION_UPLOAD_FIELD.FILE = 'file', .DURATION_MS = 'durationMs') and the
  backend interceptor reads them from there, so the two cannot drift.
- The frontend must now import StudyListItem / StudyDetail / StudyFlags /
  StudyClinicalData / StudyLockInfo / DictationDto / InformationNoteDto /
  StudyPacsViewer / StudyPacsSeries and the realtime types from
  @radiology/shared, and delete its local copies (API_CONTRACT section 121).

Commits the frontend branch must take (agent/backend):
  see the Frontend Resume Pointer section.

Still open for the frontend, with no backend answer yet:
- flags.externalLockConflict — no ExternalStudyLock model (DISCOVERED-005).
  Not returned as `false`; the backend cannot know.
- Dictation audio does not survive a Railway redeploy (DEVOPS-004).

Deployment notes:
- Redeploy: railway up --service backend
- Logs:     railway logs --service backend
- Variables live on the Railway service; secrets are not in the repository.
- Dev tools are Manager-only; the HL7 simulation needs a manager token.
```

---

# 6. FRONTEND PROGRESS

## Current Frontend Status

```text
NOT STARTED
```

## Current Frontend Task

```text
None claimed yet.
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
None yet.
```

## Frontend Blockers

```text
None currently known.
```

## Frontend Known Issues

```text
None yet.
```

## Frontend Resume Pointer

```text
Read:
AGENTS.md
docs/TASK_QUEUE.md
docs/FRONTEND.md
docs/API_CONTRACT.md sections 26, 28, 28.1-28.4, 36-45, 68-72

Then:
Claim highest-priority available FRONTEND task whose dependencies are satisfied.
```

## Backend Contract Handoff — FRONTEND-007 / FRONTEND-009

The backend side of both tasks is complete and covered by e2e tests over real
HTTP. Full endpoint lists, per-section data sources and the dictation error
contract live in `docs/TASK_QUEUE.md` under FRONTEND-007 and FRONTEND-009.

Commits to bring across from `agent/backend` (in order):

```text
9b72457  refactor(shared): lock, dictation, report and hbys contracts canonical
e577de6  feat(sla): derive state, remaining and overdue from the frozen deadline
4170e99  feat(information): information notes with preserved history
0c8b514  feat(pacs): adapter boundary and the pilot test adapter
63f859e  feat(realtime): websocket gateway and workflow-derived events
f3ddc35  feat(studies): complete the study detail contract for the frontend
```

Only `f3ddc35` is new since the last handoff; the five before it are listed
because a frontend branch that has not merged `agent/backend` recently needs
them for `@radiology/shared` to compile.

Endpoints FRONTEND-007 can call today (base `/api/v1`):

```text
GET  /studies/:studyId                  StudyDetail
GET  /studies/:studyId/lock             StudyLockInfo
POST /studies/:studyId/lock/heartbeat   { valid, expiresInSeconds }
POST /studies/:studyId/lock/release     { released }
GET  /studies/:studyId/dictations       DictationDto[]
GET  /dictations/:dictationId/playback  DictationPlaybackDto
GET  /studies/:studyId/information      InformationNoteDto[]
POST /studies/:studyId/information      CreatedInformationNote (201)
PUT  /information/:noteId               InformationNoteDto
GET  /information/:noteId/versions      InformationNoteVersionDto[]
GET  /studies/:studyId/pacs/viewer      StudyPacsViewer
GET  /studies/:studyId/pacs/series      StudyPacsSeries[]
WS   /realtime                          token in the Socket.IO handshake auth
```

FRONTEND-009 sequence:

```text
POST /studies/:studyId/start-reading      -> lock + READING
POST /studies/:studyId/dictations         -> DictationDto (RECORDING)
POST /dictations/:dictationId/upload      -> multipart: file, durationMs
POST /studies/:studyId/complete-reading   -> WAITING_TRANSCRIPTION
```

Do not hard-code the multipart field names; import
`DICTATION_UPLOAD_FIELD` from `@radiology/shared`.

A failed upload returns `status: FAILED` with `failureReason`, never
`COMPLETED`. The recorder must not show success in that case.

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

Canonical API contracts now in `@radiology/shared` (API_CONTRACT section 121):

```text
StudyListItem  StudyDetail  StudyFlags  StudyClinicalData  StudySlaSnapshot
StudyLockInfo  StudyLockType  AcquiredLockInfo
DictationDto   DictationPlaybackDto   DICTATION_UPLOAD_FIELD
ReportDto      ReportVersionDto       SaveReportDraftResult
HbysDeliveryDto  HbysDeliveryAttemptDto
InformationNoteDto  InformationNoteVersionDto  CreatedInformationNote
StudyPacsViewer  StudyPacsSeries
RealtimeEventType  RealtimeEventPayloads  RealtimeCommand  realtimeRoom
ApiErrorCode  PaginatedResponse  PaginationMeta
```

The frontend must import these rather than keep local copies. Backend code
imports the same symbols, so a contract change breaks both sides at compile
time instead of at runtime.

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

**Status:** DONE on the documented fallback (BACKEND-019, BACKEND-020).
Orthanc itself is still BLOCKED_EXTERNAL.

Adapter boundary (`src/integrations/contracts/pacs.contract.ts`):

```text
findStudy / listSeries / getViewerAccess / checkAvailability
```

`PacsService` knows no vendor detail. It resolves the study, checks hospital
scope, asks whichever adapter the registry returns and maps the answer. Adding
an Orthanc adapter changes no line in it.

Running adapter:

```text
TestPacsAdapter   PACS_DRIVER=test (default)
```

Everything it returns is derived by hashing hospitalId + accessionNumber, so a
study always gets the same UIDs — no randomness, same rule the mock HBYS
adapter follows.

Working endpoints:

```text
GET /api/v1/studies/:studyId/pacs/viewer
GET /api/v1/studies/:studyId/pacs/series
```

It does NOT fake a viewer. With no PACS_TEST_VIEWER_BASE_URL configured the
answer is:

```json
{ "available": false, "viewerUrl": null, "reason": "PACS_VIEWER_NOT_CONFIGURED" }
```

A URL that does not open would tell a doctor the images are ready and leave
them with nothing (CLAUDE.md section 30). Other cases stay distinguishable
rather than collapsing into one error: PENDING gives IMAGES_NOT_READY, an
integration failure gives PACS_ERROR.

Technical vs clinical, kept apart (INTEGRATIONS section 27):

```text
PacsAvailability.ERROR   integration failure
StudyStatus.IMAGE_MISSING  a doctor or Operation decision
```

Neither is ever derived from the other.

`PACS_DRIVER=orthanc` fails startup on purpose — the adapter does not exist,
and silently serving mock metadata to something that asked for a real PACS
would be worse than refusing to boot.

Real hospital PACS / a reachable Orthanc instance:

```text
BLOCKED_EXTERNAL
```

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

**Status:** DONE (BACKEND-045)

```text
RealtimeGateway         Socket.IO on /realtime
RealtimeService         the only realtime API domain services see
RealtimeMonitorService  sweeper for the two clock-driven events
packages/shared/src/realtime/   canonical event contracts
```

Events, all derived from real committed state:

```text
study.status.changed      every workflow transition
study.locked              start-reading, start-approval
study.unlocked            release / force-release / workflow done / TTL expiry
study.waiting_approval    submit-report, to the assigned doctor's room only
hbys.delivery.pending     finalize and manual retry
hbys.delivery.sent        worker success
hbys.delivery.failed      worker, only once the retry budget is spent
sla.warning / sla.overdue sweeper, when a real deadline threshold passes
information.added/updated note create and edit
```

Security, and why it is not a second implementation:

```text
Auth runs as handshake middleware, so an unauthorized client never connects
rather than connecting and being kicked a moment later.
It calls the same two things JwtAuthGuard calls — verifyAccessToken, then
resolveAuthenticatedUser — so realtime cannot be looser than REST.
Rooms are assigned by the server: user / role / hospital on connect.
study.join is authorized server-side; knowing a UUID is not access, and a
nonexistent study answers exactly like an unauthorized one.
The connection closes at the access token's expiry, because hospital access is
resolved once per connection and a socket must not outlive its permissions.
```

Duplicate and reconnect handling:

```text
Every event carries an eventId a client can deduplicate on.
Hospital and study rooms overlap; Socket.IO still delivers one copy (asserted).
No server-side session: rooms are rebuilt from the database on every connect,
so a reconnect takes the same path as a first connection.
An SLA threshold announces once, claimed with Redis SET NX. A 15s sweeper would
otherwise raise the same warning four times a minute for hours.
A retryable HBYS attempt emits nothing; only the final failure does.
```

Emission ordering: events are emitted after commit. `WorkflowService.transition`
can run inside a caller's transaction, so the emit does not live there —
`TransitionResult` now carries `hospitalId` and each action service emits once
its own transaction has returned.

Known limit: the sweeper assumes a single instance. With several backend
instances each would sweep, so the lock-expiry event would be emitted more than
once; the SLA half is already deduplicated through Redis.

---

# 17. SLA PROGRESS

**Status:** DONE (BACKEND-039) — except the one duration nobody has defined.

Seeded policy:

```text
ACIL   = 120 min
YATAN  = 720 min
NORMAL = 1440 min
Warning = 20 min before the deadline
```

What the engine computes (`src/sla/sla.calculator.ts`, pure, `now` injected):

```text
deadlineAt        frozen at arrival, never recalculated (DATA_MODEL 66)
completedAt       doctor final approval — where the clock STOPS
remainingSeconds  seconds left; 0 once the deadline has passed
overdueSeconds    seconds past the deadline; 0 while inside it
state             NORMAL | WARNING | OVERDUE | COMPLETED | null
```

Two rules worth remembering:

```text
The clock stops at final approval (WORKFLOW_STATE_MACHINE 61).
A study that goes HBYS_FAILED afterwards is NOT clinically late again —
the counters freeze at approval. A report finalized 10 minutes late stays
COMPLETED with overdueSeconds = 600 forever: the breach is on the record,
but it does not keep growing.

Only the warning band is read live. The deadline itself is a snapshot, so a
policy change cannot move a historical deadline.
```

Operation finds studies at risk through the list filter (API_CONTRACT 92):

```text
GET /api/v1/studies?slaState=WARNING
GET /api/v1/studies?slaState=OVERDUE
```

Unresolved:

```text
YOGUN_BAKIM exact SLA duration   BLOCKED_SPEC
```

NOT invented. No policy is seeded for it, so those studies carry no deadline,
every derived field is null and they appear in no slaState list — rather than
silently borrowing another category's duration. When the health team gives the
number, seeding one SlaPolicy row is the entire change; no code edit.

---

# 18. DEPLOYMENT PROGRESS

## Frontend

```text
Vercel: NOT DEPLOYED
```

## Backend

```text
Railway: DEPLOYED — service `backend` in strong-courtesy / production

Public API base URL (frontend uses this):
  https://backend-production-b2b6.up.railway.app/api/v1

Health: https://backend-production-b2b6.up.railway.app/api/v1/health
Build:  Dockerfile at the repo root (pnpm workspace, single stage)
Start:  prisma migrate deploy && node dist/main.js
Port:   PORT=3001 pinned, and the Railway domain targets 3001

DATABASE_URL and REDIS_URL are Railway service references, so the backend
reaches both over the private network: health reports 1ms for each, against
250-1600ms through the developer TCP proxy.
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
Backend API:    https://backend-production-b2b6.up.railway.app/api/v1
Backend health: https://backend-production-b2b6.up.railway.app/api/v1/health
Frontend:       not deployed yet (DEVOPS-005)
```

---

# 19. LATEST QUALITY GATE RESULTS

No development quality gate has been run yet.

Current status:

Measured on 2026-08-15 (backend):

```text
Lint: PASS
Typecheck: PASS
Backend Unit Tests: 303 PASS / 0 FAIL
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

Deployed pilot verification (public URL, 2026-08-18):

```text
GET /api/v1/health                    -> 200, appEnv=pilot, db up 1ms, redis up 1ms
login doctor/reporter/operation/manager -> 200, correct role, no refreshToken in body
wrong password vs unknown email       -> 401, byte-identical bodies
refresh cookie flags                  -> HttpOnly; Secure; SameSite=None; Path=/api/v1/auth
GET /auth/me                          -> 200, hospitals [TEST_HOSPITAL], no passwordHash
GET /auth/me without token            -> 401
POST /auth/refresh                    -> 200, cookie rotated; replayed old cookie 401
POST /auth/logout                     -> 204; refresh 401 and the access token 401 at once
CORS preflight from localhost:3000    -> allow-origin localhost:3000, credentials true

Full clinical chain on the deployed instance (one study):
  first HL7 -> WAITING_ACCEPTANCE       second doctor start-reading -> 423
  second HL7 -> IMAGES_PENDING          reporter finalize          -> 403
  images available -> UNREAD            finalize -> HBYS_PENDING
  start-reading -> READING              worker  -> HBYS_SENT
  dictation upload -> COMPLETED         delivery SENT, 1 attempt, external id set
  complete-reading -> WAITING_TRANSCRIPTION
  start-transcription -> TRANSCRIBING
  submit-report -> WAITING_APPROVAL
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