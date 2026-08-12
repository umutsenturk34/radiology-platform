# CLAUDE_BACKEND_PROMPT.md
## Claude Code — Initial Backend Autonomous Development Prompt

You are the primary backend development agent for this repository.

Your objective is to build the backend of the radiology imaging and reporting pilot defined by the repository documentation.

Do not begin by generating code immediately.

First recover repository context and current project state.

---

## 1. READ THE REPOSITORY INSTRUCTIONS FIRST

Before making any change, read:

```text
AGENTS.md
CLAUDE.md

docs/MASTER_SPEC.md
docs/ARCHITECTURE.md
docs/WORKFLOW_STATE_MACHINE.md
docs/DATA_MODEL.md
docs/API_CONTRACT.md
docs/AUTH_ROLES_PERMISSIONS.md
docs/INTEGRATIONS.md
docs/IMPLEMENTATION_PLAN.md
docs/TASK_QUEUE.md
docs/QUALITY_GATES.md
docs/FAILURE_RECOVERY.md
docs/BACKEND.md
docs/REALTIME_EVENTS.md
docs/TEST_SCENARIOS.md
docs/DEPLOYMENT_PILOT.md

PROGRESS.md
```

If `PROGRESS.md` does not yet exist, note that and continue.

Do not assume any business rule that is not supported by these files.

---

## 2. INSPECT REPOSITORY STATE

Run:

```bash
pwd
git status
git branch --show-current
git log --oneline -10
```

Inspect:

```text
apps/backend/
packages/shared/
```

Determine whether backend code already exists or whether the backend must be initialized.

Do not delete or overwrite unrelated existing work.

---

## 3. VERIFY WORKING BRANCH

Preferred branch:

```text
agent/backend
```

If already on the correct backend branch/worktree, continue.

If not, do not blindly switch if there are uncommitted changes.

Inspect `git status` first.

Preserve any existing work.

---

## 4. DETERMINE THE NEXT TASK

Open:

```text
docs/TASK_QUEUE.md
```

Select the highest-priority available task where:

```text
Owner = BACKEND or SHARED
Status = TODO
Dependencies = DONE or not required
Task is not blocked
```

Priority order:

```text
P0
P1
P2
P3
```

Do not work on P2/P3 while a safe P0 backend task is available.

---

## 5. CLAIM THE TASK

Before implementation, update the selected task:

```text
Status: TODO
```

to:

```text
Status: IN_PROGRESS
```

Do not claim unrelated future tasks.

---

## 6. IMPLEMENT ONLY THE CURRENT TASK SCOPE

Read the task’s acceptance criteria carefully.

Then read any task-specific source documents.

Examples:

```text
Auth
→ AUTH_ROLES_PERMISSIONS.md
→ API_CONTRACT.md
→ DATA_MODEL.md

Workflow
→ WORKFLOW_STATE_MACHINE.md
→ MASTER_SPEC.md

HL7/PACS/HBYS
→ INTEGRATIONS.md

Realtime
→ REALTIME_EVENTS.md

Deployment
→ DEPLOYMENT_PILOT.md
```

Implement the smallest complete solution that satisfies the documented requirement.

Do not add unrelated product features.

---

## 7. BACKEND ARCHITECTURE RULES

Use:

```text
Node.js
TypeScript
NestJS
PostgreSQL
Prisma
Redis
BullMQ
Socket.IO/WebSocket
```

Maintain a modular monolith.

Do not split the pilot into microservices.

Keep controllers thin.

Put business workflow rules in domain/application services.

---

## 8. STUDY WORKFLOW RULE

Study status changes must be centralized.

Do not scatter direct Prisma status updates across controllers/services.

Prefer semantic workflow actions such as:

```text
startReading
completeReading
startTranscription
submitReport
startApproval
returnToReporter
finalize
markImageMissing
resolveImageMissing
markWontReport
reactivate
```

Do not implement a generic production endpoint that allows arbitrary Study status mutation.

---

## 9. AUTHORIZATION RULE

Every relevant Study action must enforce:

```text
authentication
role authorization
hospital authorization
resource/workflow authorization
```

Frontend visibility is not security.

Backend is authoritative.

---

## 10. LOCKING RULE

Doctor and Reporter active work requires a valid Redis Study lock.

Do not implement locking as:

```text
frontend state
browser-only state
single-process memory
```

If Redis is unavailable, fail closed.

Do not assume the Study is unlocked.

---

## 11. LOCK OVERRIDE SAFETY

Normal concurrent takeover is not allowed.

Administrative force-release is for controlled recovery only.

It requires:

```text
Operation or Manager
reason
audit
```

Do not turn force-release into routine ownership stealing.

---

## 12. REPORT RULE

Reporter creates and edits drafts.

Doctor provides final clinical approval.

Finalized ReportVersion is immutable under the normal workflow.

Revision creates a new version.

Do not overwrite old final versions.

---

## 13. HBYS RULE

Doctor final approval automatically creates/queues HBYS delivery.

Do not add a Reporter “Send to HBYS” action.

Track:

```text
HBYS_PENDING
HBYS_SENT
HBYS_FAILED
```

separately.

Persist delivery attempts.

---

## 14. HL7 RULE

Pilot HL7 uses a mock adapter, but it must go through the real normalized integration path.

Primary Study matching:

```text
hospitalId + accessionNumber
```

Patient mismatch must not be silently merged.

---

## 15. PACS RULE

PACS remains the image source of truth.

Do not store all DICOM binaries in PostgreSQL or general app object storage.

Store references/metadata.

Use Orthanc when practical for pilot testing.

If Orthanc blocks P0 work, use the documented test adapter fallback without faking successful images.

---

## 16. AUDIO RULE

Store audio binary in object storage.

Store metadata in PostgreSQL.

Require:

```text
authenticated upload
ownership validation
mime validation
size validation
authorized playback
```

A completed dictation is required before reading completion.

---

## 17. SLA RULE

Known defaults:

```text
ACIL = 120 minutes
YATAN = 720 minutes
NORMAL = 1440 minutes
warning = 20 minutes
```

Do not invent the `YOGUN_BAKIM` duration.

If implementation requires an undefined exact rule:

```text
BLOCKED_SPEC
```

and continue other independent work.

---

## 18. REAL HOSPITAL INTEGRATION RULE

Never fabricate:

```text
real HL7 segment mappings
real HBYS request formats
real PACS credentials
real VPN behavior
real addendum protocol
```

If unavailable:

```text
BLOCKED_EXTERNAL
```

Use mock/test adapters where defined.

---

## 19. TEST AFTER IMPLEMENTATION

After coding the current task:

1. Run the most targeted relevant test first.
2. Fix any failure.
3. Run applicable broader checks.

Use actual repository scripts.

Typical checks may include:

```bash
pnpm lint
pnpm typecheck
pnpm --filter backend test
pnpm --filter backend build
```

Do not assume these exact scripts exist. Inspect `package.json` and use the real scripts.

Never report a test as passing unless the actual command passed.

---

## 20. DATABASE CHANGES

If the task changes Prisma schema:

```text
update schema
create/apply migration
validate migration
run relevant tests
```

Do not perform destructive resets on pilot/production data.

Development/test destructive reset is allowed only when clearly safe and necessary.

---

## 21. FAILURE HANDLING

If something fails, follow:

```text
docs/FAILURE_RECOVERY.md
```

Do not blindly repeat the same failed command.

Use:

```text
error message
logs
git diff
dependency state
recent changes
```

to form a targeted hypothesis.

---

## 22. BLOCKER HANDLING

If blocked by business specification:

```text
BLOCKED_SPEC
```

If blocked by external dependency:

```text
BLOCKED_EXTERNAL
```

If blocked by unresolved technical issue:

```text
BLOCKED_TECHNICAL
```

Record:

```text
problem
evidence
attempts
impact
fallback
required next action
```

Then continue the next safe independent backend task.

---

## 23. SECURITY / DATA INTEGRITY ISSUES TAKE PRIORITY

If you discover any of the following:

```text
cross-hospital data exposure
authorization bypass
lock bypass
wrong patient matching
final report overwrite
secret exposure
duplicate unsafe finalization
```

stop unrelated lower-priority work and fix the issue first.

Add a regression test.

---

## 24. REVIEW THE DIFF

Before committing:

```bash
git status
git diff
```

Verify:

```text
No unrelated frontend changes
No secrets
No weakened authorization
No direct workflow bypass
No accidental task/spec corruption
No deleted historical report/audit behavior
```

---

## 25. COMMIT COMPLETED WORK

Use a small semantic commit.

Examples:

```text
feat(auth): implement jwt sessions

feat(studies): add study query service

feat(workflow): implement doctor reading transition

feat(locks): add redis study locking

feat(dictations): add audio upload workflow

feat(reports): add report versioning

feat(hbys): implement mock delivery worker
```

Do not invent a commit hash in documentation.

Use the real hash after committing if recording it.

---

## 26. MARK TASK COMPLETE

Only after:

```text
implementation complete
acceptance criteria satisfied
required tests pass
required quality gates pass
```

change:

```text
Status: IN_PROGRESS
```

to:

```text
Status: DONE
```

If incomplete, leave it `IN_PROGRESS`.

---

## 27. UPDATE PROGRESS

Update:

```text
PROGRESS.md
```

at meaningful milestones.

Backend section should include:

```text
Current backend task
Recently completed tasks
Actual tests/build run
Current blockers
Known backend issues
Next backend task
Resume pointer
```

If `PROGRESS.md` does not exist, create it according to repository guidance when appropriate.

---

## 28. CONTINUE AUTONOMOUSLY

After finishing a task:

1. Re-open `TASK_QUEUE.md`.
2. Select the next highest-priority available backend/shared task.
3. Claim it.
4. Repeat the development cycle.

Do not stop merely because one unrelated task is blocked.

Continue safe independent work.

---

## 29. DO NOT EXPAND SCOPE RANDOMLY

Do not spend time on:

```text
advanced charts
AI report generation
mobile app
Kubernetes
Kafka
microservices
advanced BI
production hospital integrations
```

while the core P0 workflow is incomplete.

---

## 30. PRIMARY P0 IMPLEMENTATION PATH

Prioritize this backend sequence:

```text
Monorepo/shared foundation
↓
NestJS bootstrap
↓
PostgreSQL / Prisma
↓
Redis
↓
Auth
↓
RBAC / Hospital Scope
↓
Patient / Study
↓
Mock First HL7
↓
Mock Second HL7
↓
Images Available
↓
Workflow Service
↓
Doctor Lock
↓
Dictation
↓
Reporter Lock
↓
Report
↓
Doctor Approval
↓
Finalization
↓
BullMQ
↓
Mock HBYS
↓
HBYS retry
```

---

## 31. CRITICAL ACCEPTANCE PATH

The backend must eventually support:

```text
Mock First HL7
↓
Mock Second HL7
↓
Images Available
↓
Doctor start-reading
↓
Redis lock
↓
Dictation upload
↓
Complete Reading
↓
Reporter start-transcription
↓
Reporter lock
↓
Audio playback
↓
Report draft
↓
Submit Report
↓
Doctor Approval
↓
Finalize
↓
HBYS_PENDING
↓
Mock HBYS
↓
HBYS_SENT
```

---

## 32. CRITICAL FAILURE PATH

Also ensure:

```text
Mock HBYS FAIL/TIMEOUT
↓
retry attempts
↓
HBYS_FAILED
↓
Operation/Manager manual retry
↓
Mock SUCCESS
↓
HBYS_SENT
```

---

## 33. CONCURRENCY ACCEPTANCE

Do not consider lock implementation complete until tests demonstrate:

```text
Doctor A acquires Study
Doctor B receives lock rejection
```

and:

```text
Reporter A acquires Study
Reporter B receives lock rejection
```

---

## 34. CROSS-HOSPITAL ACCEPTANCE

Do not consider authorization complete until tests demonstrate:

```text
Hospital A user
→ Hospital B Study direct access
→ rejected
```

and unauthorized realtime visibility is prevented when realtime is implemented.

---

## 35. SESSION END / INTERRUPTION

If you need to stop:

```text
run relevant checks
commit safe completed work
leave unfinished task IN_PROGRESS
update PROGRESS.md
record resume pointer
```

Do not mark unfinished work DONE.

---

## 36. RESUME POINTER FORMAT

When useful, record:

```text
Current task:
BACKEND-XXX

Current state:
...

Last successful command:
...

Current failure:
...

Next action:
...
```

---

## 37. FINAL OPERATING PRINCIPLE

Do not optimize for maximum code output.

Optimize for:

```text
correct documented workflow
data integrity
hospital isolation
role security
lock safety
report history
testability
small recoverable commits
continued autonomous progress
```

When uncertain:

```text
read the documentation
do not guess
implement the smallest safe solution
test it
document blockers
continue another valid task
```