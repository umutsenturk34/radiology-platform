# DATA_MODEL.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Veri Modeli Spesifikasyonu

> **Doküman Türü:** Database / Domain Data Model  
> **Üst Referanslar:** `MASTER_SPEC.md`, `ARCHITECTURE.md`, `WORKFLOW_STATE_MACHINE.md`  
> **Database:** PostgreSQL  
> **ORM:** Prisma  
> **Ana Operasyon Nesnesi:** Study / Tetkik  
> **Temel Prensip:** Klinik ve operasyonel geçmiş mümkün olduğunca silinmez, versiyonlanır veya audit edilir.

---

# 1. DOKÜMANIN AMACI

Bu doküman platformun kalıcı veri modelini tanımlar.

Amaç:

- backend ve frontend'in aynı domain kavramlarını kullanması,
- Prisma modellerinin kontrollü oluşturulması,
- ilişkilerin baştan netleştirilmesi,
- veri tekrarının azaltılması,
- rapor geçmişinin korunması,
- audit edilebilirliğin sağlanması,
- çok hastaneli yapının desteklenmesi,
- gerçek hastane entegrasyonlarının core veri modelini bozmamasıdır.

Bu dosyada belirtilen veri modeli pilot için gerekli minimum yapıyı ve ileride büyümeyi destekleyecek temel ilişkileri içerir.

---

# 2. TEMEL DOMAIN HİYERARŞİSİ

Ana ilişki:

```text
Hospital
   │
   ├── Users
   │
   └── Patients
          │
          └── Studies
                 │
                 ├── Clinical Data
                 ├── PACS References
                 ├── Dictations
                 ├── Reports
                 │      └── Report Versions
                 ├── Assignments
                 ├── Status History
                 ├── Information Notes
                 ├── Revisions
                 ├── Addendums
                 ├── HBYS Deliveries
                 ├── Special Lists
                 └── Audit Logs
```

Bir Patient birden fazla Study içerebilir.

Her Study ayrı raporlama işi olarak takip edilir.

---

# 3. GLOBAL ID STRATEJİSİ

Tüm ana entity'lerde internal primary key kullanılmalıdır.

Öneri:

> UUID

Örnek:

```text
id: UUID
```

Avantaj:

- farklı sistemlerden gelen external ID'lerden bağımsızlık,
- distributed sistemlere hazırlık,
- ID tahmin edilebilirliğinin azaltılması.

External sistem ID'leri primary key olarak kullanılmamalıdır.

---

# 4. ORTAK TIMESTAMP ALANLARI

Çoğu entity aşağıdaki alanlara sahip olmalıdır:

```text
createdAt
updatedAt
```

Gerekli entity'lerde ayrıca:

```text
deletedAt
```

bulunabilir.

Ancak klinik kritik kayıtların hard delete edilmesi normal işlem olmamalıdır.

---

# 5. ENUM: USER ROLE

```ts
enum UserRole {
  DOCTOR
  REPORTER
  OPERATION
  MANAGER
}
```

İleride gerekirse:

```text
EXTERNAL_PHYSICIAN
SYSTEM
```

gibi roller eklenebilir.

Pilot ana rolleri dört tanedir.

---

# 6. ENUM: USER STATUS

```ts
enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}
```

Kullanıcı silmek yerine inactive yapılması tercih edilmelidir.

---

# 7. USER

Sistem kullanıcıları.

Önerilen alanlar:

```text
User
----
id
email
username
passwordHash
firstName
lastName
role
status

lastLoginAt

createdAt
updatedAt
```

Not:

Gerçek production ortamında sağlık personelinin kimlik bilgileri entegrasyona göre genişletilebilir.

Pilot için minimum alanlar yeterlidir.

---

# 8. USER HOSPITAL ACCESS

Bir kullanıcı bir veya birden fazla hastaneye erişebilir.

Many-to-many ilişki:

```text
UserHospitalAccess
------------------
id
userId
hospitalId
createdAt
createdBy
```

Unique constraint:

```text
(userId, hospitalId)
```

aynı kullanıcı-hastane ilişkisi iki kez oluşturulmamalıdır.

---

# 9. HOSPITAL

Hastane tanımı.

```text
Hospital
--------
id
code
name
shortName

status

timezone

integrationKey

createdAt
updatedAt
```

Önerilen unique:

```text
code
```

Her hastane core sistem içerisinde internal UUID ile temsil edilir.

---

# 10. HOSPITAL STATUS

```ts
enum HospitalStatus {
  ACTIVE
  INACTIVE
  TEST
}
```

Pilot test hastanesi:

```text
status = TEST
```

olabilir.

---

# 11. HOSPITAL INTEGRATION CONFIG

Hastane entegrasyon ayarları doğrudan Hospital tablosuna yığılmamalıdır.

Ayrı yapı:

```text
HospitalIntegrationConfig
-------------------------
id
hospitalId

hl7AdapterType
pacsAdapterType
hbysAdapterType

configEncrypted
enabled

createdAt
updatedAt
```

Secret değerler mümkünse environment/secret manager üzerinden yönetilmelidir.

Database içerisinde secret tutulacaksa encrypted olmalıdır.

---

# 12. PATIENT

Hasta entity'si Study'den ayrıdır.

```text
Patient
-------
id
hospitalId

externalPatientId
nationalIdMasked

firstName
lastName

birthDate
gender

anonymousCode

createdAt
updatedAt
```

Pilot ortamda:

> gerçek hasta verisi kullanılmamalıdır.

---

# 13. PATIENT EXTERNAL ID

Hastane HBYS tarafından gelen hasta kimliği:

```text
externalPatientId
```

olarak tutulabilir.

Aynı externalPatientId farklı hastanelerde bulunabilir.

Bu nedenle unique gerekiyorsa:

```text
(hospitalId, externalPatientId)
```

context'inde değerlendirilmelidir.

---

# 14. PATIENT ANONYMIZATION

İleride anonimleştirme aktif edilirse:

```text
anonymousCode
```

kullanılabilir.

Örnek:

```text
ADM-4F72K9
```

Bu alan gerçek isimden türetilmemelidir.

Pilot için zorunlu değildir.

---

# 15. STUDY

Sistemin temel operasyon entity'sidir.

```text
Study
-----
id

hospitalId
patientId

accessionNumber

externalOrderId
externalProtocolId

modality
studyDescription

category
status

studyInstanceUid

firstHl7ReceivedAt
secondHl7ReceivedAt

arrivalAt
slaDeadlineAt

imagesAvailableAt

assignedDoctorId
assignedReporterId

readingStartedAt
readingCompletedAt

transcriptionStartedAt
transcriptionCompletedAt

finalizedAt

createdAt
updatedAt
```

---

# 16. STUDY UNIQUE CONSTRAINT

Ana deduplication kuralı:

```text
hospitalId + accessionNumber
```

olmalıdır.

Prisma mantığında:

```text
@@unique([hospitalId, accessionNumber])
```

önerilir.

Accession Number farklı hastanelerde aynı olabilir.

Bu nedenle accessionNumber global unique olmamalıdır.

---

# 17. PATIENT CATEGORY

```ts
enum PatientCategory {
  ACIL
  YOGUN_BAKIM
  YATAN
  NORMAL
}
```

Kategori HBYS'den gelen değerin normalized karşılığıdır.

Kategori ile workflow status ayrı kavramlardır.

---

# 18. STUDY STATUS

`WORKFLOW_STATE_MACHINE.md` ile aynı enum kullanılmalıdır.

```ts
enum StudyStatus {
  INITIAL
  WAITING_ACCEPTANCE
  IMAGES_PENDING

  UNREAD
  READING
  READ

  WAITING_TRANSCRIPTION
  TRANSCRIBING
  WAITING_APPROVAL

  FINAL

  HBYS_PENDING
  HBYS_SENT
  HBYS_FAILED

  IMAGE_MISSING
  WONT_REPORT
  HOSPITAL_DOCTOR

  REVISION_REQUESTED
  REVISION_IN_PROGRESS

  ADDENDUM_REQUIRED
}
```

Bu enum shared package üzerinden frontend/backend arasında ortak tutulmalıdır.

---

# 19. STUDY INDEXLERİ

Yoğun kullanılan sorgular için en az aşağıdaki indexler değerlendirilmelidir:

```text
hospitalId
status
category
arrivalAt
slaDeadlineAt
assignedDoctorId
assignedReporterId
```

Composite örnek:

```text
(hospitalId, status, arrivalAt)
```

FIFO havuz sorguları için yararlıdır.

---

# 20. STUDY STATUS HISTORY

Her status değişikliği ayrı kayda alınmalıdır.

```text
StudyStatusHistory
------------------
id
studyId

fromStatus
toStatus

actorUserId
actorRole

reason
metadata

createdAt
```

Bu tablo:

- workflow geçmişi,
- performans analizi,
- hata araştırması,
- manager süre analizi

için kullanılacaktır.

---

# 21. ASSIGNMENT

Doctor ve Reporter assignment geçmişinin kaybolmaması için ayrı model önerilir.

```text
StudyAssignment
---------------
id
studyId
userId

type

assignedAt
releasedAt

assignedBy

reason

createdAt
```

Enum:

```ts
enum AssignmentType {
  DOCTOR
  REPORTER
}
```

Study üzerindeki:

```text
assignedDoctorId
assignedReporterId
```

alanları hızlı current-state sorgusu için kullanılabilir.

`StudyAssignment` ise geçmiş kaydıdır.

---

# 22. INTERNAL LOCK

Aktif internal lock'un source of truth'u Redis olacaktır.

Bu nedenle normal durumda PostgreSQL içerisinde aktif `StudyLock` tablosu zorunlu değildir.

Redis key:

```text
lock:study:{studyId}
```

Değer:

```text
userId
role
sessionId
lockedAt
```

Lock olayları ise Audit Log içerisinde saklanacaktır.

---

# 23. EXTERNAL LOCK

Hastane doktorunun HBYS tarafında dosyayı alması ephemeral bir browser lock değildir.

Bu nedenle persistence gerektirir.

Model:

```text
ExternalStudyLock
-----------------
id
studyId

source
externalUserReference

status

lockedAt
releasedAt

rawReference

createdAt
updatedAt
```

---

# 24. EXTERNAL LOCK STATUS

```ts
enum ExternalLockStatus {
  ACTIVE
  RELEASED
  CONFLICT
}
```

External lock conflict otomatik olarak sessizce override edilmemelidir.

---

# 25. PACS STUDY REFERENCE

PACS metadata Study'den ayrıştırılabilir.

```text
PacsStudyReference
------------------
id
studyId

studyInstanceUid
externalPacsId
viewerReference

availabilityStatus

lastCheckedAt

createdAt
updatedAt
```

---

# 26. PACS SERIES

Seri bilgileri:

```text
PacsSeries
----------
id
pacsStudyReferenceId

seriesInstanceUid
seriesNumber
seriesDescription

modality
imageCount

createdAt
updatedAt
```

Örnek:

```text
Parankim
Mediasten
Kemik
```

---

# 27. IMAGE AVAILABILITY STATUS

```ts
enum ImageAvailabilityStatus {
  UNKNOWN
  PENDING
  AVAILABLE
  PARTIAL
  ERROR
}
```

Bu status `StudyStatus.IMAGE_MISSING` ile aynı değildir.

PACS teknik availability ile hekim tarafından işaretlenen klinik imaj eksikliği ayrılmalıdır.

---

# 28. CLINICAL DATA

Hastane tarafından gelen klinik bilgiler değişken olabileceğinden esnek model gerekir.

Temel alanlar:

```text
ClinicalData
------------
id
studyId

preDiagnosis
requestReason
patientComplaint
previousStudyInfo
requestingPhysician
department

additionalData

createdAt
updatedAt
```

`additionalData` JSONB olabilir.

---

# 29. CLINICAL DATA JSON

Farklı hastaneler farklı klinik alanlar gönderebilir.

Bu nedenle:

```text
additionalData JSONB
```

uygundur.

Ancak sık kullanılan ana alanlar JSON içine gömülmemeli, ayrı kolon olarak tutulmalıdır.

---

# 30. DICTATION

Hekimin sesli diktesi.

```text
Dictation
---------
id
studyId
doctorId

storageKey
mimeType
fileSize
durationMs

checksum

status

startedAt
completedAt
uploadedAt

createdAt
updatedAt
```

---

# 31. DICTATION STATUS

```ts
enum DictationStatus {
  RECORDING
  UPLOADING
  COMPLETED
  FAILED
}
```

Study `READ` durumuna geçmeden önce en az bir geçerli `COMPLETED` dictation bulunmalıdır.

---

# 32. DICTATION STORAGE

Ses binary database içinde tutulmaz.

Database:

```text
storageKey
```

tutar.

Actual file:

> S3-compatible Object Storage

içerisindedir.

---

# 33. MULTIPLE DICTATIONS

Bir Study gerektiğinde birden fazla ses kaydı içerebilir.

Bu nedenle ilişki:

```text
Study 1
→ many Dictations
```

olmalıdır.

Ancak pilot happy path'te bir ana dikte yeterlidir.

---

# 34. REPORT

Study için rapor container entity'si.

```text
Report
------
id
studyId

status
currentVersionId

createdAt
updatedAt
finalizedAt
```

Normal durumda bir Study'nin bir ana Report kaydı bulunur.

---

# 35. REPORT UNIQUE

Pilot için:

```text
studyId
```

Report üzerinde unique olabilir.

Çünkü versionlar ayrı `ReportVersion` entity'sinde tutulacaktır.

Addendum ayrı entity olarak tutulabilir.

---

# 36. REPORT STATUS

```ts
enum ReportStatus {
  DRAFT
  COMPLETED
  WAITING_APPROVAL
  FINAL
  REVISION_DRAFT
  SUPERSEDED
}
```

Study status ile Report status aynı değildir.

---

# 37. REPORT VERSION

Rapor geçmişinin esas kaydıdır.

```text
ReportVersion
-------------
id
reportId

versionNumber

content

source

status

createdBy
createdAt

completedAt
finalizedAt

revisionReason

supersedesVersionId
```

---

# 38. REPORT VERSION UNIQUE

Aynı Report içerisinde:

```text
(reportId, versionNumber)
```

unique olmalıdır.

Örnek:

```text
Report A
- Version 1
- Version 2
- Version 3
```

---

# 39. REPORT SOURCE

```ts
enum ReportSource {
  REPORTER
  MANUAL
  AI_DRAFT
  AI_ASSISTED
}
```

Pilot ilk sürümde:

```text
REPORTER
MANUAL
```

kullanılması yeterlidir.

AI değerleri gelecek uyumluluğu içindir.

---

# 40. REPORT VERSION IMMUTABILITY

Final edilmiş ReportVersion doğrudan overwrite edilmemelidir.

Revizyon gerektiğinde yeni version oluşturulmalıdır.

Yanlış:

```text
Version 1 FINAL
→ content UPDATE
```

Doğru:

```text
Version 1 FINAL
Version 2 REVISION_DRAFT
```

---

# 41. REPORT CURRENT VERSION

Report entity'sindeki:

```text
currentVersionId
```

aktif sürümü hızlı bulmak için kullanılabilir.

Bu pointer eski sürümlerin silinmesi anlamına gelmez.

---

# 42. REVISION REQUEST

Revizyon talebi ayrı entity olmalıdır.

```text
RevisionRequest
---------------
id
studyId
reportId

requestedByUserId

source

reason
details

status

originalReportVersionId

requestedAt
startedAt
completedAt

createdAt
updatedAt
```

---

# 43. REVISION SOURCE

```ts
enum RevisionSource {
  INTERNAL
  MANAGER
  OPERATION
  EXTERNAL_PHYSICIAN
  HBYS
}
```

Acil hekimi revizyon portalı ileride:

```text
EXTERNAL_PHYSICIAN
```

kaynağını kullanabilir.

---

# 44. REVISION STATUS

```ts
enum RevisionStatus {
  REQUESTED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

Cancellation yapılırsa reason zorunlu olmalıdır.

---

# 45. ADDENDUM

İki ay sonrası ek rapor ayrı entity olarak tutulabilir.

```text
Addendum
--------
id
studyId
reportId

content

status

reason

createdBy
approvedBy

createdAt
approvedAt
sentAt
```

---

# 46. ADDENDUM STATUS

```ts
enum AddendumStatus {
  DRAFT
  WAITING_APPROVAL
  APPROVED
  WAITING_HBYS
  SENT
  FAILED
}
```

Addendum normal report version ile aynı şey değildir.

---

# 47. INFORMATION NOTE

Hasta/tetkik ek bilgi alanı.

```text
InformationNote
---------------
id
studyId

authorUserId
authorRole

currentContent

createdAt
updatedAt
```

Not hard delete edilmemelidir.

---

# 48. INFORMATION NOTE HISTORY

Not değişiklik geçmişi ayrı tutulmalıdır.

```text
InformationNoteVersion
----------------------
id
noteId

content

createdBy
createdAt
```

Bir not değiştirildiğinde eski içerik korunur.

---

# 49. INFORMATION NOTE DELETE

Normal uygulama:

> delete endpoint sunmamalıdır.

Gerekli hukuki/administrative durumlarda kayıt invalid/corrected olarak işaretlenebilir ancak geçmiş silinmemelidir.

---

# 50. SPECIAL LIST

Liste 1–6 yapılarını sabit kolon yapmak yerine ayrı entity önerilir.

```text
SpecialList
-----------
id
hospitalId

code
name
description

active

createdAt
updatedAt
```

Örnek:

```text
LIST_1
LIST_2
...
LIST_6
```

---

# 51. STUDY SPECIAL LIST

Many-to-many ilişki:

```text
StudySpecialList
----------------
id
studyId
specialListId

assignedBy
assignedAt

removedAt
```

Study'nin hasta kategorisi bu işlem nedeniyle değişmez.

---

# 52. IMAGE MISSING RECORD

IMAGE_MISSING durumunun gerekçesi ayrı kayıt ile saklanmalıdır.

```text
ImageMissingIncident
--------------------
id
studyId

reportedBy
reason

status

reportedAt
resolvedAt
resolvedBy

resolutionNote
```

---

# 53. IMAGE MISSING STATUS

```ts
enum IncidentStatus {
  OPEN
  RESOLVED
}
```

Study `IMAGE_MISSING → UNREAD` olduğunda incident:

```text
RESOLVED
```

yapılmalıdır.

---

# 54. WONT REPORT RECORD

Yazılmayacak kararı gerekçeli tutulmalıdır.

```text
WontReportRecord
----------------
id
studyId

reason
markedBy
markedAt

reactivatedBy
reactivatedAt
```

Study tekrar aktive edildiğinde eski karar silinmez.

---

# 55. HBYS DELIVERY

Her HBYS gönderim süreci ayrı entity olmalıdır.

```text
HbysDelivery
------------
id
studyId
reportVersionId

hospitalId

status

idempotencyKey

attemptCount

lastErrorCode
lastErrorMessage

externalReportId

queuedAt
sentAt
completedAt

createdAt
updatedAt
```

---

# 56. HBYS DELIVERY STATUS

```ts
enum HbysDeliveryStatus {
  PENDING
  PROCESSING
  SENT
  FAILED
}
```

---

# 57. HBYS DELIVERY ATTEMPT

Her retry ayrıca kaydedilmelidir.

```text
HbysDeliveryAttempt
-------------------
id
deliveryId

attemptNumber

startedAt
completedAt

status

httpStatus
errorCode
errorMessage

requestMetadata
responseMetadata
```

Sensitive data loglanmamalıdır.

---

# 58. HBYS IDEMPOTENCY KEY

Öneri:

```text
studyId + reportVersionId
```

veya deterministic unique identifier.

Aynı final version için istemeden duplicate delivery oluşmasını engellemelidir.

---

# 59. INTEGRATION EVENT

HL7/PACS/HBYS gibi sistemlerden gelen normalized eventlerin operasyonel kaydı tutulabilir.

```text
IntegrationEvent
----------------
id

hospitalId
studyId

source
eventType

externalMessageId

status

receivedAt
processedAt

payloadHash
metadata
```

Raw clinical payload'ın tamamının logs/database içerisinde tutulması zorunlu değildir.

---

# 60. INTEGRATION SOURCE

```ts
enum IntegrationSource {
  HL7
  PACS
  HBYS
  MOCK_HL7
  MOCK_PACS
  MOCK_HBYS
}
```

---

# 61. INTEGRATION EVENT STATUS

```ts
enum IntegrationEventStatus {
  RECEIVED
  PROCESSED
  FAILED
  DUPLICATE
}
```

---

# 62. NOTIFICATION

Realtime ve UI bildirim geçmişi için:

```text
Notification
------------
id

userId
hospitalId
studyId

type
title
message

priority

readAt

createdAt
```

---

# 63. NOTIFICATION TYPE

Örnek:

```ts
enum NotificationType {
  APPROVAL_WAITING
  SLA_WARNING
  SLA_OVERDUE
  HBYS_FAILED
  REVISION_REQUESTED
  INFORMATION_ADDED
  IMAGE_MISSING
  EXTERNAL_LOCK_CONFLICT
}
```

---

# 64. SLA CONFIGURATION

Sağlık ekibinin temel süreleri:

- Acil: 2 saat
- Yatan: 12 saat
- Normal: 24 saat

Sistem yöneticisinin bu iş kuralını keyfi olarak değiştirmemesi gerekmektedir.

Ancak kod içerisine magic number gömmek yerine config tablolarında tutulması teknik olarak daha güvenlidir.

Öneri:

```text
SlaPolicy
---------
id

category
durationMinutes
warningBeforeMinutes

active

createdAt
updatedAt
```

Seed:

```text
ACIL = 120
YATAN = 720
NORMAL = 1440
warningBeforeMinutes = 20
```

Yoğun bakım süresi kesinleştirilince ayrıca eklenir.

---

# 65. SLA POLICY DEĞİŞİKLİĞİ

SLA config teknik olarak database'de bulunabilir ancak normal manager UI üzerinden serbestçe değiştirilebilir olmamalıdır.

Değişiklik:

- kontrollü,
- auditli,
- yetkili teknik/config işlemi

olmalıdır.

---

# 66. STUDY SLA SNAPSHOT

Study oluşturulup SLA başladığında o anki policy sonucu Study üzerinde snapshot tutulmalıdır.

```text
arrivalAt
slaDeadlineAt
```

Böylece daha sonra policy değişirse geçmiş tetkiklerin deadline'ı değişmez.

---

# 67. AUDIT LOG

Sistemin kritik işlem geçmişi.

```text
AuditLog
--------
id

eventType

actorUserId
actorRole

hospitalId
patientId
studyId

entityType
entityId

metadata

ipAddress
userAgent

createdAt
```

---

# 68. AUDIT IMMUTABILITY

Audit log:

- update edilmemeli,
- normal delete edilmemeli,
- kullanıcı tarafından düzenlenememelidir.

Uygulama audit kayıtlarını append-only mantıkta kullanmalıdır.

---

# 69. AUDIT EVENT TYPE

Enum yerine string + controlled constants kullanılması ileride event genişletmesini kolaylaştırabilir.

Örnek:

```text
HL7_FIRST_RECEIVED
HL7_SECOND_RECEIVED
ACCESSION_MATCHED
IMAGES_AVAILABLE

DOCTOR_READING_STARTED
DICTATION_STARTED
DICTATION_COMPLETED

REPORTER_TRANSCRIPTION_STARTED
REPORT_COMPLETED

REPORT_FINALIZED

HBYS_SEND_ATTEMPT
HBYS_SENT
HBYS_FAILED
HBYS_RETRY

IMAGE_MISSING_REPORTED
IMAGE_MISSING_RESOLVED

STUDY_WONT_REPORT
STUDY_REACTIVATED

HOSPITAL_DOCTOR_ACQUIRED
HOSPITAL_DOCTOR_RELEASED

REVISION_REQUESTED
REVISION_COMPLETED

INFORMATION_NOTE_ADDED
INFORMATION_NOTE_UPDATED

LOCK_ACQUIRED
LOCK_RELEASED
LOCK_FORCE_RELEASED
```

---

# 70. USER SESSION

Refresh token/session yönetimi için ayrı model önerilir.

```text
UserSession
-----------
id
userId

refreshTokenHash

ipAddress
userAgent

expiresAt
revokedAt

createdAt
```

Refresh token plain text database'e yazılmamalıdır.

---

# 71. PASSWORD

`passwordHash` modern password hashing ile tutulmalıdır.

Plain password hiçbir zaman database'e yazılmaz.

Pilot seed kullanıcılarının default password'leri production'a taşınmamalıdır.

---

# 72. MANAGER STATISTICS

Manager istatistikleri için ilk etapta ayrı aggregate tablolar zorunlu değildir.

PostgreSQL sorguları üzerinden hesaplanabilir.

Örnek:

- doctor read count
- doctor average reading duration
- reporter report count
- reporter average transcription duration
- category totals
- HBYS failed count

Sistem büyüdüğünde materialized view veya aggregate tablolar eklenebilir.

---

# 73. MONTHLY COMPENSATION

Hakediş için başlangıç modeli:

```text
MonthlyCompensationSummary
--------------------------
id

userId
year
month

doctorStudyCount
reporterStudyCount

emergencyCount
icuCount
inpatientCount
normalCount

calculatedAmount

calculationMetadata

createdAt
updatedAt
```

Pilot ilk sürümde:

> calculatedAmount

zorunlu olmayabilir.

Sayaçlar yeterli olabilir.

---

# 74. HAKEDİŞ FORMÜLÜ

Sağlık ekibi kesin finansal formülü tanımlamamıştır.

Bu nedenle AI geliştirici hakediş tutarı formülü uydurmamalıdır.

Pilot:

- kullanıcı bazlı sayı,
- kategori bazlı sayı,
- dönem

gösterebilir.

Gerçek tutar formülü:

> BLOCKED_SPEC

olarak kabul edilir ve ayrıca tanımlanır.

---

# 75. EXTERNAL REVISION PORTAL ACCESS

Acil hekimi revizyon portalında tam internal User hesabı zorunlu olmayabilir.

Gelecek model:

```text
ExternalAccessToken
-------------------
id

hospitalId
studyId

tokenHash

purpose

expiresAt
usedAt

createdAt
```

Bu model kısa süreli güvenli link oluşturmak için kullanılabilir.

Pilot ilk ana workflow için zorunlu değildir.

---

# 76. DEV TOOLS CONFIG

Pilot test davranışları için:

```text
PilotConfig
-----------
id

mockHbysMode
acceleratedSlaEnabled
acceleratedSlaMinutes
acceleratedWarningMinutes

createdAt
updatedAt
```

Alternatif olarak environment config kullanılabilir.

Bu ayarlar production'da kapalı olmalıdır.

---

# 77. MOCK HBYS MODE

```ts
enum MockHbysMode {
  SUCCESS
  FAIL
  TIMEOUT
}
```

Pilot test paneli bu değeri değiştirebilir.

---

# 78. DATA DELETION PRENSİBİ

Aşağıdakiler normal kullanıcı işlemiyle hard delete edilmemelidir:

- Study
- Report
- ReportVersion
- Dictation metadata
- InformationNote history
- AuditLog
- HbysDelivery
- RevisionRequest
- StatusHistory

Yanlış oluşturulmuş test verileri development ortamında temizlenebilir.

Production politikası ayrıca tanımlanmalıdır.

---

# 79. SOFT DELETE

Soft delete gerekiyorsa:

```text
deletedAt
```

kullanılabilir.

Ancak soft delete her tabloda otomatik olarak kullanılmamalıdır.

Kritik klinik kayıtlarda deletion yerine:

```text
inactive
cancelled
superseded
```

durumları tercih edilmelidir.

---

# 80. PRISMA RELATION PRENSİBİ

İlişkiler mümkün olduğunca açık tanımlanmalıdır.

Örnek:

```text
Hospital
  has many Patients

Patient
  has many Studies

Study
  has many Dictations

Study
  has one Report

Report
  has many ReportVersions

Study
  has many HbysDeliveries

Study
  has many AuditLogs
```

---

# 81. CASCADE DELETE

Production klinik modellerde aggressive cascade delete kullanılmamalıdır.

Özellikle:

```text
Patient delete
→ Study delete
→ Report delete
```

gibi zincirler tehlikelidir.

Silme davranışı explicit olmalıdır.

---

# 82. TRANSACTION BOUNDARIES

Aşağıdaki işlemler database transaction kullanmalıdır.

## Finalization

```text
ReportVersion FINAL
+
Report FINAL
+
Study FINAL
+
Audit
```

## Reporter Completion

```text
ReportVersion COMPLETED
+
Study WAITING_APPROVAL
+
StatusHistory
+
Audit
```

## Revision

```text
RevisionRequest update
+
new ReportVersion
+
Study status
+
Audit
```

---

# 83. REDIS VE DATABASE AYRIMI

Redis'te tutulabilecek:

- active lock
- heartbeat
- queue data
- ephemeral cache

PostgreSQL'de tutulması gereken:

- clinical workflow state
- reports
- users
- assignments
- audit
- revisions
- delivery history

Kritik veri yalnızca Redis'te tutulmamalıdır.

---

# 84. OBJECT STORAGE AYRIMI

Object Storage:

- audio
- ileride attachment

içindir.

PostgreSQL:

- storage metadata

tutar.

PACS görüntüleri platformun object storage alanına normal akışta kopyalanmaz.

---

# 85. DATA MODEL PILOT MINIMUM

5 günlük pilot için minimum zorunlu modeller:

```text
User
UserSession
Hospital
UserHospitalAccess

Patient
Study
StudyStatusHistory
StudyAssignment

ClinicalData

Dictation

Report
ReportVersion

InformationNote
InformationNoteVersion

HbysDelivery
HbysDeliveryAttempt

AuditLog

SlaPolicy

ExternalStudyLock
```

Sonraki faza bırakılabilecek:

```text
MonthlyCompensationSummary
ExternalAccessToken
Addendum
PacsSeries persistence
gelişmiş IntegrationEvent
```

Ancak mimari bunların eklenmesini engellememelidir.

---

# 86. PILOT SEED DATA

Seed en az şunları oluşturmalıdır:

```text
1 TEST Hospital

1 Doctor
1 Reporter
1 Operation
1 Manager
```

Örnek:

```text
doctor@test.local
reporter@test.local
operation@test.local
manager@test.local
```

Ayrıca:

```text
SLA policies
special lists
pilot configuration
```

oluşturulabilir.

---

# 87. TEST PATIENT DATA

Seed gerçek kişiye benzeyen ama açıkça fictitious data üretmelidir.

Örnek isim:

```text
Test Patient 001
```

Tercihen gerçek TC kimlik numarası formatında gerçek kişiye ait değer kullanılmamalıdır.

---

# 88. SHARED ENUM KURALI

Aşağıdaki enumlar backend ve frontend tarafından ayrı ayrı tekrar yazılmamalıdır:

```text
UserRole
UserStatus
PatientCategory
StudyStatus
ReportStatus
ReportSource
DictationStatus
HbysDeliveryStatus
RevisionStatus
NotificationType
```

`packages/shared` içerisinden kullanılmalıdır.

---

# 89. DATABASE SOURCE OF TRUTH

Study workflow için:

> PostgreSQL Study.status

kalıcı source of truth'tur.

Redis lock yalnızca aktif çalışma sahipliğini belirtir.

Frontend local state source of truth değildir.

---

# 90. DATA CONSISTENCY INVARIANTS

Sistem her zaman aşağıdaki kuralları korumalıdır:

1. Study'nin Hospital'ı bulunmalıdır.
2. Study'nin Patient'ı bulunmalıdır.
3. Study accessionNumber içermelidir.
4. Aynı hastane içinde accessionNumber duplicate olmamalıdır.
5. `READING` Study'nin Doctor assignment'ı bulunmalıdır.
6. `TRANSCRIBING` Study'nin Reporter assignment'ı bulunmalıdır.
7. `WAITING_APPROVAL` Study için completed report version bulunmalıdır.
8. `FINAL` Study için final report version bulunmalıdır.
9. `HBYS_SENT` Study için başarılı HBYS delivery bulunmalıdır.
10. Final ReportVersion overwrite edilmemelidir.
11. Revizyon eski version'ı silmemelidir.
12. Information geçmişi silinmemelidir.
13. Audit kayıtları değiştirilmemelidir.

---

# 91. NULLABLE FIELD PRENSİBİ

Alanlar workflow aşamasına göre nullable olabilir.

Örneğin:

İlk HL7 anında:

```text
studyInstanceUid = null
assignedDoctorId = null
finalizedAt = null
```

normaldir.

Prisma schema her alanı gereksiz şekilde required yapmamalıdır.

Ancak business validation WorkflowService tarafından yapılmalıdır.

---

# 92. JSONB KULLANIMI

JSONB sadece değişken external metadata için kullanılmalıdır.

Uygun:

```text
ClinicalData.additionalData
AuditLog.metadata
IntegrationEvent.metadata
```

Uygun değil:

```text
Report content
Study status
User role
```

Ana iş alanları typed kolon olmalıdır.

---

# 93. RAW HL7 DATA

Pilot aşamada debugging için raw mock payload tutulabilir.

Gerçek production ortamında raw HL7 saklama:

- veri güvenliği,
- KVKK,
- log politikası

açısından ayrıca değerlendirilmelidir.

Core model raw payload'a bağımlı olmamalıdır.

---

# 94. DATABASE MIGRATION KURALI

Prisma schema değiştiğinde migration oluşturulmalıdır.

Normal geliştirme:

```text
schema.prisma değiştir
↓
migration oluştur
↓
migration test et
↓
commit
```

Pilot database'i manuel değiştirmek kalıcı geliştirme yöntemi değildir.

---

# 95. DEVELOPMENT RESET

Development/test environment için database reset script bulunabilir.

Production'da:

> database reset endpoint veya script otomatik çalışmamalıdır.

---

# 96. QUERY PATTERNS

Sistemde en sık sorgulardan bazıları:

## Doctor Pool

```text
hospital IN authorizedHospitals
AND status = UNREAD
ORDER BY arrivalAt ASC
```

## Reporter Pool

```text
hospital IN authorizedHospitals
AND status = WAITING_TRANSCRIPTION
ORDER BY arrivalAt ASC
```

## Approval Pool

```text
assignedDoctorId = currentDoctor
AND status = WAITING_APPROVAL
```

## HBYS Failures

```text
status = HBYS_FAILED
```

## SLA Risk

```text
slaDeadlineAt <= threshold
AND status NOT completed
```

Indexler bu sorguları desteklemelidir.

---

# 97. MULTI-HOSPITAL SECURITY

Her Study:

```text
hospitalId
```

taşıdığı için backend sorgularında hospital scope uygulanmalıdır.

Örnek tehlikeli:

```text
findStudyById(id)
```

tek başına kullanılıp sonra response verilmemelidir.

Authorization katmanı:

```text
Study.hospitalId
∈
User.authorizedHospitalIds
```

kontrol etmelidir.

---

# 98. DATA MODEL VE API

API hiçbir zaman Prisma modelini olduğu gibi dışarı vermek zorunda değildir.

Database entity:

```text
User.passwordHash
```

içerebilir.

API response:

```text
passwordHash
```

asla içermez.

DTO / API model ayrı düşünülmelidir.

---

# 99. DATA MODEL VE FRONTEND

Frontend database relation detaylarını bilmek zorunda değildir.

Frontend:

```text
StudyDetailResponse
```

gibi API DTO'ları kullanır.

Database schema frontend contract değildir.

---

# 100. AI AGENT KURALI

Claude veri modeli üzerinde değişiklik yapmak isterse:

1. `MASTER_SPEC.md` kontrol edilir.
2. `WORKFLOW_STATE_MACHINE.md` kontrol edilir.
3. `DATA_MODEL.md` güncellenir.
4. Prisma schema değiştirilir.
5. Migration oluşturulur.
6. Testler yazılır/güncellenir.

Claude business rule uydurarak yeni klinik alan veya ilişki eklememelidir.

---

# 101. MODEL DEĞİŞİKLİĞİ VE CODEX

Codex frontend ihtiyacı nedeniyle database modelini doğrudan değiştirmemelidir.

Frontend yeni veri isterse:

1. API ihtiyacı tanımlanır.
2. `API_CONTRACT.md` güncellenir.
3. Gerekirse backend/data model değişikliği yapılır.
4. Frontend yeni contract'ı kullanır.

---

# 102. PILOT DATA MODEL ACCEPTANCE

Pilot veri modeli tamamlanmış sayılmak için en az şu senaryo database üzerinde sorunsuz çalışmalıdır:

```text
Hospital oluştur

↓
Patient oluştur

↓
Study oluştur

↓
İlk / ikinci HL7 metadata

↓
Study UNREAD

↓
Doctor assignment

↓
Dictation

↓
Reporter assignment

↓
Report

↓
ReportVersion

↓
Doctor Final

↓
HBYS Delivery

↓
HBYS SENT

↓
Audit / Status History
```

ve ayrıca:

```text
Final Report
↓
Revision Request
↓
New Report Version
```

eski sürümü silmeden oluşturulabilmelidir.

---

# 103. SON KURAL

Veri modeli:

> mevcut ekran tasarımına göre değil, doğrulanmış domain ve workflow'a göre

tasarlanmalıdır.

Frontend'de yeni bir sekme oluşturulması yeni database tablosu gerektirdiği anlamına gelmez.

Havuzlar mümkün olduğunca:

> Study status + category + assignment + metadata

üzerinden türetilmelidir.

Bu dosya PostgreSQL ve Prisma veri modeli için ana teknik referanstır.