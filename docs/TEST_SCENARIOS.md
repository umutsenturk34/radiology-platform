# TEST_SCENARIOS.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Pilot Test Senaryoları

> **Doküman Türü:** Functional / Integration / E2E Test Specification  
> **Üst Referanslar:**  
> `MASTER_SPEC.md`  
> `WORKFLOW_STATE_MACHINE.md`  
> `API_CONTRACT.md`  
> `AUTH_ROLES_PERMISSIONS.md`  
> `INTEGRATIONS.md`  
> `QUALITY_GATES.md`
>
> **Amaç:** Pilot sistemin yalnızca ekran bazında değil, gerçek iş akışı bazında doğrulanmasını sağlamak.

---

# 1. TEST PRENSİBİ

Pilot testlerde yalnızca:

> ekran açılıyor mu?

kontrol edilmez.

Her test:

```text
input
↓
business action
↓
backend state
↓
permission
↓
lock
↓
audit
↓
UI sonucu
```

zincirini doğrulamalıdır.

---

# 2. TEST ORTAMI

Pilot minimum test ortamı:

```text
Frontend
Vercel

Backend
Railway

Database
PostgreSQL

Redis
Managed Redis

HL7
MockHl7Adapter

PACS
Orthanc veya TestPacsAdapter

HBYS
MockHbysAdapter
```

---

# 3. TEST KULLANICILARI

Minimum:

```text
doctor@test.local
role = DOCTOR

reporter@test.local
role = REPORTER

operation@test.local
role = OPERATION

manager@test.local
role = MANAGER
```

Ek concurrency testi için:

```text
doctor2@test.local
reporter2@test.local
```

oluşturulması önerilir.

---

# 4. TEST HASTANELERİ

En az:

```text
TEST_HOSPITAL_A
TEST_HOSPITAL_B
```

oluşturulmalıdır.

Cross-hospital security testleri için iki ayrı hastane gereklidir.

---

# 5. TEST DATA KURALI

Gerçek hasta verisi kullanılmamalıdır.

Örnek:

```text
Patient:
Test Patient 001

External Patient ID:
TEST-PAT-001

Accession:
TEST-ACC-001
```

---

# 6. TEST DURUM FORMATLARI

Her test aşağıdaki sonucu taşımalıdır:

```text
PASS
FAIL
BLOCKED_EXTERNAL
BLOCKED_SPEC
NOT_RUN
```

---

# 7. TEST RECORD FORMAT

Test sonucu gerektiğinde:

```text
Scenario:
TS-001

Result:
PASS

Actor:
Doctor

Study:
TEST-ACC-001

Evidence:
...

Notes:
...
```

şeklinde kaydedilebilir.

---

# 8. TS-001 — FIRST HL7

## Amaç

İlk HL7 eventinin doğru Study kaydını oluşturduğunu doğrulamak.

## Actor

MANAGER / DevTools

## Precondition

Study mevcut değil.

## Action

```text
DevTools
→ First HL7
```

Payload:

```text
Hospital A
Patient TEST-PAT-001
Accession TEST-ACC-001
Category ACIL
Study BT Toraks
```

## Expected

```text
Patient created
Study created
Study status = WAITING_ACCEPTANCE
```

## Database

- Patient vardır.
- Study vardır.
- hospitalId + accessionNumber doğru.
- Audit vardır.

---

# 9. TS-002 — DUPLICATE FIRST HL7

## Amaç

Aynı First HL7 iki kez geldiğinde duplicate Study oluşmamasını doğrulamak.

## Action

TS-001 payload tekrar gönderilir.

## Expected

```text
new Patient = 0
new Study = 0
```

State resetlenmemelidir.

---

# 10. TS-003 — SECOND HL7 MATCH

## Precondition

TS-001 tamamlanmış.

Study:

```text
WAITING_ACCEPTANCE
```

## Action

Second HL7 gönderilir.

## Matching

```text
hospitalId + accessionNumber
```

## Expected

```text
WAITING_ACCEPTANCE
→ IMAGES_PENDING
```

---

# 11. TS-004 — SECOND HL7 UNKNOWN ACCESSION

## Action

Sistemde olmayan accession ile Second HL7 gönderilir.

## Expected

- Yanlış Study oluşturulmamalı.
- Başka Study ile eşleşmemeli.
- Integration error oluşmalı.

---

# 12. TS-005 — SECOND HL7 PATIENT MISMATCH

## Precondition

Accession mevcut.

## Action

Aynı accession ancak farklı externalPatientId gönderilir.

## Expected

Sistem sessizce yanlış hastayı birleştirmemelidir.

Expected internal error:

```text
HL7_PATIENT_MISMATCH
```

veya contract ile uyumlu conflict.

---

# 13. TS-006 — IMAGES AVAILABLE

## Precondition

```text
Study = IMAGES_PENDING
```

## Action

DevTools:

```text
Images Available
```

## Expected

```text
IMAGES_PENDING
→ UNREAD
```

Doctor pool’da görünür.

---

# 14. TS-007 — DOCTOR SEES UNREAD STUDY

## Actor

Doctor A

## Action

Login → Okuma Havuzu.

## Expected

Test Study görünür.

Minimum:

```text
Patient
Accession
Study
Category
Arrival
Status
SLA
```

görülebilir.

---

# 15. TS-008 — DOCTOR START READING

## Actor

Doctor A

## Precondition

```text
Study = UNREAD
```

## Action

Study açılır / Start Reading.

## Expected

```text
UNREAD
→ READING
```

ve:

```text
Doctor assignment
Redis lock
readingStartedAt
Audit
```

oluşur.

---

# 16. TS-009 — DOCTOR LOCK CONFLICT

## Actors

Doctor A  
Doctor B

## Precondition

Doctor A TS-008 ile Study’yi açmış.

## Action

Doctor B aynı Study’yi açmaya çalışır.

## Expected

```text
423 STUDY_LOCKED
```

UI mümkünse:

```text
Bu tetkik Dr. Test Doctor tarafından okunuyor.
```

göstermelidir.

---

# 17. TS-010 — DOCTOR HEARTBEAT

## Actor

Doctor A

## Action

Active Study açık tutulur.

## Expected

Lock TTL heartbeat ile yenilenir.

Study başka kullanıcıya açılmaz.

---

# 18. TS-011 — STALE DOCTOR LOCK

## Precondition

Doctor A lock sahibi.

## Action

Doctor A browser/session kapanır ve heartbeat durur.

## Expected

Configured TTL sonrası lock expire olur.

Study kalıcı olarak sonsuza kadar kilitli kalmaz.

---

# 19. TS-012 — FORCE UNLOCK

## Actor

Operation veya Manager

## Precondition

Aktif lock var.

## Action

Force unlock + reason.

## Expected

- lock kaldırılır,
- reason kaydedilir,
- Audit oluşur.

---

# 20. TS-013 — MICROPHONE PERMISSION

## Actor

Doctor

## Action

Dikte başlat.

## Expected — Permission Granted

Recording başlar.

## Expected — Permission Denied

Anlaşılır hata gösterilir.

Study yanlışlıkla tamamlanmış sayılmaz.

---

# 21. TS-014 — DICTATION RECORDING

## Actor

Doctor

## Precondition

```text
Study = READING
Doctor owns lock
```

## Action

- Start recording
- Speak
- Stop

## Expected

Local audio blob oluşur.

Upload başlar.

---

# 22. TS-015 — DICTATION UPLOAD

## Expected

Backend:

- Dictation record,
- object storage object,
- metadata

oluşturur.

Status:

```text
COMPLETED
```

olur.

---

# 23. TS-016 — DICTATION UPLOAD FAILURE

## Action

Storage failure simüle edilir.

## Expected

- UI success göstermez.
- Doctor Complete Reading yapamaz.
- Retry mümkün olur.
- Audio mümkünse client state’te korunur.

---

# 24. TS-017 — COMPLETE READING WITHOUT DICTATION

## Action

Completed dictation yokken Complete Reading denenir.

## Expected

```text
422
DICTATION_REQUIRED
```

Study:

```text
READING
```

olarak kalır.

---

# 25. TS-018 — COMPLETE READING

## Precondition

Completed dictation mevcut.

## Action

Doctor Complete Reading.

## Expected

```text
READING
→ READ
→ WAITING_TRANSCRIPTION
```

ve:

- readingCompletedAt,
- lock release,
- audit

oluşur.

---

# 26. TS-019 — REPORTER SEES STUDY

## Actor

Reporter A

## Expected

Study:

```text
WAITING_TRANSCRIPTION
```

havuzunda görünür.

Minimum:

```text
Patient
Study
Doctor
Dictation
Category
SLA
```

görülebilir.

---

# 27. TS-020 — REPORTER START TRANSCRIPTION

## Actor

Reporter A

## Action

Study seçilir.

## Expected

```text
WAITING_TRANSCRIPTION
→ TRANSCRIBING
```

ve:

```text
Reporter assignment
Reporter lock
```

oluşur.

---

# 28. TS-021 — REPORTER LOCK CONFLICT

## Actors

Reporter A  
Reporter B

## Precondition

Reporter A Study’yi almış.

## Action

Reporter B aynı Study’ye girmeye çalışır.

## Expected

```text
423 STUDY_LOCKED
```

---

# 29. TS-022 — REPORTER AUDIO PLAYBACK

## Actor

Reporter A

## Expected

Doctor’un gerçek uploaded dictation dosyası:

```text
play
pause
seek
duration
```

ile dinlenebilir.

---

# 30. TS-023 — REPORTER SAME WORKSPACE

## Amaç

Sağlık ekibinin kritik UX talebini doğrulamak.

## Expected

Reporter aynı workspace içinde:

```text
Patient
Clinical Data
Doctor Audio
Report Editor
Information
```

görebilir.

Ses dinlemek için ayrı bağımsız modüle gitmek gerekmez.

---

# 31. TS-024 — REPORT DRAFT SAVE

## Actor

Reporter

## Action

Rapor yazılır.

## Expected

Autosave backend’e gider.

UI:

```text
Kaydediliyor
→
Kaydedildi
```

gösterir.

---

# 32. TS-025 — REPORT SAVE FAILURE

## Action

Backend/network save failure simüle edilir.

## Expected

UI:

```text
Kaydetme başarısız
```

gösterir.

`Kaydedildi` göstermez.

Editor content kaybolmamalıdır.

---

# 33. TS-026 — REPORT PAGE REFRESH

## Action

Draft kaydedildikten sonra sayfa refresh edilir.

## Expected

Report backend’den yeniden yüklenir.

Draft kaybolmaz.

---

# 34. TS-027 — SUBMIT REPORT

## Actor

Reporter

## Action

Hekim Onayına Gönder.

## Expected

```text
TRANSCRIBING
→ WAITING_APPROVAL
```

Reporter lock release edilir.

Audit oluşur.

---

# 35. TS-028 — DOCTOR APPROVAL NOTIFICATION

## Actor

Assigned Doctor

## Expected

- approval queue güncellenir,
- count/badge artar,
- notification veya realtime event gelir.

---

# 36. TS-029 — OTHER DOCTOR APPROVAL PRIVACY

## Actors

Doctor A assigned.  
Doctor B unrelated.

## Expected

Doctor B default private approval queue’da bu Study’yi görmemelidir.

---

# 37. TS-030 — START APPROVAL

## Actor

Assigned Doctor

## Action

Approval Study açılır.

## Expected

Approval lock oluşabilir.

Report görüntülenir.

---

# 38. TS-031 — RETURN TO REPORTER

## Actor

Doctor

## Action

Raportöre Geri Gönder.

Reason:

```text
Bulgular tekrar düzenlensin.
```

## Expected

```text
WAITING_APPROVAL
→ WAITING_TRANSCRIPTION
```

ve:

- reason,
- audit,
- notification

oluşur.

---

# 39. TS-032 — REPORTER RECEIVES RETURNED STUDY

## Actor

Reporter

## Expected

Study yeniden reporter havuzunda görünür.

Return reason görünür olmalıdır.

---

# 40. TS-033 — FINALIZE REPORT

## Actor

Assigned Doctor

## Precondition

```text
WAITING_APPROVAL
```

ve valid report.

## Action

Final Onayla.

## Expected

```text
ReportVersion = FINAL
finalizedAt set
HBYS Delivery created
Study = HBYS_PENDING
```

Reporter manuel HBYS send yapmaz.

---

# 41. TS-034 — REPORTER CANNOT FINALIZE

## Actor

Reporter

## Action

Finalize endpoint direct çağrılır.

## Expected

```text
403 FORBIDDEN
```

---

# 42. TS-035 — OPERATION CANNOT FINALIZE

## Actor

Operation

## Expected

```text
403 FORBIDDEN
```

---

# 43. TS-036 — MANAGER CANNOT CLINICALLY FINALIZE

Manager aynı zamanda Doctor rolü taşımıyorsa:

```text
403 FORBIDDEN
```

olmalıdır.

---

# 44. TS-037 — DOUBLE FINALIZE

## Action

Finalize request iki kez hızlı gönderilir.

## Expected

- iki final version oluşmaz,
- iki duplicate HBYS delivery oluşmaz,
- data integrity korunur.

---

# 45. TS-038 — MOCK HBYS SUCCESS

## Precondition

Mock mode:

```text
SUCCESS
```

## Action

Doctor finalize.

## Expected

```text
HBYS_PENDING
↓
worker
↓
HBYS_SENT
```

ve:

- Delivery attempt,
- audit,
- realtime

oluşur.

---

# 46. TS-039 — HBYS PENDING UI

## Expected

Finalize hemen sonrası:

```text
HBYS Gönderiliyor
```

gösterilir.

Henüz:

```text
HBYS Gönderildi
```

gösterilmez.

---

# 47. TS-040 — MOCK HBYS FAIL

## Precondition

Mock mode:

```text
FAIL
```

## Expected

Configured attemptler sonrası:

```text
HBYS_FAILED
```

olur.

Operation ve Manager bunu görür.

---

# 48. TS-041 — MOCK HBYS TIMEOUT

## Precondition

Mode:

```text
TIMEOUT
```

## Expected

- request sonsuza kadar beklemez,
- retry çalışır,
- sonunda success veya HBYS_FAILED olur,
- attempt history korunur.

---

# 49. TS-042 — DOCTOR CANNOT RETRY HBYS

## Actor

Doctor

## Action

HBYS retry endpoint.

## Expected

```text
403
```

---

# 50. TS-043 — REPORTER CANNOT RETRY HBYS

## Actor

Reporter

## Expected

```text
403
```

---

# 51. TS-044 — OPERATION MANUAL HBYS RETRY

## Actor

Operation

## Precondition

Study:

```text
HBYS_FAILED
```

Mock mode SUCCESS yapılır.

## Action

Manual Retry.

## Expected

```text
HBYS_FAILED
→ HBYS_PENDING
→ HBYS_SENT
```

---

# 52. TS-045 — MANAGER MANUAL HBYS RETRY

TS-044 ile aynı davranış Manager için de PASS olmalıdır.

---

# 53. TS-046 — HBYS DELIVERY HISTORY

## Expected

Eski failed attemptler silinmez.

Yeni retry yeni attempt olarak görünür.

---

# 54. TS-047 — ACIL SLA

## Precondition

Category:

```text
ACIL
```

## Expected Default

```text
Deadline = Arrival + 120 minutes
```

Test mode dışında.

---

# 55. TS-048 — YATAN SLA

Expected:

```text
Arrival + 720 minutes
```

---

# 56. TS-049 — NORMAL SLA

Expected:

```text
Arrival + 1440 minutes
```

---

# 57. TS-050 — YOGUN BAKIM SLA

Kesin duration kaynak dokümanda belirlenmiş değilse:

```text
BLOCKED_SPEC
```

olmalıdır.

AI/test kodu rastgele süre beklememelidir.

---

# 58. TS-051 — SLA WARNING

## Precondition

Accelerated test SLA kullanılır.

Örnek:

```text
5 minute SLA
warning at 1 minute
```

## Expected

- SLA WARNING state,
- visual alert,
- Operation visibility,
- realtime event.

---

# 59. TS-052 — SLA OVERDUE

Deadline aşılır.

## Expected

```text
OVERDUE
```

ve Gecikme süresi görünür.

---

# 60. TS-053 — FINALIZED SLA

Doctor final sonrası SLA:

```text
COMPLETED
```

olarak değerlendirilebilir.

HBYS failure reportu yeniden klinik olarak okunmamış yapmamalıdır.

Bu pilot varsayımı `WORKFLOW_STATE_MACHINE.md` ile uyumlu kalmalıdır.

---

# 61. TS-054 — IMAGE MISSING

## Actor

Doctor

## Precondition

```text
READING
```

## Action

İmaj Eksik.

Reason:

```text
Kemik serisi eksik.
```

## Expected

```text
READING
→ IMAGE_MISSING
```

ve:

- lock release,
- incident,
- audit.

---

# 62. TS-055 — IMAGE MISSING OPERATION VIEW

## Actor

Operation

## Expected

Study Image Missing listesinde görünür.

Reason görülebilir.

---

# 63. TS-056 — IMAGE MISSING RESOLVE

## Actor

Operation

## Action

Resolved.

## Expected

```text
IMAGE_MISSING
→ UNREAD
```

Doctor pool’a geri döner.

Incident history silinmez.

---

# 64. TS-057 — WONT REPORT

## Actor

Operation / Manager

## Precondition

Study raporlanabilir aktif durumda.

## Action

Yazılmayacak + reason.

## Expected

```text
WONT_REPORT
```

ve history.

---

# 65. TS-058 — REACTIVATE WONT REPORT

## Action

Reactivate + reason.

## Expected

```text
WONT_REPORT
→ UNREAD
```

---

# 66. TS-059 — EXTERNAL HOSPITAL DOCTOR LOCK

## Precondition

```text
Study = UNREAD
```

## Action

DevTools External Lock.

## Expected

```text
UNREAD
→ HOSPITAL_DOCTOR
```

Central Doctor start-reading yapamaz.

---

# 67. TS-060 — HOSPITAL DOCTOR RELEASE

## Action

External Unlock.

## Expected

```text
HOSPITAL_DOCTOR
→ UNREAD
```

Doctor tekrar okuyabilir.

---

# 68. TS-061 — EXTERNAL LOCK DURING CENTRAL READING

## Precondition

Doctor A:

```text
READING + internal lock
```

## Action

External Lock event gelir.

## Expected

- central work otomatik silinmez,
- external conflict oluşur,
- Operation/Manager alert,
- Audit.

Bu durumda otomatik precedence uydurulmamalıdır.

---

# 69. TS-062 — INFORMATION NOTE CREATE

## Actor

Doctor

## Action

Information note ekle.

## Expected

- Author,
- Role,
- Timestamp,
- Content

görünür.

---

# 70. TS-063 — INFORMATION NOTE UPDATE

## Action

Note düzenle.

## Expected

Yeni version oluşur.

Eski içerik history’de kalır.

---

# 71. TS-064 — INFORMATION NOTE DELETE ABSENT

Normal UI/API’da delete olmamalıdır.

DELETE çağrısı mümkün değil veya forbidden olmalıdır.

---

# 72. TS-065 — INFORMATION REALTIME

Doctor note eklerken Reporter aynı Study workspace’de.

## Expected

Reporter:

- indicator,
- refetch,
- new note

görür.

---

# 73. TS-066 — CROSS HOSPITAL LIST SECURITY

## Setup

Doctor A yalnız Hospital A yetkili.

Hospital B’de Study var.

## Expected

Doctor A `/studies` listesinde Hospital B Study görmez.

---

# 74. TS-067 — CROSS HOSPITAL DIRECT UUID ACCESS

Doctor A Hospital B Study UUID’sini doğrudan çağırır.

## Expected

```text
403 HOSPITAL_ACCESS_DENIED
```

---

# 75. TS-068 — CROSS HOSPITAL REALTIME SECURITY

Hospital B Study değişir.

Doctor A yalnız Hospital A yetkili.

## Expected

Doctor A ilgili realtime event’i almamalıdır.

---

# 76. TS-069 — MANAGER USER LIST

## Actor

Manager

## Expected

Authorized user list görünür.

---

# 77. TS-070 — MANAGER CREATE USER

## Action

Yeni test Doctor oluştur.

## Expected

- user oluşur,
- role doğru,
- hospital access doğru,
- passwordHash response’da yok.

---

# 78. TS-071 — OPERATION CANNOT CREATE USER

## Actor

Operation

## Expected

```text
403
```

---

# 79. TS-072 — DOCTOR CANNOT CREATE USER

Expected:

```text
403
```

---

# 80. TS-073 — MANAGER CHANGE HOSPITAL ACCESS

## Expected

User hospital access değişir.

Audit oluşur.

---

# 81. TS-074 — INACTIVE USER LOGIN

User inactive yapılır.

## Expected

Login reddedilir.

---

# 82. TS-075 — SESSION LOGOUT

## Action

Logout.

## Expected

- refresh session revoke,
- frontend cache clear,
- socket disconnect.

---

# 83. TS-076 — INVALID PASSWORD

Expected:

```text
401 / INVALID_CREDENTIALS
```

User existence leak edilmemelidir.

---

# 84. TS-077 — TOKEN REFRESH

Access token expire simüle edilir.

## Expected

Valid refresh session ile yeni access token alınır.

Original request tekrar çalışır.

---

# 85. TS-078 — INVALID REFRESH SESSION

Expected

Kullanıcı login ekranına döner.

---

# 86. TS-079 — PACS AVAILABLE

## Expected

Doctor Study workspace’den viewer açabilir.

Study/Series metadata erişilebilir.

---

# 87. TS-080 — PACS UNAVAILABLE

PACS adapter error üretir.

## Expected

- tüm uygulama crash olmaz,
- Doctor anlamlı hata görür,
- Study data korunur.

---

# 88. TS-081 — PACS STUDY NOT FOUND

Expected:

- viewer unavailable state,
- integration error,
- operation visibility gerekirse.

Yanlış görüntü açılmaz.

---

# 89. TS-082 — DOCTOR SAME WORKSPACE

Doctor tek workspace’de minimum:

```text
Patient
Study
Clinical Data
PACS
Dictation
Information
SLA
```

görebilir.

Bu sağlık ekibi UX kabul testidir.

---

# 90. TS-083 — APPROVAL SAME WORKSPACE

Doctor approval ekranında:

```text
Patient
Study
Clinical Data
PACS
Report
Information
Finalize
Return
```

görebilir.

---

# 91. TS-084 — ROLE NAVIGATION

Her role yalnız ilgili ana navigasyon görünür.

Ancak direct endpoint security ayrıca backend ile test edilir.

---

# 92. TS-085 — DEVTOOLS DOCTOR ACCESS

Doctor `/dev-tools` backend endpointine direct request yapar.

## Expected

```text
403
```

veya route disabled contractına uygun cevap.

---

# 93. TS-086 — DEVTOOLS REPORTER ACCESS

Expected:

```text
403
```

---

# 94. TS-087 — DEVTOOLS MANAGER ACCESS

## Precondition

```text
DEV_TOOLS_ENABLED=true
```

## Expected

Allowed.

---

# 95. TS-088 — DEVTOOLS DISABLED

## Precondition

```text
DEV_TOOLS_ENABLED=false
```

## Expected

Manager dahi DevTools kullanamaz.

---

# 96. TS-089 — MOCK HBYS DOES NOT BYPASS CORE

## Action

DevTools HBYS SUCCESS seçilir.

## Expected

Frontend local state doğrudan HBYS_SENT yapmaz.

Akış:

```text
finalize
→ queue
→ adapter
→ DB
→ HBYS_SENT
```

olur.

---

# 97. TS-090 — MOCK HL7 DOES NOT DIRECTLY SET FINAL STATE

First/Second HL7 gerçek integration service’i kullanmalıdır.

DevTools direct arbitrary Study creation bypass yapmamalıdır.

---

# 98. TS-091 — AUDIT HAPPY PATH

Happy path sonunda en az:

```text
HL7 first
HL7 second
images
Doctor reading start
dictation complete
reading complete
Reporter transcription start
report submit
Doctor final
HBYS attempt
HBYS sent
```

audit kayıtları olmalıdır.

---

# 99. TS-092 — AUDIT IMMUTABILITY

Normal kullanıcı audit update/delete yapamaz.

---

# 100. TS-093 — REPORT FINAL IMMUTABILITY

Final ReportVersion normal draft save endpointi ile değiştirilememelidir.

---

# 101. TS-094 — REVISION CREATES NEW VERSION

## Priority

P2

## Precondition

Final report var.

## Action

Revision request + revision workflow.

## Expected

```text
v1 FINAL preserved
v2 created
```

v1 overwrite edilmez.

---

# 102. TS-095 — REVISION MANAGER ALERT

Revize edilmiş Study Manager tarafında kontrol/alert alanında görünmelidir.

Pilot P2.

---

# 103. TS-096 — TWO-MONTH ADDENDUM RULE

Final raporun üzerinden 2 ay geçmiş senaryo test edilir.

## Expected

Normal same-case revision yerine:

```text
ADDENDUM_REQUIRED
```

workflow sonucu.

Gerçek HBYS addendum protokolü net değilse sonraki entegrasyon adımı:

```text
BLOCKED_EXTERNAL / BLOCKED_SPEC
```

olabilir.

---

# 104. TS-097 — SPECIAL LIST ASSIGNMENT

## Priority

P2

Study Liste 1’e alınır.

## Expected

- `LIST_1` filtresinde görünür,
- Patient category değişmez.

---

# 105. TS-098 — SPECIAL LIST REMOVE

Study Liste 1’den çıkarılır.

Category aynı kalır.

---

# 106. TS-099 — PATIENT WITH MULTIPLE STUDIES

Aynı Patient için iki Study oluştur.

## Expected

Her Study ayrı reporting job’dır.

Bir Study final olduğunda diğeri otomatik final olmaz.

---

# 107. TS-100 — UNREPORTED SIBLING INDICATOR

Aynı Patient’ın başka raporlanmamış Study’si varsa ilgili flag/indicator görünür.

---

# 108. TS-101 — MANAGER DASHBOARD COUNTS

Manager Dashboard countları gerçek Study query sonuçlarıyla uyumlu olmalıdır.

Örnek:

```text
UNREAD = actual unread count
HBYS_FAILED = actual failed count
```

---

# 109. TS-102 — PERFORMANCE READING DURATION

## Priority

P2

Doctor reading duration:

```text
readingStartedAt
→ readingCompletedAt
```

üzerinden ölçülür.

Manager average görebilir.

---

# 110. TS-103 — REPORTER TRANSCRIPTION DURATION

## Priority

P2

Reporter:

```text
transcriptionStartedAt
→ reportSubmittedAt
```

duration hesaplanabilir.

---

# 111. TS-104 — MONTHLY COMPENSATION COUNTS

## Priority

P2

Manager:

```text
Acil
Yoğun Bakım
Yatan
Normal
Total
```

countlarını görebilir.

Finansal formül yoksa amount:

```text
null
```

kalır.

---

# 112. TS-105 — NO INVENTED COMPENSATION

Frontend/backend finansal tutar uydurmamalıdır.

Beklenen:

```text
calculatedAmount = null
```

veya formula not configured.

---

# 113. TS-106 — SLA POLICY SNAPSHOT

Bir Study oluşturulup deadline belirlenir.

Daha sonra test policy değiştirilirse eski Study deadline’ı geriye dönük sessiz değişmemelidir.

---

# 114. TS-107 — REALTIME STATUS UPDATE

Doctor start-reading yapar.

Başka yetkili kullanıcı listesinde Study:

```text
READING
```

olarak realtime güncellenir veya refetch olur.

---

# 115. TS-108 — REALTIME RECONNECT

Socket disconnect/reconnect yapılır.

## Expected

Reconnect sonrası:

```text
REST refetch
```

ile gerçek state tekrar alınır.

---

# 116. TS-109 — REALTIME MISSED EVENT

Event bilinçli kaçırılır.

Frontend sonraki refetch’te doğru state’e gelir.

Realtime’ın source of truth olmadığı doğrulanır.

---

# 117. TS-110 — REDIS DOWN DURING START READING

## Security Critical

Redis unavailable yapılır.

Doctor Start Reading dener.

## Expected

Sistem:

```text
assume unlocked
```

yapmamalıdır.

Edit workflow fail closed olmalıdır.

---

# 118. TS-111 — REDIS RETURNS

Redis yeniden erişilebilir olduğunda lock servisi normal davranışına döner.

---

# 119. TS-112 — FINALIZE QUEUE ENQUEUE FAILURE

## Advanced P1

DB final commit olur ancak queue enqueue fail simüle edilir.

## Expected

- final rapor kaybolmaz,
- delivery PENDING/recovery-required kalır,
- yeniden enqueue mümkün olur.

---

# 120. TS-113 — AUDIO STORAGE OWNERSHIP

Reporter başka Study’nin dictation ID’sini kullanarak playback istemeye çalışır.

Yetkisi yoksa access reddedilmelidir.

---

# 121. TS-114 — AUDIO MIME VALIDATION

Audio endpointine arbitrary executable/text file yüklenir.

Expected:

```text
422 / validation error
```

---

# 122. TS-115 — REPORTER EDITS OTHER REPORT

Reporter A başka Reporter’ın active locked Study’sine report save çağrısı yapar.

Expected:

```text
LOCK_NOT_OWNED
```

veya 423/403 contractına uygun hata.

---

# 123. TS-116 — DOCTOR FINALIZES OTHER DOCTOR STUDY

Doctor B Doctor A’ya assigned approval Study’sini direct finalize etmeye çalışır.

Expected:

```text
403
STUDY_NOT_ASSIGNED_TO_USER
```

veya contract ile uyumlu equivalent.

---

# 124. TS-117 — UI DOUBLE CLICK FINAL

Final button rapid double click.

## Expected

Frontend mutation sırasında button disable.

Backend de duplicate finalization üretmez.

---

# 125. TS-118 — UI DOUBLE CLICK SUBMIT REPORT

Reporter submit’e iki kez basar.

Expected:

- tek transition,
- duplicate completed version oluşmaz.

---

# 126. TS-119 — NETWORK FAILURE DURING REPORT EDIT

Network kesilir.

## Expected

- editor content local state’te kalır,
- save failure görünür,
- network geri gelince retry mümkün.

---

# 127. TS-120 — NETWORK FAILURE DURING DICTATION UPLOAD

Expected:

- Doctor success görmez,
- reading tamamlanamaz,
- retry mümkün.

---

# 128. TS-121 — LOGOUT WHILE ACTIVE LOCK

User active Study ile logout olur.

## Expected

- normal release denenebilir,
- session kapanır,
- lock kalırsa TTL recovery vardır.

---

# 129. TS-122 — MANAGER FORCE UNLOCK AUDIT

Force unlock sonrası Audit:

```text
actor
reason
previous owner
timestamp
```

içermelidir.

---

# 130. TS-123 — HBYS FAILURE PERSISTENT VISIBILITY

HBYS failed toast kapatılsa bile Study:

```text
HBYS_FAILED
```

listesinde görünmeye devam etmelidir.

---

# 131. TS-124 — APPROVAL BADGE PERSISTENCE

Doctor başka sayfaya geçse bile onay bekleyen count navigation’da kalmalıdır.

---

# 132. TS-125 — INFORMATION NOT DELETABLE FROM UI

Hiçbir role normal Information delete button görünmemelidir.

---

# 133. TS-126 — FINAL REPORT NOT EDITABLE BY REPORTER

Final sonrası Reporter draft endpoint ile raporu değiştirmeye çalışır.

Expected:

```text
403 / invalid state
```

---

# 134. TS-127 — HBYS RETRY DOES NOT MODIFY REPORT

Manual retry yalnız delivery attempt oluşturur.

Report content/version değişmez.

---

# 135. TS-128 — DUPLICATE HBYS DELIVERY IDEMPOTENCY

Aynı `reportVersionId` için duplicate send request/job oluşursa sistem duplicate logical delivery üretmemelidir veya güvenli idempotent davranmalıdır.

---

# 136. TS-129 — MANAGER SEES REVISION HISTORY

## Priority

P2

Manager final/revised version history görebilir.

Eski version silinmez.

---

# 137. TS-130 — OPERATION BASIC DASHBOARD

Operation minimum şu havuzları görebilir:

```text
SLA Warning
Overdue
HBYS Failed
Image Missing
Hospital Doctor
```

---

# 138. TS-131 — DOCTOR DOES NOT SEE COMPENSATION

Doctor manager compensation route/API çağırır.

Expected:

```text
403
```

---

# 139. TS-132 — REPORTER DOES NOT SEE COMPENSATION

Expected:

```text
403
```

---

# 140. TS-133 — OPERATION DOES NOT SEE COMPENSATION

Expected:

```text
403
```

---

# 141. TS-134 — DEVTOOLS ACCELERATED SLA LABEL

Test SLA aktifken UI bunun test mode olduğunu açık gösterir.

Gerçek süre ile karıştırılmaz.

---

# 142. TS-135 — MOCK HOSPITAL SEPARATION

Test hospital Study’si gerçek production HBYS adapter’a gitmemelidir.

Mock config kullanılmalıdır.

---

# 143. TS-136 — UNKNOWN ADAPTER CONFIG

Hospital integration adapter eksik.

## Expected

```text
INTEGRATION_ADAPTER_NOT_CONFIGURED
```

ve silent Mock fallback olmamalıdır.

---

# 144. TS-137 — HBYS AUTH FAILURE CLASSIFICATION

Gerçek adapter geliştirilince auth failure:

- retryable false olabilir,
- Operation error görür,
- secret loglanmaz.

Pilot mock ile benzer classification test edilebilir.

---

# 145. TS-138 — PATIENT DATA NOT IN RAW ERROR

Backend 500 hata response’da:

- stack trace,
- DB secret,
- full raw patient payload

olmamalıdır.

---

# 146. TS-139 — REQUEST ID

API response/log correlation için request ID üretilebiliyorsa aynı request izlenebilir.

P1.

---

# 147. TS-140 — HEALTH CHECK

```text
GET /api/v1/health
```

Expected:

```text
app = ok
database = ok
redis = ok
```

---

# 148. TS-141 — HEALTH REDIS DOWN

Redis kapatılır.

Expected health Redis down gösterir.

App false positive all-ok vermemelidir.

---

# 149. TS-142 — DEPLOYED LOGIN

Localhost değil Vercel URL üzerinden Doctor login.

Expected PASS.

---

# 150. TS-143 — DEPLOYED REFRESH COOKIE

Vercel → Railway cross-origin refresh çalışır.

---

# 151. TS-144 — DEPLOYED AUDIO

Vercel üzerinden microphone → Railway/backend → object storage.

Reporter playback.

Bu test pilot release için kritiktir.

---

# 152. TS-145 — DEPLOYED WEBSOCKET

Vercel frontend Railway WebSocket’e bağlanır.

Realtime status gelir.

Çalışmazsa polling fallback doğrulanır ve issue MAJOR olarak kaydedilir.

---

# 153. TS-146 — DEPLOYED HAPPY PATH

Pilot release öncesi gerçek deployed ortamda:

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

baştan sona çalışmalıdır.

---

# 154. TS-147 — DEPLOYED FAILURE PATH

Deployed:

```text
HBYS FAIL
→ HBYS_FAILED
→ Operation Retry
→ SUCCESS
→ HBYS_SENT
```

çalışmalıdır.

---

# 155. TS-148 — THREE ROLE PILOT SESSION

Aynı anda:

```text
Browser 1 = Doctor
Browser 2 = Reporter
Browser 3 = Operation/Manager
```

ile ana workflow test edilir.

---

# 156. TS-149 — DOCTOR SELF-SELECTION

Pilot ilk fazda Doctor uygun UNREAD Study’yi manuel seçebilmelidir.

FIFO zorla uygulanmamalıdır.

---

# 157. TS-150 — FUTURE FIFO NOT FRONTEND IMPLEMENTED

Frontend kendi FIFO algoritmasını çalıştırmamalıdır.

Bu yalnız mimari doğrulama testidir.

---

# 158. P0 TEST SETİ

Pilot blocker testleri:

```text
TS-001
TS-003
TS-006
TS-007
TS-008
TS-009
TS-014
TS-015
TS-018
TS-019
TS-020
TS-021
TS-022
TS-024
TS-027
TS-028
TS-033
TS-034
TS-038
TS-040
TS-041
TS-044
TS-066
TS-067
TS-091
TS-110
TS-142
TS-144
TS-146
TS-147
```

---

# 159. P1 TEST SETİ

```text
SLA
Image Missing
Wont Report
Hospital Doctor
Information
Operation
Realtime
Audit
Manager Basic
```

senaryoları.

---

# 160. P2 TEST SETİ

```text
Revision
Special Lists
Performance
Compensation Counts
Advanced PACS
```

---

# 161. RELEASE KRİTERİ

Pilot sağlık ekibine verilmeden önce:

```text
P0 FAIL = 0
BLOCKER = 0
CRITICAL = 0
```

olmalıdır.

---

# 162. MAJOR ISSUE

MAJOR issue varsa pilot yapılabilir ancak:

- veri güvenliği riski olmamalı,
- workaround mevcut olmalı,
- `PROGRESS.md` içinde açıkça yazılmalıdır.

---

# 163. HEALTHCARE TEAM MANUAL TEST — KISA SENARYO

Sağlık ekibinin manuel test için kullanabileceği en kısa ana senaryo:

```text
1. Manager ile giriş yap.
2. DevTools’tan First HL7 gönder.
3. Second HL7 gönder.
4. Images Available yap.
5. Doctor hesabına geç.
6. Study’yi aç.
7. Dikte kaydet.
8. Okumayı tamamla.
9. Reporter hesabına geç.
10. Study’yi al.
11. Dikteyi dinle.
12. Rapor yaz.
13. Hekim onayına gönder.
14. Doctor hesabına dön.
15. Onay Bekleyenler’den Study’yi aç.
16. Final onayla.
17. HBYS_SENT durumunu gör.
```

---

# 164. HEALTHCARE TEAM FAILURE TEST

```text
1. DevTools Mock HBYS = FAIL.
2. Yeni Study oluştur.
3. Doctor → Reporter → Doctor Final akışını tamamla.
4. HBYS_FAILED gör.
5. Operation hesabına geç.
6. Hatanın listede olduğunu kontrol et.
7. DevTools Mock HBYS = SUCCESS.
8. Retry yap.
9. HBYS_SENT gör.
```

---

# 165. HEALTHCARE TEAM LOCK TEST

```text
1. Doctor A Study açsın.
2. Doctor B aynı Study’yi açmaya çalışsın.
3. Doctor B’nin engellendiğini kontrol edin.
4. Lock owner bilgisini kontrol edin.
```

---

# 166. HEALTHCARE TEAM IMAGE MISSING TEST

```text
1. Doctor Study açsın.
2. İmaj Eksik seçsin.
3. Reason girsin.
4. Study Image Missing havuzuna gitsin.
5. Operation resolve etsin.
6. Study tekrar UNREAD olsun.
```

---

# 167. HEALTHCARE TEAM HOSPITAL DR TEST

```text
1. UNREAD Study oluştur.
2. DevTools External Lock çalıştır.
3. Study Hastane DR olsun.
4. Doctor Study’yi alamamalı.
5. External Unlock çalıştır.
6. Study tekrar UNREAD olsun.
```

---

# 168. HEALTHCARE TEAM SLA TEST

Accelerated SLA ile:

```text
1. 5 dakikalık test SLA aktif et.
2. Study oluştur.
3. Warning durumunu bekle.
4. UI warning rengini/göstergesini kontrol et.
5. Deadline aşımını kontrol et.
6. Operation Gecikenler listesine bak.
```

---

# 169. TEST SONUÇLARI PROGRESS

Pilot test sonunda `PROGRESS.md` içine en az:

```text
Happy Path: PASS/FAIL
HBYS Failure Path: PASS/FAIL
Doctor Lock: PASS/FAIL
Reporter Lock: PASS/FAIL
Cross Hospital Security: PASS/FAIL
Audio Upload/Playback: PASS/FAIL
Deployed Auth: PASS/FAIL
Known Major Issues: ...
```

yazılmalıdır.

---

# 170. TESTLERDE İŞ KURALI UYDURMA YASAĞI

Kaynak dokümanda kesin olmayan bir davranış için test:

> varsayılan beklenen değer

uydurmamalıdır.

Örnek:

```text
YOGUN_BAKIM SLA = 6 saat
```

gibi bir assertion yazılamaz.

---

# 171. TEST DATA CLEANUP

Test Study’ler test hospital kapsamında kalmalıdır.

Pilot sırasında verileri silmek zorunlu değildir.

Ancak production verisi ile karışmamalıdır.

---

# 172. TEST AUTOMATION ÖNCELİĞİ

Otomasyon önceliği:

```text
Auth
Workflow
Lock
HL7
Report
HBYS
Security
```

olmalıdır.

UI polish testleri daha düşük önceliktedir.

---

# 173. E2E TOOL

Frontend E2E için:

```text
Playwright
```

kullanılabilir.

Multi-user lock testleri ayrı browser context ile yapılabilir.

---

# 174. TEST ENV ISOLATION

E2E testleri mümkünse:

- ayrı test accession,
- ayrı test Study,
- deterministic HBYS mode

kullanmalıdır.

Bir test diğerine gizli bağımlı olmamalıdır.

---

# 175. DETERMINISTIC TEST

Testlerde random HBYS success/failure kullanılmamalıdır.

DevTools mode açıkça seçilmelidir.

---

# 176. FAILED TEST KURALI

P0 test fail ise ilgili task:

```text
DONE
```

olarak kalmamalıdır.

Gerekirse yeniden:

```text
IN_PROGRESS
```

durumuna alınır.

---

# 177. REGRESSION TEST

Kritik bug bulunursa:

1. bug reproduce edilir,
2. yeni test eklenir,
3. fix yapılır,
4. test PASS olmalıdır.

---

# 178. PILOT READY TANIMI

Pilot ready:

> test senaryolarının çoğu çalışıyor

değildir.

Minimum:

```text
P0 testler PASS
+
no BLOCKER
+
no CRITICAL
+
deployed happy path PASS
```

gereklidir.

---

# 179. SOURCE OF TRUTH

Test expectation konusunda öncelik:

```text
MASTER_SPEC.md
↓
WORKFLOW_STATE_MACHINE.md
↓
AUTH_ROLES_PERMISSIONS.md
↓
API_CONTRACT.md
↓
QUALITY_GATES.md
↓
TEST_SCENARIOS.md
```

---

# 180. SON KURAL

Bu test dosyasının amacı:

> yalnızca kodun hata vermediğini göstermek

değildir.

Amaç:

> sağlık ekibinin tanımladığı gerçek raporlama sürecinin doğru kullanıcı, doğru Study, doğru lock, doğru rapor versionı ve doğru entegrasyon sonucuyla güvenli şekilde çalıştığını kanıtlamaktır.