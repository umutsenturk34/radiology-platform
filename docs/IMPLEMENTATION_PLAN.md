# IMPLEMENTATION_PLAN.md
## Radyoloji Görüntüleme ve Raporlama Platformu — 5 Günlük Pilot Geliştirme Planı

> **Doküman Türü:** Uygulama / Geliştirme Planı  
> **Üst Referanslar:**  
> `MASTER_SPEC.md`  
> `ARCHITECTURE.md`  
> `WORKFLOW_STATE_MACHINE.md`  
> `DATA_MODEL.md`  
> `API_CONTRACT.md`  
> `AUTH_ROLES_PERMISSIONS.md`  
> `INTEGRATIONS.md`
>
> **Pilot Hedef:** Sağlık ekibinin 2–3 kullanıcı ile sistemi uçtan uca test edebilmesi  
> **Backend Agent:** Claude Code  
> **Frontend Agent:** Codex  
> **Backend:** Node.js + NestJS + TypeScript  
> **Frontend:** Next.js + React + TypeScript  
> **Pilot Hosting:** Railway + Vercel  
> **Geliştirme Modeli:** Paralel AI Agent Development  
> **Tahmini Süre:** 5 yoğun geliştirme günü

---

# 1. DOKÜMANIN AMACI

Bu doküman projenin ilk çalışan pilotunun hangi sırayla geliştirileceğini tanımlar.

Amaç:

- Claude ve Codex'in rastgele özellik geliştirmesini önlemek,
- backend ve frontend bağımlılıklarını doğru sıraya koymak,
- ilk 5 günlük çalışmayı küçük fazlara bölmek,
- her gün sonunda çalışan bir ara ürün bırakmak,
- ajanların kullanıcı bilgisayar başında değilken ilerlemeye devam edebilmesini kolaylaştırmak,
- pilot için kritik olmayan işlerin ana workflow'u geciktirmesini önlemek

şeklindedir.

---

# 2. 5 GÜNLÜK HEDEFİN TANIMI

Beşinci günün sonunda hedef:

> Sistemin tüm enterprise özelliklerinin tamamlanması değildir.

Başarı hedefi:

> Sağlık ekibinin internet üzerinden farklı rollerle login olarak ana radyoloji raporlama akışını baştan sona test edebilmesidir.

Minimum başarılı uçtan uca akış:

```text
Mock First HL7
↓
Mock Second HL7
↓
Accession Match
↓
Images Available
↓
UNREAD
↓
Doctor Reading + Lock
↓
Audio Dictation
↓
WAITING_TRANSCRIPTION
↓
Reporter Lock + Audio Playback
↓
Report Writing
↓
WAITING_APPROVAL
↓
Doctor Final
↓
HBYS_PENDING
↓
Mock HBYS
↓
HBYS_SENT
```

Ayrıca minimum hata testi:

```text
Mock HBYS FAIL
↓
HBYS_FAILED
↓
Operation / Manager
↓
Manual Retry
↓
HBYS_SENT
```

---

# 3. GELİŞTİRME PRENSİBİ

Projede:

> önce infrastructure ve core workflow,

sonra:

> ekranlar ve görsel detaylar

geliştirilecektir.

Güzel görünen ancak gerçek backend workflow'una bağlı olmayan ekranlar tamamlanmış özellik kabul edilmez.

---

# 4. BACKEND / FRONTEND PARALEL ÇALIŞMA

Claude ve Codex paralel çalışacaktır.

Temel sorumluluk:

```text
Claude
↓
Backend
Database
Workflow
API
Integration
Queue
Redis
Tests
```

```text
Codex
↓
Frontend
Role UI
Study Pools
Doctor Workspace
Reporter Workspace
Manager UI
Realtime Client
E2E UI
```

---

# 5. ORTAK SÖZLEŞMELER

İki ajan şu dosyaları ortak kaynak kabul eder:

```text
MASTER_SPEC.md
WORKFLOW_STATE_MACHINE.md
API_CONTRACT.md
AUTH_ROLES_PERMISSIONS.md
```

Bu dosyalarla çelişen kod yazılmamalıdır.

---

# 6. BRANCH / WORKTREE MODELİ

Önerilen yapı:

```text
main
│
├── agent/backend
│
└── agent/frontend
```

Claude:

```text
agent/backend
```

Codex:

```text
agent/frontend
```

üzerinde çalışır.

Aynı working directory üzerinde iki ajan eşzamanlı yazmamalıdır.

---

# 7. GÜN 0 — HAZIRLIK

Bu faz otonom geliştirme başlamadan önce tamamlanmalıdır.

Zorunlu:

```text
✓ Git repo hazır
✓ docs hazır
✓ Node.js kurulu
✓ pnpm kurulu
✓ Git kurulu
✓ Docker kurulu
✓ Claude Code kurulu
✓ Codex CLI kurulu
```

Henüz production secret kullanılmaz.

---

# 8. GÜN 1 — FOUNDATION

Ana hedef:

> Projenin teknik iskeletinin ayağa kalkması.

---

# 9. GÜN 1 — REPO / MONOREPO

İlk görevler:

```text
Initialize pnpm workspace
Create root package.json
Create pnpm-workspace.yaml
Create shared package
Create frontend app
Create backend app
Configure TypeScript
Configure linting
Configure formatting
```

Beklenen yapı:

```text
apps/
├── frontend
└── backend

packages/
└── shared
```

---

# 10. GÜN 1 — BACKEND FOUNDATION

Claude:

```text
NestJS application
Prisma
PostgreSQL
Redis connection
Health endpoint
Global validation
Global exception handler
API response format
Request correlation ID
```

oluşturur.

Minimum:

```text
GET /api/v1/health
```

çalışmalıdır.

---

# 11. GÜN 1 — DATABASE

İlk Prisma modelleri:

```text
User
UserSession
Hospital
UserHospitalAccess
Patient
Study
StudyStatusHistory
StudyAssignment
AuditLog
SlaPolicy
```

oluşturulur.

Migration çalışmalıdır.

---

# 12. GÜN 1 — AUTH

Claude:

```text
Login
Refresh
Logout
Me
JWT
Refresh session
Password hashing
RBAC
Hospital authorization
```

oluşturur.

Pilot seed:

```text
doctor@test.local
reporter@test.local
operation@test.local
manager@test.local
```

---

# 13. GÜN 1 — FRONTEND FOUNDATION

Codex:

```text
Next.js application
Tailwind
shadcn/ui
TanStack Query
Auth client
App shell
Login page
Role-based navigation
Error handling
```

oluşturur.

---

# 14. GÜN 1 — LOGIN ENTEGRASYONU

Frontend gerçek backend:

```text
POST /auth/login
GET /auth/me
POST /auth/refresh
POST /auth/logout
```

endpointlerini kullanmalıdır.

Hard-coded kullanıcı login'i kullanılmamalıdır.

---

# 15. GÜN 1 — STUDY BASIC API

Claude:

```text
GET /studies
GET /studies/:id
```

endpointlerini oluşturur.

Role/hospital scope çalışmalıdır.

---

# 16. GÜN 1 — MOCK FIRST HL7

Claude:

```text
MockHl7Adapter
POST /dev-tools/hl7/first
```

oluşturur.

Sonuç:

```text
Patient
+
Study
+
WAITING_ACCEPTANCE
```

olmalıdır.

---

# 17. GÜN 1 ÇIKIŞ KRİTERİ

Gün 1 tamamlanmış sayılması için:

```text
[ ] Backend starts
[ ] Frontend starts
[ ] PostgreSQL connected
[ ] Redis connected
[ ] Migration works
[ ] Seed works
[ ] Doctor login works
[ ] Reporter login works
[ ] Operation login works
[ ] Manager login works
[ ] Hospital authorization works
[ ] First Mock HL7 creates Study
[ ] Study list API works
[ ] Tests pass
```

---

# 18. GÜN 2 — DOCTOR WORKFLOW

Ana hedef:

> Study'nin doctor tarafından gerçekten okunabilmesi.

---

# 19. GÜN 2 — SECOND HL7

Claude:

```text
POST /dev-tools/hl7/second
```

oluşturur.

Core matching:

```text
hospitalId + accessionNumber
```

ile yapılır.

Transition:

```text
WAITING_ACCEPTANCE
→ IMAGES_PENDING
```

---

# 20. GÜN 2 — IMAGES AVAILABLE

Claude:

```text
POST /dev-tools/studies/:id/images-available
```

oluşturur.

Transition:

```text
IMAGES_PENDING
→ UNREAD
```

---

# 21. GÜN 2 — DOCTOR POOL

Codex Doctor ekranını oluşturur.

Minimum kolonlar:

```text
Hasta
Tetkik
Hastane
Kategori
Geliş
Kalan
Durum
Lock
```

Doctor yalnız authorized Study'leri görür.

---

# 22. GÜN 2 — LOCK SYSTEM

Claude:

```text
Redis lock
Atomic acquire
Heartbeat
TTL
Release
Force release
```

oluşturur.

Minimum endpoints:

```text
start-reading
lock/heartbeat
lock/release
lock/force-release
```

---

# 23. GÜN 2 — LOCK CONCURRENCY TEST

Zorunlu test:

```text
Doctor A
↓
start-reading SUCCESS

Doctor B
↓
start-reading

Expected:
423 STUDY_LOCKED
```

Bu test geçmeden Doctor workflow tamamlanmış kabul edilmez.

---

# 24. GÜN 2 — DOCTOR DETAIL SCREEN

Codex aynı Study ekranında:

```text
Patient data
Clinical data
Study data
Status
SLA
Lock
Information
PACS section
Dictation section
```

alanlarını oluşturur.

---

# 25. GÜN 2 — TEST PACS

İki seçenek:

## Öncelikli

Orthanc çalışırsa gerçek test PACS.

## Fallback

Core PacsAdapter üzerinde güvenli test metadata adapter.

Ancak frontend sahte local PACS state kullanmamalıdır.

---

# 26. GÜN 2 — AUDIO DICTATION

Codex:

```text
Microphone permission
Start
Stop
Complete
Upload state
Timer
```

oluşturur.

Claude:

```text
Dictation model
Create
Upload
Playback metadata
Object storage
```

oluşturur.

---

# 27. GÜN 2 — AUDIO STORAGE FALLBACK

S3-compatible remote storage hazır değilse development sırasında local-compatible storage adapter kullanılabilir.

Ancak interface:

> ObjectStorageAdapter

arkasında kalmalıdır.

Pilot deployment öncesi remote-compatible storage kullanılmalıdır.

---

# 28. GÜN 2 — COMPLETE READING

Akış:

```text
READING
↓
Completed Dictation
↓
complete-reading
↓
WAITING_TRANSCRIPTION
```

Doctor lock kaldırılır.

---

# 29. GÜN 2 — IMAGE MISSING

Minimum:

```text
Doctor
↓
Image Missing
↓
Reason
↓
IMAGE_MISSING
↓
lock released
```

Operation resolution sonraki gün tamamlanabilir.

---

# 30. GÜN 2 ÇIKIŞ KRİTERİ

```text
[ ] Second HL7 matching works
[ ] Images available works
[ ] Study becomes UNREAD
[ ] Doctor pool works
[ ] Doctor opens Study
[ ] Redis lock works
[ ] Second Doctor blocked
[ ] Heartbeat works
[ ] Study detail works
[ ] Dictation can be recorded
[ ] Dictation upload works
[ ] Dictation persisted
[ ] Complete reading works
[ ] WAITING_TRANSCRIPTION works
[ ] Doctor lock released
[ ] Image Missing basic flow works
```

---

# 31. GÜN 3 — REPORTER + APPROVAL

Ana hedef:

> Dikteden final rapora kadar klinik iş akışını tamamlamak.

---

# 32. GÜN 3 — REPORTER POOL

Codex:

```text
WAITING_TRANSCRIPTION
```

listesini oluşturur.

Gösterilecek:

```text
Patient
Study
Doctor
Dictation duration
Arrival
SLA
Information
```

---

# 33. GÜN 3 — REPORTER LOCK

Claude:

```text
start-transcription
Reporter assignment
Reporter Redis lock
```

oluşturur.

Concurrent Reporter test zorunludur.

---

# 34. GÜN 3 — REPORT DATA MODEL

Claude:

```text
Report
ReportVersion
ReportStatus
ReportSource
```

modellerini tamamlar.

Draft autosave desteklenir.

---

# 35. GÜN 3 — REPORTER WORKSPACE

Codex aynı ekranda:

```text
Patient data
Clinical information
Dictation player
Report editor
Save status
Information notes
Submit button
```

oluşturur.

Bu ekran projenin ana UX ekranlarından biridir.

---

# 36. GÜN 3 — AUDIO PLAYBACK

Reporter gerçek uploaded dictation dosyasını:

```text
play
pause
seek
duration
```

ile dinleyebilmelidir.

---

# 37. GÜN 3 — REPORT AUTOSAVE

Codex:

```text
debounced autosave
```

kullanabilir.

UI:

```text
Kaydediliyor...
Kaydedildi
Kaydetme hatası
```

durumlarını ayırmalıdır.

---

# 38. GÜN 3 — SUBMIT REPORT

Akış:

```text
TRANSCRIBING
↓
submit-report
↓
WAITING_APPROVAL
↓
Reporter lock release
↓
Doctor notification
```

---

# 39. GÜN 3 — DOCTOR APPROVAL QUEUE

Codex Doctor navigasyonuna:

> Onay Bekleyenler

ekler.

Badge/count gösterilebilir.

---

# 40. GÜN 3 — APPROVAL WORKSPACE

Doctor:

```text
Patient
Study
Images / viewer
Dictation optional
Report
Information
Finalize
Return to Reporter
```

görebilmelidir.

---

# 41. GÜN 3 — FINALIZATION

Claude:

```text
finalize action
ReportVersion FINAL
Study FINAL
HbysDelivery create
HBYS_PENDING
BullMQ job
```

işlemlerini kurar.

Mock HBYS henüz minimal olabilir.

---

# 42. GÜN 3 — INFORMATION NOTES

Claude:

```text
InformationNote
InformationNoteVersion
```

oluşturur.

Codex Study workspace içine ekler.

Not:

- create,
- update,
- history

olmalıdır.

Delete yoktur.

---

# 43. GÜN 3 ÇIKIŞ KRİTERİ

```text
[ ] Reporter pool works
[ ] Reporter lock works
[ ] Second Reporter blocked
[ ] Dictation playback works
[ ] Report editor works
[ ] Autosave works
[ ] Submit report works
[ ] WAITING_APPROVAL works
[ ] Doctor approval queue works
[ ] Doctor opens report
[ ] Return to Reporter works
[ ] Finalize works
[ ] Report version FINAL exists
[ ] HBYS delivery created
[ ] Information notes work
```

---

# 44. GÜN 4 — HBYS + SLA + OPERATION

Ana hedef:

> Happy path'i gerçek operasyonel sistem haline getirmek.

---

# 45. GÜN 4 — MOCK HBYS

Claude:

```text
MockHbysAdapter
SUCCESS
FAIL
TIMEOUT
```

modlarını tamamlar.

---

# 46. GÜN 4 — HBYS WORKER

BullMQ:

```text
hbys-delivery
```

queue oluşturulur.

Worker:

```text
delivery
attempt
retry
result
audit
realtime
```

yönetir.

---

# 47. GÜN 4 — HBYS SUCCESS FLOW

```text
FINAL
↓
HBYS_PENDING
↓
SUCCESS
↓
HBYS_SENT
```

çalışmalıdır.

---

# 48. GÜN 4 — HBYS FAIL FLOW

```text
HBYS_PENDING
↓
FAIL / TIMEOUT
↓
Retry
↓
Exhaustion
↓
HBYS_FAILED
```

çalışmalıdır.

---

# 49. GÜN 4 — MANUAL RETRY

Operation/Manager:

```text
retry
```

yapabilir.

Sonraki success:

```text
HBYS_SENT
```

olmalıdır.

---

# 50. GÜN 4 — SLA

Claude:

```text
SlaPolicy
arrivalAt
slaDeadlineAt
remaining
overdue
warning
```

mantığını tamamlar.

Temel:

```text
ACIL = 120 min
YATAN = 720 min
NORMAL = 1440 min
warning = 20 min
```

---

# 51. GÜN 4 — TEST SLA MODE

DevTools:

```text
5 minute SLA
1 minute warning
```

gibi hızlandırılmış değer destekler.

Production policy değişmez.

---

# 52. GÜN 4 — REALTIME

Claude/Codex temel WebSocket olaylarını entegre eder.

Minimum:

```text
study.status.changed
study.locked
study.unlocked
study.waiting_approval
study.hbys.sent
study.hbys.failed
sla.warning
sla.overdue
information.added
```

---

# 53. GÜN 4 — OPERATION UI

Codex Operation ekranı:

```text
All active studies
SLA Warning
Overdue
HBYS Failed
Image Missing
Hospital Doctor
Information alerts
```

göstermelidir.

---

# 54. GÜN 4 — IMAGE MISSING RESOLUTION

Operation:

```text
IMAGE_MISSING
↓
Resolve
↓
UNREAD
```

yapabilmelidir.

---

# 55. GÜN 4 — WONT REPORT

Minimum:

```text
UNREAD
→ WONT_REPORT

WONT_REPORT
→ UNREAD
```

Operation/Manager üzerinden çalışır.

---

# 56. GÜN 4 — EXTERNAL HOSPITAL DOCTOR LOCK

DevTools:

```text
External Lock
External Unlock
```

oluşturur.

Akış:

```text
UNREAD
→ HOSPITAL_DOCTOR
→ UNREAD
```

çalışmalıdır.

---

# 57. GÜN 4 — AUDIT

Minimum kritik eventlerin tamamı AuditLog oluşturmalıdır.

Codex Operation/Manager için Study audit timeline gösterebilir.

---

# 58. GÜN 4 ÇIKIŞ KRİTERİ

```text
[ ] Mock HBYS SUCCESS
[ ] Mock HBYS FAIL
[ ] Mock HBYS TIMEOUT
[ ] BullMQ works
[ ] Automatic retry works
[ ] Manual retry works
[ ] HBYS_SENT works
[ ] HBYS_FAILED works
[ ] SLA calculation works
[ ] Warning works
[ ] Overdue works
[ ] Accelerated test SLA works
[ ] Operation UI works
[ ] Image Missing resolve works
[ ] Wont Report works
[ ] Reactivation works
[ ] External Hospital Doctor lock works
[ ] Realtime basic events work
[ ] Audit records exist
```

---

# 59. GÜN 5 — MANAGER + HARDENING + DEPLOYMENT

Ana hedef:

> Sağlık ekibinin kullanabileceği pilot URL oluşturmak.

---

# 60. GÜN 5 — MANAGER DASHBOARD

Codex:

```text
Total Studies
Acil
Yoğun Bakım
Yatan
Normal

Unread
Waiting transcription
Waiting approval
Final
HBYS failed
Overdue
```

kartlarını gösterir.

---

# 61. GÜN 5 — USER MANAGEMENT

Minimum Manager:

```text
Users list
Create user
Activate/deactivate
Role
Hospital access
```

işlemleri.

---

# 62. GÜN 5 — PERFORMANCE

Manager minimum:

```text
Doctor study count
Doctor average reading duration
Reporter report count
Reporter average transcription duration
```

görebilir.

---

# 63. GÜN 5 — COMPENSATION

Pilot:

```text
User
Month
Acil count
Yoğun Bakım count
Yatan count
Normal count
Total
```

gösterilir.

Finansal `calculatedAmount` zorunlu değildir.

---

# 64. GÜN 5 — DEVTOOLS UI

Manager pilot test ekranı:

```text
First HL7
Second HL7
Images available

Mock HBYS:
SUCCESS
FAIL
TIMEOUT

Accelerated SLA

External Lock
External Unlock
```

işlemlerini kolayca yapabilmelidir.

---

# 65. GÜN 5 — E2E HAPPY PATH

Zorunlu manuel/otomatik test:

```text
Manager/Test
↓
First HL7
↓
Second HL7
↓
Images
↓
Doctor
↓
Dictation
↓
Reporter
↓
Report
↓
Doctor Final
↓
HBYS SUCCESS
```

---

# 66. GÜN 5 — E2E FAILURE PATH

```text
Mock HBYS FAIL
↓
Doctor Final
↓
HBYS_FAILED
↓
Operation sees failure
↓
Mock HBYS SUCCESS
↓
Manual retry
↓
HBYS_SENT
```

---

# 67. GÜN 5 — MULTI USER TEST

Aynı anda en az:

```text
Doctor
Reporter
Manager/Operation
```

farklı browser sessionlarda test edilir.

Örnek:

```text
Chrome
Doctor

Chrome Incognito
Reporter

Edge/Safari
Manager
```

---

# 68. GÜN 5 — LOCK TEST

İki Doctor session:

```text
Doctor A
opens study

Doctor B
tries same study
```

Expected:

```text
423 STUDY_LOCKED
```

Reporter concurrency için de aynı test yapılır.

---

# 69. GÜN 5 — BACKEND DEPLOYMENT

Backend Railway'e deploy edilir.

Zorunlu env:

```text
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_REFRESH_SECRET
FRONTEND_URL
DEV_TOOLS_ENABLED
OBJECT_STORAGE_*
```

---

# 70. GÜN 5 — FRONTEND DEPLOYMENT

Frontend Vercel'e deploy edilir.

Env:

```text
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_WS_URL
```

ayarlanır.

---

# 71. GÜN 5 — CORS / COOKIE TEST

Özellikle:

```text
Vercel
↔
Railway
```

cross-origin auth test edilir.

Kontrol:

```text
login
refresh
logout
credentials cookie
CORS
WebSocket
```

---

# 72. GÜN 5 — PILOT USERS

Health team için ayrı test hesapları hazırlanabilir.

Örnek:

```text
pilot.doctor@test.local
pilot.reporter@test.local
pilot.manager@test.local
```

Geçici şifre güvenli şekilde paylaşılır.

---

# 73. GÜN 5 ÇIKIŞ KRİTERİ

```text
[ ] Vercel URL live
[ ] Railway API live
[ ] Login live
[ ] PostgreSQL live
[ ] Redis live
[ ] Doctor workflow live
[ ] Reporter workflow live
[ ] Approval live
[ ] Mock HBYS live
[ ] Retry live
[ ] SLA live
[ ] Operation live
[ ] Manager dashboard live
[ ] DevTools live
[ ] Audit works
[ ] Lock concurrency verified
[ ] Happy path verified
[ ] Failure path verified
```

---

# 74. ÖNCELİK SINIFLARI

Tüm görevler aşağıdaki önceliklerden birine sahip olmalıdır.

## P0 — Pilot Blocker

Olmadan ana akış çalışmaz.

Örnek:

```text
Auth
Study
Lock
Dictation
Report
Final
HBYS Mock
```

## P1 — Pilot Important

Sağlık ekibinin gerçekçi test yapması için önemlidir.

Örnek:

```text
SLA
Operation
Audit
Information
Image Missing
```

## P2 — Pilot Nice-to-Have

Yetişirse eklenir.

Örnek:

```text
Advanced Manager Analytics
Revision
Special List detailed UX
```

## P3 — Post Pilot

İlk pilot için yapılmaz.

Örnek:

```text
AI report generation
production anonymization
Kubernetes
advanced finance
```

---

# 75. P0 GÖREVLERİ

Kesin P0:

```text
Repository foundation
Auth
RBAC
Hospital scope

Patient
Study

Mock First HL7
Mock Second HL7
Accession matching
Images available

Study pool
Doctor start-reading
Redis locking

Dictation recording
Dictation upload
Dictation playback

Reporter queue
Reporter lock
Report editor
Submit report

Doctor approval
Finalization

Mock HBYS
HBYS queue
HBYS success
HBYS failure
Manual retry
```

---

# 76. P1 GÖREVLERİ

```text
SLA
20-minute warning
accelerated SLA mode

Information Notes

Image Missing
Wont Report
Hospital Doctor

Operation dashboard

Audit Timeline

Realtime events

Manager basic dashboard
```

---

# 77. P2 GÖREVLERİ

```text
Special Lists
Revision
Report version UI
Performance dashboard
Compensation count screen
Advanced PACS series UI
```

---

# 78. P3 / SONRAKİ FAZ

```text
AI generated report
External emergency physician portal
Production KVKK anonymization
Full Addendum workflow
Real hospital integration
HA infrastructure
Kubernetes
Advanced BI
```

Not:

External physician portal sağlık ekibinin önemli talebidir ancak ilk 5 günlük pilotun ana akışını engellememelidir.

---

# 79. BLOCKED TASK KURALI

Bir görev dış bağımlılık nedeniyle yapılamıyorsa:

```text
BLOCKED_EXTERNAL
```

Örnek:

```text
Real PACS credential missing
Real HBYS API unavailable
```

Ajan başka bağımsız göreve geçmelidir.

---

# 80. BLOCKED SPEC KURALI

İş kuralı belirsizse:

```text
BLOCKED_SPEC
```

Örnek:

```text
Exact ICU SLA
Exact compensation formula
Exact addendum HBYS behavior
```

Ajan business rule uydurmamalıdır.

---

# 81. TEST FAILURE KURALI

Test başarısızken görev:

> DONE

yapılamaz.

Ajan:

1. Hatayı inceler.
2. Kendi değişikliği kaynaklıysa düzeltir.
3. Testi tekrar çalıştırır.
4. Geçmeden görevi tamamlamaz.

---

# 82. COMMIT KURALI

Her anlamlı görev sonrası küçük commit yapılmalıdır.

Örnek:

```text
feat(auth): implement jwt authentication

feat(studies): add study workflow foundation

feat(locks): implement redis study lock

feat(dictations): add audio upload

feat(reports): add reporter workflow

feat(hbys): add mock delivery worker

fix(auth): handle refresh cookie cors
```

---

# 83. TODO KURALI

Kod içerisinde açıklamasız:

```text
TODO
FIXME
HACK
```

bırakılmamalıdır.

Gerekli ise:

> TASK_QUEUE.md

içerisinde görev olarak kaydedilmelidir.

---

# 84. FRONTEND BAĞIMLILIK KURALI

Codex backend endpoint hazır değilse:

- `API_CONTRACT.md` üzerinden UI structure geliştirebilir,
- typed API client hazırlayabilir.

Ancak production kodunda hard-coded fake workflow bırakmamalıdır.

Endpoint hazır olduğunda gerçek API'ye bağlanmalıdır.

---

# 85. BACKEND BAĞIMLILIK KURALI

Claude frontend hazır değil diye backend workflow'u bekletmemelidir.

API contract ve integration testleri üzerinden ilerleyebilir.

---

# 86. SHARED PACKAGE

İlk günlerde mutlaka:

```text
UserRole
PatientCategory
StudyStatus
ReportStatus
ReportSource
HbysDeliveryStatus

StudyListItem
StudyDetail
ApiError
```

gibi ortak type'lar shared package'a alınmalıdır.

---

# 87. SHARED PACKAGE OWNERSHIP

Shared package iki tarafça rastgele değiştirilemez.

Type değişikliği:

```text
docs contract
↓
shared
↓
backend
↓
frontend
```

şeklinde uygulanmalıdır.

---

# 88. QUALITY GATE

Her gün sonunda:

```text
lint
typecheck
unit tests
integration tests
build
```

geçmelidir.

Bunların kesin detayları:

> `QUALITY_GATES.md`

içerisinde tanımlanacaktır.

---

# 89. PROGRESS TRACKING

Ajanlar:

```text
PROGRESS.md
```

dosyasını güncellemelidir.

En az:

```text
Completed
In Progress
Blocked
Tests
Known Issues
```

bulunmalıdır.

---

# 90. TASK QUEUE

Gerçek mikro görevler:

> `TASK_QUEUE.md`

dosyasında tanımlanacaktır.

Bu Implementation Plan yalnızca yüksek seviye sıra ve milestone belirler.

---

# 91. AJAN KENDİ KENDİNE ÖZELLİK EKLEYEMEZ

Claude veya Codex:

> “Bence faydalı olur.”

diyerek P0/P1 dışı büyük özellik eklememelidir.

Yeni özellik:

- TASK_QUEUE'ya eklenir,
- öncelik verilir,
- sonra geliştirilir.

---

# 92. 5 GÜNLÜK ZAMAN YÖNETİMİ

Bir özellik beklenenden çok uzun sürüyorsa:

```text
P0 ise:
çözmeye devam et / basitleştir

P1 ise:
minimum working version

P2 ise:
defer

P3 ise:
çalışma
```

---

# 93. ORTHANC ENGEL OLURSA

Test PACS kurulumu ana workflow'u geciktiriyorsa:

> PacsAdapter interface + test metadata adapter

ile Doctor workflow ilerleyebilir.

Orthanc sonraki paralel görev olarak devam eder.

Ancak gerçek pilot kabul öncesi mümkünse test viewer doğrulanır.

---

# 94. VAD ENGEL OLURSA

Voice Activity Detection ana dictation sistemini engelliyorsa:

P0:

```text
record
upload
playback
```

tamamlanır.

VAD:

> P1/P2

olarak uygulanabilir.

Mimari VAD eklemeye hazır kalmalıdır.

---

# 95. REALTIME ENGEL OLURSA

WebSocket problemi core workflow'u durdurmamalıdır.

Fallback:

```text
REST refetch / polling
```

ile pilot akış devam edebilir.

Realtime sonra düzeltilir.

Ancak P1 olarak tamamlanması hedeflenir.

---

# 96. REVISION ENGEL OLURSA

Revision önemli ancak ilk happy path'i engellemez.

Öncelik:

```text
Doctor
Reporter
Final
HBYS
```

akışıdır.

Revision P2 olarak pilot sonuna yetişirse eklenir.

---

# 97. MANAGER UI ENGEL OLURSA

İlk pilotta Manager için minimum:

```text
dashboard
HBYS failures
users
devtools
```

yeterlidir.

Gelişmiş grafikler ertelenebilir.

---

# 98. UI POLISH

İlk beş günde öncelik:

```text
functionality
clarity
speed
```

olacaktır.

Animation ve detaylı design polish P0 değildir.

Ancak sağlık çalışanının kullanımını zorlaştıracak kötü UX kabul edilmez.

---

# 99. PILOT RELEASE LABEL

İlk çalışan sürüm:

```text
v0.1.0-pilot
```

olarak etiketlenebilir.

---

# 100. PILOT BUG FIX PHASE

Sağlık ekibi test etmeye başladıktan sonra yeni faz:

```text
Pilot Feedback
↓
Bug / Workflow Feedback
↓
TASK_QUEUE
↓
Fix
↓
v0.1.x
```

şeklinde ilerler.

---

# 101. BAŞARI ÖLÇÜTÜ

İlk 5 günlük sprintin başarısı yazılan kod satırı değildir.

Başarı:

> sağlık ekibinin ana süreci kendisinin kullanıp doğrulayabilmesidir.

---

# 102. EN KRİTİK SENARYO

Her karar şu senaryoya hizmet etmelidir:

```text
Bir tetkik sisteme gelsin.

Doctor okuyabilsin.

Reporter yazabilsin.

Doctor final verebilsin.

Rapor HBYS'ye gidebilsin.
```

Bu zinciri geciktiren pilot dışı özellikler ertelenmelidir.

---

# 103. IMPLEMENTATION ORDER SOURCE OF TRUTH

Geliştirme önceliği konusunda:

1. `MASTER_SPEC.md`
2. Bu `IMPLEMENTATION_PLAN.md`
3. `TASK_QUEUE.md`
4. Agent kararları

sırası geçerlidir.

---

# 104. SON KURAL

Ajan bir görevin sonraki göreve geçmesine izin vermediğini düşünüyorsa:

- bağımlılığı doğrular,
- çözebiliyorsa çözer,
- dış bağımlılıksa BLOCKED_EXTERNAL,
- iş kuralıysa BLOCKED_SPEC

olarak işaretler.

Bloke olan tek görev nedeniyle tüm geliştirme sürecini durdurmamalıdır.

Mümkün olan bir sonraki bağımsız göreve geçmelidir.