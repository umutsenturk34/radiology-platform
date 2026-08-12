# CODEX_FRONTEND_PROMPT.md
## Codex — Initial Frontend Autonomous Development Prompt

You are the primary frontend development agent for this repository.

Your objective is to build the frontend of the radiology imaging and reporting pilot defined by the repository documentation.

Do not begin by generating UI immediately.

First recover repository context and current project state.

---

## 1. READ THE REPOSITORY INSTRUCTIONS FIRST

Before making any change, read:

```text
AGENTS.md

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
docs/FRONTEND.md
docs/REALTIME_EVENTS.md
docs/TEST_SCENARIOS.md
docs/DEPLOYMENT_PILOT.md

PROGRESS.md
```

If `PROGRESS.md` does not yet exist, note that and continue.

Do not assume previous chat context is available.

Repository files are the working memory.

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
apps/frontend/
packages/shared/
```

Determine whether frontend code already exists or must be initialized.

Do not overwrite unrelated existing work.

---

## 3. VERIFY WORKING BRANCH

Preferred frontend branch:

```text
agent/frontend
```

Prefer a dedicated frontend worktree.

If not on the frontend branch, inspect `git status` before switching.

Do not destroy uncommitted work.

Do not intentionally develop frontend work on `agent/backend`.

---

## 4. DETERMINE THE NEXT TASK

Open:

```text
docs/TASK_QUEUE.md
```

Select the highest-priority available task where:

```text
Owner = FRONTEND
Status = TODO
Dependencies are DONE
```

or where the documented API contract is stable enough for safe preparatory frontend work.

Priority order:

```text
P0
P1
P2
P3
```

Do not work on P2/P3 while an available P0 frontend task exists.

---

## 5. CLAIM THE TASK

Before implementation:

```text
Status: TODO
```

becomes:

```text
Status: IN_PROGRESS
```

Do not claim many unrelated future tasks.

---

## 6. FRONTEND SOURCE OF TRUTH

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
docs/FRONTEND.md
↓
docs/REALTIME_EVENTS.md
↓
implementation
```

Do not invent healthcare workflow behavior.

---

## 7. PRIMARY FRONTEND STACK

Use:

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Zustand where appropriate
React Hook Form
Zod
Socket.IO client / WebSocket
```

Do not replace the agreed stack without a documented reason.

---

## 8. FRONTEND ROLE

Frontend is responsible for:

```text
rendering backend state
user interaction
forms
workspace UX
server-state queries
realtime synchronization
error states
loading states
```

Frontend is not the authoritative business workflow engine.

---

## 9. DO NOT CREATE BUSINESS STATE LOCALLY

Do not treat local client state as authoritative for:

```text
StudyStatus
assignment
locks
SLA
HBYS state
finalization
workflow transitions
permissions
```

Use the backend API response.

Correct pattern:

```text
user action
↓
backend semantic endpoint
↓
backend validates and persists
↓
response/realtime
↓
frontend updates
```

---

## 10. DO NOT INVENT API ENDPOINTS

Use:

```text
docs/API_CONTRACT.md
```

If the documented endpoint does not exist yet, you may prepare:

```text
typed hook
component
loading state
error state
```

but do not invent permanent backend routes.

An API-dependent task is not DONE until verified against the real backend.

---

## 11. USE SHARED TYPES

Prefer:

```text
packages/shared/
```

for common enums/contracts.

Do not duplicate:

```text
UserRole
PatientCategory
StudyStatus
ReportStatus
HbysDeliveryStatus
```

inside frontend source.

Do not import Prisma persistence types into frontend.

---

## 12. CORE UX PRINCIPLE

The primary operational object is the Study workspace.

Doctor and Reporter should not need to constantly navigate across disconnected modules.

Keep critical information together.

---

## 13. DOCTOR WORKSPACE

Doctor Study workspace should include, as appropriate:

```text
Patient
Study
Clinical Information
Status
SLA
Lock
PACS / Viewer
Dictation
Information Notes
Workflow Actions
```

The Doctor should be able to view images and dictate from the same Study context.

---

## 14. DOCTOR START READING

Do not simply open an editable workspace locally.

Correct flow:

```text
Doctor selects Study
↓
POST start-reading
↓
backend validates state / assignment / hospital / lock
↓
success
↓
active workspace
```

If backend returns:

```text
423 STUDY_LOCKED
```

show the lock state.

---

## 15. LOCK UX

Lock information should be visible.

Example:

```text
Okunuyor — Dr. Test Doctor
```

or:

```text
Yazılıyor — Test Reporter
```

Do not show only a generic error when lock ownership is known.

---

## 16. LOCK HEARTBEAT

When an active workspace requires heartbeat, call the documented backend heartbeat endpoint.

Do not use WebSocket connectivity as proof that the Study lock is valid.

Backend/Redis remains authoritative.

---

## 17. HEARTBEAT FAILURE

Do not silently ignore repeated heartbeat failure.

Show a clear warning if lock validity cannot be confirmed.

Final business actions remain backend-validated.

---

## 18. DICTATION

Use browser recording APIs when supported.

Minimum recording UI:

```text
permission
record
stop
duration
upload
retry
completed/error state
```

Do not mark recording complete until backend upload succeeds.

---

## 19. AUDIO FAILURE

If audio upload fails:

```text
do not show success
do not allow user to believe reading is completed
retain recoverable local state where practical
offer retry
```

---

## 20. VAD

Voice Activity Detection is secondary to the working audio path.

Do not block P0 development on VAD.

P0 remains:

```text
record
upload
playback
```

---

## 21. COMPLETE READING

Doctor completion should call the backend semantic action.

Do not set:

```text
WAITING_TRANSCRIPTION
```

locally.

Let the backend response update the UI.

---

## 22. REPORTER QUEUE

Reporter should see Studies available for transcription.

Use backend filters/queues.

Do not build a permanent fake local queue.

---

## 23. START TRANSCRIPTION

Reporter editing begins only after:

```text
POST start-transcription
```

succeeds.

If a second Reporter receives 423, show the current lock state.

---

## 24. REPORTER WORKSPACE

Reporter should see in the same Study workspace:

```text
Patient
Study
Clinical Information
Doctor Dictation
Audio Player
Report Editor
Information Notes
SLA
```

Do not require a separate audio module for the normal transcription path.

---

## 25. AUDIO PLAYER

Minimum:

```text
play
pause
seek
current time
duration
```

Use the real uploaded dictation playback URL from backend.

Do not use unrelated bundled sample audio as pilot behavior.

---

## 26. REPORT EDITOR

Pilot report editor may be plain text or controlled rich text.

Do not spend P0 time building a complex document editor.

Prioritize:

```text
reliable editing
autosave
error recovery
submission
```

---

## 27. REPORT AUTOSAVE

Use controlled/debounced autosave.

UI must distinguish:

```text
Kaydediliyor...
Kaydedildi
Kaydetme başarısız
```

Never show “Kaydedildi” after a failed API mutation.

---

## 28. REPORT DATA LOSS PROTECTION

On save failure:

```text
keep editor content in local state
show persistent error
allow retry
avoid silent navigation loss
```

Page refresh should reload the last successful backend draft.

---

## 29. SUBMIT REPORT

Reporter submission calls the documented backend action.

Success should move the Study according to backend state.

Do not manually set:

```text
WAITING_APPROVAL
```

without backend confirmation.

---

## 30. DOCTOR APPROVAL VISIBILITY

Approval waiting must be highly visible to the Doctor.

Use:

```text
approval navigation item
badge/count
approval list
realtime notification where available
```

Do not rely only on temporary toast messages.

---

## 31. APPROVAL WORKSPACE

Doctor approval workspace should include:

```text
Patient
Study
Clinical Information
PACS access
Report
Information Notes
Finalize
Return to Reporter
```

---

## 32. RETURN TO REPORTER

Require a reason in the UI if the API contract requires it.

Let backend perform the workflow transition.

Do not implement custom client-side status transitions.

---

## 33. FINALIZE

Finalization is a critical mutation.

During request:

```text
disable repeated clicks
show loading
wait for backend response
```

Do not optimistically show HBYS success.

---

## 34. HBYS PENDING VS SENT

Keep these visually distinct:

```text
HBYS_PENDING
HBYS_SENT
HBYS_FAILED
```

After final approval, initial UI should usually show:

```text
HBYS gönderimi bekleniyor
```

until the backend worker confirms success.

---

## 35. HBYS FAILURE

HBYS failure must remain persistently visible.

Do not show it only in a toast.

Operation/Manager should have a clear failure list and retry path.

Doctor may see read-only status.

---

## 36. HBYS RETRY

Retry UI belongs to authorized Operation/Manager roles according to the contract.

Frontend must not expose unauthorized retry actions as the primary control.

Backend remains authoritative even if a hidden button is bypassed.

---

## 37. SLA

Use backend deadline/state.

Frontend may display a running countdown based on:

```text
deadlineAt
```

but should periodically reconcile with the backend.

Do not invent the `YOGUN_BAKIM` SLA duration.

Do not independently calculate healthcare policy.

---

## 38. INFORMATION NOTES

Information should be visible from the Study workspace.

Display at minimum:

```text
author
role
timestamp
content
```

No normal delete action.

History should remain available after updates.

---

## 39. IMAGE MISSING

Doctor can trigger Image Missing according to the API contract.

Use a reason form where required.

Operation can resolve.

Do not fake the transition locally.

---

## 40. WONT REPORT

Only show actions to authorized roles.

Reason should be collected when required.

Reactivation remains a backend workflow action.

---

## 41. HOSPITAL DOCTOR STATE

When Study is:

```text
HOSPITAL_DOCTOR
```

central Doctor should not see an enabled normal start-reading action.

Show clear state.

Do not automatically decide conflict precedence in the UI.

---

## 42. OPERATION DASHBOARD

Prioritize operational visibility:

```text
SLA Warning
Overdue
HBYS Failed
Image Missing
Hospital Doctor
Information alerts
```

Advanced charts are secondary.

---

## 43. MANAGER DASHBOARD

Minimum useful pilot areas:

```text
counts
users
HBYS failures
audit access
DevTools
```

Do not prioritize advanced BI before the P0 clinical workflow.

---

## 44. MANAGER CLINICAL BOUNDARY

Manager UI should not imply that Manager role alone grants clinical final approval.

Role separation defined in the backend contract must remain clear.

---

## 45. DEVTOOLS

DevTools frontend calls real backend DevTools endpoints.

Correct:

```text
button
↓
backend devtools API
↓
core service
↓
database
↓
refetch
```

Incorrect:

```text
button
↓
local setStatus(...)
```

---

## 46. DEVTOOLS SAFETY

Only show DevTools in the appropriate pilot/dev environment and role.

Backend security remains mandatory.

---

## 47. REALTIME

Use:

```text
docs/REALTIME_EVENTS.md
```

as the contract.

Prefer one authenticated central socket client per app session.

Do not open a new socket for every component.

---

## 48. REALTIME IS NOT SOURCE OF TRUTH

Preferred pattern:

```text
socket event
↓
invalidate/update TanStack Query cache
↓
REST state becomes authoritative
```

On reconnect:

```text
rejoin as needed
↓
refetch active queries
```

---

## 49. POLLING FALLBACK

If WebSocket is blocked:

```text
REST polling/refetch
```

may be used as a safe pilot fallback.

Document the issue in `PROGRESS.md`.

Do not fake realtime success.

---

## 50. TANSTACK QUERY

Use TanStack Query for server state such as:

```text
studies
study detail
report
dictations
notifications
manager data
operation data
```

Do not mirror all server entities into Zustand.

---

## 51. ZUSTAND

Use Zustand/React state for client concerns such as:

```text
temporary filters
modal state
player state
UI preferences
```

Do not use Zustand as the authoritative Study workflow store.

---

## 52. QUERY KEYS

Use a consistent query-key strategy.

Example:

```text
studyKeys.all
studyKeys.list(filters)
studyKeys.detail(id)
studyKeys.report(id)
studyKeys.audit(id)
```

Avoid ad-hoc string keys scattered across the app.

---

## 53. API CLIENT

Use one centralized API client.

Handle:

```text
base URL
access token
standardized errors
refresh
credentials
```

centrally.

Do not duplicate fetch logic across pages.

---

## 54. AUTH

Implement real backend authentication.

Do not use permanent hard-coded role login.

Refresh token is HttpOnly-managed.

Do not store refresh token in localStorage.

---

## 55. LOGOUT

On logout:

```text
call backend logout
clear auth state
clear query cache
disconnect socket
navigate to login
```

---

## 56. ERROR HANDLING

Prefer backend:

```text
error.code
```

for deterministic UI behavior.

Examples:

```text
STUDY_LOCKED
HOSPITAL_ACCESS_DENIED
DICTATION_REQUIRED
HBYS_NOT_RETRYABLE
```

Do not parse arbitrary message text when a code exists.

---

## 57. ERROR STATES

Important screens must support:

```text
loading
empty
error
success
```

Do not leave blank white screens on API failure.

---

## 58. SECURITY

Never put secrets in frontend source or `NEXT_PUBLIC_*`.

Do not expose:

```text
JWT secrets
database URL
Redis URL
HBYS credentials
PACS credentials
object storage secret
```

---

## 59. PATIENT DATA LOGGING

Avoid logging full patient/report objects to browser console.

Remove debugging output before completion.

---

## 60. XSS

If report content becomes rich text, sanitize safely.

Pilot plain text is acceptable and simpler.

Do not use unsafe raw HTML rendering for report content.

---

## 61. TEST AFTER IMPLEMENTATION

After the current task:

1. Run targeted tests.
2. Fix failures.
3. Run applicable frontend checks.
4. Build when appropriate.

Inspect real package scripts first.

Typical commands may be similar to:

```bash
pnpm lint
pnpm typecheck
pnpm --filter frontend test
pnpm --filter frontend build
```

Use actual scripts from the repository.

Do not fabricate successful results.

---

## 62. QUALITY GATES

Follow:

```text
docs/QUALITY_GATES.md
```

A required failing test means the task is not DONE.

---

## 63. API DEPENDENCY BLOCK

If frontend implementation is complete but required backend endpoint is unavailable:

```text
leave the task IN_PROGRESS
```

or document the dependency appropriately.

Do not mark a real integration requirement as complete using fake local data.

---

## 64. FAILURE HANDLING

Follow:

```text
docs/FAILURE_RECOVERY.md
```

When a build or UI error occurs:

```text
reproduce
inspect error
check recent diff
check API contract
check client/server boundary
apply smallest fix
rerun targeted check
```

Do not blindly rewrite large sections.

---

## 65. NEXT.JS BROWSER API FAILURES

For browser-only APIs such as:

```text
window
navigator
MediaRecorder
```

handle Next.js server/client boundaries correctly.

Use client components/runtime guards where needed.

Do not turn the entire application into a client-only app to solve one error.

---

## 66. BLOCKED_SPEC

If UI requires a business decision not defined in the documentation:

```text
BLOCKED_SPEC
```

Do not invent policy.

Examples may include:

```text
exact ICU SLA display rule
unknown compensation formula
undefined addendum details
```

---

## 67. BLOCKED_EXTERNAL

If real external behavior is required but unavailable:

```text
BLOCKED_EXTERNAL
```

Do not fabricate PACS/HBYS/HL7 behavior in the frontend.

---

## 68. BLOCKED_TECHNICAL

If a frontend technical issue remains unresolved after reasonable safe attempts:

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
next action
```

Continue another available frontend task.

---

## 69. REVIEW THE DIFF

Before committing:

```bash
git status
git diff
```

Verify:

```text
No broad backend rewrite
No secrets
No duplicate shared enums
No fake success state
No API contract invention
No role/security assumptions
No accidental unrelated edits
```

---

## 70. COMMIT COMPLETED WORK

Use small semantic commits.

Examples:

```text
feat(frontend): add authenticated app shell

feat(studies): add doctor study list

feat(dictation): add browser audio recorder

feat(reporter): add transcription workspace

feat(approval): add doctor approval queue

feat(hbys): add delivery status ui

fix(auth): handle refresh failure
```

Use real commit hashes if recording them.

---

## 71. MARK TASK COMPLETE

Only after:

```text
implementation complete
acceptance criteria satisfied
required tests pass
typecheck/lint pass
real API verified when required
```

change:

```text
Status: IN_PROGRESS
```

to:

```text
Status: DONE
```

Otherwise leave it unfinished.

---

## 72. UPDATE PROGRESS

Update:

```text
PROGRESS.md
```

Frontend section should contain:

```text
Current frontend task
Recently completed tasks
Actual tests/build run
Backend dependencies
Current blockers
Known UI issues
Next frontend task
Resume pointer
```

---

## 73. CONTINUE AUTONOMOUSLY

After completing a task:

```text
re-open TASK_QUEUE
↓
select next highest-priority available FRONTEND task
↓
claim
↓
implement
↓
test
↓
commit
↓
update progress
```

Do not stop because one unrelated backend dependency is blocked if other frontend work is safely available.

---

## 74. DO NOT EXPAND SCOPE RANDOMLY

Do not prioritize:

```text
mobile app
advanced animation
advanced BI
AI report generation
complex design system work
advanced keyboard shortcut suite
```

while P0 workflow is incomplete.

---

## 75. PRIMARY P0 FRONTEND PATH

Prioritize:

```text
Next.js foundation
↓
API client
↓
Login/session
↓
Role navigation
↓
Study list
↓
Lock UX
↓
Doctor workspace
↓
Dictation
↓
Complete Reading
↓
Reporter queue
↓
Reporter workspace
↓
Audio player
↓
Report autosave
↓
Submit
↓
Approval queue
↓
Approval workspace
↓
Finalize
↓
HBYS status/retry UX
```

---

## 76. CRITICAL ACCEPTANCE PATH

Frontend must eventually allow the deployed user to execute:

```text
Doctor Login
↓
UNREAD Study
↓
Start Reading
↓
View Study/PACS
↓
Record Dictation
↓
Complete Reading

Reporter Login
↓
Open Queue
↓
Start Transcription
↓
Listen to Dictation
↓
Write Report
↓
Submit for Approval

Doctor Login
↓
Approval Queue
↓
Open Report
↓
Finalize

System
↓
HBYS_PENDING
↓
HBYS_SENT / HBYS_FAILED
```

---

## 77. FAILURE ACCEPTANCE PATH

Also support:

```text
HBYS_FAILED
↓
Operation/Manager sees persistent error
↓
retry
↓
HBYS_PENDING
↓
HBYS_SENT
```

---

## 78. LOCK ACCEPTANCE

Do not consider lock UX complete until actual backend behavior demonstrates:

```text
Doctor A owns Study
Doctor B sees lock rejection
```

and:

```text
Reporter A owns Study
Reporter B sees lock rejection
```

---

## 79. ROLE ACCEPTANCE

Frontend navigation and action visibility should align with roles.

But backend rejection must still be handled for unauthorized direct actions.

Do not assume hidden UI equals security.

---

## 80. DEPLOYMENT

Pilot frontend target:

```text
Vercel
```

Use:

```text
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_WS_URL
```

from environment.

Do not hardcode Railway URLs.

---

## 81. DEPLOYED TESTING

Do not consider pilot frontend ready based only on localhost.

Test on Vercel:

```text
login
refresh
microphone
audio upload
report
finalization
HBYS status
realtime or polling fallback
```

---

## 82. MICROPHONE DEPLOYMENT

Browser microphone requires secure context.

Verify on deployed HTTPS.

Do not assume local microphone success proves pilot readiness.

---

## 83. PILOT BANNER

A visible test environment warning is recommended:

```text
TEST ORTAMI — GERÇEK HASTA VERİSİ KULLANMAYIN
```

Do not use real patient data in pilot examples.

---

## 84. UI PRIORITY

Optimize for:

```text
clarity
workflow visibility
speed
error transparency
safe actions
```

before visual polish.

---

## 85. FINAL OPERATING PRINCIPLE

Do not optimize for the number of screens generated.

Optimize for:

```text
one coherent Study workflow
real backend integration
no fake success
safe lock handling
report data protection
clear role behavior
clear operational status
tested deployed usability
```

When uncertain:

```text
read the specification
do not invent backend behavior
do not invent healthcare policy
implement the smallest clear UI
verify against the real API
test it
document blockers
continue safe independent work
```