# INTEGRATIONS.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Entegrasyon Mimarisi

> **Doküman Türü:** External Integrations Spesifikasyonu  
> **Üst Referanslar:** `MASTER_SPEC.md`, `ARCHITECTURE.md`, `WORKFLOW_STATE_MACHINE.md`, `DATA_MODEL.md`, `API_CONTRACT.md`, `AUTH_ROLES_PERMISSIONS.md`  
> **Ana Entegrasyonlar:** HL7, PACS/DICOM, HBYS, External Hospital Doctor Lock  
> **Pilot Yaklaşım:** Mock / Test Adapter  
> **Production Yaklaşım:** Hospital-Specific Adapter  
> **Temel Prensip:** Core workflow hiçbir hastanenin özel protokolüne doğrudan bağımlı olmayacaktır.

---

# 1. DOKÜMANIN AMACI

Bu doküman dış sistemlerle entegrasyon mimarisini tanımlar.

Amaç:

- HL7 mesajlarının core sisteme nasıl gireceği,
- Accession Number eşleşmesinin nasıl uygulanacağı,
- PACS görüntülerinin nasıl ilişkilendirileceği,
- HBYS rapor gönderiminin nasıl yapılacağı,
- retry ve hata yönetiminin nasıl çalışacağı,
- hastane doktoru lock event'lerinin nasıl normalize edileceği,
- pilot mock entegrasyonlarla gerçek hastane adapterlarının aynı core workflow'u kullanması

kurallarını belirlemektir.

---

# 2. ANA ENTEGRASYON PRENSİBİ

Core system hiçbir zaman doğrudan:

```text id="awjmod"
Hospital A SOAP request
Hospital B HL7 custom segment
Hospital C proprietary JSON
```

gibi özel formatlarla çalışmamalıdır.

Doğru akış:

```text id="it4hmt"
Hospital Specific Payload
        ↓
Hospital Adapter
        ↓
Normalized Internal Model
        ↓
Core Workflow
```

---

# 3. ADAPTER ARCHITECTURE

Temel adapter grupları:

```text id="xmczui"
HL7 Adapter
PACS Adapter
HBYS Adapter
External Lock Adapter
```

Her hastane gerektiğinde kendi implementasyonuna sahip olabilir.

Örnek:

```text id="aw8z60"
MockHl7Adapter
HospitalAHl7Adapter
HospitalBHl7Adapter

OrthancPacsAdapter
HospitalAPacsAdapter

MockHbysAdapter
HospitalAHbysAdapter
HospitalBHbysAdapter
```

---

# 4. INTEGRATION REGISTRY

Backend, hastaneye göre doğru adapter'ı seçebilmelidir.

Kavramsal örnek:

```ts id="d8gpip"
integrationRegistry.getHl7Adapter(hospitalId)
integrationRegistry.getPacsAdapter(hospitalId)
integrationRegistry.getHbysAdapter(hospitalId)
```

Hospital-specific logic controller veya workflow service içine dağılmamalıdır.

---

# 5. NORMALIZED EVENT PRENSİBİ

Core service'ler dış sistemin ham payload'ını değil normalized DTO'yu kullanmalıdır.

Örnek:

```text id="1kjlz1"
Raw HL7
↓
HL7 Adapter
↓
NormalizedHl7Message
↓
Study Workflow
```

---

# 6. HL7 ENTEGRASYONUNUN AMACI

HL7 entegrasyonunun temel görevleri:

- ilk istem/randevu bilgisini almak,
- hasta/tetkik kaydı oluşturmak,
- ikinci kabul bilgisini almak,
- aynı Study ile eşleştirmek,
- hasta kategorisini normalize etmek,
- gerekli klinik bilgileri aktarmak,
- audit/integration event üretmek.

---

# 7. FIRST HL7 EVENT

İlk HL7 event:

> hasta/tetkik için ilk sistem kaydını oluşturur.

Normalized event örneği:

```ts id="fkfeqq"
interface NormalizedHl7FirstEvent {
  eventType: "FIRST_ORDER";

  hospitalId: string;

  externalMessageId?: string;

  patient: {
    externalPatientId: string;
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    gender?: string;
  };

  study: {
    accessionNumber: string;
    externalOrderId?: string;
    externalProtocolId?: string;
    studyDescription?: string;
    modality?: string;
    category: PatientCategory;
  };

  clinicalData?: Record<string, unknown>;

  receivedAt: string;
}
```

---

# 8. FIRST HL7 PROCESSING

Core processing:

```text id="cwoou0"
FIRST HL7
↓
validate
↓
normalize
↓
hospital + accession check
↓
patient find/create
↓
Study create
↓
INITIAL
↓
WAITING_ACCEPTANCE
```

Audit:

```text id="chjmeu"
HL7_FIRST_RECEIVED
STUDY_CREATED
```

---

# 9. SECOND HL7 EVENT

İkinci HL7:

> tetkik kabul edildi

bilgisini taşır.

Normalized örnek:

```ts id="k9wj7v"
interface NormalizedHl7SecondEvent {
  eventType: "STUDY_ACCEPTED";

  hospitalId: string;

  externalMessageId?: string;

  externalPatientId?: string;

  accessionNumber: string;

  acceptedAt: string;

  clinicalData?: Record<string, unknown>;
}
```

---

# 10. HL7 EŞLEŞTİRME KURALI

Sağlık ekibinin kesin cevabı:

> Ana eşleştirme alanı Accession Number olacaktır.

Core unique context:

```text id="zc4vmi"
hospitalId + accessionNumber
```

olacaktır.

Ek güvenlik için ikinci kontrol olarak:

- externalPatientId,
- orderId,
- protocolId

gibi alanlar karşılaştırılabilir.

---

# 11. HL7 MATCHING SAFETY

İkincil alanlar çelişiyorsa sistem otomatik olarak yanlış hastayı birleştirmemelidir.

Örnek:

```text id="rm7p8j"
Accession Number match ✓
Patient ID mismatch ✕
```

bu durumda:

> INTEGRATION_CONFLICT

oluşturulabilir.

Operation/Manager uyarısı üretilebilir.

Pilot ilk sürümde açık hata ile durmak veri yanlış eşleşmesinden daha güvenlidir.

---

# 12. HL7 DUPLICATE

Aynı external HL7 mesajı tekrar gelebilir.

Adapter mümkün olduğunda:

```text id="ubfo6g"
externalMessageId
```

kullanmalıdır.

Ayrıca Study deduplication:

```text id="exrmvg"
hospitalId + accessionNumber
```

üzerinden yapılmalıdır.

Duplicate event:

```text id="jibm9i"
PROCESSED
↓
aynı event tekrar geldi
↓
DUPLICATE
```

olarak işaretlenebilir.

---

# 13. HL7 IDEMPOTENCY

Aynı First HL7 iki kez geldiğinde:

- ikinci Patient oluşturulmamalı,
- ikinci Study oluşturulmamalı,
- state resetlenmemelidir.

Aynı Second HL7 iki kez geldiğinde:

- Study tekrar `WAITING_ACCEPTANCE` yapılmamalı,
- duplicate integration event olarak değerlendirilebilir.

---

# 14. HL7 CATEGORY NORMALIZATION

Hastaneler kategori değerlerini farklı kodlarla gönderebilir.

Adapter hastane kodunu internal enum'a çevirmelidir.

Internal:

```text id="prv3du"
ACIL
YOGUN_BAKIM
YATAN
NORMAL
```

Örnek:

```text id="exb4kn"
Hospital A: E
→ ACIL

Hospital B: EMERG
→ ACIL
```

Core workflow hospital-specific kodu bilmemelidir.

---

# 15. HL7 CLINICAL DATA

HL7/HBYS tarafından gelen klinik alanlar normalized hale getirilmelidir.

Örnek internal:

```text id="7m09ps"
preDiagnosis
requestReason
patientComplaint
requestingPhysician
department
additionalData
```

Hastaneye özgü ek alanlar:

```text id="45yb8b"
additionalData
```

içinde tutulabilir.

---

# 16. RAW HL7

Pilot ortamda debug amacıyla raw mock message tutulabilir.

Gerçek production ortamında raw HL7 retention:

- KVKK,
- PHI,
- log policy,
- storage policy

açısından ayrıca belirlenmelidir.

Raw HL7 core data modelin source of truth'u değildir.

---

# 17. HL7 ERROR TYPES

Örnek hata kodları:

```text id="wdtu6m"
HL7_INVALID_MESSAGE
HL7_REQUIRED_FIELD_MISSING
HL7_UNKNOWN_HOSPITAL
HL7_ACCESSION_CONFLICT
HL7_PATIENT_MISMATCH
HL7_DUPLICATE
HL7_PROCESSING_FAILED
```

---

# 18. PILOT MOCK HL7

Pilot ortamda gerçek HL7 server zorunlu değildir.

Mock HL7 API:

```text id="uvymw3"
/dev-tools/hl7/first
/dev-tools/hl7/second
```

kullanacaktır.

Ancak bu endpointler doğrudan Study status değiştirmemelidir.

Akış:

```text id="lmkcx6"
DevTools
↓
MockHl7Adapter
↓
Normalized Event
↓
Real HL7 Application Service
↓
Real Workflow
```

---

# 19. REAL HL7 TRANSPORT

Gerçek hastane entegrasyonunda transport hastaneye göre değişebilir.

Olası yöntemler:

- HL7 v2 MLLP
- HTTP endpoint
- REST wrapper
- vendor-specific middleware
- integration engine

Bu ayrıntı adapter içinde kalmalıdır.

Core workflow transport yöntemini bilmemelidir.

---

# 20. HL7 ACK

Gerçek HL7 v2 entegrasyonunda ACK/NACK ihtiyacı olabilir.

Adapter:

- accepted,
- rejected,
- processing error

sonucunu hastane sisteminin beklediği formatta dönebilmelidir.

Pilot mock adapter için gerçek HL7 ACK zorunlu değildir.

---

# 21. PACS ENTEGRASYONUNUN AMACI

PACS entegrasyonu:

- görüntülerin mevcut olup olmadığını kontrol etmek,
- Study UID'yi ilişkilendirmek,
- Series bilgilerini almak,
- viewer erişimini sağlamak,
- görüntü gönderim sorunlarını tespit etmek

için kullanılacaktır.

---

# 22. PACS DATA OWNERSHIP

DICOM görüntülerinin ana deposu:

> PACS

olmalıdır.

Raporlama platformu normal şartlarda PACS görüntülerinin tamamını kendi PostgreSQL veya object storage alanına kopyalamamalıdır.

Platform:

- Study Instance UID
- Series Instance UID
- viewer reference
- availability metadata

tutabilir.

---

# 23. PACS ADAPTER INTERFACE

Kavramsal interface:

```ts id="fdrsgn"
interface PacsAdapter {
  findStudy(input: PacsStudyLookup): Promise<PacsStudyResult>;

  listSeries(
    input: PacsSeriesLookup
  ): Promise<PacsSeriesResult[]>;

  getViewerAccess(
    input: PacsViewerRequest
  ): Promise<PacsViewerAccess>;

  checkAvailability(
    input: PacsStudyLookup
  ): Promise<PacsAvailabilityResult>;
}
```

---

# 24. PACS STUDY LOOKUP

Lookup öncelikle:

```text id="sz504y"
Accession Number
```

veya entegrasyon sonrası elde edilen:

```text id="vl4iq7"
Study Instance UID
```

ile yapılabilir.

Hastanenin PACS implementasyonuna göre adapter karar verir.

---

# 25. IMAGES AVAILABLE EVENT

PACS görüntüleri raporlamaya hazır olduğunda normalized event:

```text id="92o6it"
IMAGES_AVAILABLE
```

üretebilir.

Core:

```text id="ws7c5e"
IMAGES_PENDING
→ UNREAD
```

geçişini yapar.

---

# 26. IMAGE DELIVERY ISSUE

Sağlık ekibinin belirttiği önemli konu:

> Görüntü gönderildi / gönderilmedi aşamasında sorun olabilir.

Bu nedenle teknik PACS status ayrı takip edilmelidir.

Örnek:

```text id="yygf7a"
UNKNOWN
PENDING
AVAILABLE
PARTIAL
ERROR
```

---

# 27. PACS ERROR ≠ IMAGE_MISSING

Teknik PACS problemi:

```text id="mzbk1r"
PACS status = ERROR
```

ile klinik:

```text id="36lmxj"
StudyStatus = IMAGE_MISSING
```

aynı şey değildir.

`IMAGE_MISSING` hekim/operasyon workflow kararıdır.

PACS error ise teknik integration state'dir.

---

# 28. PACS OPERATION ALERT

Örneğin:

```text id="yuufh6"
Second HL7 received
↓
reasonable wait
↓
no images
↓
PACS availability error
↓
operation notification
```

oluşturulabilir.

Bu alarm doğrudan Study'yi yanlış state'e taşımamalıdır.

---

# 29. TEST PACS

Pilot ortamda:

> Orthanc

önerilir.

Orthanc:

- test DICOM depolama,
- DICOMweb entegrasyonu,
- Study/Series sorgulama

için kullanılabilir.

Gerekirse viewer olarak OHIF değerlendirilebilir.

---

# 30. ORTHANC ADAPTER

Pilot:

```text id="c08v5o"
OrthancPacsAdapter
```

kullanabilir.

Adapter Orthanc API detaylarını core sisteme sızdırmamalıdır.

Frontend:

> Orthanc internal credentials

görmemelidir.

---

# 31. PACS VIEWER ACCESS

Backend frontend'e:

```text id="gw270p"
viewerUrl
```

veya viewer launch metadata dönebilir.

Viewer URL gerekiyorsa kısa ömürlü veya güvenli erişim kullanılmalıdır.

---

# 32. PACS SERIES NORMALIZATION

Dış PACS:

```text id="q17s6i"
SeriesDescription
SeriesNumber
SeriesInstanceUID
Modality
```

alanlarını internal model haline dönüştürür.

Frontend:

```text id="m8eolu"
Parankim
Mediasten
Kemik
```

gibi isimleri bu metadata üzerinden gösterebilir.

---

# 33. HBYS ENTEGRASYONUNUN AMACI

HBYS entegrasyonu:

> final raporu hastanenin sistemine otomatik göndermek

içindir.

Final onaydan sonra raportörün yeniden işlem yapması beklenmez.

---

# 34. HBYS GÖNDERİM AKIŞI

```text id="0s6uod"
Doctor Final Approval
↓
ReportVersion FINAL
↓
HBYS Delivery created
↓
HBYS_PENDING
↓
BullMQ Job
↓
Hospital HBYS Adapter
↓
SUCCESS / FAIL / TIMEOUT
```

---

# 35. HBYS ASYNC KURALI

HBYS gönderimi HTTP finalization request'i içinde senkron olarak tamamlanmak zorunda değildir.

Doğru:

```text id="70il5b"
Finalize
↓
queue
↓
return HBYS_PENDING
↓
worker sends
```

Bu yaklaşım:

- timeout,
- retry,
- remote outage

senaryolarını daha güvenli yönetir.

---

# 36. HBYS ADAPTER INTERFACE

```ts id="vclj31"
interface HbysAdapter {
  sendReport(
    input: NormalizedHbysReport
  ): Promise<HbysDeliveryResult>;
}
```

Normalized payload:

```ts id="juxx7w"
interface NormalizedHbysReport {
  hospitalId: string;

  patient: {
    externalPatientId: string;
  };

  study: {
    accessionNumber: string;
  };

  report: {
    versionId: string;
    content: string;
    finalizedAt: string;
    finalizedByDoctorId: string;
  };

  idempotencyKey: string;
}
```

---

# 37. HBYS SUCCESS RESULT

```ts id="s00s1z"
interface HbysDeliverySuccess {
  success: true;
  externalReportId?: string;
  rawReference?: string;
}
```

Core:

```text id="jevbr2"
HBYS_PENDING
→ HBYS_SENT
```

---

# 38. HBYS FAILURE RESULT

```ts id="s4wcoi"
interface HbysDeliveryFailure {
  success: false;
  retryable: boolean;
  errorCode: string;
  message: string;
}
```

Retry exhausted:

```text id="m9qjl9"
HBYS_PENDING
→ HBYS_FAILED
```

---

# 39. RETRY STRATEGY

Pilot için önerilen otomatik retry:

```text id="pyfr9h"
Attempt 1
↓
30 sec

Attempt 2
↓
2 min

Attempt 3
↓
5 min

FAIL
```

Bu süreler config üzerinden değiştirilebilir.

Pilot test modunda daha kısa olabilir.

---

# 40. RETRYABLE ERROR

Retry edilebilir:

- timeout,
- temporary network error,
- 5xx remote error,
- connection reset.

Retry edilmemesi gereken:

- invalid payload,
- unsupported study,
- authentication/config error,
- permanent validation failure.

Adapter:

```text id="glmxzy"
retryable
```

bilgisini döndürmelidir.

---

# 41. MANUAL RETRY

Otomatik retry bittikten sonra:

> OPERATION / MANAGER

manuel retry yapabilir.

Akış:

```text id="jehcvy"
HBYS_FAILED
↓
Manual Retry
↓
HBYS_PENDING
↓
New attempt
```

---

# 42. HBYS IDEMPOTENCY

Aynı final report version istemeden iki kez gönderilebilir.

Bu nedenle:

```text id="otxg7m"
idempotencyKey
```

kullanılmalıdır.

Öneri:

```text id="e0lqb7"
hospitalId + studyId + reportVersionId
```

deterministic olarak oluşturulabilir.

---

# 43. HOSPITAL HBYS IDEMPOTENCY SUPPORT

Hastane sistemi native idempotency desteklemiyorsa adapter:

- external report ID,
- previous delivery result,
- local delivery history

ile duplicate riskini azaltmalıdır.

Ancak hastane tarafı duplicate davranışı entegrasyon sırasında ayrıca test edilmelidir.

---

# 44. HBYS DELIVERY LOG

Her gönderim attempt kaydedilmelidir.

Örnek metadata:

```text id="exnbsw"
attemptNumber
startedAt
completedAt
result
errorCode
remoteStatus
```

Sensitive payload loglanmamalıdır.

---

# 45. HBYS MOCK ADAPTER

Pilot:

```text id="6wsb91"
MockHbysAdapter
```

kullanır.

Modlar:

```text id="1bj5ws"
SUCCESS
FAIL
TIMEOUT
```

---

# 46. MOCK HBYS SUCCESS

Örnek:

```text id="o7r1h6"
SUCCESS
```

sonucu:

```json id="csz8c1"
{
  "success": true,
  "externalReportId": "MOCK-HBYS-0001"
}
```

---

# 47. MOCK HBYS FAIL

Örnek:

```json id="eakjrj"
{
  "success": false,
  "retryable": false,
  "errorCode": "MOCK_HBYS_REJECTED",
  "message": "Mock HBYS rejection."
}
```

---

# 48. MOCK HBYS TIMEOUT

Adapter bilinçli delay / timeout üretir.

Amaç:

- worker timeout,
- automatic retry,
- failure UI,
- operation notification

test etmektir.

---

# 49. HBYS AUTH

Gerçek hastane HBYS adapterı:

- API key,
- Basic Auth,
- OAuth,
- client certificate,
- VPN/internal network

gibi yöntemler kullanabilir.

Bu bilgi core HbysService içinde hardcode edilmemelidir.

---

# 50. HBYS SECRET MANAGEMENT

Secrets:

- repository'ye yazılmaz,
- frontend'e gönderilmez,
- logs içinde gösterilmez.

Pilot Railway secrets / environment variables kullanılabilir.

---

# 51. NETWORK CONNECTIVITY

Gerçek hastane entegrasyonu aşağıdakilerden birini gerektirebilir:

- VPN,
- site-to-site VPN,
- static IP allowlist,
- private network,
- reverse tunnel,
- on-premise gateway.

Bu detay hastane onboarding sırasında belirlenir.

Core product architecture bundan bağımsız kalmalıdır.

---

# 52. EXTERNAL HOSPITAL DOCTOR LOCK

Sağlık ekibinin ek kuralı:

> Hastane hekimi kendi HBYS sisteminde “bu hastayı okuyacağım” anlamındaki işleme girdiğinde raporlama sistemine lock mesajı gelmelidir.

Bu dış event core sistemde normalize edilmelidir.

---

# 53. EXTERNAL LOCK EVENT

Normalized event:

```ts id="mno7am"
interface ExternalStudyLockEvent {
  eventType: "EXTERNAL_STUDY_LOCKED";

  hospitalId: string;
  accessionNumber: string;

  externalUserReference?: string;

  occurredAt: string;
}
```

---

# 54. EXTERNAL UNLOCK EVENT

```ts id="hcw3q4"
interface ExternalStudyUnlockEvent {
  eventType: "EXTERNAL_STUDY_RELEASED";

  hospitalId: string;
  accessionNumber: string;

  occurredAt: string;
}
```

---

# 55. EXTERNAL LOCK NORMAL FLOW

Study `UNREAD` ise:

```text id="rx3evg"
EXTERNAL_STUDY_LOCKED
↓
ExternalStudyLock ACTIVE
↓
Study HOSPITAL_DOCTOR
```

Merkezi doktor normal reading başlatamaz.

---

# 56. EXTERNAL RELEASE NORMAL FLOW

```text id="85kfwk"
EXTERNAL_STUDY_RELEASED
↓
ExternalStudyLock RELEASED
↓
HOSPITAL_DOCTOR → UNREAD
```

---

# 57. EXTERNAL LOCK CONFLICT

Çakışma:

```text id="ajnp1z"
Central Doctor READING + internal lock
↓
Hospital external lock arrives
```

bu durumda sistem otomatik olarak central Doctor'ın işini silmemelidir.

Oluşturulacak durum:

```text id="njokhl"
EXTERNAL_LOCK_CONFLICT
```

notification/audit.

Pilot:

> OPERATION review

gerektirir.

---

# 58. EXTERNAL LOCK SOURCE

Hastaneye göre event:

- HL7 custom message,
- HBYS API callback,
- REST webhook,
- vendor integration event

olarak gelebilir.

Adapter bunu normalized lock event'e dönüştürür.

---

# 59. EXTERNAL EVENT SECURITY

Public webhook endpoint varsa:

- shared secret,
- HMAC signature,
- mTLS,
- IP allowlist,
- replay protection

gibi doğrulama yapılmalıdır.

Pilot mock endpoint yalnız DevTools üzerinden kullanılacaktır.

---

# 60. REVISION PORTAL INTEGRATION

Acil hekimi dış portalı normal HBYS entegrasyonundan farklıdır.

Amaç:

```text id="yeeloo"
External Physician
↓
secure short link
↓
Revision Request
↓
Core Revision Workflow
```

---

# 61. EXTERNAL REVISION REQUEST

Core'a normalize edilen data:

```text id="lksu5z"
studyId / accession reference
hospitalId
reason
details
requestedAt
source = EXTERNAL_PHYSICIAN
```

---

# 62. REVISION PORTAL ACCESS

External physician:

- ana Study listelerini göremez,
- başka hasta arayamaz,
- manager ekranlarına erişemez.

Token:

> tek study + tek amaç + süreli

olmalıdır.

---

# 63. REVISION NOTIFICATION

External revision request geldiğinde:

- ilgili Doctor,
- ilgili Reporter,
- Operation,
- gerektiğinde Manager

uyarı alabilir.

---

# 64. INTEGRATION EVENT RECORDING

Önerilen core akış:

```text id="868rgq"
External message
↓
IntegrationEvent RECEIVED
↓
Adapter normalize
↓
Core processing
↓
IntegrationEvent PROCESSED
```

Hata:

```text id="zfncso"
FAILED
```

Duplicate:

```text id="ij6f2e"
DUPLICATE
```

---

# 65. INTEGRATION CORRELATION ID

Her external message için mümkün olduğunda:

```text id="gubg6g"
externalMessageId
```

ve internal:

```text id="n5c1vk"
correlationId
```

tutulmalıdır.

Bu özellikle hastane entegrasyon debugging için önemlidir.

---

# 66. REQUEST LOG SANITIZATION

Loglara aşağıdakiler doğrudan yazılmamalıdır:

- patient full identity,
- report full text,
- audio content,
- access tokens,
- API secret,
- raw credentials.

Log:

```text id="zp69xo"
studyId
hospitalId
accession masked/partial
event type
error code
```

gibi operational metadata kullanmalıdır.

---

# 67. OUTBOUND HBYS OBSERVABILITY

HBYS attempt log örneği:

```json id="zzft1a"
{
  "event": "HBYS_SEND_ATTEMPT",
  "hospitalId": "...",
  "studyId": "...",
  "deliveryId": "...",
  "attempt": 2,
  "result": "TIMEOUT"
}
```

---

# 68. HEALTH CHECKS

Integration health alanları ayrı olabilir.

Örnek:

```text id="i1n83p"
GET /health
GET /health/integrations
```

Pilot minimum `/health` yeterlidir.

Manager/Operation dashboard daha sonra:

```text id="p8f2wp"
HL7 OK
PACS OK
HBYS DOWN
```

gibi gösterebilir.

---

# 69. CIRCUIT BREAKER

Pilot ilk implementasyonda zorunlu değildir.

Ancak gerçek HBYS/PACS sürekli hata verirse circuit breaker değerlendirilebilir.

Amaç:

- aynı unavailable sisteme aşırı istek atmamak,
- sistem kaynaklarını korumak.

---

# 70. TIMEOUT POLICY

Her external adapter explicit timeout kullanmalıdır.

Örnek pilot:

```text id="lp66f3"
PACS metadata request: 10 sec
HBYS request: 15 sec
```

Gerçek değer hastaneye göre config edilebilir.

Infinite wait yasaktır.

---

# 71. RETRY + TIMEOUT AYRIMI

Timeout:

> tek attempt'ın maksimum bekleme süresi.

Retry:

> başarısız attempt sonrası yeni deneme.

İkisi ayrı konfigürasyondur.

---

# 72. PACS RETRY

PACS metadata lookup geçici hata verirse kısa retry yapılabilir.

Ancak user görüntü açmak istediğinde uzun süren background retry yerine UI:

> PACS temporarily unavailable

gösterebilir.

---

# 73. HL7 PROCESSING RETRY

HL7 mesajı geçerli ancak database geçici unavailable ise integration event retry edilebilir.

Invalid message tekrar tekrar retry edilmemelidir.

---

# 74. DEAD LETTER / FAILED JOB

BullMQ retry bittikten sonra failed job kaydı korunmalıdır.

Özellikle:

- HBYS delivery,
- integration processing

işleri operation tarafından incelenebilmelidir.

---

# 75. PILOT INTEGRATION ENVIRONMENT

Pilot:

```text id="cxnfq2"
Frontend
Vercel

Backend
Railway

PostgreSQL
Railway

Redis
Railway / managed

HL7
MockHl7Adapter

PACS
OrthancPacsAdapter

HBYS
MockHbysAdapter
```

---

# 76. REAL HOSPITAL MIGRATION

Gerçek hastane bağlantısına geçerken:

```text id="2ouckj"
MockHl7Adapter
→ HospitalXHl7Adapter

OrthancPacsAdapter
→ HospitalXPacsAdapter

MockHbysAdapter
→ HospitalXHbysAdapter
```

değişir.

Değişmemesi gereken:

- Study workflow,
- report workflow,
- Doctor UI,
- Reporter UI,
- locking,
- SLA,
- audit,
- manager workflow.

---

# 77. HOSPITAL ONBOARDING CHECKLIST

Her yeni hastane için teknik olarak aşağıdakiler netleştirilmelidir:

```text id="qckziv"
Hospital code
HL7 transport
HL7 message examples
Accession field location
Patient ID field location
Category mappings
Clinical data mappings
PACS type
PACS access
DICOMweb availability
Viewer strategy
HBYS report API
HBYS authentication
HBYS response contract
HBYS retry rules
External lock event
Network/VPN
Test environment
```

---

# 78. HL7 SAMPLE REQUIREMENT

Gerçek entegrasyon başlamadan hastaneden:

- First HL7 örneği,
- Second HL7 örneği,
- category examples,
- error/edge examples

istenmelidir.

AI geliştirici örnek olmadan vendor-specific HL7 mapping uydurmamalıdır.

---

# 79. HBYS SAMPLE REQUIREMENT

Hastaneden:

- endpoint dokümanı,
- request example,
- response example,
- error response,
- authentication yöntemi,
- test credentials/environment

alınmalıdır.

---

# 80. PACS SAMPLE REQUIREMENT

Hastaneden:

- PACS vendor,
- DICOMweb destek bilgisi,
- AE Title gerekiyorsa bilgiler,
- Study lookup yöntemi,
- viewer access yöntemi,
- test Study

bilgisi alınmalıdır.

---

# 81. HASTANEYE ÖZEL KOD YERLEŞİMİ

Önerilen backend yapı:

```text id="1g0a45"
src/integrations/
│
├── contracts/
│
├── hl7/
│   ├── mock/
│   └── hospitals/
│       └── hospital-a/
│
├── pacs/
│   ├── orthanc/
│   └── hospitals/
│       └── hospital-a/
│
└── hbys/
    ├── mock/
    └── hospitals/
        └── hospital-a/
```

Core domain modülleri burada tanımlı vendor payload'ları import etmemelidir.

---

# 82. ADAPTER CONFIG

Her hospital için:

```text id="r3mb94"
hl7AdapterType
pacsAdapterType
hbysAdapterType
```

tanımlanabilir.

Örnek:

```text id="hb3q6j"
TEST_HOSPITAL

HL7 = MOCK
PACS = ORTHANC
HBYS = MOCK
```

---

# 83. UNKNOWN ADAPTER

Config yanlışsa:

```text id="5e2abt"
INTEGRATION_ADAPTER_NOT_CONFIGURED
```

hatası üretmelidir.

Silent fallback yapılmamalıdır.

Örneğin gerçek hastanede HBYS adapter yoksa otomatik Mock HBYS kullanmak yasaktır.

---

# 84. MOCK SAFETY

Mock adapter production'da yanlışlıkla aktif olmamalıdır.

Öneri:

```text id="n5wpx7"
ALLOW_MOCK_INTEGRATIONS=true
```

sadece:

- development,
- pilot

ortamlarında.

Production:

```text id="64xo4g"
false
```

---

# 85. TEST DATA SEPARATION

Mock hospital:

> TEST

status taşımalıdır.

Gerçek hospital:

> ACTIVE

olabilir.

Mock Study'ler gerçek hastane entegrasyon kuyruğuna gönderilmemelidir.

---

# 86. EXTERNAL PATIENT IDENTIFIERS

External system ID'leri:

- patient external ID,
- accession number,
- order ID,
- report ID

internal UUID yerine ayrı tutulmalıdır.

Core ilişkiler internal UUID ile yapılmalıdır.

---

# 87. ACCESSION NORMALIZATION

Accession Number gelen payload'da:

- whitespace,
- casing,
- vendor formatting

sorunları olabilir.

Adapter gerekirse güvenli normalization yapabilir.

Ancak accession değerini anlam değiştirecek şekilde transform etmemelidir.

Normalized ve raw value ayrı tutulabilir.

---

# 88. TIMEZONE

External event timestampleri hastanenin lokal saatinde gelebilir.

Adapter internal olarak:

> UTC ISO timestamp

üretmelidir.

Hospital timezone config kullanılabilir.

---

# 89. CLOCK TRUST

SLA hesaplaması için backend server time esas alınmalıdır.

External HL7 acceptedAt kullanılıyorsa:

- timezone normalize edilmeli,
- bariz gelecekte/geçmişte hatalı timestamp için validation düşünülebilir.

---

# 90. EVENT ORDERING

Bazen Second HL7 First HL7'dan önce veya tekrar gelebilir.

Adapter/core integration layer out-of-order eventleri güvenli yönetmelidir.

Pilot minimum:

- Second HL7 için matching Study bulunamazsa failed/pending integration event oluştur.
- Study uydurup yanlış workflow başlatma.

İleride pending reconciliation uygulanabilir.

---

# 91. IMAGES BEFORE SECOND HL7

PACS görüntüsü Second HL7'dan önce görünür olabilir.

Core event ordering buna dayanıklı olmalıdır.

Images availability metadata kaydedilebilir.

Ancak Study workflow gerekli HL7 state kurallarını korumalıdır.

---

# 92. EVENT RECONCILIATION

Gerçek entegrasyonlarda ileride background reconciliation job olabilir.

Örnek:

```text id="8fwtio"
pending integration events
↓
match retry
↓
process when dependency appears
```

Pilot ilk 5 günlük kapsam için zorunlu değildir.

---

# 93. REPORT TEXT FORMAT

HBYS farklı format isteyebilir:

- plain text,
- HTML,
- XML,
- vendor-specific structure.

Core report:

> normalized textual/domain representation

olarak tutulur.

HBYS adapter dış sistem formatına dönüştürür.

---

# 94. REPORT VERSION SELECTION

HBYS gönderimine her zaman:

> ilgili final ReportVersion

gönderilmelidir.

`Report.currentVersionId` yanlış/stale ise delivery record'daki:

```text id="d2ik6p"
reportVersionId
```

esas alınır.

---

# 95. REVISION HBYS DELIVERY

Revizyon final olduktan sonra yeni ReportVersion için yeni delivery oluşturulur.

Eski delivery kaydı silinmez.

Örnek:

```text id="llmgex"
v1 FINAL
→ HBYS Delivery A SENT

v2 FINAL REVISION
→ HBYS Delivery B SENT
```

---

# 96. ADDENDUM DELIVERY

İki ay sonrası Addendum normal ReportVersion update değildir.

Ayrı payload type gerekebilir.

Örnek:

```text id="x6whrk"
type = ADDENDUM
```

Ancak hastane HBYS endpointinin kesin davranışı bilinmediği için AI geliştirici vendor-specific gönderim kuralı uydurmamalıdır.

İlk pilotta mock senaryo yeterlidir.

---

# 97. INTEGRATION BUSINESS ERRORS

Standard internal error kodları:

```text id="9ty1r2"
INTEGRATION_ADAPTER_NOT_CONFIGURED

HL7_INVALID_MESSAGE
HL7_ACCESSION_CONFLICT
HL7_PATIENT_MISMATCH

PACS_UNAVAILABLE
PACS_STUDY_NOT_FOUND
PACS_PARTIAL_IMAGES

HBYS_TIMEOUT
HBYS_REJECTED
HBYS_AUTH_FAILED
HBYS_UNAVAILABLE

EXTERNAL_LOCK_CONFLICT
EXTERNAL_EVENT_INVALID
```

---

# 98. RETRYABLE ERROR CONTRACT

Internal integration error:

```ts id="p3aw1s"
interface IntegrationError {
  code: string;
  message: string;
  retryable: boolean;
  metadata?: Record<string, unknown>;
}
```

Core queue retry behavior bu contract'a göre karar verebilir.

---

# 99. OPERATION VISIBILITY

Operation ekranı ileride aşağıdakileri görebilmelidir:

```text id="m3f25h"
HL7 failures
PACS unavailable
Images pending too long
HBYS failures
External lock conflicts
```

Pilot minimum:

- HBYS failures,
- IMAGE_MISSING,
- SLA,
- basic integration error

görünürlüğüdür.

---

# 100. MANAGER VISIBILITY

Manager:

- hospital integration status,
- failed integration count,
- latest error,
- retry history

gibi bilgileri görebilir.

Secrets görünmez.

---

# 101. DEVTOOLS INTEGRATION TESTS

DevTools ile aşağıdaki senaryolar üretilebilmelidir:

```text id="ni3y5x"
First HL7
Second HL7
Duplicate First HL7
Wrong Accession Second HL7
Images Available
PACS Error
HBYS Success
HBYS Fail
HBYS Timeout
External Lock
External Unlock
```

---

# 102. PILOT HL7 ACCEPTANCE

Minimum test:

```text id="ymv438"
First HL7
✓ Patient created
✓ Study created
✓ WAITING_ACCEPTANCE

Second HL7
✓ same Study found
✓ accession matched
✓ IMAGES_PENDING

Duplicate
✓ no duplicate Study
```

---

# 103. PILOT PACS ACCEPTANCE

```text id="aum4d4"
✓ Test Study in Orthanc
✓ backend can locate Study
✓ images available
✓ series metadata
✓ viewer can open
✓ UNREAD transition
```

---

# 104. PILOT HBYS SUCCESS ACCEPTANCE

```text id="i4qsgl"
Doctor final
✓ HBYS delivery created
✓ BullMQ job
✓ Mock adapter called
✓ external mock ID returned
✓ HBYS_SENT
✓ audit
✓ realtime event
```

---

# 105. PILOT HBYS FAILURE ACCEPTANCE

```text id="7wb4bc"
Mock mode FAIL
✓ send attempt
✓ retry behavior
✓ HBYS_FAILED
✓ Operation warning
✓ Manager warning
✓ manual retry
✓ SUCCESS
✓ HBYS_SENT
```

---

# 106. PILOT EXTERNAL LOCK ACCEPTANCE

```text id="ln3md0"
Study UNREAD
↓
Mock External Lock
↓
HOSPITAL_DOCTOR
↓
Doctor start-reading rejected

Mock External Unlock
↓
UNREAD
↓
Doctor can read
```

---

# 107. PILOT INTEGRATION LOG ACCEPTANCE

Her ana integration action için en az:

- source,
- hospital,
- study,
- event,
- status,
- timestamp

log/audit bilgisi bulunmalıdır.

---

# 108. ADAPTER UNIT TESTS

Her adapter aşağıdakiler için test edilmelidir:

```text id="r60ibo"
normalization
invalid payload
missing field
remote error
timeout
duplicate response if relevant
```

---

# 109. CORE INTEGRATION TESTS

Adapter dışındaki core processing şu senaryoları test etmelidir:

- duplicate HL7,
- accession conflict,
- images available,
- HBYS retry,
- external lock conflict.

---

# 110. NO REAL HOSPITAL DEPENDENCY IN PILOT

İlk pilotun çalışması için gerçek:

- HL7 server,
- PACS,
- HBYS

zorunlu değildir.

Bütün core workflow:

> test adapterlar

üzerinden sağlık ekibince test edilebilir olmalıdır.

---

# 111. PRODUCTION SWITCH RULE

Mock'tan gerçeğe geçiş:

> kodun içinde if/else ile hastane adına göre yapılmamalıdır.

Yanlış:

```ts id="94u1yo"
if (hospital.name === "Hospital A") {
  ...
}
```

Doğru:

```text id="2dd3r0"
Hospital Integration Config
↓
Registry
↓
HospitalAAdapter
```

---

# 112. HOSPITAL-SPECIFIC FEATURE FLAG

Bir hastanede belirli entegrasyon özelliği yoksa feature capability tutulabilir.

Örnek:

```text id="38mb7x"
supportsExternalLock = true
supportsReportRevision = true
supportsDICOMweb = false
```

Core UI/API capability'ye göre davranabilir.

---

# 113. CAPABILITY RESPONSE

İleride hospital detail response:

```json id="b1rbop"
{
  "capabilities": {
    "pacsViewer": true,
    "externalStudyLock": false,
    "automaticHbysDelivery": true
  }
}
```

dönebilir.

Pilot için zorunlu değildir.

---

# 114. BACKEND OWNERSHIP

Claude integration implementation yaparken:

- vendor-specific kodu adapter altında tutar,
- core workflow'u değiştirmez,
- mock'u bypass etmez,
- integration testleri yazar.

---

# 115. FRONTEND OWNERSHIP

Codex:

- HL7 parsing yapmaz,
- HBYS payload oluşturmaz,
- PACS credentials bilmez,
- adapter type'a göre ayrı frontend yazmaz.

Frontend normalized API response kullanır.

---

# 116. BLOCKED_EXTERNAL KURALI

Gerçek hastane entegrasyonu için aşağıdakiler yoksa görev:

```text id="c8l2jk"
BLOCKED_EXTERNAL
```

olmalıdır.

Örnek:

- HL7 sample yok,
- HBYS documentation yok,
- PACS credentials yok,
- VPN erişimi yok.

Ajan vendor davranışı uydurmamalıdır.

---

# 117. BLOCKED_SPEC KURALI

Sağlık ekibinin iş kuralı net değilse:

```text id="wxgl3n"
BLOCKED_SPEC
```

kullanılır.

Örnek:

- Yoğun bakım kesin SLA süresi,
- addendum için gerçek HBYS approval süreci,
- gerçek hakediş formülü.

---

# 118. MOCK ≠ FAKE UI

Mock adapter gerçek backend integration interface'ini implement eder.

Frontend:

```text id="zkmrhb"
if test then set HBYS success
```

gibi bir davranış kullanmamalıdır.

---

# 119. INTEGRATION SECURITY PRINCIPLE

Her dış sistem:

> güvenilmeyen input

olarak değerlendirilmelidir.

Validation:

- schema,
- required fields,
- allowed hospital,
- replay/duplicate,
- type checks

uygulanmalıdır.

---

# 120. FINAL INTEGRATION SUMMARY

Ana entegrasyon akışı:

```text id="kss7h0"
HOSPITAL
│
├── HL7
│     ↓
│   HL7 Adapter
│     ↓
│   Normalized Event
│     ↓
│   Patient / Study Workflow
│
├── PACS
│     ↓
│   PACS Adapter
│     ↓
│   Study / Series / Viewer Metadata
│
├── HBYS
│     ↑
│   HBYS Adapter
│     ↑
│   Delivery Queue
│     ↑
│   Doctor Final
│
└── Hospital Doctor Lock Event
      ↓
    External Lock Adapter
      ↓
    HOSPITAL_DOCTOR Workflow
```

---

# 121. SON KURAL

Yeni bir hastane eklenirken:

> core application değiştirilmemelidir.

Gerekli olan:

1. Hastane config'i,
2. HL7 mapping,
3. PACS adapter/config,
4. HBYS adapter/config,
5. varsa external lock adapter,
6. integration testleri.

Her hastane için ayrı frontend veya ayrı core workflow oluşturmak bu mimariye aykırıdır.

Bu dosya tüm dış sistem entegrasyonlarının ana teknik sözleşmesidir.