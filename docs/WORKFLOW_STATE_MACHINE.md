# WORKFLOW_STATE_MACHINE.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Tetkik Durum Makinesi

> **Doküman Türü:** Workflow / State Machine Spesifikasyonu  
> **Üst Referanslar:** `MASTER_SPEC.md`, `ARCHITECTURE.md`  
> **Ana Nesne:** Study / Tetkik  
> **Temel Kural:** Study status değişiklikleri yalnızca backend workflow servisi üzerinden yapılır.

---

# 1. DOKÜMANIN AMACI

Bu doküman bir tetkikin sistem içerisindeki yaşam döngüsünü kesin olarak tanımlar.

Tanımlanan her state için:

- anlamı,
- state'e hangi olayla girildiği,
- hangi kullanıcıların işlem yapabileceği,
- hangi state'lere geçilebileceği,
- lock davranışı,
- audit davranışı,
- realtime event davranışı,
- otomatik işlemler

belirlenir.

Frontend veya başka herhangi bir servis tetkik status değerini doğrudan değiştirmemelidir.

Tüm geçişler:

> WorkflowService

üzerinden gerçekleştirilmelidir.

---

# 2. STATE MACHINE ANA PRENSİBİ

Bir Study için status:

> iş akışının gerçek kaynağıdır.

Ancak operasyon ekranlarında gösterilen bazı sekmeler gerçek state olmayabilir.

Örneğin:

- Okunmayan
- Yazılmayan
- Onay Bekleyen
- HBYS Gönderilmedi

gibi ekranlar bazı durumların filtrelenmiş görünümü olabilir.

Bu nedenle:

> UI sekmesi ≠ her zaman database state

kuralı geçerlidir.

---

# 3. ANA STATE ENUM

Temel state enum aşağıdaki gibi tanımlanacaktır:

```ts
enum StudyStatus {
  INITIAL = "INITIAL",
  WAITING_ACCEPTANCE = "WAITING_ACCEPTANCE",
  IMAGES_PENDING = "IMAGES_PENDING",

  UNREAD = "UNREAD",
  READING = "READING",
  READ = "READ",

  WAITING_TRANSCRIPTION = "WAITING_TRANSCRIPTION",
  TRANSCRIBING = "TRANSCRIBING",
  WAITING_APPROVAL = "WAITING_APPROVAL",

  FINAL = "FINAL",

  HBYS_PENDING = "HBYS_PENDING",
  HBYS_SENT = "HBYS_SENT",
  HBYS_FAILED = "HBYS_FAILED",

  IMAGE_MISSING = "IMAGE_MISSING",
  WONT_REPORT = "WONT_REPORT",
  HOSPITAL_DOCTOR = "HOSPITAL_DOCTOR",

  REVISION_REQUESTED = "REVISION_REQUESTED",
  REVISION_IN_PROGRESS = "REVISION_IN_PROGRESS",

  ADDENDUM_REQUIRED = "ADDENDUM_REQUIRED"
}
```

---

# 4. ANA HAPPY PATH

Normal iş akışı:

```text
INITIAL
   ↓
WAITING_ACCEPTANCE
   ↓
IMAGES_PENDING
   ↓
UNREAD
   ↓
READING
   ↓
READ
   ↓
WAITING_TRANSCRIPTION
   ↓
TRANSCRIBING
   ↓
WAITING_APPROVAL
   ↓
FINAL
   ↓
HBYS_PENDING
   ↓
HBYS_SENT
```

---

# 5. INITIAL

## Anlamı

İlk HL7 mesajı alınmış ve sisteme ilk Study kaydı oluşturulmuştur.

Bu aşamada tetkik henüz kabul edilmemiş olabilir.

## Giriş Olayı

```text
HL7_FIRST_RECEIVED
```

## Gerekli Veriler

En az:

- hospitalId
- patient reference
- accessionNumber
- order / tetkik bilgisi
- firstHl7ReceivedAt

bulunmalıdır.

## Sonraki State

```text
WAITING_ACCEPTANCE
```

## Audit

```text
HL7_FIRST_RECEIVED
STUDY_CREATED
```

---

# 6. WAITING_ACCEPTANCE

## Anlamı

İlk HL7 kaydı bulunmaktadır.

İkinci HL7 / tetkik kabul mesajı beklenmektedir.

## Kullanıcı İşlemi

Normal kullanıcı bu state'i manuel değiştiremez.

## Geçiş

İkinci HL7 geldiğinde:

```text
WAITING_ACCEPTANCE
→ IMAGES_PENDING
```

## Eşleştirme

Ana eşleştirme:

> Accession Number

üzerinden yapılmalıdır.

İkincil doğrulama alanları gerektiğinde kullanılabilir.

## Audit

```text
HL7_SECOND_RECEIVED
ACCESSION_MATCHED
```

---

# 7. IMAGES_PENDING

## Anlamı

Tetkik kabul edilmiştir ancak raporlama için görüntülerin kullanılabilir hale gelmesi beklenmektedir.

## Giriş

```text
SECOND_HL7_MATCHED
```

## Geçiş

Görüntü kullanılabilir olduğunda:

```text
IMAGES_PENDING
→ UNREAD
```

## PACS Kontrolü

Bu state'te sistem:

- Study UID
- Series UID
- PACS reference
- image availability

bilgilerini takip edebilir.

## Hata Durumu

Görüntünün hiç gelmemesi veya gönderim sorunu:

> operasyonel uyarı

oluşturabilir.

Ancak yalnızca görüntünün henüz gelmemiş olması otomatik olarak `IMAGE_MISSING` anlamına gelmez.

`IMAGE_MISSING` klinik/operasyonel olarak hekim tarafından bildirilen özel durumdur.

---

# 8. UNREAD

## Anlamı

Tetkik raporlamaya hazırdır ve henüz hekim tarafından okunmaya başlanmamıştır.

Bu state UI'de:

> Okunmayan

havuzunun ana kaynağıdır.

## Study Açma

Hekim Study'yi okumak için açtığında backend:

1. Yetki kontrol eder.
2. Hastane yetkisini kontrol eder.
3. Study state kontrol eder.
4. Existing lock kontrol eder.
5. Lock acquire eder.
6. Hekim assignment oluşturur/günceller.
7. Status değiştirir.

Geçiş:

```text
UNREAD
→ READING
```

## Audit

```text
DOCTOR_READING_STARTED
LOCK_ACQUIRED
```

---

# 9. READING

## Anlamı

Tetkik aktif olarak bir hekim tarafından incelenmektedir.

## Lock

Bu state:

> DOCTOR lock

gerektirir.

Lock owner:

```text
assignedDoctorId
```

ile uyumlu olmalıdır.

## Başka Kullanıcı

Başka hekim veya raportör Study'yi aktif çalışma amacıyla açamaz.

Beklenen backend error:

```text
STUDY_LOCKED
```

## Kullanıcıya Gösterilecek Bilgiler

Yetkisine bağlı olarak:

- dosyanın kilitli olduğu,
- hangi hekimde olduğu,
- okumanın başlama zamanı

görülebilir.

## Geçişler

Normal:

```text
READING
→ READ
```

Özel:

```text
READING
→ IMAGE_MISSING
READING
→ WONT_REPORT
```

Hastane kaynaklı dış lock event gibi çakışmalı durumlar ayrıca integration kuralına tabi olacaktır.

---

# 10. HEKİM DİKTESİ VE READING

Hekim `READING` state'inde:

- görüntüleri açabilir,
- dikte başlatabilir,
- dikte durdurabilir,
- dikte tamamlayabilir.

Dikte tamamlanmadan normal `READ` geçişi yapılmamalıdır.

Pilot implementasyonda en az bir geçerli dictation kaydı beklenir.

Workflow guard:

```text
dictationExists === true
dictation.uploadStatus === COMPLETED
```

olmalıdır.

---

# 11. READ

## Anlamı

Hekim görüntü incelemesini tamamlamış ve ses diktesini sonlandırmıştır.

UI'de:

> Okundu

olarak görülebilir.

## Lock

Doctor lock bu aşamada serbest bırakılmalıdır.

## Otomatik Sonraki Geçiş

`READ` ara state olarak kısa süre kullanılabilir.

Backend normal durumda otomatik olarak:

```text
READ
→ WAITING_TRANSCRIPTION
```

geçişi yapar.

## Audit

```text
DICTATION_COMPLETED
DOCTOR_READING_COMPLETED
LOCK_RELEASED
```

---

# 12. WAITING_TRANSCRIPTION

## Anlamı

Hekim diktesi hazırdır.

Henüz raportör raporu yazmaya başlamamıştır.

UI'de:

> Yazılmayan

havuzunun ana state'idir.

## Raportör İşlemi

Raportör dosyayı üzerine aldığında:

1. Yetki kontrolü
2. State kontrolü
3. Lock kontrolü
4. Reporter lock
5. Assignment
6. State transition

gerçekleşir.

```text
WAITING_TRANSCRIPTION
→ TRANSCRIBING
```

---

# 13. TRANSCRIBING

## Anlamı

Raportör raporu aktif olarak yazmaktadır.

## Lock

Bu state:

> REPORTER lock

gerektirir.

Başka raportör dosyayı açamaz.

Başka kullanıcı aktif edit yapamaz.

## Süre Takibi

Bu state'e giriş zamanı:

```text
transcriptionStartedAt
```

olarak kaydedilmelidir.

Manager tarafından raportör yazım süresi ölçümünde kullanılabilir.

## Geçiş

Raportör raporu tamamladığında:

```text
TRANSCRIBING
→ WAITING_APPROVAL
```

## Zorunlu Veri

En az bir draft/report version bulunmalıdır.

## Lock

Geçiş sonrası Reporter lock kaldırılır.

## Audit

```text
REPORTER_TRANSCRIPTION_STARTED
REPORT_COMPLETED
LOCK_RELEASED
```

---

# 14. WAITING_APPROVAL

## Anlamı

Raportör raporu tamamlamıştır.

Rapor ilgili hekimin final kontrolünü beklemektedir.

UI'de:

> Yazılan / Onay Bekleyen

olarak gösterilebilir.

## Hekim Bildirimi

İlgili hekim realtime bildirim almalıdır.

Örnek event:

```text
STUDY_WAITING_APPROVAL
```

## Hekim İşlemleri

Hekim:

- raporu görüntüler,
- görüntüyü tekrar açabilir,
- raporu düzenleyebilir,
- final onay verebilir,
- gerekli uygulama kararı tanımlanırsa raportöre geri gönderebilir.

---

# 15. ONAY AŞAMASI LOCK

Hekim raporu final kontrol için aktif edit modunda açtığında yeniden lock oluşturulmalıdır.

Lock role:

```text
DOCTOR
```

Bu lock raporun aynı anda iki kullanıcı tarafından değiştirilmesini önler.

Final onay tamamlandığında lock bırakılır.

---

# 16. FINAL

## Anlamı

Hekim rapora tıbbi final onayı vermiştir.

## Geçiş

```text
WAITING_APPROVAL
→ FINAL
```

## Finalizasyon İşlemleri

Backend transaction mümkün olduğunca şunları birlikte gerçekleştirmelidir:

1. Report version FINAL olarak işaretlenir.
2. finalizedBy kaydedilir.
3. finalizedAt kaydedilir.
4. Study status FINAL yapılır.
5. Audit event oluşturulur.
6. HBYS delivery job oluşturulur.

## Otomatik Akış

Kullanıcıdan ikinci işlem beklenmeden:

```text
FINAL
→ HBYS_PENDING
```

olmalıdır.

---

# 17. HBYS_PENDING

## Anlamı

Final rapor HBYS gönderim kuyruğundadır veya gönderim işlemi sürmektedir.

## İşlem

BullMQ worker:

```text
HBYS_DELIVERY_JOB
```

çalıştırır.

## Kullanıcı Müdahalesi

Normal durumda yoktur.

## Sonuçlar

Başarılı:

```text
HBYS_PENDING
→ HBYS_SENT
```

Başarısız:

```text
HBYS_PENDING
→ HBYS_FAILED
```

---

# 18. HBYS_SENT

## Anlamı

Final rapor hastane HBYS sistemine başarıyla gönderilmiştir.

Ana normal workflow'un tamamlanmış halidir.

## Metadata

Kaydedilebilecek alanlar:

- sentAt
- externalReportId
- deliveryAttemptId
- integration response metadata

## Audit

```text
HBYS_REPORT_SENT
```

---

# 19. HBYS_FAILED

## Anlamı

Final rapor HBYS'ye gönderilememiştir.

Neden:

- remote error
- timeout
- validation error
- integration error
- retry exhaustion

olabilir.

## Görünürlük

En az:

- OPERATION
- MANAGER

kullanıcıları görebilmelidir.

## Otomatik Retry

Integration policy'ye göre otomatik retry yapılabilir.

## Manuel Retry

Yetkili kullanıcı:

```text
HBYS_FAILED
→ HBYS_PENDING
```

geçişini tetikleyebilir.

## Rapor Durumu

Rapor tıbbi olarak FINAL kalır.

HBYS gönderim hatası final raporu draft haline döndürmez.

---

# 20. IMAGE_MISSING

## Anlamı

Hekim görüntülerin raporlama için eksik olduğunu belirtmiştir.

## Giriş

Temel olarak:

```text
READING
→ IMAGE_MISSING
```

gerektiğinde `UNREAD` state'inden de yetkili operasyonel geçiş desteklenebilir.

## Lock

IMAGE_MISSING state'ine geçildiğinde aktif çalışma lock'u bırakılmalıdır.

## Required Metadata

En az:

```text
reason
reportedBy
reportedAt
```

saklanmalıdır.

## Görüntü Tamamlandığında

Sağlık ekibinin kuralına göre dosya yeniden aktif çalışma havuzuna dönmelidir.

Varsayılan geçiş:

```text
IMAGE_MISSING
→ UNREAD
```

Eğer önceki okuma/dikte korunması gereken özel bir senaryo çıkarsa ayrıca iş kuralı tanımlanmalıdır.

İlk pilotta güvenli varsayım:

> yeniden hekim değerlendirmesi

olduğundan `UNREAD` state'ine dönüş yapılacaktır.

## Audit

```text
IMAGE_MISSING_REPORTED
IMAGE_COMPLETED
STUDY_REACTIVATED
```

---

# 21. WONT_REPORT

## Anlamı

Tetkik merkezi raporlama akışında raporlanmayacaktır.

## Giriş

Yetkili kullanıcı gerekli state'lerden bu state'e alabilir.

Örnek:

```text
UNREAD
→ WONT_REPORT
```

## Veri Silme

Hiçbir kayıt silinmez.

## Reactivation

Sağlık ekibinin kuralına göre dosya daha sonra tekrar aktif hale getirilebilir.

Varsayılan:

```text
WONT_REPORT
→ UNREAD
```

## Required Metadata

```text
reason
markedBy
markedAt
```

---

# 22. HOSPITAL_DOCTOR

## Anlamı

Tetkik hastane hekimi tarafından üzerine alınmıştır ve merkezi ekip normal akışta bu tetkiki okumamalıdır.

## Giriş Kaynakları

Manuel yetkili işlem:

```text
UNREAD
→ HOSPITAL_DOCTOR
```

veya dış HBYS event:

```text
EXTERNAL_STUDY_LOCKED
```

## Lock

External lock metadata tutulmalıdır.

Örnek:

```text
externalLocked = true
externalLockSource = HBYS
```

## Merkezi Ekip

Sağlık ekibi kuralına göre merkezi raporlama ekibi gerektiğinde atamayı değiştirebilmelidir.

Bu nedenle state mutlak terminal state değildir.

## Release

Hastane hekimi bıraktığında:

```text
HOSPITAL_DOCTOR
→ UNREAD
```

## Audit

```text
HOSPITAL_DOCTOR_ACQUIRED
HOSPITAL_DOCTOR_RELEASED
```

---

# 23. REVISION_REQUESTED

## Anlamı

Daha önce oluşturulmuş/final edilmiş rapor için tekrar değerlendirme veya revizyon talebi oluşmuştur.

## Kaynak

- yetkili sistem kullanıcısı,
- manager,
- acil hekimi revizyon portalı,
- entegrasyon event'i

olabilir.

## Required Metadata

- request reason
- requestedBy
- requestedAt
- originalReportVersion
- source

## Geçiş

Revizyon işleme alındığında:

```text
REVISION_REQUESTED
→ REVISION_IN_PROGRESS
```

---

# 24. REVISION_IN_PROGRESS

## Anlamı

Rapor revizyon üzerinde aktif olarak çalışılmaktadır.

## Eski Rapor

Eski final version silinmez.

Yeni report version oluşturulur.

Örnek:

```text
v1 FINAL
v2 REVISION_DRAFT
```

## İş Akışı

Revizyon türüne göre yeniden:

- hekim,
- raportör,
- hekim final

adımları kullanılabilir.

İlk pilotta revizyonun ayrıntılı alt workflow'u `REPORT` ve `REVISION` spesifikasyonunda netleştirilebilir.

Temel kural:

> revize edilen yeni sürüm final onaysız HBYS'ye gönderilmez.

## Final Sonrası

Yeni version final olduğunda:

```text
REVISION_IN_PROGRESS
→ HBYS_PENDING
```

şeklinde yeni HBYS gönderimi oluşabilir.

Manager revizyonu ayrıca görebilmelidir.

---

# 25. ADDENDUM_REQUIRED

## Anlamı

İki aylık faturalama dönemi sonrasında rapor değişikliği gerektiği için normal revision yerine Ek Rapor / Addendum gerekmektedir.

## Kural

Sağlık ekibine göre:

> 2 ay kuralı tüm hastanelerde geçerlidir.

Fatura dönemi sonrasında eski rapor değiştirilmez.

Yeni:

> Addendum

kaydı oluşturulur.

## Ek Gönderim

Hastane fatura birimi koordinasyonu gerektirebilir.

Bu nedenle addendum HBYS gönderimi normal otomatik final akışından farklı approval/operation kontrolü gerektirebilir.

Kesin integration detayı `INTEGRATIONS.md` içerisinde tanımlanacaktır.

---

# 26. REVISION VS ADDENDUM KARARI

Backend karar mantığı kavramsal olarak:

```text
revision request
      ↓
original final date kontrolü
      ↓
<= 2 ay
      ↓
REVISION_REQUESTED

> 2 ay
      ↓
ADDENDUM_REQUIRED
```

Ancak gerçek iki aylık tarih hesaplama yöntemi ve faturalama referans tarihi entegrasyon katmanında ayrıca kesinleştirilmelidir.

---

# 27. ALT TETKİKLER

Bir hastanın birden fazla tetkiki varsa her Study ayrı state machine çalıştırır.

Örnek:

```text
Patient X
│
├── Study A → HBYS_SENT
├── Study B → WAITING_TRANSCRIPTION
└── Study C → UNREAD
```

Patient seviyesi tamamlandı bilgisi tüm alt Study'lerin durumundan türetilebilir.

Bir alt tetkik raporlanmamışsa UI bunu ayrıca belirleyici simge ile göstermelidir.

---

# 28. STUDY STATUS VE ASSIGNMENT

Status ile assignment ayrı kavramlardır.

Örneğin:

```text
status = READING
assignedDoctorId = doctor-10
```

ve:

```text
status = TRANSCRIBING
assignedReporterId = reporter-4
```

Assignment değişiklikleri audit'e yazılmalıdır.

---

# 29. FIFO UYGUNLUK

FIFO seçimi status değiştirmez.

FIFO:

> UNREAD tetkiklerinin hangi sırayla hekime sunulduğunu

belirleyen seçim algoritmasıdır.

Pilot ilk aşamada manual seçim açık olabilir.

İleride FIFO aktif edildiğinde backend yalnızca uygun en eski Study'yi verir.

---

# 30. LOCK STATE İLE STATUS AYRIMI

Lock ayrı bir geçici runtime state'dir.

Database Study status:

```text
READING
```

olabilir.

Redis:

```text
lock:study:{id}
```

bulunur.

İkisi birbirini doğrulamalıdır.

Lock kaybolursa status otomatik olarak yanlış şekilde `UNREAD` yapılmamalıdır.

Recovery policy ayrıca tanımlanmalıdır.

---

# 31. LOCK ACQUIRE KURALI

Study lock acquire işlemi atomic olmalıdır.

Akış:

```text
check authorization
↓
check workflow state
↓
SET NX Redis lock
↓
success?
├─ yes → continue
└─ no  → STUDY_LOCKED
```

---

# 32. LOCK TTL

Lock sonsuz olmamalıdır.

Örnek pilot yaklaşımı:

```text
TTL = 60 saniye
heartbeat = 20 saniye
```

Bu rakamlar config üzerinden değiştirilebilir.

Heartbeat devam ettikçe TTL uzatılır.

---

# 33. LOCK RELEASE

Lock şu durumlarda bırakılmalıdır:

- normal işlem tamamlandı,
- kullanıcı çalışma ekranından güvenli çıkış yaptı,
- workflow özel state'e geçti,
- heartbeat timeout oldu,
- manager force release yaptı.

Force release audit'e yazılmalıdır.

---

# 34. TARAYICI KAPANMASI

Tarayıcı beklenmedik şekilde kapanırsa:

- explicit unlock garanti değildir,
- heartbeat durur,
- Redis TTL sona erer.

Backend sonraki erişimde stale assignment olup olmadığını kontrol edebilir.

---

# 35. STATE TRANSITION SERVICE

Önerilen backend interface:

```ts
interface StudyWorkflowService {
  transition(
    studyId: string,
    targetState: StudyStatus,
    context: WorkflowContext
  ): Promise<Study>;
}
```

WorkflowContext:

```ts
interface WorkflowContext {
  actorUserId?: string;
  actorRole?: UserRole;
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

---

# 36. TRANSITION VALIDATION

Her geçişte backend şu kontrolleri yapmalıdır:

1. Study mevcut mu?
2. Actor authenticated mı?
3. Actor authorized mı?
4. Hospital access var mı?
5. Current state uygun mu?
6. Required lock mevcut mu?
7. Actor lock owner mı?
8. Required data tamam mı?
9. Target transition allowed mı?
10. Audit oluşturulabilir mi?

---

# 37. INVALID TRANSITION

Geçersiz geçiş backend tarafından reddedilir.

Örnek:

```text
UNREAD
→ FINAL
```

Error:

```text
INVALID_STATE_TRANSITION
```

Frontend state'i zorla değiştiremez.

---

# 38. STATE TRANSITION TABLE

Ana geçiş tablosu:

| Current | Event | Next |
|---|---|---|
| INITIAL | First HL7 processed | WAITING_ACCEPTANCE |
| WAITING_ACCEPTANCE | Second HL7 matched | IMAGES_PENDING |
| IMAGES_PENDING | Images available | UNREAD |
| UNREAD | Doctor starts reading | READING |
| READING | Doctor completes dictation | READ |
| READ | Workflow continues | WAITING_TRANSCRIPTION |
| WAITING_TRANSCRIPTION | Reporter starts | TRANSCRIBING |
| TRANSCRIBING | Reporter completes report | WAITING_APPROVAL |
| WAITING_APPROVAL | Doctor final approval | FINAL |
| FINAL | Create HBYS job | HBYS_PENDING |
| HBYS_PENDING | HBYS success | HBYS_SENT |
| HBYS_PENDING | HBYS failed | HBYS_FAILED |
| HBYS_FAILED | Retry | HBYS_PENDING |
| READING | Image missing | IMAGE_MISSING |
| IMAGE_MISSING | Images completed | UNREAD |
| UNREAD | Won't report | WONT_REPORT |
| WONT_REPORT | Reactivate | UNREAD |
| UNREAD | Hospital doctor acquired | HOSPITAL_DOCTOR |
| HOSPITAL_DOCTOR | Hospital doctor released | UNREAD |
| HBYS_SENT | Revision requested | REVISION_REQUESTED |
| REVISION_REQUESTED | Revision started | REVISION_IN_PROGRESS |

---

# 39. TERMINAL STATE YOKTUR

`HBYS_SENT` normal ana akışın tamamlanmış durumudur.

Ancak tamamen terminal değildir.

Çünkü daha sonra:

```text
HBYS_SENT
→ REVISION_REQUESTED
```

veya:

```text
HBYS_SENT
→ ADDENDUM_REQUIRED
```

geçişi oluşabilir.

---

# 40. SLA STATE DEĞİLDİR

SLA durumu StudyStatus enum içerisine konulmamalıdır.

Örneğin:

```text
SLA_WARNING
SLA_OVERDUE
```

Study state değildir.

Bunlar ayrı hesaplanmış özelliklerdir.

Örnek:

```ts
slaState:
  | "NORMAL"
  | "WARNING"
  | "OVERDUE"
```

Bir Study aynı anda:

```text
status = WAITING_TRANSCRIPTION
slaState = OVERDUE
```

olabilir.

---

# 41. HBYS DELIVERY STATUS AYRIMI

İleride Study status'tan ayrı:

```ts
HbysDeliveryStatus
```

tutulabilir.

Ancak pilot için:

```text
HBYS_PENDING
HBYS_SENT
HBYS_FAILED
```

Study workflow görünümü açısından korunacaktır.

Data model detayında delivery attempt ayrıca entity olacaktır.

---

# 42. REPORT STATUS AYRIMI

Report kendi iç state'ine sahip olabilir.

Örnek:

```ts
enum ReportStatus {
  DRAFT,
  COMPLETED,
  WAITING_APPROVAL,
  FINAL,
  REVISION_DRAFT,
  SUPERSEDED
}
```

Study status ve Report status birbirine bağlı ancak aynı şey değildir.

---

# 43. STATE TRANSITION + AUDIT ATOMICITY

Mümkün olan durumlarda:

- database state update
- assignment update
- report update
- audit event

aynı transaction içerisinde yapılmalıdır.

Redis lock ve external queue işlemleri transaction dışında kalabilir.

Bunlarda failure compensation uygulanmalıdır.

---

# 44. OUTBOX PRENSİBİ

Pilotun ilk implementasyonunda zorunlu değildir.

Ancak kritik eventlerde database commit sonrası event kaybı riski görülürse:

> Transactional Outbox

pattern eklenebilir.

Özellikle:

- HBYS delivery
- notifications
- external events

için ileride yararlı olabilir.

---

# 45. REALTIME EVENTLER

Başlıca workflow realtime eventleri:

```text
study.status.changed
study.locked
study.unlocked
study.waiting_approval
study.hbys.pending
study.hbys.sent
study.hbys.failed
study.image_missing
study.reactivated
study.revision.requested
```

Kesin payload:

> `REALTIME_EVENTS.md`

içerisinde tanımlanacaktır.

---

# 46. ACTOR MATRIX

Ana transition actorları:

| Transition | Actor |
|---|---|
| İlk HL7 | SYSTEM / HL7 |
| İkinci HL7 | SYSTEM / HL7 |
| Images available | SYSTEM / PACS |
| UNREAD → READING | DOCTOR |
| READING → READ | DOCTOR |
| READ → WAITING_TRANSCRIPTION | SYSTEM |
| WAITING_TRANSCRIPTION → TRANSCRIBING | REPORTER |
| TRANSCRIBING → WAITING_APPROVAL | REPORTER |
| WAITING_APPROVAL → FINAL | DOCTOR |
| FINAL → HBYS_PENDING | SYSTEM |
| HBYS_PENDING → HBYS_SENT | SYSTEM |
| HBYS_PENDING → HBYS_FAILED | SYSTEM |
| HBYS_FAILED → HBYS_PENDING | OPERATION / MANAGER / SYSTEM |
| → IMAGE_MISSING | DOCTOR |
| IMAGE_MISSING → UNREAD | SYSTEM / OPERATION |
| → WONT_REPORT | Yetkili rol |
| WONT_REPORT → UNREAD | Yetkili rol |
| → HOSPITAL_DOCTOR | SYSTEM / OPERATION |
| HOSPITAL_DOCTOR → UNREAD | SYSTEM / OPERATION |
| → REVISION_REQUESTED | Yetkili kaynak |
| REVISION_REQUESTED → REVISION_IN_PROGRESS | Yetkili kullanıcı |

Detaylı yetkiler:

> `AUTH_ROLES_PERMISSIONS.md`

dosyasında kesinleştirilecektir.

---

# 47. TEST MODE STATE MACHINE

Test ortamında gerçek workflow değişmez.

Yalnızca external eventlerin üretim yöntemi farklıdır.

Örneğin:

```text
DevTools
→ send mock first HL7
→ gerçek WorkflowService
```

ve:

```text
DevTools
→ simulate images available
→ gerçek WorkflowService
```

kullanılır.

Test için doğrudan database'de status değiştirmek normal yöntem olmamalıdır.

---

# 48. DEV TOOLS FORCE STATE

Debug amacıyla force transition endpoint gerekirse yalnızca development environment'ta bulunmalıdır.

Örneğin:

```text
POST /dev-tools/studies/:id/force-state
```

Production:

```text
404 / disabled
```

olmalıdır.

Force transition ayrıca audit üretmelidir.

---

# 49. HEALTHCARE DATA SAFETY KURALI

Workflow içerisinde:

- completed report,
- final report,
- previous versions,
- audit history

state değişiklikleri sırasında silinmemelidir.

State değişimi data deletion anlamına gelmez.

---

# 50. REVISION HISTORY

Örneğin:

```text
Study HBYS_SENT
↓
Revision Requested
↓
Revision In Progress
↓
New Final Version
↓
HBYS Pending
↓
HBYS Sent
```

eski:

```text
Report Version 1 FINAL
```

korunmalıdır.

Yeni:

```text
Report Version 2 FINAL
```

oluşturulmalıdır.

---

# 51. INFORMATION NOTES STATE DEĞİŞTİRMEZ

Information / Note eklemek normal durumda Study status değiştirmez.

Örnek:

```text
status = READING
note added
status remains READING
```

Ancak notification üretilebilir.

---

# 52. LISTE 1–6 STATE DEĞİLDİR

Liste 1–6 üyeliği StudyStatus değildir.

Ayrı association / metadata olarak tutulmalıdır.

Study aynı anda:

```text
status = UNREAD
specialList = LIST_2
```

olabilir.

---

# 53. PATIENT CATEGORY STATE DEĞİLDİR

Acil, Yatan, Yoğun Bakım, Normal:

> PatientCategory

alanıdır.

Workflow status ile karıştırılmamalıdır.

Örnek:

```text
category = ACIL
status = WAITING_TRANSCRIPTION
```

---

# 54. USER ASSIGNMENT STATE DEĞİLDİR

Hekim veya raportör assignment:

> ayrı relation / field

olarak tutulur.

Status assignment bilgisini ima edebilir ancak tek veri kaynağı değildir.

---

# 55. EXTERNAL LOCK İLE INTERNAL LOCK

İki lock türü ayırt edilmelidir.

## Internal Lock

Raporlama sistemindeki Doctor/Reporter tarafından oluşturulur.

Redis tabanlıdır.

## External Lock

Hastane hekimi HBYS tarafında dosyayı üzerine aldığında gelir.

Persistence gerektirebilir çünkü dış sistem state'idir.

External lock Redis'e ek olarak database metadata ile tutulabilir.

---

# 56. EXTERNAL LOCK ÖNCELİĞİ

Hastane hekimi lock event'i geldiğinde ve Study henüz merkezde aktif okunmuyorsa:

```text
→ HOSPITAL_DOCTOR
```

geçişi yapılır.

Eğer Study merkezde aktif lock altındaysa çakışma durumu:

> integration conflict

olarak operasyon ekranına düşmelidir.

Sağlık ekibi kaynağı bu çakışmanın kesin çözüm önceliğini tanımlamadığı için sistem otomatik veri kaybına neden olacak karar vermemelidir.

Pilot için:

> conflict alert + operation review

yaklaşımı kullanılmalıdır.

---

# 57. APPROVAL RETURN

Sağlık ekibi final onay zorunluluğunu açıkça tanımlamıştır.

Ancak hekimin raporu raportöre hangi detaylı state ile geri göndereceği kesin isimlendirilmemiştir.

Pilot için ihtiyaç çıkarsa:

```text
WAITING_APPROVAL
→ WAITING_TRANSCRIPTION
```

geri geçişi desteklenebilir.

Bu geçiş:

- reason zorunlu,
- audit zorunlu,
- notification zorunlu

olmalıdır.

Bu özellik `BACKEND.md` ve `FRONTEND.md` hazırlanırken net uygulanacaktır.

---

# 58. STATUS TIMESTAMPS

Study üzerinde state history tutulmalıdır.

Örnek ayrı entity:

```text
StudyStatusHistory
```

Alanlar:

```text
studyId
fromStatus
toStatus
changedBy
changedAt
reason
metadata
```

Bu yapı:

- süre analizi,
- audit,
- manager istatistikleri

için kullanılabilir.

---

# 59. MANAGER SÜRE ANALİZİ

Hekim okuma süresi:

```text
READING startedAt
→ READ completedAt
```

Raportör yazım süresi:

```text
TRANSCRIBING startedAt
→ WAITING_APPROVAL enteredAt
```

üzerinden hesaplanabilir.

Bu süreler frontend'in local timestamp'lerinden hesaplanmamalıdır.

Backend timestamp esas alınmalıdır.

---

# 60. SLA START TIME

SLA başlangıcı sağlık ekibinin tanımına göre:

> ikinci HL7 sonrası dosyanın görüntüleme/raporlama sürecine geliş zamanı

üzerinden ele alınacaktır.

Kesin alan adı:

```text
slaStartedAt
```

veya:

```text
arrivalAt
```

olarak data modelde tanımlanacaktır.

---

# 61. SLA COMPLETION

Sözleşmesel raporlama süresinin hangi noktada tamamlanmış sayılacağı health team dokümanında doğrudan ayrı teknik alan olarak ifade edilmemiştir.

Mevcut iş akışına göre pilotta:

> hekim final onayı

raporun klinik tamamlanma noktası olarak kullanılabilir.

HBYS gönderim hatası nedeniyle rapor klinik olarak tekrar gecikmiş sayılmamalıdır.

Bu varsayım ileride sözleşmesel yorumla farklılaşırsa MASTER_SPEC güncellenmelidir.

---

# 62. STATE RECOVERY

Sistem restart olduğunda:

- PostgreSQL state korunur.
- Redis ephemeral locks yeniden değerlendirilebilir.
- Queue pending jobs recover edilmelidir.
- Workflow database state'ten devam eder.

Application memory workflow state kaynağı olmamalıdır.

---

# 63. DUPLICATE HL7

Aynı HL7 event tekrar gelirse:

- duplicate Study oluşturulmamalı,
- state gereksiz yere resetlenmemeli,
- idempotent processing yapılmalıdır.

Özellikle:

```text
hospitalId + accessionNumber
```

unique context olarak değerlendirilmelidir.

Kesin unique constraint:

> `DATA_MODEL.md`

içerisinde tanımlanacaktır.

---

# 64. DUPLICATE COMPLETION EVENT

Aynı event iki kez geldiğinde state machine idempotent davranmalıdır.

Örnek:

Study zaten:

```text
HBYS_SENT
```

ise aynı success event tekrar geldiğinde yeni state üretmemelidir.

Audit gerekirse duplicate ignored event olarak kaydedilebilir.

---

# 65. BUSINESS ERROR CODES

Workflow ile ilişkili temel hata kodları:

```text
INVALID_STATE_TRANSITION
STUDY_LOCKED
LOCK_NOT_OWNED
LOCK_EXPIRED
STUDY_NOT_READY
DICTATION_REQUIRED
REPORT_REQUIRED
FINAL_APPROVAL_REQUIRED
IMAGES_NOT_AVAILABLE
HBYS_NOT_RETRYABLE
EXTERNAL_LOCK_CONFLICT
NOT_AUTHORIZED_FOR_TRANSITION
```

Kesin API error contract:

> `API_CONTRACT.md`

içerisinde tanımlanacaktır.

---

# 66. PILOT MINIMUM WORKFLOW

İlk 5 günlük pilotun zorunlu state zinciri:

```text
WAITING_ACCEPTANCE
→ IMAGES_PENDING
→ UNREAD
→ READING
→ WAITING_TRANSCRIPTION
→ TRANSCRIBING
→ WAITING_APPROVAL
→ FINAL
→ HBYS_PENDING
→ HBYS_SENT
```

ve hata senaryosu:

```text
HBYS_PENDING
→ HBYS_FAILED
→ HBYS_PENDING
→ HBYS_SENT
```

Ayrıca minimum özel state testi:

```text
READING
→ IMAGE_MISSING
→ UNREAD
```

olmalıdır.

---

# 67. PILOT LOCK TEST

Minimum lock acceptance:

1. Doctor A Study açar.
2. Study `READING`.
3. Lock owner Doctor A.
4. Doctor B aynı Study'yi açmaya çalışır.
5. Backend reddeder.
6. UI kilit bilgisini gösterir.
7. Doctor A tamamlar.
8. Lock kaldırılır.

Reporter için aynı test tekrarlanmalıdır.

---

# 68. PILOT REVISION TEST

Revision modülü pilot son fazına yetişirse minimum:

```text
HBYS_SENT
→ REVISION_REQUESTED
→ REVISION_IN_PROGRESS
→ new report version
→ FINAL
→ HBYS_PENDING
→ HBYS_SENT
```

akışı test edilmelidir.

Eski version korunmalıdır.

---

# 69. PILOT EXTERNAL LOCK TEST

Mock HBYS / DevTools ile:

```text
EXTERNAL_STUDY_LOCKED
```

event üretilebilir.

Study:

```text
UNREAD
→ HOSPITAL_DOCTOR
```

olmalıdır.

Release:

```text
HOSPITAL_DOCTOR
→ UNREAD
```

olmalıdır.

---

# 70. STATE MACHINE KODLAMA KURALI

Kod içerisinde dağınık şekilde:

```ts
study.status = ...
```

kullanılmamalıdır.

Status değişiklikleri merkezi method üzerinden yapılmalıdır.

Örnek:

```ts
workflow.transition(...)
```

Bu kural unit test ile korunmalıdır.

---

# 71. FRONTEND KURALI

Frontend status değerlerini yorumlayabilir ancak üretemez.

Örnek:

```text
status === READING
→ "Okunuyor"
```

gösterebilir.

Ancak frontend:

```text
setStudyStatus("FINAL")
```

şeklinde local business state değiştiremez.

---

# 72. BACKEND KURALI

Backend controller yalnızca action kabul etmelidir.

Örnek:

```text
POST /studies/:id/start-reading
POST /studies/:id/complete-reading
POST /studies/:id/start-transcription
POST /studies/:id/submit-report
POST /studies/:id/finalize
```

Tercihen kullanıcıdan:

```text
targetStatus = arbitrary string
```

kabul edilmemelidir.

Workflow action endpointleri daha güvenlidir.

Kesin endpointler `API_CONTRACT.md` içerisinde belirlenecektir.

---

# 73. STATE MACHINE TEST KURALI

Her allowed transition için test yazılmalıdır.

Her kritik forbidden transition için de test yazılmalıdır.

Örnek:

```text
UNREAD → READING = PASS
UNREAD → FINAL = REJECT
TRANSCRIBING → HBYS_SENT = REJECT
```

---

# 74. WORKFLOW INVARIANTS

Aşağıdaki kurallar her zaman doğru olmalıdır:

1. `READING` state'inde aktif Doctor assignment bulunmalıdır.
2. `TRANSCRIBING` state'inde aktif Reporter assignment bulunmalıdır.
3. `WAITING_APPROVAL` state'inde tamamlanmış bir report draft bulunmalıdır.
4. `FINAL` state'inde final report version bulunmalıdır.
5. `HBYS_SENT` state'inde başarılı delivery record bulunmalıdır.
6. Revision eski final version'ı silmemelidir.
7. Aynı Study aynı anda iki internal active lock taşıyamaz.
8. External lock conflict sessizce override edilmemelidir.

---

# 75. SOURCE OF TRUTH

Workflow için öncelik:

1. `MASTER_SPEC.md`
2. `WORKFLOW_STATE_MACHINE.md`
3. `API_CONTRACT.md`
4. Backend implementation

Kod bu dokümanlardan farklı davranıyorsa:

> kod hatalı kabul edilir.

---

# 76. SON KURAL

Yeni bir Study state eklenmesi gerektiğinde:

1. Önce iş gereksinimi doğrulanır.
2. `MASTER_SPEC.md` gerekiyorsa güncellenir.
3. Bu dosya güncellenir.
4. `DATA_MODEL.md` enum etkisi kontrol edilir.
5. `API_CONTRACT.md` etkisi kontrol edilir.
6. `FRONTEND.md` etkisi kontrol edilir.
7. `BACKEND.md` etkisi kontrol edilir.
8. Son olarak kod değiştirilir.

State machine geliştirici tarafından rastgele genişletilemez.