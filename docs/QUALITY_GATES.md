# QUALITY_GATES.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Kalite Barajları ve Tamamlanma Kriterleri

> **Doküman Türü:** Quality Assurance / Completion Gates  
> **Üst Referanslar:**  
> `MASTER_SPEC.md`  
> `ARCHITECTURE.md`  
> `WORKFLOW_STATE_MACHINE.md`  
> `DATA_MODEL.md`  
> `API_CONTRACT.md`  
> `AUTH_ROLES_PERMISSIONS.md`  
> `INTEGRATIONS.md`  
> `IMPLEMENTATION_PLAN.md`  
> `TASK_QUEUE.md`
>
> **Amaç:** AI ajanlarının yarım, test edilmemiş veya spesifikasyonla uyumsuz işi tamamlanmış saymasını engellemek.

---

# 1. ANA KURAL

Bir görev yalnızca:

```text
kod yazıldı
```

diye tamamlanmış değildir.

Bir görev:

```text
implementation
+
validation
+
test
+
required build checks
+
acceptance criteria
```

başarılı olduğunda `DONE` yapılabilir.

---

# 2. QUALITY GATE SEVİYELERİ

Kalite kontrolleri beş seviyeye ayrılır.

```text
QG-1 Syntax / Static Quality
QG-2 Unit / Component Quality
QG-3 Integration Quality
QG-4 Workflow / E2E Quality
QG-5 Pilot Release Quality
```

Her görev kendi seviyesine uygun barajları geçmelidir.

---

# 3. GLOBAL DONE DEFINITION

Bir task `DONE` yapılmadan önce minimum:

```text
[ ] Requirement okundu
[ ] İlgili docs kontrol edildi
[ ] Kod tamamlandı
[ ] Lint başarılı
[ ] Typecheck başarılı
[ ] İlgili testler başarılı
[ ] Acceptance criteria karşılandı
[ ] Kritik TODO/FIXME bırakılmadı
[ ] Gerekliyse commit oluşturuldu
[ ] TASK_QUEUE status güncellendi
```

olmalıdır.

---

# 4. QG-1 — STATIC QUALITY

Her backend/frontend/shared görev için uygulanır.

Minimum:

```text
lint
typecheck
format validation
```

geçmelidir.

Başarısızsa görev DONE yapılamaz.

---

# 5. TYPESCRIPT STRICTNESS

TypeScript mümkün olduğunca:

```text
strict: true
```

ile kullanılmalıdır.

Aşağıdaki kullanım normal çözüm kabul edilmemelidir:

```ts
const data: any = ...
```

`any` ancak:

- external unknown payload,
- geçici adapter boundary

gibi gerçekten gerekli yerlerde ve mümkünse `unknown` tercih edilerek kullanılmalıdır.

---

# 6. NO SILENT TYPE ERRORS

Aşağıdaki yöntemler sırf build geçsin diye kullanılmamalıdır:

```text
@ts-ignore
@ts-nocheck
eslint-disable entire file
```

Gerekirse spesifik satır açıklaması ile sınırlı kullanılmalı ve sebebi belli olmalıdır.

---

# 7. LINT GATE

Root seviyede ortak lint komutu bulunmalıdır.

Örnek:

```bash
pnpm lint
```

Bu komut:

- backend,
- frontend,
- shared

için çalışmalıdır.

Pilot release öncesi lint error sayısı:

```text
0
```

olmalıdır.

---

# 8. TYPECHECK GATE

Örnek:

```bash
pnpm typecheck
```

veya workspace bazında:

```bash
pnpm --filter backend typecheck
pnpm --filter frontend typecheck
pnpm --filter shared typecheck
```

çalışmalıdır.

TypeScript error sayısı:

```text
0
```

olmalıdır.

---

# 9. BUILD GATE

Özellikle milestone ve release öncesi:

```bash
pnpm build
```

başarılı olmalıdır.

Backend:

> production compile

Frontend:

> Next.js production build

başarılı değilse pilot release yapılamaz.

---

# 10. QG-2 — UNIT TEST QUALITY

Business logic içeren backend servislerinde unit test önceliklidir.

Özellikle:

```text
WorkflowService
PermissionService
LockService
SlaService
HL7 matching
Report versioning
HBYS retry logic
```

unit test ile doğrulanmalıdır.

---

# 11. WORKFLOW TEST GATE

Aşağıdaki geçişler en az test edilmelidir:

```text
WAITING_ACCEPTANCE → IMAGES_PENDING
IMAGES_PENDING → UNREAD
UNREAD → READING
READING → WAITING_TRANSCRIPTION
WAITING_TRANSCRIPTION → TRANSCRIBING
TRANSCRIBING → WAITING_APPROVAL
WAITING_APPROVAL → FINAL
FINAL → HBYS_PENDING
HBYS_PENDING → HBYS_SENT
HBYS_PENDING → HBYS_FAILED
HBYS_FAILED → HBYS_PENDING
```

---

# 12. FORBIDDEN TRANSITION TESTS

En az aşağıdaki geçersiz örnekler test edilmelidir:

```text
UNREAD → FINAL
UNREAD → HBYS_SENT
TRANSCRIBING → FINAL
WAITING_TRANSCRIPTION → HBYS_PENDING
HBYS_FAILED → READING
```

Expected:

```text
INVALID_STATE_TRANSITION
```

---

# 13. LOCK UNIT / INTEGRATION GATE

Lock sistemi için zorunlu:

```text
[ ] acquire success
[ ] second acquire fails
[ ] heartbeat extends TTL
[ ] non-owner heartbeat rejected
[ ] owner release works
[ ] force release works
[ ] stale lock expires
```

---

# 14. LOCK ATOMICITY

İki concurrent request aynı Study için lock almaya çalıştığında:

> yalnızca bir tanesi başarılı olmalıdır.

Bu davranış mümkün olduğunca integration test ile doğrulanmalıdır.

---

# 15. PERMISSION TEST GATE

Zorunlu örnekler:

```text
Reporter finalize → 403
Doctor HBYS retry → 403
Operation finalize → 403
Doctor manager users → 403
Unauthorized hospital Study → 403
Non-owner lock edit → 423 / forbidden
```

---

# 16. AUTH TEST GATE

En az:

```text
valid login
invalid password
inactive user
refresh
logout
expired access token
invalid refresh session
```

test edilmelidir.

---

# 17. PASSWORD SECURITY GATE

Kontrol:

```text
[ ] plain password DB'de yok
[ ] passwordHash API response'da yok
[ ] refresh token plain text DB'de yok
[ ] login log'unda password yok
```

---

# 18. QG-3 — DATABASE QUALITY

Prisma değişikliği sonrası:

```text
migration create
migration apply
schema validation
```

başarılı olmalıdır.

---

# 19. DATABASE RESET TEST

Development database temiz kurulumda:

```text
migrate
seed
start app
```

zinciri çalışmalıdır.

Bir geliştiricinin eski lokal DB'sine bağımlı olmamalıdır.

---

# 20. UNIQUE CONSTRAINT TEST

Zorunlu:

```text
hospitalId + accessionNumber
```

duplicate Study oluşturmamalıdır.

Aynı accession:

- aynı hospital → reject/deduplicate
- farklı hospital → allowed

olmalıdır.

---

# 21. REPORT VERSIONING GATE

Test:

```text
v1 FINAL
↓
revision
↓
v2
```

sonrasında:

```text
v1 hâlâ mevcut
```

olmalıdır.

Final v1 overwrite edilmemelidir.

---

# 22. INFORMATION HISTORY GATE

Information note update:

```text
Version 1
↓
update
↓
Version 2
```

oluşturmalıdır.

Eski içerik silinmemelidir.

DELETE endpoint bulunmamalıdır.

---

# 23. AUDIT QUALITY GATE

Kritik actionların audit üretmesi zorunludur.

Minimum:

```text
HL7 first
HL7 second
images available
start reading
dictation complete
complete reading
start transcription
submit report
finalize
HBYS attempt
HBYS result
HBYS retry
image missing
wont report
reactivate
external lock
force lock release
information update
```

---

# 24. AUDIT IMMUTABILITY TEST

Normal API kullanıcısı:

```text
AuditLog update
AuditLog delete
```

yapamamalıdır.

---

# 25. QG-3 — API CONTRACT QUALITY

Backend response'ları `API_CONTRACT.md` ile uyumlu olmalıdır.

Kontrol:

```text
status codes
response envelope
error envelope
enum names
date format
pagination
```

---

# 26. API ERROR CONTRACT

Business errorlarda:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  }
}
```

formatı korunmalıdır.

Rastgele başka error şekilleri oluşturulmamalıdır.

---

# 27. HTTP STATUS GATE

Örnek:

```text
401 unauthenticated
403 forbidden
409 invalid workflow conflict
423 study locked
422 validation error
500 unexpected server failure
```

mantıklı ve tutarlı kullanılmalıdır.

---

# 28. API SECRET LEAK GATE

API response içerisinde hiçbir zaman:

```text
DATABASE_URL
REDIS_URL
JWT_SECRET
passwordHash
refreshTokenHash
S3 secret
HBYS password
PACS password
```

olmamalıdır.

---

# 29. HL7 INTEGRATION QUALITY

Minimum senaryolar:

```text
First HL7 valid
First HL7 duplicate
Second HL7 valid
Second HL7 unknown accession
patient mismatch
required field missing
```

---

# 30. HL7 DUPLICATE QUALITY

Aynı First HL7 iki kez gönderildiğinde:

```text
Patient count artmamalı
Study count artmamalı
status resetlenmemeli
```

---

# 31. HL7 MATCHING QUALITY

Second HL7:

> yalnızca accession string eşleşti diye şüpheli patient mismatch'i sessiz kabul etmemelidir.

Conflict güvenli hata üretmelidir.

---

# 32. PACS QUALITY

Pilot PACS entegrasyonunda en az:

```text
study found
viewer available
study not found
PACS unavailable
```

durumları düzgün yönetilmelidir.

---

# 33. PACS FAILURE UX

PACS unavailable ise:

- tüm uygulama crash olmamalı,
- kullanıcıya hata gösterilmeli,
- backend anlamlı error code üretmeli.

---

# 34. DICTATION QUALITY GATE

Zorunlu test:

```text
microphone permission
record
stop
upload
persist
playback
```

akışıdır.

---

# 35. DICTATION FAILURE

Aşağıdakiler için UI açık hata göstermelidir:

```text
permission denied
recording failed
upload failed
playback unavailable
```

Kullanıcı başarısız upload sonrası reading tamamlandı sanmamalıdır.

---

# 36. DICTATION COMPLETION GATE

Study:

```text
READING → WAITING_TRANSCRIPTION
```

geçmeden completed dictation bulunmalıdır.

Aksi durumda:

```text
DICTATION_REQUIRED
```

beklenir.

---

# 37. REPORT AUTOSAVE QUALITY

Autosave:

```text
saving
saved
error
```

durumlarını ayırmalıdır.

API fail iken:

> “Kaydedildi”

gösterilemez.

---

# 38. REPORT SUBMIT QUALITY

Submit report öncesi:

- content boş değil,
- kullanıcı lock owner,
- Study TRANSCRIBING

olmalıdır.

Submit sonrası:

```text
WAITING_APPROVAL
```

olmalıdır.

---

# 39. FINALIZATION QUALITY GATE

Doctor final işleminde minimum:

```text
[ ] assigned Doctor
[ ] correct Study state
[ ] completed report
[ ] final ReportVersion
[ ] finalizedAt
[ ] Study FINAL/HBYS_PENDING flow
[ ] HBYS Delivery created
[ ] audit created
```

---

# 40. FINALIZATION DOUBLE SUBMIT

Finalize request network retry nedeniyle iki kez gelirse:

- iki ayrı final version yanlışlıkla oluşmamalı,
- iki duplicate HBYS delivery yanlışlıkla oluşmamalıdır.

Idempotent davranış test edilmelidir.

---

# 41. HBYS QUALITY GATE

Üç mock mode zorunlu:

```text
SUCCESS
FAIL
TIMEOUT
```

---

# 42. HBYS SUCCESS TEST

Expected:

```text
finalize
↓
HBYS_PENDING
↓
worker
↓
HBYS_SENT
```

ve:

```text
successful delivery record
attempt record
audit
```

bulunmalıdır.

---

# 43. HBYS FAIL TEST

Expected:

```text
HBYS_PENDING
↓
automatic attempts
↓
HBYS_FAILED
```

Operation/Manager bunu görebilmelidir.

---

# 44. HBYS TIMEOUT TEST

Timeout:

- process sonsuza kadar beklememeli,
- retry policy çalışmalı,
- sonunda anlamlı failure oluşmalıdır.

---

# 45. HBYS MANUAL RETRY QUALITY

Test:

```text
HBYS_FAILED
↓
Manager/Operation retry
↓
HBYS_PENDING
↓
SUCCESS
↓
HBYS_SENT
```

---

# 46. HBYS ROLE SECURITY

Manual retry:

```text
Reporter → 403
Doctor → 403
Operation → allowed
Manager → allowed
```

olmalıdır.

---

# 47. QG-3 — REALTIME QUALITY

WebSocket event kaçırıldığında sistem yanlış state'te kalmamalıdır.

Frontend reconnect sonrası:

```text
REST refetch
```

yapmalıdır.

---

# 48. REALTIME DUPLICATE EVENT

Aynı event iki kez gelirse frontend:

- duplicate toast spam üretmemeli,
- business state'i bozacak çift işlem yapmamalıdır.

---

# 49. QG-3 — SLA QUALITY

SLA hesabı backend'de olmalıdır.

Frontend kendi başına deadline üretmemelidir.

---

# 50. SLA TESTLERİ

En az:

```text
normal
warning
overdue
completed
```

durumları test edilmelidir.

---

# 51. TEST SLA MODE

Accelerated mode:

- development/pilot'ta çalışmalı,
- production policy'yi değiştirmemelidir.

---

# 52. SLA UNKNOWN ICU RULE

`YOGUN_BAKIM` için kesin SLA değeri iş kuralında net değilse:

> ajan uydurmamalıdır.

İlgili görev:

```text
BLOCKED_SPEC
```

veya config-required durumda tutulmalıdır.

---

# 53. QG-4 — HAPPY PATH E2E

Pilotun ana E2E senaryosu:

```text
First HL7
↓
Second HL7
↓
Images Available
↓
Doctor Login
↓
Start Reading
↓
Dictation
↓
Complete Reading
↓
Reporter Login
↓
Start Transcription
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
HBYS Success
↓
HBYS_SENT
```

Bu akış baştan sona çalışmadan pilot “hazır” sayılamaz.

---

# 54. E2E DATA VERIFICATION

Happy path sonunda database'de minimum:

```text
Patient
Study
StatusHistory
DoctorAssignment
Dictation
ReporterAssignment
Report
ReportVersion FINAL
HbysDelivery SENT
HbysDeliveryAttempt
AuditLog
```

bulunmalıdır.

---

# 55. QG-4 — DOCTOR LOCK E2E

İki ayrı authenticated session ile test:

```text
Doctor A → start reading = success
Doctor B → same Study = 423
```

UI lock owner bilgisini göstermelidir.

---

# 56. QG-4 — REPORTER LOCK E2E

```text
Reporter A → start transcription = success
Reporter B → same Study = 423
```

---

# 57. QG-4 — IMAGE MISSING E2E

```text
READING
↓
Doctor Image Missing
↓
IMAGE_MISSING
↓
Operation resolve
↓
UNREAD
```

Eski incident history korunmalıdır.

---

# 58. QG-4 — WONT REPORT E2E

```text
UNREAD
↓
WONT_REPORT
↓
reactivate
↓
UNREAD
```

reason/history korunmalıdır.

---

# 59. QG-4 — EXTERNAL LOCK E2E

```text
UNREAD
↓
mock external lock
↓
HOSPITAL_DOCTOR
↓
Doctor start-reading rejected
↓
external unlock
↓
UNREAD
```

---

# 60. QG-4 — CROSS HOSPITAL SECURITY

İki hospital test edilmelidir.

Doctor A sadece Hospital A yetkili.

Hospital B Study UUID ile direct request:

```text
403
```

olmalıdır.

---

# 61. QG-4 — CROSS ROLE SECURITY

Minimum:

```text
Reporter cannot finalize
Doctor cannot HBYS retry
Operation cannot clinical finalize
Manager without Doctor role cannot clinical finalize
```

---

# 62. QG-5 — PILOT RELEASE GATE

Vercel/Railway deploy öncesi aşağıdaki bütün kritik barajlar geçmelidir.

```text
[ ] Backend build
[ ] Frontend build
[ ] DB migration
[ ] Seed
[ ] Redis
[ ] Object storage
[ ] Login
[ ] Role security
[ ] Hospital security
[ ] Doctor flow
[ ] Reporter flow
[ ] Finalization
[ ] HBYS success
[ ] HBYS fail
[ ] manual retry
[ ] lock conflict
[ ] audit
```

---

# 63. DEPLOYED HEALTH CHECK

Railway deployment sonrası:

```text
GET /api/v1/health
```

başarılı olmalıdır.

Minimum:

```text
app
database
redis
```

kontrolü.

---

# 64. DEPLOYED AUTH TEST

Vercel domain üzerinden:

```text
login
refresh
logout
```

çalışmalıdır.

Localhost testi tek başına yeterli değildir.

---

# 65. CORS GATE

Pilot domain dışında rastgele origin authenticated API'ye erişememelidir.

Configured Vercel domain çalışmalıdır.

---

# 66. COOKIE GATE

Cross-origin refresh kullanılıyorsa:

```text
Secure
HttpOnly
SameSite=None
```

konfigürasyonu deployed ortamda doğrulanmalıdır.

---

# 67. WEBSOCKET DEPLOYMENT GATE

Deployed frontend:

```text
Vercel
↔
Railway WebSocket
```

bağlantısı test edilmelidir.

Çalışmazsa fallback REST refresh pilotu tamamen engellemeyebilir, ancak issue `PROGRESS.md` içinde açık tutulmalıdır.

---

# 68. OBJECT STORAGE DEPLOYMENT GATE

Gerçek deployed Doctor session:

```text
record
upload
```

ve Reporter:

```text
playback
```

başarılı olmalıdır.

Local filesystem üzerinde çalışan audio pilot release için yeterli değildir.

---

# 69. DEVTOOLS GATE

Pilot:

```text
DEV_TOOLS_ENABLED=true
```

olabilir.

Ancak:

```text
unauthenticated user
Doctor
Reporter
```

DevTools endpointlerine erişememelidir.

---

# 70. PRODUCTION SAFETY CHECK

Production environment ileride açılırken:

```text
DEV_TOOLS_ENABLED=false
ALLOW_MOCK_INTEGRATIONS=false
```

olmalıdır.

Pilot bunun production olduğu varsayımıyla sunulmamalıdır.

---

# 71. NO REAL PATIENT DATA

Pilot quality gate:

> gerçek hasta verisi kullanılmamalıdır.

Test verileri açıkça sahte olmalıdır.

---

# 72. UI QUALITY — DOCTOR

Doctor ana ekranında minimum görünür:

```text
Patient
Study
Clinical data
SLA
PACS
Dictation
Status
Lock
Information
```

Doktorun sürekli modül değiştirerek çalışması gerekmemelidir.

---

# 73. UI QUALITY — REPORTER

Reporter aynı ekranda minimum:

```text
Patient
Study
Clinical data
Audio player
Report editor
Information
```

görmelidir.

Ses için ayrı uzak bir modüle gitmemelidir.

---

# 74. UI QUALITY — APPROVAL

Doctor approval ekranında:

```text
report
study
patient
clinical info
viewer access
finalize
return
```

olmalıdır.

Onay bekleyen dosyalar kolay fark edilmelidir.

---

# 75. UI QUALITY — OPERATION

Operation minimum:

```text
SLA warning
Overdue
HBYS failed
Image missing
Hospital doctor
Information alerts
```

görebilmelidir.

---

# 76. UI QUALITY — MANAGER

Manager minimum:

```text
Dashboard
Users
HBYS failures
Audit
DevTools
```

işlevlerine ulaşabilmelidir.

---

# 77. LOADING STATE GATE

API kullanılan önemli ekranlarda:

```text
loading
empty
success
error
```

state'leri olmalıdır.

Beyaz boş ekran acceptable değildir.

---

# 78. ERROR UX GATE

Kullanıcıya raw backend stack trace gösterilmemelidir.

Örneğin:

```text
TypeError: Cannot read properties...
```

UI'de görünmemelidir.

---

# 79. LOCK UX GATE

423 alındığında frontend:

> genel “Bir hata oluştu”

yerine lock bilgisini göstermelidir.

Örnek:

```text
Bu tetkik Test Doctor tarafından okunuyor.
```

---

# 80. SAVE UX GATE

Report autosave:

```text
Kaydediliyor...
Kaydedildi
Kaydetme başarısız
```

durumlarını net ayırmalıdır.

---

# 81. HBYS UX GATE

Frontend final onay sonrası:

```text
HBYS gönderildi
```

mesajını worker başarı vermeden gösteremez.

Doğru:

```text
HBYS gönderimi bekleniyor
```

sonrasında success/failure.

---

# 82. TEST DATA GATE

Seed script idempotent olmalıdır.

İki kez çalıştırıldığında kullanıcı/hastane sayısını gereksiz artırmamalıdır.

---

# 83. MOCK QUALITY

Mock entegrasyonlar gerçek core service'leri kullanmalıdır.

Yanlış:

```text
frontend setStatus("HBYS_SENT")
```

Doğru:

```text
frontend
→ backend
→ queue
→ MockHbysAdapter
→ DB
→ event
→ frontend
```

---

# 84. CODE QUALITY — CONTROLLER

Controller'larda büyük business logic olmamalıdır.

Controller:

```text
validate request
authorize
call service
return response
```

düzeyinde tutulmalıdır.

---

# 85. CODE QUALITY — SERVICE

Workflow kuralları service katmanında merkezi tutulmalıdır.

Direct Prisma update ile farklı modüllerde status değiştirilmemelidir.

---

# 86. CODE QUALITY — FRONTEND

Frontend componentler:

- devasa tek dosya,
- duplicate API logic,
- duplicate role logic

haline getirilmemelidir.

API hooks ve UI componentler anlamlı şekilde ayrılmalıdır.

---

# 87. NO DUPLICATE ENUM GATE

Aşağıdaki enumların frontend/backend'de ayrı kopyaları olmamalıdır:

```text
StudyStatus
UserRole
PatientCategory
ReportStatus
HbysDeliveryStatus
```

Shared package kullanılmalıdır.

---

# 88. DEPENDENCY QUALITY

Ajan basit bir problem için gereksiz büyük dependency eklememelidir.

Yeni dependency eklenirken:

- aktif bakım görüyor mu,
- gerçekten gerekli mi,
- mevcut stack çözebilir mi

kontrol edilmelidir.

---

# 89. NO ENTERPRISE OVERENGINEERING

Pilot için aşağıdaki altyapılar quality kriteri değildir:

```text
Kubernetes
Kafka
Elasticsearch
Service Mesh
Multi-region
```

Bunların olmaması kalite eksikliği sayılmaz.

---

# 90. PERFORMANCE BASIC GATE

Pilot 2–3 kullanıcı içindir.

Yine de temel API çağrıları normal test verisinde kabul edilebilir hızda olmalıdır.

Bariz:

```text
her listede yüzlerce N+1 query
```

gibi sorunlar bırakılmamalıdır.

---

# 91. DATABASE QUERY GATE

Study list gibi sık endpointlerde:

- pagination,
- gerekli indexes,
- controlled includes/selects

kullanılmalıdır.

Tüm ilişkiler gereksiz yüklenmemelidir.

---

# 92. SECURITY GATE — INPUT

Tüm dış input:

- DTO validation,
- enum validation,
- UUID validation

ile kontrol edilmelidir.

---

# 93. SECURITY GATE — HTML / REPORT

Rapor içeriği HTML destekliyorsa:

> XSS riski

kontrol edilmelidir.

Pilot plain text veya sanitize edilmiş content tercih edilebilir.

---

# 94. SECURITY GATE — UPLOAD

Audio upload:

- mime type,
- max size,
- authenticated ownership

kontrollerine sahip olmalıdır.

Arbitrary file upload kabul edilmemelidir.

---

# 95. SECURITY GATE — SIGNED PLAYBACK

Audio bucket public yapılmamalıdır.

Playback:

- authenticated endpoint,
- kısa süreli signed URL

tercih edilmelidir.

---

# 96. RELEASE BLOCKER SEVERITY

Issue seviyeleri:

```text
BLOCKER
CRITICAL
MAJOR
MINOR
```

---

# 97. BLOCKER

Pilot release'i tamamen engeller.

Örnek:

```text
login çalışmıyor
report save olmuyor
finalize çalışmıyor
HBYS job oluşmuyor
iki Doctor aynı dosyayı düzenleyebiliyor
```

Release yapılamaz.

---

# 98. CRITICAL

Ana workflow'da ciddi risk.

Örnek:

```text
wrong hospital data visible
final report overwritten
audio başka Study'den açılıyor
```

Release yapılamaz.

---

# 99. MAJOR

Pilot kullanımını zorlaştırır ama veri güvenliğini doğrudan bozmayabilir.

Örnek:

```text
realtime notification çalışmıyor ancak refresh çalışıyor
manager chart eksik
```

Bilinen issue olarak pilot yapılması değerlendirilebilir.

---

# 100. MINOR

Polish problemi.

Örnek:

```text
spacing
icon alignment
non-critical text
```

Pilot blocker değildir.

---

# 101. RELEASE ISSUE RULE

Pilot release öncesi:

```text
BLOCKER = 0
CRITICAL = 0
```

olmalıdır.

MAJOR issue varsa `PROGRESS.md` içinde açıkça yazılmalıdır.

---

# 102. TEST RESULT RECORDING

Ajan önemli milestone sonrası `PROGRESS.md` içine:

```text
Lint: PASS
Typecheck: PASS
Unit: 42 PASS / 0 FAIL
Integration: 15 PASS / 0 FAIL
E2E: 3 PASS / 0 FAIL
Build: PASS
```

gibi sonuç yazmalıdır.

Rakam uydurulmamalıdır.

Gerçek komut sonucu kullanılmalıdır.

---

# 103. FAILED TEST TRANSPARENCY

Bir test fail ise ajan:

```text
Tests: PASS
```

yazamamalıdır.

Açıkça:

```text
1 test failing:
- reporter concurrency
```

yazmalıdır.

---

# 104. FLAKY TEST

Flaky test görmezden gelinmemelidir.

Geçici olarak quarantine gerekiyorsa:

- nedeni,
- issue/task ID,
- etkisi

yazılmalıdır.

P0 workflow testlerinin flaky bırakılması kabul edilmez.

---

# 105. AGENT SELF-REVIEW

Task tamamlandıktan sonra ajan kendi diff'ini kontrol etmelidir.

Minimum sorular:

```text
Bu değişiklik spec ile uyumlu mu?
Yeni security açığı ekledim mi?
Başka role erişim açtım mı?
State machine'i bypass ettim mi?
Test eklemek gerekiyor mu?
```

---

# 106. CROSS-AGENT QUALITY

Claude API değiştirirse Codex'in mevcut kullanımını bozabilecekse:

- API_CONTRACT kontrol edilmeli,
- shared type güncellenmeli,
- etkisi PROGRESS/TASK_QUEUE'ya yazılmalıdır.

Codex backend'in döndürmediği alanı uydurmamalıdır.

---

# 107. DOC DRIFT GATE

Kod ile doküman çelişiyorsa:

> kod geçiyor diye görev DONE yapılamaz.

Önce doğru source of truth belirlenir.

İş kuralı değiştiyse ilgili docs güncellenmelidir.

---

# 108. QUALITY GATE BY TASK PRIORITY

## P0

Zorunlu:

```text
lint
typecheck
unit/integration as applicable
acceptance
critical E2E impact
```

## P1

Zorunlu:

```text
lint
typecheck
relevant tests
acceptance
```

## P2

Minimum:

```text
lint
typecheck
targeted test
```

P3 pilot sırasında yapılmamalıdır.

---

# 109. DAILY QUALITY GATE

Her geliştirme günü sonunda:

```text
[ ] root lint
[ ] root typecheck
[ ] relevant unit tests
[ ] relevant integration tests
[ ] backend build
[ ] frontend build
[ ] PROGRESS updated
[ ] no unexplained P0 failing task
```

---

# 110. DAY 1 QUALITY

```text
Auth
DB
Redis
Seed
First HL7
Study list
```

temel testleri geçmelidir.

---

# 111. DAY 2 QUALITY

```text
Second HL7
Images
Doctor lock
Dictation
Complete reading
```

testleri geçmelidir.

---

# 112. DAY 3 QUALITY

```text
Reporter lock
Audio playback
Report autosave
Submit
Approval
Finalize
```

testleri geçmelidir.

---

# 113. DAY 4 QUALITY

```text
HBYS success
HBYS fail
HBYS timeout
retry
SLA
special states
audit
```

testleri geçmelidir.

---

# 114. DAY 5 QUALITY

```text
deployed happy path
deployed failure path
role test
lock concurrency
cross-hospital security
```

kontrol edilmelidir.

---

# 115. PILOT FINAL ACCEPTANCE CHECKLIST

Pilot URL sağlık ekibine verilmeden önce:

```text
[ ] Test Doctor login
[ ] Test Reporter login
[ ] Test Operation login
[ ] Test Manager login

[ ] First HL7
[ ] Second HL7
[ ] Images Available

[ ] Doctor starts reading
[ ] Second Doctor blocked
[ ] Dictation upload

[ ] Reporter starts
[ ] Second Reporter blocked
[ ] Audio playback
[ ] Report save
[ ] Report submit

[ ] Doctor approval
[ ] Final

[ ] HBYS Success
[ ] HBYS Fail
[ ] Manual Retry

[ ] SLA visible
[ ] Image Missing
[ ] Audit

[ ] Vercel works
[ ] Railway works
[ ] Redis works
[ ] PostgreSQL works
[ ] Object storage works

[ ] BLOCKER count = 0
[ ] CRITICAL count = 0
```

---

# 116. DEFINITION OF PILOT READY

Pilot hazır demek:

> sistemin tüm ekranları yapılmış

demek değildir.

Pilot hazır demek:

> ana klinik/operasyonel workflow gerçek backend state'leri üzerinde güvenli şekilde baştan sona çalışıyor

demektir.

---

# 117. QUALITY SOURCE OF TRUTH

Kalite değerlendirmesinde öncelik:

1. `MASTER_SPEC.md`
2. `WORKFLOW_STATE_MACHINE.md`
3. `API_CONTRACT.md`
4. `AUTH_ROLES_PERMISSIONS.md`
5. `QUALITY_GATES.md`
6. test sonuçları
7. kod

şeklindedir.

---

# 118. SON KURAL

Ajan:

> “Muhtemelen çalışıyor.”

veya:

> “Kod doğru görünüyor.”

gerekçesiyle task tamamlayamaz.

Tamamlanma için:

```text
kanıt = çalışan test / başarılı build / doğrulanmış acceptance criteria
```

gereklidir.

Test edilmeyen kritik workflow:

> tamamlanmış kabul edilmez.