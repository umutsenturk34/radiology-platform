# AGENTS.md
## Radiology Platform — Repository-Wide AI Agent Instructions

> **Scope:** Entire repository  
> **Primary Agents:** Claude Code, Codex  
> **Purpose:** Define mandatory rules for autonomous development, coordination, testing, task selection, commits, recovery, and specification compliance.

---

# 1. PROJECT MISSION

Build a pilot radiology imaging and reporting workflow platform.

The primary end-to-end workflow is:

```text
First HL7
↓
Second HL7 / Study Acceptance
↓
Images Available
↓
Doctor Reading
↓
Voice Dictation
↓
Reporter Transcription
↓
Doctor Final Approval
↓
Automatic HBYS Delivery
```

This workflow has higher priority than secondary features.

---

# 2. SOURCE OF TRUTH

Before implementing business behavior, read the repository documentation.

The primary specification hierarchy is:

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
implementation
```

Do not override documented business rules with assumptions.

---

# 3. REQUIRED READING AT SESSION START

At the beginning of every new development session, read at minimum:

```text
docs/MASTER_SPEC.md
docs/TASK_QUEUE.md
docs/QUALITY_GATES.md
docs/FAILURE_RECOVERY.md
PROGRESS.md
AGENTS.md
```

Then read the role-specific implementation guide.

Claude:

```text
docs/BACKEND.md
```

Codex:

```text
docs/FRONTEND.md
```

Read additional documents related to the current task.

---

# 4. AGENT RESPONSIBILITIES

## Claude Code

Primary ownership:

```text
apps/backend/
packages/shared/
backend-related configuration
database
Redis
BullMQ
integrations
backend tests
```

## Codex

Primary ownership:

```text
apps/frontend/
frontend tests
frontend configuration
```

---

# 5. DIRECTORY OWNERSHIP

Claude should not make broad changes inside:

```text
apps/frontend/
```

Codex should not make broad changes inside:

```text
apps/backend/
```

Cross-boundary changes must be minimal and necessary.

If a task requires significant work owned by the other agent:

1. document the requirement,
2. add/update a task,
3. continue another available task when possible.

---

# 6. SHARED DIRECTORY

Both agents may need:

```text
packages/shared/
```

Changes here require extra care.

Shared package is intended for:

```text
Enums
API DTO contracts
Realtime event contracts
Shared validation-safe types
Common API response types
```

Do not put backend-only Prisma types into the frontend contract.

---

# 7. SHARED TYPE CHANGE RULE

When changing a shared API type:

```text
Specification
↓
API contract
↓
Shared type
↓
Backend
↓
Frontend
```

must remain consistent.

Do not silently change a shared contract for local convenience.

---

# 8. TASK SOURCE

Actual implementation work is selected from:

```text
docs/TASK_QUEUE.md
```

Agents should not choose random features.

---

# 9. TASK SELECTION ALGORITHM

Select work in this order:

```text
1. Highest priority
2. Correct owner
3. Dependencies DONE
4. Not blocked
5. Smallest safe next task
```

Priority:

```text
P0
↓
P1
↓
P2
↓
P3
```

Do not work on P2/P3 while available P0 work exists.

---

# 10. TASK CLAIM

Before starting a task:

```text
Status: TODO
```

change to:

```text
Status: IN_PROGRESS
```

Only claim tasks you are actually beginning.

---

# 11. TASK COMPLETION

A task may become:

```text
DONE
```

only after its acceptance criteria and required quality gates pass.

Code existing in the repository does not automatically mean the task is complete.

---

# 12. STANDARD AGENT LOOP

Every agent follows this loop:

```text
Read specification
↓
Select task
↓
Claim task
↓
Inspect existing code
↓
Implement smallest complete solution
↓
Run targeted tests
↓
Fix failures
↓
Run required quality gates
↓
Review diff
↓
Commit
↓
Mark task DONE
↓
Update PROGRESS.md
↓
Select next task
```

---

# 13. DO NOT INVENT BUSINESS RULES

Agents must not invent healthcare workflow rules.

Examples of currently unresolved areas may include:

```text
Exact YOGUN_BAKIM SLA
Exact compensation formula
Hospital-specific addendum protocol
Real hospital integration payloads
```

If a required rule is not documented:

```text
BLOCKED_SPEC
```

Use another independent task where possible.

---

# 14. EXTERNAL DEPENDENCY RULE

If real integration requires unavailable external information:

```text
BLOCKED_EXTERNAL
```

Examples:

```text
HL7 samples
PACS credentials
HBYS documentation
VPN access
hospital test environment
```

Do not fabricate external protocols.

---

# 15. TECHNICAL BLOCKER

If a technical issue remains unresolved after reasonable diagnosis and safe alternatives:

```text
BLOCKED_TECHNICAL
```

Document:

```text
problem
evidence
attempts
impact
possible fallback
next recommended action
```

Then continue independent work.

---

# 16. FAILURE RECOVERY

Follow:

```text
docs/FAILURE_RECOVERY.md
```

Do not repeatedly execute the same failed approach without changing the hypothesis.

Avoid blind retry loops.

---

# 17. BUSINESS RULE SAFETY

The following rules are critical and must not be simplified away:

```text
role authorization
hospital authorization
study workflow validation
study locking
report version preservation
doctor final approval
HBYS delivery tracking
audit trail
```

---

# 18. NO ARBITRARY STATUS PATCHING

Study workflow status must not be modified through generic frontend/backend mutation.

Do not implement:

```text
PATCH /studies/:id
status = FINAL
```

Use documented semantic workflow actions.

---

# 19. LOCKING IS MANDATORY

Doctor and Reporter active work requires locking.

Do not replace Redis locking with:

```text
frontend flags
local component state
browser-only lock state
```

Redis failure must not be interpreted as “Study is unlocked”.

Fail closed.

---

# 20. REPORT FINALIZATION

Only the appropriate Doctor workflow may provide medical final approval.

Reporter cannot finalize.

Operation cannot finalize.

Manager without Doctor clinical authority cannot finalize.

---

# 21. HBYS RULE

Doctor final approval automatically starts HBYS delivery.

Do not add a Reporter “Send HBYS” workflow.

The states:

```text
HBYS_PENDING
HBYS_SENT
HBYS_FAILED
```

must remain distinct.

---

# 22. HBYS FAILURE

HBYS failure is visible operational state.

It must not be hidden.

Retry must preserve:

```text
report version
previous attempts
audit history
```

---

# 23. PATIENT / STUDY MODEL

A patient can have multiple studies.

Each Study is a separate reporting job.

Do not merge multiple Study workflow states into one patient-level state.

---

# 24. HL7 MATCHING

Primary matching context:

```text
hospitalId + accessionNumber
```

Do not silently merge patient mismatches.

---

# 25. INFORMATION NOTES

Information notes preserve history.

Do not implement normal hard delete.

Updates create/preserve version history.

---

# 26. FINAL REPORT VERSION

A finalized ReportVersion is immutable in normal workflow.

Revision must create a new version.

Do not overwrite the prior final version.

---

# 27. AUDIT

Critical workflow events must be auditable.

Do not remove audit events to simplify implementation.

Audit records are append-oriented and not normally editable.

---

# 28. MOCK INTEGRATIONS

Pilot uses real backend workflow with mock adapters.

Correct:

```text
Frontend
↓
Backend
↓
Core Service
↓
Mock Adapter
↓
Database
↓
Frontend result
```

Incorrect:

```text
Frontend
↓
Fake local success
```

---

# 29. FRONTEND BUSINESS RULE

Frontend does not determine authoritative Study workflow state.

Backend owns:

```text
status
assignment
locks
SLA
HBYS delivery status
finalization
permissions
```

---

# 30. BACKEND BUSINESS RULE

Backend must not create undocumented workflow behavior simply to make frontend implementation easier.

---

# 31. API CONTRACT

REST API must comply with:

```text
docs/API_CONTRACT.md
```

Do not invent endpoint names without updating the contract.

---

# 32. REALTIME CONTRACT

WebSocket events must comply with:

```text
docs/REALTIME_EVENTS.md
```

Realtime is synchronization, not the business mutation transport.

Primary workflow mutations remain REST actions.

---

# 33. API CHANGE PROCESS

If an API change is genuinely required:

```text
1. Confirm business requirement
2. Update API_CONTRACT.md
3. Update shared type
4. Update backend
5. Update frontend
6. Update tests
```

---

# 34. FRONTEND API DEPENDENCY

Codex may prepare UI/hooks against a documented API that is not yet implemented.

But API-dependent task remains:

```text
IN_PROGRESS
```

until verified against the real backend.

---

# 35. NO PERMANENT FAKE FRONTEND DATA

Temporary component-development fixtures are acceptable.

Do not leave production/pilot workflow dependent on hard-coded frontend fake data.

Use backend DevTools.

---

# 36. QUALITY GATES

Follow:

```text
docs/QUALITY_GATES.md
```

At minimum for applicable tasks:

```text
lint
typecheck
targeted tests
acceptance criteria
```

---

# 37. P0 QUALITY

Critical P0 tasks should additionally receive appropriate:

```text
unit tests
integration tests
workflow tests
security tests
```

---

# 38. TEST FAILURE

A task with a failing required test cannot be marked DONE.

Do not remove the test merely to obtain a green build.

---

# 39. BUILD FAILURE

A required build failure means the related milestone is incomplete.

Do not report build success unless the actual command passed.

---

# 40. TEST RESULT HONESTY

Never fabricate:

```text
PASS counts
coverage
build results
deployment status
```

Record only actual command results.

---

# 41. CODE REVIEW BEFORE COMMIT

Before committing, inspect the diff.

Check:

```text
Did I violate the spec?
Did I weaken authorization?
Did I bypass workflow?
Did I bypass locking?
Did I leak sensitive data?
Did I create duplicate API contracts?
Did I accidentally modify another agent's work?
```

---

# 42. COMMIT STYLE

Use small semantic commits.

Examples:

```text
feat(auth): add jwt authentication

feat(workflow): implement doctor reading transition

feat(locks): add redis study locking

feat(dictations): add audio upload

feat(reports): implement transcription workflow

feat(hbys): add mock delivery worker

fix(auth): correct refresh cookie settings
```

---

# 43. COMMIT SIZE

Prefer one task or closely related small tasks per commit.

Avoid a single giant multi-feature commit whenever possible.

---

# 44. DO NOT DESTROY UNCOMMITTED WORK

Before destructive Git operations:

```text
git status
```

must be inspected.

Avoid:

```text
git reset --hard
git clean -fd
```

unless the consequences are fully understood and the working tree contains no valuable work from another agent.

---

# 45. AGENT BRANCHES

Recommended branches:

```text
agent/backend
agent/frontend
```

Claude works on backend branch/worktree.

Codex works on frontend branch/worktree.

---

# 46. WORKTREE SAFETY

Agents should operate in separate worktrees when running concurrently.

They should not continuously modify the same working directory.

---

# 47. CROSS-AGENT FILES

Files with elevated conflict risk:

```text
packages/shared/
AGENTS.md
docs/API_CONTRACT.md
docs/TASK_QUEUE.md
PROGRESS.md
README.md
```

Make minimal focused edits.

---

# 48. TASK QUEUE EDIT SAFETY

When updating `TASK_QUEUE.md`, normally change only:

```text
your claimed task status
your completion note
newly discovered task
```

Do not arbitrarily change another agent's task status.

---

# 49. PROGRESS FILE

Both agents maintain:

```text
PROGRESS.md
```

Suggested structure:

```text
Current Pilot Status

Backend Progress
Frontend Progress

Completed Milestones

Active Tasks

Blockers

Known Issues

Latest Quality Gate Results

Deployment Status

Resume Pointers
```

---

# 50. PROGRESS UPDATE FREQUENCY

Update progress after:

```text
2–4 meaningful tasks
major milestone
significant blocker
session end
deployment
```

---

# 51. SESSION RESUME

When resuming work, use:

```text
TASK_QUEUE.md
PROGRESS.md
git status
git log
```

to determine current state.

Do not assume previous conversational context exists.

---

# 52. RESUME POINTER

Before stopping, record when useful:

```text
Current task
Current failing test
Current branch
Next expected action
Known blocker
```

---

# 53. DISCOVERED WORK

If implementation reveals necessary new work, add:

```text
DISCOVERED-XXX
```

to the task queue.

Assign:

```text
owner
priority
status
reason
acceptance criteria
```

Do not silently grow scope.

---

# 54. P0 BEFORE POLISH

Do not prioritize:

```text
animations
advanced charts
mobile layout
AI report generation
advanced BI
```

while Doctor → Reporter → Doctor → HBYS P0 path is incomplete.

---

# 55. PILOT SCOPE

Pilot is intended for a very small healthcare testing group.

Do not overengineer initial infrastructure.

Not initially required:

```text
Kubernetes
Kafka
Service mesh
Multi-region deployment
Elasticsearch
Complex microservices
```

---

# 56. MODULAR MONOLITH

Backend architecture remains a modular NestJS monolith for the pilot.

Do not split it into independent microservices without an explicit specification change.

---

# 57. DATABASE

PostgreSQL is the authoritative persistent datastore.

Do not replace it casually.

---

# 58. REDIS

Redis is used for:

```text
Study locks
BullMQ
Ephemeral coordination
```

Do not use Redis as permanent authoritative report storage.

---

# 59. AUDIO

Audio binary belongs in object storage.

PostgreSQL stores audio metadata.

Do not store full audio blobs in the relational database.

---

# 60. DICOM

PACS remains primary image storage.

Do not copy all DICOM images into the application database/object storage by default.

Store references and metadata.

---

# 61. SECURITY

Do not commit secrets.

Never expose:

```text
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
object storage secrets
HBYS secrets
PACS credentials
refresh token hashes
password hashes
```

to frontend responses.

---

# 62. ENVIRONMENT VARIABLES

Provide placeholders in:

```text
.env.example
```

Actual credentials remain outside Git.

---

# 63. DEVTOOLS

DevTools are pilot/development-only.

They must be guarded by environment configuration and authorization.

Do not expose them as unprotected public endpoints.

---

# 64. REAL PATIENT DATA

The initial pilot must use test data.

Do not introduce real patient data into development examples, fixtures, screenshots, or test seeds.

---

# 65. ERROR HANDLING

Do not hide important failures.

Examples:

```text
audio upload failed
report save failed
HBYS failed
lock unavailable
authorization denied
PACS unavailable
```

must have explicit behavior.

---

# 66. SAFE DEGRADATION

Permitted technical fallback examples:

```text
WebSocket problem → REST polling
Orthanc blocker → TestPacsAdapter
VAD blocker → basic audio recording
real HBYS unavailable → MockHbysAdapter
```

---

# 67. UNSAFE FALLBACKS

Never degrade away:

```text
authorization
hospital scope
locking
final report version preservation
critical audit
HBYS tracking
```

---

# 68. DEPENDENCY CHANGES

Do not upgrade the entire dependency tree to solve one package problem.

Prefer targeted changes.

---

# 69. NEW DEPENDENCIES

Before adding a dependency, check:

```text
Is it necessary?
Can the current stack solve this?
Is it maintained?
Does it significantly increase complexity?
```

---

# 70. NO FULL REWRITE BY DEFAULT

When a module fails, diagnose root cause first.

Do not rewrite entire modules as the first recovery strategy.

---

# 71. CODE QUALITY

Avoid:

```text
giant controllers
giant React components
duplicated role logic
duplicated enums
business logic in UI
business logic hidden in Prisma hooks
```

---

# 72. BACKEND CONTROLLER PRINCIPLE

Controllers should be thin.

Business behavior belongs in domain/application services.

---

# 73. FRONTEND COMPONENT PRINCIPLE

Pages should compose feature components.

API logic should use centralized hooks/client utilities rather than being copied across pages.

---

# 74. SERVER STATE

Frontend server state belongs primarily in:

```text
TanStack Query
```

Do not mirror every backend entity into Zustand.

---

# 75. LOCAL UI STATE

Use React/Zustand for local concerns such as:

```text
modal state
temporary filters
audio player state
workspace UI preferences
```

---

# 76. REALTIME

Use one central authenticated socket connection per frontend app session where practical.

Do not create a socket per component.

---

# 77. RECONNECT

After WebSocket reconnect:

```text
refetch authoritative REST state
```

Do not reconstruct missed workflow state from guesses.

---

# 78. ERROR CODES

Frontend behavior should prefer:

```text
error.code
```

over parsing human-readable `message`.

---

# 79. DOUBLE SUBMIT PROTECTION

Critical mutations should protect against double-click and duplicate requests.

Examples:

```text
finalize
submit report
start reading
HBYS retry
```

Backend should also be idempotent where required.

---

# 80. DEPLOYMENT TARGET

Pilot:

```text
Frontend → Vercel
Backend/API → Railway
PostgreSQL → Railway/managed
Redis → Railway/managed
Audio → S3-compatible object storage
```

---

# 81. DEPLOYMENT QUALITY

A successful provider build is not enough.

Pilot is ready only when deployed:

```text
Doctor
↓
Reporter
↓
Doctor Final
↓
HBYS
```

works end-to-end.

---

# 82. RELEASE BLOCKERS

The following are release blockers:

```text
authentication bypass
cross-hospital data leak
locking bypass
report data loss
final report overwrite
HBYS delivery loss
audio workflow broken
critical build failure
P0 E2E failure
```

---

# 83. NO SILENT KNOWN ISSUES

Known issues must be added to `PROGRESS.md`.

Do not present an unfinished capability as completed.

---

# 84. DOCUMENTATION DRIFT

If implementation requires a legitimate specification change:

> update the relevant documentation.

Do not allow code and contract to silently diverge.

---

# 85. DOCUMENT CHANGE CAUTION

Agents must not casually rewrite core specifications while implementing.

A spec change should represent an actual clarified requirement, not a coding preference.

---

# 86. CLAUDE SESSION RULE

Claude should prioritize backend work from `TASK_QUEUE.md`.

It should continue independent backend P0 tasks even when a frontend task is unavailable.

---

# 87. CODEX SESSION RULE

Codex should prioritize frontend tasks whose backend dependencies are complete or whose contract is stable enough for preparatory implementation.

It must eventually verify against the real API.

---

# 88. EXTERNAL SYSTEMS

Never fabricate:

```text
real hospital HL7 mappings
real PACS credentials/protocols
real HBYS payloads
real addendum protocols
```

Use adapter interfaces and mark external work blocked.

---

# 89. PILOT ACCEPTANCE PATH

The most important acceptance path is:

```text
Mock First HL7
↓
Mock Second HL7
↓
Images Available
↓
Doctor start-reading
↓
Lock
↓
Dictation
↓
Complete Reading
↓
Reporter start-transcription
↓
Audio Playback
↓
Report
↓
Submit
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

Protect this path above secondary features.

---

# 90. FAILURE ACCEPTANCE PATH

The second most important path is:

```text
Mock HBYS FAIL
↓
Automatic attempts
↓
HBYS_FAILED
↓
Operation / Manager
↓
Manual Retry
↓
Mock SUCCESS
↓
HBYS_SENT
```

---

# 91. CONCURRENCY ACCEPTANCE

Required:

```text
Doctor A owns Study
→ Doctor B rejected

Reporter A owns Study
→ Reporter B rejected
```

This is mandatory pilot behavior.

---

# 92. CROSS-HOSPITAL ACCEPTANCE

A user cannot read data or realtime events from an unauthorized hospital.

This must be enforced backend-side.

---

# 93. SESSION END RULE

Before ending meaningful work:

```text
save changes
run appropriate checks
commit safe completed work
update task status
update PROGRESS
record blocker/resume pointer
```

---

# 94. AUTONOMOUS CONTINUATION

When the user is not present, agents should continue available work instead of stopping at the first unrelated blocker.

Stop only when:

```text
no safe available task exists
critical specification input is required
external access is mandatory
continuing could damage data/security
```

---

# 95. FINAL RULE

The goal is not maximum code generation.

The goal is:

> a testable, coherent, safe pilot that implements the documented healthcare workflow.

When in doubt:

```text
protect business rules
protect data integrity
protect role boundaries
protect Study locks
protect report history
prefer tested simplicity
document blockers
continue independent work
```