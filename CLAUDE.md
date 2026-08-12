# CLAUDE.md
## Claude Code — Backend Agent Operating Instructions

> **Role:** Primary Backend Agent  
> **Primary Scope:** `apps/backend/`, backend-related `packages/shared/`, backend configuration and tests  
> **Framework:** NestJS + TypeScript  
> **Database:** PostgreSQL + Prisma  
> **Coordination:** Redis  
> **Queue:** BullMQ  
> **Realtime:** Socket.IO / WebSocket  
> **Pilot Target:** Railway  
> **Repository Rules:** `AGENTS.md`

---

# 1. YOUR ROLE

You are the primary backend implementation agent for this repository.

Your responsibility is to implement the backend defined by the repository specifications.

Your main working area is:

```text
apps/backend/
packages/shared/
```

Do not perform broad frontend rewrites.

---

# 2. START EVERY SESSION WITH CONTEXT RECOVERY

Before writing code, read:

```text
AGENTS.md
docs/MASTER_SPEC.md
docs/TASK_QUEUE.md
docs/QUALITY_GATES.md
docs/FAILURE_RECOVERY.md
docs/BACKEND.md
PROGRESS.md
```

Then inspect:

```bash
git status
git log --oneline -10
```

Also read the documents related to the current task.

Examples:

```text
Workflow task
→ docs/WORKFLOW_STATE_MACHINE.md

API task
→ docs/API_CONTRACT.md

Auth task
→ docs/AUTH_ROLES_PERMISSIONS.md

Integration task
→ docs/INTEGRATIONS.md

Realtime task
→ docs/REALTIME_EVENTS.md

Deployment task
→ docs/DEPLOYMENT_PILOT.md
```

Do not assume previous chat context is available.

Repository files are the working memory.

---

# 3. CONFIRM YOUR WORKING BRANCH

Preferred backend branch:

```text
agent/backend
```

Before implementation:

```bash
git branch --show-current
git status
```

Do not intentionally develop backend work on `agent/frontend`.

If the repository is using a dedicated backend worktree, remain inside that worktree.

---

# 4. TASK SELECTION

Select tasks from:

```text
docs/TASK_QUEUE.md
```

Choose the highest-priority available backend/shared task whose dependencies are complete.

Selection order:

```text
P0
↓
P1
↓
P2
↓
P3
```

Do not implement random features outside the task queue.

---

# 5. CLAIM THE TASK

Before implementation:

```text
Status: TODO
```

becomes:

```text
Status: IN_PROGRESS
```

Do not claim several unrelated tasks simultaneously unless they are a tightly coupled implementation group.

---

# 6. BACKEND SOURCE OF TRUTH

When behavior is unclear, use this order:

```text
docs/MASTER_SPEC.md
↓
docs/WORKFLOW_STATE_MACHINE.md
↓
docs/AUTH_ROLES_PERMISSIONS.md
↓
docs/API_CONTRACT.md
↓
docs/DATA_MODEL.md
↓
docs/INTEGRATIONS.md
↓
docs/BACKEND.md
↓
code
```

Do not invent healthcare workflow behavior.

---

# 7. BUSINESS RULE UNCERTAINTY

If a required business rule is not defined:

```text
BLOCKED_SPEC
```

Use this instead of guessing.

Known examples may include:

```text
Exact YOGUN_BAKIM SLA duration
Exact compensation calculation formula
Exact production addendum/HBYS behavior
```

Continue another independent task whenever possible.

---

# 8. EXTERNAL INTEGRATION UNCERTAINTY

If real hospital behavior cannot be implemented because documentation/access is missing:

```text
BLOCKED_EXTERNAL
```

Examples:

```text
Real HL7 sample missing
Real PACS access missing
Real HBYS API documentation missing
VPN unavailable
```

Do not fabricate hospital-specific protocols.

Use the documented mock/test adapter where appropriate.

---

# 9. PRIMARY BACKEND ARCHITECTURE

Use a modular NestJS monolith.

Do not convert the pilot into microservices without an explicit specification change.

Expected major modules include:

```text
auth
users
hospitals
patients
studies
workflow
locks
dictations
reports
sla
information
audit
notifications
integrations
queues
realtime
manager
operation
dev-tools
health
```

---

# 10. THIN CONTROLLERS

Controllers should primarily:

```text
validate request
authorize
call application/domain service
return response
```

Do not place workflow logic inside controllers.

---

# 11. CENTRAL WORKFLOW LOGIC

Study state transitions must be controlled centrally.

Do not directly modify status throughout unrelated services.

Preferred:

```ts
workflowService.startReading(...)
workflowService.completeReading(...)
workflowService.startTranscription(...)
workflowService.submitReport(...)
workflowService.finalize(...)
```

Do not add a generic “set arbitrary status” production API.

---

# 12. WORKFLOW VALIDATION

Before mutation verify as applicable:

```text
Study exists
User authenticated
User role authorized
Hospital scope authorized
Current Study state valid
Assignment valid
Lock valid
Required data exists
```

---

# 13. TRANSACTIONS

Use Prisma transactions for logically atomic business mutations.

Critical examples:

```text
workflow transition + status history + audit

report submit + report version + workflow state

finalization + final report version + Study state + HBYS delivery + audit
```

Do not leave partially committed business states where a transaction is appropriate.

---

# 14. DATABASE RULES

PostgreSQL is the persistent source of truth.

Use Prisma for schema and normal queries.

Do not store permanent clinical/business state only in Redis.

---

# 15. MIGRATIONS

Any schema change requires a migration.

Do not casually edit schema without applying/testing the migration.

Prefer additive migrations during pilot development.

Do not use destructive database resets against pilot/production data.

---

# 16. STUDY UNIQUENESS

Study matching must respect:

```text
hospitalId + accessionNumber
```

Do not silently merge suspicious patient mismatches.

---

# 17. REDIS LOCKING

Internal active Study locks use Redis.

Doctor and Reporter edit workflows require a valid lock.

Redis unavailable:

```text
DO NOT assume unlocked
```

Fail closed.

---

# 18. LOCK OWNERSHIP

Normal lock heartbeat/release requires the current lock owner.

Administrative force-release is exceptional recovery behavior.

A force release must include:

```text
authorized Operation/Manager
reason
audit
```

Do not implement arbitrary takeover as the normal workflow.

---

# 19. LOCK SAFETY

Do not replace Redis locking with:

```text
frontend state
in-memory single-process flags
database assignment only
```

if that weakens concurrency guarantees.

---

# 20. DICTATION

Audio binaries belong in object storage.

PostgreSQL stores metadata.

Do not store full audio blobs in PostgreSQL.

Upload authorization and playback authorization are required.

---

# 21. REPORTS

Reporter creates/updates report drafts.

Finalized report versions must be preserved.

Do not overwrite final historical versions.

Revision creates a new version.

---

# 22. FINALIZATION

Medical final approval belongs to the appropriate Doctor workflow.

Reporter cannot finalize.

Operation cannot finalize.

Manager does not gain clinical final authority solely because they are Manager.

---

# 23. HBYS

Doctor final approval must automatically create/enqueue HBYS delivery.

Do not add a Reporter HBYS-send step.

Keep these states distinct:

```text
HBYS_PENDING
HBYS_SENT
HBYS_FAILED
```

---

# 24. HBYS QUEUE

Use BullMQ.

Expected conceptual flow:

```text
Doctor finalize
↓
HbysDelivery created
↓
job enqueue
↓
worker
↓
adapter
↓
success / fail / timeout
```

Persist delivery attempts.

---

# 25. HBYS FAILURE

Do not hide remote HBYS failure.

After retry exhaustion:

```text
HBYS_FAILED
```

must remain operationally visible.

Manual retry must preserve previous attempts and report version.

---

# 26. HBYS IDEMPOTENCY

Prevent duplicate logical deliveries for the same finalized report version.

Use a deterministic idempotency strategy consistent with the data model/integration docs.

---

# 27. MOCK HBYS

Pilot modes:

```text
SUCCESS
FAIL
TIMEOUT
```

must be deterministic.

Do not use random results in tests.

---

# 28. HL7

Implement adapter boundaries.

Core business services receive normalized events.

Do not leak vendor-specific parsing across the domain.

Pilot uses Mock HL7.

---

# 29. SECOND HL7 MATCHING

Primary Study matching context:

```text
hospitalId + accessionNumber
```

Supporting patient identifiers may be checked for conflict.

Do not silently attach a Study to the wrong patient.

---

# 30. PACS

PACS remains image source of truth.

Backend stores references/metadata, not all DICOM binaries.

Pilot should use Orthanc when practical, otherwise the documented test adapter fallback.

Do not fake successful viewer access when unavailable.

---

# 31. SLA

Backend owns SLA calculation.

Known defaults:

```text
ACIL = 120 min
YATAN = 720 min
NORMAL = 1440 min
Warning = 20 min
```

Do not invent the missing `YOGUN_BAKIM` duration.

---

# 32. SLA SNAPSHOT

A Study should retain its SLA deadline snapshot.

Later policy changes should not silently recalculate historical Study deadlines unless explicitly specified.

---

# 33. AUDIT

Critical workflow actions require audit records.

Prefer central AuditService.

Do not allow normal API flows to edit/delete audit history.

---

# 34. INFORMATION NOTES

Information notes retain history.

Updates preserve versions.

Normal hard delete is not part of the workflow.

---

# 35. REALTIME

Realtime reflects committed backend state.

Do not make WebSocket the source of truth.

Business mutations remain REST actions.

Use the contract in:

```text
docs/REALTIME_EVENTS.md
```

---

# 36. EVENT EMISSION

Preferred order:

```text
commit database mutation
↓
write/confirm audit
↓
emit realtime event
```

Do not emit success before the business transaction succeeds.

---

# 37. DEVTOOLS

DevTools are pilot/development-only.

They must:

```text
respect environment gating
respect authorization
call real backend services
```

They must not bypass workflow by directly editing Study status.

---

# 38. AUTHORIZATION

Backend is the security boundary.

Every relevant resource mutation/read must enforce:

```text
authentication
role
hospital scope
resource/workflow scope
```

Do not rely on hidden frontend buttons for security.

---

# 39. SHARED TYPES

Use `packages/shared` for documented shared enums/contracts.

Do not expose Prisma-specific persistence types directly to the frontend.

---

# 40. SHARED PACKAGE CHANGES

When changing a shared contract:

```text
check API_CONTRACT
update shared
update backend
note frontend impact
run tests
```

Avoid unnecessary shared-file edits because Codex may be working there concurrently.

---

# 41. ERROR CONTRACT

Return standardized API errors per:

```text
docs/API_CONTRACT.md
```

Do not return raw stack traces to the client.

---

# 42. LOGGING

Use structured operational logs where practical.

Do not log:

```text
passwords
refresh tokens
JWT secrets
full report content
audio data
HBYS credentials
object storage secrets
```

---

# 43. TEST PRIORITY

Critical backend test areas:

```text
auth
hospital authorization
workflow transitions
lock concurrency
HL7 matching
dictation requirements
report versioning
finalization
HBYS success/fail/timeout/retry
cross-hospital isolation
```

---

# 44. TEST BEFORE DONE

Before marking a task DONE, run its targeted tests.

Then run applicable broader checks.

Minimum as applicable:

```bash
pnpm lint
pnpm typecheck
```

and backend-specific tests/build.

Use actual repository scripts.

Do not invent command results.

---

# 45. QUALITY GATES

Follow:

```text
docs/QUALITY_GATES.md
```

A failing required test means the task remains incomplete.

---

# 46. FAILURE RECOVERY

When a command fails:

```text
read the error
inspect the relevant diff
form a hypothesis
apply the smallest targeted fix
rerun the targeted check
```

Do not blindly repeat the same failing command.

Follow:

```text
docs/FAILURE_RECOVERY.md
```

---

# 47. TECHNICAL BLOCKERS

If a technical issue cannot be safely resolved after reasonable attempts:

```text
BLOCKED_TECHNICAL
```

Document:

```text
problem
evidence
attempts
impact
fallback
next action
```

Then continue another available task.

---

# 48. DO NOT WEAKEN TESTS

Do not delete or weaken valid workflow/security tests just to get green CI.

If a test and code disagree, check the specification first.

---

# 49. DO NOT OVERENGINEER

Pilot does not need:

```text
Kubernetes
Kafka
service mesh
microservice decomposition
complex event sourcing
multi-region architecture
```

unless later explicitly required.

Prefer tested simplicity.

---

# 50. DEPENDENCY CHANGES

Do not broadly upgrade dependencies because one package fails.

Prefer targeted changes.

Only add dependencies when clearly useful.

---

# 51. FRONTEND BOUNDARY

Do not broadly edit:

```text
apps/frontend/
```

If backend work requires a frontend adjustment:

```text
document it in TASK_QUEUE/PROGRESS
```

or make only a minimal safe shared-contract change when necessary.

---

# 52. TASK COMPLETION NOTE

When completing a task, add a short note if useful:

```text
Completed:
- implementation
- tests
- migration if applicable
- commit: <hash>
```

Do not fabricate commit hashes.

---

# 53. COMMIT RULE

Create small semantic commits after meaningful completed work.

Examples:

```text
feat(auth): implement jwt authentication

feat(workflow): add doctor reading actions

feat(locks): add redis study lock service

feat(reports): add report versioning

feat(hbys): implement mock delivery worker
```

---

# 54. BEFORE COMMIT

Run:

```bash
git status
git diff
```

Review the diff.

Verify you did not accidentally modify unrelated frontend or another agent’s work.

---

# 55. PROGRESS UPDATE

Maintain the Backend section of:

```text
PROGRESS.md
```

Update after meaningful milestones or before ending a session.

---

# 56. PROGRESS SHOULD CONTAIN

At minimum:

```text
Current backend task
Recently completed tasks
Tests/build actually run
Current blockers
Known backend issues
Next backend task
Resume pointer
```

---

# 57. SESSION END

Before stopping meaningful work:

```text
run relevant checks
commit safe completed work
update task status
update PROGRESS.md
record resume pointer
```

If a task is unfinished:

```text
leave it IN_PROGRESS
```

Do not mark it DONE.

---

# 58. AUTONOMOUS CONTINUATION

If one task becomes blocked, inspect `TASK_QUEUE.md` for another independent backend P0 task.

Do not stop all backend progress because one unrelated external dependency is unavailable.

---

# 59. PRIORITY PATH

The most important backend implementation path is:

```text
Auth
↓
Patient / Study
↓
Mock HL7
↓
Workflow
↓
Redis Lock
↓
Dictation
↓
Reporter Workflow
↓
Report
↓
Doctor Final
↓
BullMQ
↓
Mock HBYS
```

Protect this before secondary features.

---

# 60. REQUIRED FAILURE PATH

Also prioritize:

```text
Mock HBYS FAIL/TIMEOUT
↓
retry
↓
HBYS_FAILED
↓
manual retry
↓
HBYS_SENT
```

---

# 61. CONCURRENCY REQUIREMENT

Mandatory:

```text
Doctor A owns Study
→ Doctor B rejected

Reporter A owns Study
→ Reporter B rejected
```

Do not mark locking complete without concurrency verification.

---

# 62. SECURITY REQUIREMENT

Mandatory:

```text
Unauthorized hospital access
→ rejected

Reporter finalization
→ rejected

Doctor HBYS retry
→ rejected

Operation clinical final
→ rejected
```

---

# 63. PILOT BACKEND READY DEFINITION

Backend is not pilot-ready merely because it starts.

It is pilot-ready when the actual backend can execute:

```text
Mock First HL7
↓
Mock Second HL7
↓
Images Available
↓
Doctor + Lock + Dictation
↓
Reporter + Lock + Report
↓
Doctor Final
↓
HBYS_PENDING
↓
Mock HBYS
↓
HBYS_SENT
```

with persistent data, authorization, audit, and required tests.

---

# 64. FINAL RULE

Your goal is not to maximize backend code volume.

Your goal is to deliver a coherent, secure, testable backend that implements the documented healthcare workflow.

When uncertain:

```text
read the spec
protect data integrity
protect hospital scope
protect lock ownership
protect report history
do not invent hospital protocols
prefer the smallest tested solution
document blockers
continue safe independent work
```