# PROGRESS.md
## Radyoloji Platformu — Geliştirme İlerleme ve Devam Noktası

> **Doküman Türü:** Shared Agent Progress / Resume State  
> **Amaç:** Claude ve Codex’in mevcut proje durumunu hızlıca anlayabilmesi ve önceki oturumun kaldığı yerden güvenli şekilde devam edebilmesi.  
> **Güncelleyenler:** Claude Code, Codex  
> **Ana Referans:** `docs/TASK_QUEUE.md`

---

# 1. CURRENT PILOT STATUS

**Overall Status:** IN DEVELOPMENT — persistence layer live on Railway  
**Pilot Release:** NOT READY  
**Current Version:** pre-v0.1.0-pilot  
**Environment:** Local backend + Railway PostgreSQL/Redis (production environment)  
**Deployment:** Backend not deployed yet; databases provisioned  
**Last Updated:** 2026-08-14 (Claude / backend)

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
PHASE 0
Documentation and autonomous-agent preparation
```

Next phase:

```text
PHASE 1
Monorepo + Backend + Frontend foundation
```

Primary next milestone:

```text
pnpm workspace
+
NestJS backend
+
Next.js frontend
+
PostgreSQL
+
Redis
+
Auth
```

---

# 5. BACKEND PROGRESS

## Current Backend Status

```text
PERSISTENCE LAYER LIVE — auth not started
```

## Current Backend Task

```text
BACKEND-005 (Seed) — IN_PROGRESS, written but not yet executed
```

## Next Recommended Backend Task

```text
BACKEND-005 finish (run + verify idempotency)
-> BACKEND-006 Authentication
-> BACKEND-007 Role Guard
-> BACKEND-008 Hospital Access Guard
```

## Recently Completed Backend Tasks

```text
SHARED-001  Root monorepo setup                DONE
SHARED-002  Shared contracts package           DONE
BACKEND-001 NestJS application bootstrap       DONE
BACKEND-002 PostgreSQL + Prisma setup          DONE
BACKEND-003 Redis setup                        DONE
BACKEND-004 Core database models phase 1       DONE
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
BACKEND-005 — Seed System

Current State:
src/prisma/seed.ts is written, lints, typechecks and builds, but has NEVER
been executed, so its acceptance criteria are unverified.

Last Successful Command:
pnpm lint / pnpm typecheck / pnpm build  -> PASS
backend unit tests 7 PASS, e2e tests 8 PASS

Current Problem:
None. Work was paused deliberately at a green checkpoint.

Next Action:
1. Add to apps/backend/package.json:
     "scripts": { "seed": "ts-node src/prisma/seed.ts" }
     "prisma":  { "seed":  "ts-node src/prisma/seed.ts" }
2. Add SEED_DEFAULT_PASSWORD to apps/backend/.env.example
   (dev fallback used by the script is PilotTest!2026).
3. Run the seed, then run it a SECOND time and confirm no duplicates:
     expect exactly 1 hospital, 4 users, 4 access rows, 3 SLA policies.
4. Mark BACKEND-005 DONE, then start BACKEND-006 (Authentication):
   login / refresh / logout / me, argon2 hashing, JWT access token,
   HttpOnly refresh cookie, UserSession row with refreshTokenHash.
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

Then:
Claim highest-priority available FRONTEND task whose dependencies are satisfied.
```

---

# 7. SHARED / MONOREPO PROGRESS

## Status

```text
NOT STARTED
```

## Next Task

```text
SHARED-001 — Root Monorepo Setup
```

Expected output:

```text
root package.json
pnpm-workspace.yaml
TypeScript base config
lint/format configuration
workspace scripts
```

Then:

```text
SHARED-002 — Shared Package Setup
```

---

# 8. DATABASE PROGRESS

**Status:** NOT STARTED

Expected stack:

```text
PostgreSQL
Prisma
```

First database milestone:

```text
Prisma configured
↓
Core models
↓
Migration
↓
Seed
```

No migration has been recorded yet.

---

# 9. REDIS PROGRESS

**Status:** NOT STARTED

Expected responsibilities:

```text
Study Locks
BullMQ
Ephemeral Coordination
```

No Redis connection/test has been recorded yet.

---

# 10. AUTH PROGRESS

**Status:** NOT STARTED

Required pilot roles:

```text
DOCTOR
REPORTER
OPERATION
MANAGER
```

Required endpoints:

```text
login
refresh
logout
me
```

No auth test result recorded yet.

---

# 11. HL7 INTEGRATION PROGRESS

**Status:** NOT STARTED

Pilot target:

```text
MockHl7Adapter
```

Required flows:

```text
First HL7
Second HL7
Accession Number matching
Duplicate protection
Patient mismatch protection
```

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

**Status:** NOT STARTED

Minimum P0:

```text
record
upload
persist metadata
playback
```

VAD is not required before basic workflow works.

---

# 14. REPORT WORKFLOW PROGRESS

**Status:** NOT STARTED

Required flow:

```text
WAITING_TRANSCRIPTION
↓
TRANSCRIBING
↓
Report Draft
↓
WAITING_APPROVAL
↓
Doctor Final
```

No report tests recorded yet.

---

# 15. HBYS PROGRESS

**Status:** NOT STARTED

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
BullMQ
delivery attempts
automatic retry
manual retry
HBYS_SENT
HBYS_FAILED
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

Measured on 2026-08-14 (backend):

```text
Lint: PASS
Typecheck: PASS
Backend Unit Tests: 7 PASS / 0 FAIL
Backend E2E Tests: 8 PASS / 0 FAIL
Backend Build: PASS
Integration Tests: NOT_RUN (no test database yet)
Frontend Tests: NOT_RUN
Frontend Build: NOT_RUN
```

Live infrastructure verification (real Railway services):

```text
Prisma migration 20260814144451_init: APPLIED
Tables created: 11 (10 models + _prisma_migrations)
Unique indexes: 19, foreign keys: 17
GET /api/v1/health -> 200, database up (255ms), redis up (248ms)
Redis PING -> PONG on Redis 8.2.8
Unreachable database -> structured error + exit code 1, no credential logged
Unreachable Redis -> fails closed, process exits
```

Agents must replace these values only with actual command results.

Never fabricate PASS.

---

# 20. E2E TEST STATUS

## Happy Path

```text
NOT_RUN
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
NOT_RUN
```

Required:

```text
HBYS FAIL
→ HBYS_FAILED
→ Manual Retry
→ HBYS_SENT
```

## Doctor Lock Conflict

```text
NOT_RUN
```

## Reporter Lock Conflict

```text
NOT_RUN
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

Actual current branch:

```text
UNKNOWN — agent must inspect with git branch --show-current
```

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

At initialization:

```text
Not recorded here yet.
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
[ ] Auth completed
[ ] HL7 mock completed
[ ] Doctor workflow completed
[ ] Reporter workflow completed
[ ] Approval workflow completed
[ ] HBYS mock completed
[ ] Operation workflow completed
[ ] Manager basic completed
[ ] E2E passed
[ ] Pilot deployed
```

---

# 29. CURRENT PILOT READINESS CHECKLIST

```text
[ ] Auth
[ ] Roles
[ ] Hospital Scope

[ ] Patient
[ ] Study

[ ] First HL7
[ ] Second HL7
[ ] Images Available

[ ] Doctor Queue
[ ] Doctor Lock
[ ] Dictation

[ ] Reporter Queue
[ ] Reporter Lock
[ ] Audio Playback
[ ] Report

[ ] Doctor Approval
[ ] Finalization

[ ] Mock HBYS
[ ] HBYS Success
[ ] HBYS Failure
[ ] Manual Retry

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