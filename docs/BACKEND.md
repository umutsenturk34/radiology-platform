# BACKEND.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Backend Uygulama Rehberi

> **Doküman Türü:** Backend Implementation Guide  
> **Ana Geliştirici:** Claude Code  
> **Backend Runtime:** Node.js  
> **Framework:** NestJS  
> **Language:** TypeScript  
> **Database:** PostgreSQL  
> **ORM:** Prisma  
> **Redis:** Locking + BullMQ + Ephemeral Coordination  
> **Queue:** BullMQ  
> **Realtime:** WebSocket / Socket.IO  
> **Pilot Hosting:** Railway  
> **Ana Backend Dizini:** `apps/backend`

---

# 1. DOKÜMANIN AMACI

Bu dosya backend kodunun nasıl organize edileceğini ve Claude'un backend geliştirirken uyması gereken kuralları tanımlar.

Claude backend geliştirmeye başlamadan önce en az şu dosyaları okumalıdır:

```text
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
```

Bu dosya iş kuralı kaynağı değildir.

İş kuralı çelişkisinde:

```text
MASTER_SPEC
→ WORKFLOW_STATE_MACHINE
→ API_CONTRACT
→ AUTH_ROLES_PERMISSIONS
→ BACKEND.md
```

önceliği geçerlidir.

---

# 2. CLAUDE'UN ÇALIŞMA ALANI

Claude'un ana çalışma alanı:

```text
apps/backend/
packages/shared/
```

olacaktır.

Claude gerekmedikçe:

```text
apps/frontend/
```

içerisinde geniş kapsamlı değişiklik yapmamalıdır.

Frontend değişikliği gerekirse bunu TASK_QUEUE / PROGRESS içine yazmalıdır.

---

# 3. BACKEND MİMARİSİ

Backend:

> Modüler Monolith

olarak uygulanacaktır.

Örnek yapı:

```text
apps/backend/src/
│
├── main.ts
├── app.module.ts
│
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── middleware/
│   ├── pipes/
│   ├── errors/
│   └── utils/
│
├── config/
│
├── prisma/
│
├── redis/
│
├── auth/
├── users/
├── hospitals/
├── patients/
├── studies/
├── clinical-data/
├── workflow/
├── locks/
├── dictations/
├── reports/
├── information/
├── sla/
├── audit/
├── notifications/
├── revisions/
├── addendums/
├── manager/
├── operation/
│
├── integrations/
│   ├── contracts/
│   ├── hl7/
│   ├── pacs/
│   ├── hbys/
│   └── external-lock/
│
├── queues/
├── realtime/
├── dev-tools/
└── health/
```

---

# 4. MODÜL PRENSİBİ

Her domain modülü:

```text
module
controller
service
repository/data access abstraction where useful
dto
tests
```

yapısına sahip olabilir.

Örnek:

```text
studies/
├── studies.module.ts
├── studies.controller.ts
├── studies.service.ts
├── studies.repository.ts
├── dto/
├── mappers/
└── tests/
```

Ancak gereksiz katman üretmekten kaçınılmalıdır.

---

# 5. CONTROLLER KURALI

Controller:

- request kabul eder,
- DTO validation alır,
- auth/guard'dan geçer,
- service çağırır,
- response döner.

Controller business logic taşımamalıdır.

Yanlış:

```ts
if (study.status === "UNREAD") {
  study.status = "READING";
}
```

controller içinde yapılmamalıdır.

---

# 6. SERVICE KURALI

Business logic service katmanında olmalıdır.

Örnek:

```text
StudyWorkflowService
StudyPermissionService
LockService
SlaService
ReportService
HbysDeliveryService
```

---

# 7. WORKFLOW SOURCE OF TRUTH

Study status yalnızca merkezi workflow servisi üzerinden değiştirilmelidir.

Tercih edilen yapı:

```ts
await workflowService.transition(...)
```

veya action-level methods:

```ts
await workflowService.startReading(...)
await workflowService.completeReading(...)
await workflowService.startTranscription(...)
await workflowService.submitReport(...)
await workflowService.finalizeReport(...)
```

---

# 8. DIRECT STATUS UPDATE YASAĞI

Aşağıdaki yaklaşım yasaktır:

```ts
await prisma.study.update({
  where: { id },
  data: { status: StudyStatus.FINAL }
});
```

Eğer bu doğrudan workflow transition ise.

Status update yalnız workflow service veya kontrollü internal method üzerinden yapılmalıdır.

---

# 9. WORKFLOW ACTION METHODS

Önerilen servis:

```ts
class StudyWorkflowService {
  startReading(...)
  completeReading(...)
  startTranscription(...)
  submitReport(...)
  startApproval(...)
  returnToReporter(...)
  finalize(...)
  markImageMissing(...)
  resolveImageMissing(...)
  markWontReport(...)
  reactivate(...)
  acquireHospitalDoctor(...)
  releaseHospitalDoctor(...)
}
```

---

# 10. WORKFLOW VALIDATION

Her action minimum:

```text
study exists
user authenticated
hospital authorized
role authorized
current state valid
assignment valid
lock valid
required data exists
```

kontrolü yapmalıdır.

---

# 11. TRANSACTION KURALI

Kritik database değişiklikleri transaction içinde yapılmalıdır.

Örnek:

```text
submit report:
ReportVersion update
Study status
StatusHistory
Audit
```

aynı transaction içinde olmalıdır.

---

# 12. FINALIZATION TRANSACTION

Finalization en kritik transactionlardan biridir.

Minimum:

```text
ReportVersion FINAL
Report FINAL
Study FINAL
finalizedAt
StatusHistory
Audit
HbysDelivery PENDING
```

tutarlı şekilde oluşturulmalıdır.

Queue enqueue database transaction dışında olabilir ancak recovery düşünülmelidir.

---

# 13. QUEUE ENQUEUE FAILURE

Database final commit oldu fakat queue enqueue başarısızsa:

> final rapor geri alınmaz.

Delivery:

```text
PENDING
```

kalır.

Recovery job veya reconciliation yeniden enqueue edebilir.

---

# 14. PRISMA KURALI

Prisma:

- schema,
- migration,
- typed query

için kullanılacaktır.

Raw SQL yalnız gerçekten gerekli olduğunda kullanılmalıdır.

---

# 15. PRISMA SERVICE

Tek bir reusable:

```text
PrismaService
```

kullanılmalıdır.

Her modül kendi PrismaClient instance'ını yaratmamalıdır.

---

# 16. DATABASE CONNECTION

Application startup'ta DB bağlantısı doğrulanmalıdır.

Health endpoint DB durumunu gösterebilmelidir.

---

# 17. MIGRATION KURALI

Schema değişikliği:

```text
DATA_MODEL.md
↓
schema.prisma
↓
migration
↓
test
↓
commit
```

sırasına uygun olmalıdır.

---

# 18. DESTRUCTIVE MIGRATION

Pilot sırasında mümkün olduğunca:

- column drop,
- table drop,
- destructive rename

yapılmamalıdır.

Additive migration tercih edilmelidir.

---

# 19. SOFT / HARD DELETE

Kritik domain kayıtları normal API yoluyla hard delete edilmemelidir.

Özellikle:

```text
Study
ReportVersion
AuditLog
InformationNoteVersion
HbysDelivery
StatusHistory
```

silinmemelidir.

---

# 20. USER DELETE

User silmek yerine:

```text
ACTIVE
INACTIVE
SUSPENDED
```

durumları tercih edilmelidir.

---

# 21. AUTH MODULE

Auth module minimum:

```text
login
refresh
logout
me
```

işlevlerine sahip olmalıdır.

---

# 22. PASSWORD HASHING

Plain password hiçbir yerde persistence edilmemelidir.

Modern password hashing kullanılır.

Tercih:

```text
argon2
```

veya uygun modern alternatif.

---

# 23. ACCESS TOKEN

Access token kısa ömürlü olmalıdır.

Pilot örnek:

```text
15 minutes
```

Config üzerinden değiştirilebilir.

---

# 24. REFRESH TOKEN

Refresh token:

- HttpOnly cookie,
- Secure,
- hashed session persistence

ile tutulmalıdır.

Plain refresh token DB'ye yazılmaz.

---

# 25. SESSION MODEL

`UserSession`:

```text
userId
refreshTokenHash
expiresAt
revokedAt
ipAddress
userAgent
```

tutabilir.

---

# 26. RBAC

Temel roller:

```text
DOCTOR
REPORTER
OPERATION
MANAGER
```

Role guard backend'de uygulanmalıdır.

Frontend visibility security değildir.

---

# 27. HOSPITAL ACCESS GUARD

Her Study resource requestinde:

```text
study.hospitalId
∈
user.authorizedHospitals
```

kontrolü yapılmalıdır.

---

# 28. STUDY PERMISSION SERVICE

Kompleks yetkiler merkezi serviste olabilir:

```ts
canViewStudy(...)
canStartReading(...)
canStartTranscription(...)
canFinalize(...)
canRetryHbys(...)
canForceUnlock(...)
```

---

# 29. MANAGER CLINICAL FINAL RESTRICTION

MANAGER tüm sistem yönetim yetkilerine sahip olsa da:

> DOCTOR değilse tıbbi final veremez.

Bu backend'de açıkça enforce edilmelidir.

---

# 30. STUDY MODULE

Study module sorumlulukları:

- list/query,
- detail,
- search,
- filtering,
- assignments,
- status read model.

Transition logic workflow module'dedir.

---

# 31. STUDY QUERY PERFORMANCE

Sık query:

```text
authorized hospitals
+
status
+
category
+
arrivalAt
```

üzerinden çalışır.

Pagination zorunludur.

---

# 32. SEARCH

Pilot search minimum:

```text
accessionNumber
patient display name
externalPatientId
studyDescription
```

alanlarında çalışabilir.

---

# 33. STUDY DETAIL DTO

Study detail response:

- patient,
- hospital,
- study,
- clinical data,
- pacs info,
- assignment,
- lock,
- sla,
- flags

gibi normalized DTO döndürmelidir.

Prisma entity doğrudan response olarak verilmemelidir.

---

# 34. LOCK SERVICE

Redis üzerinde:

```text
lock:study:{studyId}
```

key kullanılabilir.

---

# 35. LOCK VALUE

Minimum:

```json
{
  "userId": "...",
  "role": "DOCTOR",
  "sessionId": "...",
  "lockedAt": "..."
}
```

---

# 36. LOCK ACQUIRE

Atomic acquire kullanılmalıdır.

Örnek mantık:

```text
SET key value NX EX ttl
```

veya eşdeğer güvenli primitive.

---

# 37. LOCK TTL

Pilot default:

```text
60 seconds
```

Heartbeat:

```text
20 seconds
```

Config üzerinden değiştirilebilir.

---

# 38. LOCK OWNER

Heartbeat ve normal release:

> yalnız lock owner

tarafından yapılabilir.

---

# 39. LOCK FORCE RELEASE

Force release:

```text
OPERATION
MANAGER
```

tarafından yapılabilir.

Reason zorunlu.

Audit zorunlu.

---

# 40. LOCK FAIL CLOSED

Redis unavailable ise:

> Study edit/reading/transcription başlatılmamalıdır.

Sistem unlocked varsaymamalıdır.

---

# 41. EXTERNAL LOCK

Hastane doktoru lock'u Redis browser lock'undan farklıdır.

Persistence:

```text
ExternalStudyLock
```

ile yapılabilir.

---

# 42. EXTERNAL LOCK CONFLICT

Internal Doctor lock varken external lock event gelirse:

- mevcut çalışmayı silme,
- conflict oluştur,
- audit,
- Operation notification.

---

# 43. DICTATION MODULE

Dictation backend:

- metadata,
- upload,
- playback authorization,
- storage integration

yönetir.

---

# 44. AUDIO DATABASE STORAGE YASAĞI

Audio binary PostgreSQL içine yazılmaz.

Database sadece metadata tutar.

---

# 45. OBJECT STORAGE INTERFACE

Öneri:

```ts
interface ObjectStorageAdapter {
  upload(...)
  getSignedReadUrl(...)
}
```

Pilot implementation remote S3-compatible storage olmalıdır.

---

# 46. AUDIO UPLOAD

Pilot basitlik için:

```text
multipart/form-data
```

backend upload desteklenebilir.

---

# 47. AUDIO SECURITY

Upload minimum:

- authenticated,
- ownership,
- mime validation,
- max size

kontrollerinden geçmelidir.

---

# 48. DICTATION COMPLETE RULE

Study reading complete olabilmek için:

```text
DictationStatus.COMPLETED
```

olan bir dictation gereklidir.

---

# 49. REPORT MODULE

Report module:

```text
Report
ReportVersion
```

üzerinden çalışacaktır.

---

# 50. REPORT VERSIONING

Final edilmiş version immutable kabul edilmelidir.

Revision:

> yeni ReportVersion

oluşturur.

---

# 51. REPORT CURRENT VERSION

`Report.currentVersionId` aktif version pointer olarak kullanılabilir.

Ancak eski versionlar korunur.

---

# 52. REPORT DRAFT

Reporter aktif lock sahibi ise draft save yapabilir.

Başka Reporter aynı draft'ı değiştiremez.

---

# 53. REPORT AUTOSAVE BACKEND

Backend autosave endpointi:

- hızlı,
- idempotent,
- ownership kontrollü

olmalıdır.

---

# 54. REPORT SUBMIT

Submit:

```text
TRANSCRIBING
→ WAITING_APPROVAL
```

transition'ını workflow üzerinden yapar.

Reporter lock bırakılır.

---

# 55. APPROVAL

Doctor ilgili Study için approval lock alabilir.

Study status:

```text
WAITING_APPROVAL
```

olarak kalabilir.

---

# 56. RETURN TO REPORTER

Reason zorunlu.

Transition:

```text
WAITING_APPROVAL
→ WAITING_TRANSCRIPTION
```

Audit ve notification üretir.

---

# 57. FINALIZE

Finalize action:

- assigned Doctor,
- correct state,
- valid report,
- lock owner if applicable

kontrolü yapar.

---

# 58. FINALIZE RESPONSE

HBYS'nin tamamlanmasını beklememelidir.

Response:

```text
HBYS_PENDING
```

durumunu dönebilir.

---

# 59. HBYS MODULE

HBYS domain iki parçaya ayrılmalıdır:

```text
delivery orchestration
adapter
```

---

# 60. HBYS ADAPTER

Core HbysService hospital-specific HTTP/SOAP formatı bilmemelidir.

Adapter normalized payload alır.

---

# 61. MOCK HBYS

Pilot modları:

```text
SUCCESS
FAIL
TIMEOUT
```

deterministic test edilebilir olmalıdır.

---

# 62. BULLMQ

Queue:

```text
hbys-delivery
```

minimum zorunlu queue'dur.

---

# 63. WORKER

Worker:

- delivery fetch,
- status PROCESSING,
- attempt create,
- adapter call,
- success/failure,
- retry,
- audit,
- realtime

yönetir.

---

# 64. RETRY

Retry policy config üzerinden tutulmalıdır.

Pilot örnek:

```text
30 sec
2 min
5 min
```

---

# 65. MANUAL RETRY

Operation/Manager retry action:

> mevcut final version'u yeniden queue'ya alır.

Report text'i değiştirmez.

---

# 66. HBYS IDEMPOTENCY

Delivery için unique/deterministic key kullanılmalıdır.

Öneri:

```text
hospitalId:studyId:reportVersionId
```

---

# 67. DUPLICATE FINALIZE

Aynı finalize request iki kez gelirse duplicate final version ve duplicate delivery oluşmamalıdır.

Bu test edilmelidir.

---

# 68. SLA MODULE

SLA backend tarafında hesaplanmalıdır.

Frontend yalnız response'u gösterir.

---

# 69. SLA DEFAULTS

Bilinen değerler:

```text
ACIL = 120 dakika
YATAN = 720 dakika
NORMAL = 1440 dakika
warning = 20 dakika
```

`YOGUN_BAKIM` için kesin değer uydurulmaz.

---

# 70. SLA SNAPSHOT

Study SLA başladığında:

```text
arrivalAt
slaDeadlineAt
```

snapshot tutulmalıdır.

Policy değişikliği geçmiş Study deadline'ını geriye dönük değiştirmemelidir.

---

# 71. SLA TEST MODE

Pilot için accelerated test mode desteklenebilir.

Production policy ile karıştırılmamalıdır.

---

# 72. AUDIT MODULE

Central:

```text
AuditService
```

kullanılması önerilir.

---

# 73. AUDIT EVENT

Minimum alanlar:

```text
eventType
actorUserId
actorRole
hospitalId
studyId
metadata
timestamp
```

---

# 74. AUDIT FAILURE

Kritik audit write failure göz ardı edilmemelidir.

Mümkünse transaction içinde business mutation ile birlikte yazılmalıdır.

---

# 75. INFORMATION MODULE

Information note:

- create,
- update,
- history

destekler.

DELETE yoktur.

---

# 76. NOTIFICATION MODULE

Notification persistence minimum:

```text
userId
type
studyId
message
readAt
createdAt
```

olabilir.

---

# 77. REALTIME MODULE

WebSocket gateway core eventleri yayınlar.

WebSocket business source of truth değildir.

---

# 78. REALTIME EVENT YAYINI

Örnek:

```text
study.status.changed
study.locked
study.unlocked
study.waiting_approval
study.hbys.sent
study.hbys.failed
sla.warning
information.added
```

---

# 79. EVENT PAYLOAD

Payload küçük ve normalized olmalıdır.

Full patient/report payload realtime event içinde taşınmamalıdır.

---

# 80. INTEGRATIONS DIRECTORY

Önerilen:

```text
integrations/
├── contracts/
├── hl7/
├── pacs/
├── hbys/
└── external-lock/
```

---

# 81. HL7 CORE CONTRACT

HL7 adapter output:

> normalized internal DTO

olmalıdır.

Raw vendor segment logic adapter dışına çıkmamalıdır.

---

# 82. HL7 MATCHING

Ana key:

```text
hospitalId + accessionNumber
```

olacaktır.

Patient mismatch varsa sessiz merge yapılmaz.

---

# 83. HL7 DUPLICATE

First HL7 duplicate:

- ikinci Study yaratmaz,
- state resetlemez.

Second HL7 duplicate:

- idempotent olmalıdır.

---

# 84. PACS MODULE

Core PACS service:

- viewer access,
- study lookup,
- series metadata,
- availability

sağlar.

---

# 85. PACS IMAGE STORAGE

DICOM image binary app DB/object storage'a normal flow'da kopyalanmaz.

PACS source of truth'tur.

---

# 86. TEST PACS

Pilot mümkünse Orthanc.

Orthanc kurulumu blocker olursa adapter abstraction korunarak test adapter ile P0 devam edebilir.

---

# 87. DEVTOOLS MODULE

DevTools yalnız:

```text
DEV_TOOLS_ENABLED=true
```

ise register edilmelidir.

Tercihen route disabled olduğunda 404/forbidden.

---

# 88. DEVTOOLS AUTH

Pilot default:

```text
MANAGER
```

rolü.

Operation'a sınırlı alt araçlar ayrıca açılabilir.

---

# 89. DEVTOOLS ACTIONS

Minimum:

```text
First HL7
Second HL7
Images Available
Mock HBYS Mode
Accelerated SLA
External Lock
External Unlock
```

---

# 90. DEVTOOLS CORE BYPASS YASAĞI

DevTools:

> doğrudan Prisma ile Study status update

etmemelidir.

Gerçek service/workflow çağırmalıdır.

---

# 91. HEALTH MODULE

Endpoint:

```text
GET /api/v1/health
```

Minimum:

```text
app
database
redis
```

durumu.

---

# 92. ERROR MODEL

Backend business errorlar için merkezi error class/factory kullanılabilir.

Örnek:

```text
STUDY_LOCKED
INVALID_STATE_TRANSITION
HOSPITAL_ACCESS_DENIED
DICTATION_REQUIRED
HBYS_NOT_RETRYABLE
```

---

# 93. EXCEPTION FILTER

Global exception filter:

- expected business errors,
- validation,
- unknown exceptions

formatını API contract'a çevirir.

---

# 94. STACK TRACE

Production/pilot response'da raw stack trace gönderilmemelidir.

Logda olabilir.

---

# 95. REQUEST ID

Her HTTP request:

```text
X-Request-Id
```

ile ilişkilendirilebilir.

Yoksa backend üretir.

---

# 96. STRUCTURED LOGGING

Log formatı machine-readable olmalıdır.

Örnek:

```json
{
  "level": "info",
  "event": "DOCTOR_READING_STARTED",
  "studyId": "...",
  "hospitalId": "...",
  "requestId": "..."
}
```

---

# 97. LOG DATA MINIMIZATION

Loglara full:

- patient name,
- report,
- clinical note,
- audio

yazılmamalıdır.

---

# 98. DTO VALIDATION

Tüm public mutating endpointler DTO validation kullanmalıdır.

Örnek:

```text
email
UUID
enum
reason min length
content size
```

---

# 99. REQUEST BODY LIMIT

Audio dışındaki JSON requestler için makul body limit uygulanmalıdır.

Audio endpoint ayrıca size limit taşır.

---

# 100. API VERSIONING

Pilot:

```text
/api/v1
```

prefix.

Controller'lar contract dışı alternatif endpointler üretmemelidir.

---

# 101. SWAGGER

Development/pilot için Swagger/OpenAPI eklenebilir.

Örnek:

```text
/api/docs
```

Contract ile uyumlu olmalıdır.

---

# 102. SHARED TYPES

Backend aşağıdaki enum/type'ları:

```text
packages/shared
```

üzerinden kullanmalıdır.

Ayrı duplicate enum tanımlamamalıdır.

---

# 103. SHARED PACKAGE CHANGE

Claude shared type değiştirirse:

- API contract kontrolü,
- frontend etkisi,
- tests

değerlendirilmelidir.

---

# 104. UNIT TESTLER

Özellikle:

```text
workflow
permission
lock
SLA
report versioning
HL7 matching
HBYS retry
```

yüksek önceliklidir.

---

# 105. INTEGRATION TESTLER

Gerçek database/Redis test environment üzerinde:

```text
auth
study transition
lock concurrency
HL7
HBYS
```

test edilmelidir.

---

# 106. E2E BACKEND TEST

Minimum API happy path:

```text
login doctor
first HL7
second HL7
images
start reading
dictation
complete
login reporter
start transcription
draft
submit
doctor finalize
HBYS success
```

---

# 107. TEST DATABASE

Tests production/pilot DB'ye bağlanmamalıdır.

Ayrı test database veya isolated container kullanılmalıdır.

---

# 108. MOCK TESTS

MockHbysAdapter tests deterministic olmalıdır.

`Math.random()` ile success/fail üretmemelidir.

---

# 109. TIME TESTS

SLA testlerinde gerçek saat beklemek yerine injectable clock/time abstraction değerlendirilebilir.

Örnek:

```text
ClockService
```

Bu testleri daha deterministik yapar.

---

# 110. ID GENERATION

Internal ID:

> UUID

olmalıdır.

External ID'ler ayrı alanlarda tutulur.

---

# 111. DATE HANDLING

Backend internal timestamp:

> UTC

olarak tutulur.

API ISO 8601 döner.

---

# 112. TIMEZONE

Hospital timezone config metadata olarak tutulabilir.

Business timestamp storage UTC olmalıdır.

---

# 113. CONFIG MODULE

Environment variables typed/validated şekilde okunmalıdır.

App eksik kritik env ile sessiz başlamamalıdır.

---

# 114. REQUIRED ENV

Pilot backend minimum:

```text
NODE_ENV
PORT
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_REFRESH_SECRET
FRONTEND_URL
DEV_TOOLS_ENABLED
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
OBJECT_STORAGE_BUCKET
```

---

# 115. .ENV.EXAMPLE

Repo:

```text
apps/backend/.env.example
```

veya root `.env.example`

içerebilir.

Secret değer içermez.

---

# 116. ENV VALIDATION

Startup'ta required env validation yapılmalıdır.

Yanlış env:

> erken ve anlaşılır fail

etmelidir.

---

# 117. CORS

Allowed origin:

> configured frontend URL.

Local development için localhost eklenebilir.

Wildcard authenticated pilotta kullanılmamalıdır.

---

# 118. COOKIE

Cross-origin refresh cookie:

```text
HttpOnly
Secure
SameSite=None
```

pilot HTTPS ortamında desteklenmelidir.

---

# 119. RATE LIMIT

Auth ve public/external endpointler özellikle rate limit almalıdır.

Pilot için makul default yeterlidir.

---

# 120. SECURITY HEADERS

Helmet veya NestJS/Fastify uyumlu çözüm kullanılabilir.

---

# 121. DEPENDENCY KURALI

Yeni dependency eklenmeden önce:

- gerekli mi,
- mevcut stack çözebilir mi,
- maintained mı

kontrol edilir.

---

# 122. BACKEND YAPMAMASI GEREKENLER

Claude aşağıdakileri yapmamalıdır:

```text
business rule uydurmak
workflow state uydurmak
UI convenience için API contract bozmak
hard-coded hospital logic
frontend içine backend logic taşımak
security bypass
auth kapatmak
lock bypass
final report overwrite
audit silmek
mock'u production fallback yapmak
```

---

# 123. BLOCKED_SPEC ÖRNEKLERİ

Aşağıdaki konular net değilse Claude kendisi karar vermez:

```text
YOGUN_BAKIM exact SLA
exact compensation formula
exact addendum HBYS protocol
production anonymization rules
```

---

# 124. BLOCKED_EXTERNAL ÖRNEKLERİ

```text
real HL7 sample missing
real PACS access missing
real HBYS docs missing
VPN missing
```

---

# 125. FALLBACK KURALI

Pilot için:

```text
Real HL7 blocked → Mock HL7
Real HBYS blocked → Mock HBYS
Real PACS blocked → Test PACS Adapter
```

core workflow devam eder.

---

# 126. P0 ÖNCELİĞİ

Claude önce TASK_QUEUE'daki en yüksek öncelikli bağımsız backend task'ı seçer.

P0 bitmeden P2 feature geliştirmemelidir.

---

# 127. TASK CLAIM

Göreve başlarken:

```text
Status: TODO
→
Status: IN_PROGRESS
```

yapılır.

---

# 128. TASK DONE

Task ancak:

```text
implementation
tests
lint
typecheck
acceptance
```

başarılıysa DONE yapılır.

---

# 129. COMMIT

Küçük semantic commitler.

Örnek:

```text
feat(studies): implement workflow service

feat(locks): add redis study locking

feat(dictations): add audio upload api

feat(hbys): implement mock delivery worker
```

---

# 130. PROGRESS

Claude düzenli olarak:

```text
PROGRESS.md
```

içindeki Backend Progress bölümünü güncellemelidir.

---

# 131. PROGRESS MINIMUM

```text
Completed tasks
Current task
Blocked tasks
Latest tests
Known backend issues
Next backend task
```

---

# 132. TEST FAIL

Test fail ise DONE yapılmaz.

Failure Recovery dokümanı uygulanır.

---

# 133. AGENT SESSION START

Her yeni Claude session'ında:

```text
1. Read MASTER_SPEC
2. Read TASK_QUEUE
3. Read PROGRESS
4. git status
5. git log recent
6. identify highest priority available backend task
```

---

# 134. AGENT SESSION END

Session bitmeden mümkünse:

```text
task status
progress
test results
resume pointer
```

güncellenmelidir.

---

# 135. BACKEND P0 TAMAMLANMA KRİTERİ

Backend P0 tamam sayılması için:

```text
Auth
RBAC
Hospital scope
Patient/Study
HL7 first
HL7 second
Images available
Workflow
Redis locks
Dictation
Reporter workflow
Report
Approval
Final
BullMQ
Mock HBYS
HBYS success
HBYS fail
Manual retry
Core tests
```

çalışmalıdır.

---

# 136. BACKEND PILOT READY

Backend pilot ready demek:

> endpointlerin yalnız var olması değildir.

Aşağıdaki zincir gerçek DB/Redis/queue üzerinde çalışmalıdır:

```text
Mock HL7
↓
Study
↓
Doctor
↓
Lock
↓
Dictation
↓
Reporter
↓
Report
↓
Doctor Final
↓
HBYS Queue
↓
Mock HBYS
↓
HBYS_SENT
```

---

# 137. RAILWAY PREPARATION

Backend production build komutu net olmalıdır.

Örnek:

```text
pnpm --filter backend build
pnpm --filter backend start:prod
```

---

# 138. WORKER MODE

Pilot ilk sürümde API ve BullMQ worker aynı process içinde çalışabilir.

Daha sonra:

```text
api
worker
```

ayrılabilir.

Kod buna engel olmamalıdır.

---

# 139. STARTUP ORDER

Backend startup:

```text
env validate
↓
Prisma init
↓
Redis init
↓
Nest app
↓
queue/worker init
↓
listen
```

mantığında güvenli olmalıdır.

---

# 140. GRACEFUL SHUTDOWN

Application:

- Prisma disconnect,
- Redis disconnect,
- queue close

işlemlerini graceful shutdown'da yapabilmelidir.

---

# 141. HEALTH BEFORE READY

Mümkünse health endpoint service ready olmadan false positive vermemelidir.

---

# 142. SEED KURALI

Seed production boot sırasında otomatik sürekli çalışmamalıdır.

Explicit command:

```text
pnpm seed
```

gibi olmalıdır.

---

# 143. TEST USERS

Pilot seed kullanıcıları yalnız test/pilot environment içindir.

Gerçek production kullanıcı oluşturma yöntemi daha sonra değişebilir.

---

# 144. DEVTOOLS VE SEED AYRIMI

Seed:

> başlangıç verisi.

DevTools:

> workflow simulation.

Aynı şey değildir.

---

# 145. NO BUSINESS LOGIC IN PRISMA HOOKS

Kritik workflow kuralları Prisma middleware/hook içine gizlenmemelidir.

WorkflowService açık source of truth olmalıdır.

---

# 146. NO BUSINESS LOGIC IN QUEUE WORKER

HBYS worker Study workflow'u kendi kafasına göre değiştirmemelidir.

Success/failure actionları domain service üzerinden yapılmalıdır.

---

# 147. DOMAIN EVENT KULLANIMI

İç event emitter kullanılabilir.

Örnek:

```text
REPORT_FINALIZED
HBYS_DELIVERY_FAILED
```

Ancak event-driven complexity pilotu gereksiz zorlaştırmamalıdır.

---

# 148. OUTBOX

Transactional outbox ilk pilot için zorunlu değildir.

Queue event loss problemi gerçek risk oluşturursa eklenebilir.

---

# 149. N+1 KONTROLÜ

Study listesinde her satır için ayrı ayrı:

```text
patient query
hospital query
assignment query
```

çalıştırılmamalıdır.

Prisma select/include kontrollü kullanılmalıdır.

---

# 150. RESPONSE MAPPING

Prisma models:

> internal persistence.

DTO:

> external API contract.

Mapper layer gerektiği yerlerde kullanılabilir.

---

# 151. NULLABILITY

Workflow gereği henüz oluşmamış alanlar nullable olmalıdır.

Business validation service tarafından yapılır.

---

# 152. JSONB

External değişken metadata için uygundur.

Ana business alanları JSONB içine gömülmemelidir.

---

# 153. REPORT CONTENT

Pilot plain text veya kontrollü rich text olabilir.

HTML kabul ediliyorsa sanitize edilmelidir.

---

# 154. FILE SIZE

Audio max size config ile belirlenmelidir.

Aşırı büyük file request reddedilmelidir.

---

# 155. SIGNED URL

Playback signed URL kısa ömürlü olmalıdır.

Public permanent bucket URL kullanılmamalıdır.

---

# 156. CROSS-HOSPITAL STORAGE

Audio storage key hospital/study scope içerebilir.

Örnek:

```text
dictations/{hospitalId}/{studyId}/{dictationId}.webm
```

---

# 157. IDEMPOTENCY

Kritik actionlar mümkün olduğunca idempotent:

```text
HL7
finalize
HBYS delivery
revision
```

olmalıdır.

---

# 158. ACTION ENDPOINTS

Backend mümkün olduğunca semantic action endpoint kullanır.

Örnek:

```text
/start-reading
/complete-reading
/start-transcription
/submit-report
/finalize
```

Generic arbitrary status PATCH kullanılmamalıdır.

---

# 159. ADMIN OVERRIDE

Force/dev override normal workflow endpointlerinden ayrı olmalıdır.

Audit zorunludur.

---

# 160. TEST COVERAGE ÖNCELİĞİ

Yüzde coverage hedefinden daha önemli olan:

> kritik domain path coverage

dır.

Özellikle:

- lock,
- auth,
- workflow,
- finalization,
- HBYS

test edilmelidir.

---

# 161. BACKEND RELEASE BLOCKERS

Aşağıdakiler varsa backend pilot ready değildir:

```text
auth bypass
cross-hospital leak
lock bypass
final overwrite
HBYS delivery lost
migration fail
build fail
critical tests fail
```

---

# 162. SOURCE OF TRUTH

Backend davranışı çelişkiliyse:

```text
MASTER_SPEC.md
↓
WORKFLOW_STATE_MACHINE.md
↓
AUTH_ROLES_PERMISSIONS.md
↓
API_CONTRACT.md
↓
DATA_MODEL.md
↓
BACKEND.md
↓
implementation
```

önceliği geçerlidir.

---

# 163. SON KURAL

Claude'un backend geliştirmedeki ana amacı:

> en fazla kod yazmak

değildir.

Amaç:

> sağlık ekibinin doğruladığı iş akışını güvenli, test edilmiş ve frontend tarafından kullanılabilir backend servislerine dönüştürmektir.

Claude:

- workflow'u bypass etmez,
- kullanıcı yetkisini frontend'e bırakmaz,
- lock'u opsiyonel görmez,
- final raporu overwrite etmez,
- HBYS hatasını gizlemez,
- gerçek hastane protokolünü uydurmaz,
- test geçmeden görevi tamamlamaz.