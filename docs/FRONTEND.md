# FRONTEND.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Frontend Uygulama Rehberi

> **Doküman Türü:** Frontend Implementation Guide  
> **Ana Geliştirici:** Codex  
> **Framework:** Next.js  
> **UI Library:** React  
> **Language:** TypeScript  
> **Styling:** Tailwind CSS  
> **Component Library:** shadcn/ui  
> **Server State:** TanStack Query  
> **Local UI State:** Zustand / React State  
> **Realtime:** Socket.IO Client / WebSocket  
> **Pilot Hosting:** Vercel  
> **Ana Frontend Dizini:** `apps/frontend`

---

# 1. DOKÜMANIN AMACI

Bu dosya frontend kodunun nasıl organize edileceğini ve Codex’in frontend geliştirirken uyması gereken kuralları tanımlar.

Codex frontend geliştirmeye başlamadan önce en az şu dosyaları okumalıdır:

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
docs/FRONTEND.md
```

Bu dosya iş kuralı kaynağı değildir.

Çelişki varsa öncelik:

```text
MASTER_SPEC
→ WORKFLOW_STATE_MACHINE
→ AUTH_ROLES_PERMISSIONS
→ API_CONTRACT
→ FRONTEND.md
```

şeklindedir.

---

# 2. CODEX ÇALIŞMA ALANI

Codex’in ana çalışma alanı:

```text
apps/frontend/
```

olacaktır.

Codex gerekmedikçe:

```text
apps/backend/
```

içerisinde geniş kapsamlı değişiklik yapmamalıdır.

Backend değişikliği gerekiyorsa bunu:

- TASK_QUEUE
- PROGRESS

dosyalarında belirtmelidir.

---

# 3. FRONTEND ANA PRENSİBİ

Frontend:

> iş akışını gösterir ve kullanıcı etkileşimini yönetir.

Frontend:

> iş akışının sahibi değildir.

Örnek yanlış:

```ts
setStudyStatus("FINAL");
```

Örnek doğru:

```text
POST /studies/:id/finalize
↓
backend response
↓
query update
```

---

# 4. SOURCE OF TRUTH

Frontend için gerçek state kaynağı:

> backend API + backend realtime eventleri

olacaktır.

Local state yalnız:

- UI,
- geçici form,
- player,
- modal,
- filtre

için kullanılmalıdır.

---

# 5. BUSINESS STATE FRONTEND’DE ÜRETİLMEZ

Frontend kendi başına:

```text
status
slaState
hbysStatus
assignedDoctorId
assignedReporterId
finalizedAt
```

üretmemelidir.

Bu değerler backend’den gelmelidir.

---

# 6. FRONTEND MİMARİ YAPI

Önerilen klasör yapısı:

```text
apps/frontend/
│
├── app/
│   ├── login/
│   ├── doctor/
│   ├── reporter/
│   ├── operation/
│   ├── manager/
│   ├── dev-tools/
│   └── layout.tsx
│
├── components/
│   ├── ui/
│   ├── study/
│   ├── dictation/
│   ├── report/
│   ├── pacs/
│   ├── information/
│   ├── notifications/
│   └── layout/
│
├── features/
│   ├── auth/
│   ├── studies/
│   ├── dictations/
│   ├── reports/
│   ├── locks/
│   ├── hbys/
│   ├── sla/
│   ├── realtime/
│   └── manager/
│
├── lib/
│   ├── api/
│   ├── auth/
│   ├── query/
│   ├── socket/
│   ├── utils/
│   └── env/
│
├── hooks/
├── stores/
└── types/
```

---

# 7. APP ROUTES

Pilot için önerilen route’lar:

```text
/login

/doctor/studies
/doctor/studies/[studyId]
/doctor/approvals
/doctor/approvals/[studyId]

/reporter/studies
/reporter/studies/[studyId]

/operation
/operation/studies/[studyId]

/manager
/manager/users
/manager/performance
/manager/compensation
/manager/studies/[studyId]

/dev-tools
```

---

# 8. ROUTE GUARD PRENSİBİ

Frontend role bazlı route visibility sağlayabilir.

Ancak frontend route guard:

> security’nin tek kaynağı değildir.

Backend 403 her zaman esas kontrol olarak kalır.

---

# 9. LOGIN PAGE

Login ekranı minimum:

```text
email
password
login button
loading
error
```

içermelidir.

Hard-coded test login button production/pilot ana UI’da bulunmamalıdır.

---

# 10. AUTH STATE

Auth state:

- current user,
- access token memory/state,
- session restore state

tutabilir.

Refresh token JavaScript state içinde tutulmamalıdır.

---

# 11. ACCESS TOKEN

Access token memory veya güvenli client state içinde tutulabilir.

LocalStorage tercih edilmemelidir.

Refresh cookie backend tarafından HttpOnly yönetilir.

---

# 12. AUTH REFRESH

API client 401 aldığında:

```text
refresh attempt
↓
new access token
↓
retry original request
```

yapabilir.

Loop oluşmamalıdır.

---

# 13. LOGOUT

Logout sonrası:

- local auth state temizlenir,
- query cache temizlenir,
- socket disconnect edilir,
- login sayfasına dönülür.

---

# 14. ROLE BASED NAVIGATION

## DOCTOR

```text
Okuma Havuzu
Onay Bekleyenler
Bildirimler
```

## REPORTER

```text
Yazılmayanlar
Aktif Çalışma
Bildirimler
```

## OPERATION

```text
Operasyon Havuzu
SLA
HBYS Hataları
İmaj Eksik
Hastane DR
Information
```

## MANAGER

```text
Dashboard
Tetkikler
Kullanıcılar
Performans
Hakediş
Audit
DevTools
```

---

# 15. STUDY LIST PRENSİBİ

Study list backend’in `/studies` endpointini kullanır.

Liste frontend local mock array üzerinden yönetilmemelidir.

---

# 16. STUDY LIST MINIMUM COLUMNS

Minimum:

```text
Hasta
Accession
Tetkik
Hastane
Kategori
Geliş
Kalan / Gecikme
Durum
Atama
Lock
```

---

# 17. CATEGORY LABELS

Internal enum:

```text
ACIL
YOGUN_BAKIM
YATAN
NORMAL
```

UI label:

```text
Acil
Yoğun Bakım
Yatan
Normal / Poliklinik
```

olabilir.

Shared enum duplicate edilmez.

---

# 18. STUDY STATUS LABELS

Frontend map örneği:

```text
UNREAD → Okunmayan
READING → Okunuyor
WAITING_TRANSCRIPTION → Yazılmayan
TRANSCRIBING → Yazılıyor
WAITING_APPROVAL → Hekim Onayı Bekliyor
HBYS_PENDING → HBYS Gönderiliyor
HBYS_SENT → HBYS Gönderildi
HBYS_FAILED → HBYS Gönderilemedi
IMAGE_MISSING → İmaj Eksik
WONT_REPORT → Yazılmayacak
HOSPITAL_DOCTOR → Hastane DR
```

---

# 19. STATUS COLOR PRENSİBİ

Durum renkleri tutarlı olmalıdır.

Örnek:

```text
normal → neutral
active work → blue
warning → amber
overdue/error → red
completed → green
```

Ancak yalnız renk kullanılmamalıdır.

Text/badge da gösterilmelidir.

---

# 20. SLA GÖSTERİMİ

Study list ve detail ekranında:

```text
Geliş
Kalan
Gecikme
```

gösterilebilir.

Frontend backend’in verdiği:

```text
remainingSeconds
overdueSeconds
sla.state
```

değerlerini kullanır.

---

# 21. SLA CLIENT TIMER

Frontend remaining time’ı görsel olarak saniye/dakika bazında azaltabilir.

Ancak authoritative deadline:

> backend `deadlineAt`

olmalıdır.

Periyodik refetch/realtime ile doğrulanmalıdır.

---

# 22. SLA WARNING

Backend `WARNING` döndürüyorsa UI dikkat çekmelidir.

Yaklaşık 20 dakika kuralını frontend tekrar hesaplamamalıdır.

---

# 23. STUDY WORKSPACE ANA PRENSİBİ

Projenin en önemli UX kuralı:

> Kullanıcı Study’den kopmadan çalışmalıdır.

Doctor veya Reporter:

- hasta bilgisi,
- tetkik,
- klinik bilgi,
- görüntü,
- ses,
- rapor,
- not

için farklı bağımsız modüllere sürekli gitmemelidir.

---

# 24. DOCTOR STUDY WORKSPACE

Doctor ekranında minimum:

```text
Patient Header
Study Header
Clinical Information
PACS / Viewer
Dictation Controls
Information Notes
SLA
Lock Status
Workflow Actions
```

aynı çalışma ekranında bulunmalıdır.

---

# 25. DOCTOR LAYOUT

Öneri:

```text
┌──────────────────────────────────────────────────┐
│ Patient + Study + Status + SLA                  │
├────────────────────────────┬─────────────────────┤
│ PACS / Viewer              │ Clinical Info       │
│                            │                     │
│                            │ Information Notes   │
├────────────────────────────┴─────────────────────┤
│ Dictation Controls                               │
├──────────────────────────────────────────────────┤
│ Workflow Actions                                 │
└──────────────────────────────────────────────────┘
```

---

# 26. START READING UX

Doctor Study listesinde Study’ye tıkladığında hemen local edit açılmamalıdır.

Akış:

```text
user action
↓
POST start-reading
↓
success
↓
workspace active
```

423 gelirse workspace read/edit açılmaz.

---

# 27. LOCK UI

Lock bilgisi görünür olmalıdır.

Örnek:

```text
Okunuyor — Dr. Test Doctor
Başlangıç: 14:32
```

Hover/popover ile detay gösterilebilir.

---

# 28. LOCK ERROR UX

423 alındığında:

> genel hata

yerine anlamlı mesaj gösterilmelidir.

Örnek:

```text
Bu tetkik şu anda Dr. Test Doctor tarafından okunuyor.
```

---

# 29. LOCK HEARTBEAT

Study active workspace açıldığında frontend:

```text
20 saniye civarı
```

heartbeat gönderebilir.

Interval backend response/config ile uyumlu olmalıdır.

---

# 30. HEARTBEAT FAILURE

Heartbeat fail olduğunda frontend bunu sessizce görmezden gelmemelidir.

Örnek:

```text
Çalışma kilidi doğrulanamıyor.
Bağlantınızı kontrol edin.
```

gösterebilir.

Edit/final action öncesi backend yine doğrular.

---

# 31. SAFE EXIT

Doctor/Reporter workspace’den çıkarken mümkünse normal lock release çağrısı yapılabilir.

Ancak browser kapanması güvenilir olmadığı için TTL esas recovery mekanizmasıdır.

---

# 32. PACS AREA

Doctor workspace’de PACS viewer alanı bulunmalıdır.

Durumlar:

```text
loading
available
not found
unavailable
error
```

---

# 33. PACS VIEWER

Viewer URL backend’den alınır.

Frontend:

- PACS credential üretmez,
- PACS secret bilmez.

---

# 34. PACS OPEN STRATEGY

Pilot:

- embedded iframe,
- new tab,
- viewer panel

seçeneklerinden biri uygulanabilir.

Security/CORS şartlarına göre karar verilir.

Ana amaç:

> Doctor’ın Study’den görüntüye erişebilmesi.

---

# 35. DICTATION COMPONENT

Doctor dictation component minimum:

```text
microphone permission
start
stop
duration
upload status
retry
complete state
```

---

# 36. MEDIARECORDER

Browser MediaRecorder kullanılabilir.

MIME capability runtime kontrol edilmelidir.

Tercih:

```text
audio/webm;codecs=opus
```

uygun browserlarda.

---

# 37. MICROPHONE PERMISSION UX

Permission reddedilirse:

```text
Mikrofon erişimi verilmeden dikte oluşturulamaz.
```

gibi anlaşılır mesaj gösterilmelidir.

---

# 38. RECORDING STATE

Minimum client state:

```text
IDLE
REQUESTING_PERMISSION
RECORDING
STOPPED
UPLOADING
COMPLETED
ERROR
```

StudyStatus ile karıştırılmamalıdır.

---

# 39. DICTATION UPLOAD

Kayıt stop sonrası backend upload edilir.

Upload tamamlanmadan Doctor:

> Okumayı Tamamla

action’ını kullanamamalıdır veya backend `DICTATION_REQUIRED` ile reddeder.

---

# 40. UPLOAD FAILURE

Upload fail olduğunda:

- kayıt blob’u mümkünse local state’de tutulur,
- retry verilir,
- success gösterilmez.

---

# 41. VAD

Voice Activity Detection ilk pilotta implement edilirse component arkasında kalmalıdır.

P0 audio workflow:

```text
record
upload
playback
```

bozulmamalıdır.

---

# 42. COMPLETE READING UX

Doctor “Okumayı Tamamla” dediğinde:

```text
confirm if needed
↓
POST complete-reading
↓
WAITING_TRANSCRIPTION
↓
workspace leaves active state
```

---

# 43. IMAGE MISSING UX

Doctor:

> İmaj Eksik

action’ını kullanabilir.

Reason modal:

```text
Eksik seri / açıklama
```

zorunludur.

Success sonrası Study aktif reading ekranından çıkar.

---

# 44. REPORTER QUEUE

Reporter listesi:

```text
WAITING_TRANSCRIPTION
```

Study’leri gösterir.

Minimum bilgiler:

```text
Hasta
Tetkik
Hekim
Dikte süresi
Kategori
Geliş
SLA
Information indicator
```

---

# 45. START TRANSCRIPTION UX

Reporter Study seçtiğinde:

```text
POST start-transcription
```

başarılı olmadan editor aktif edilmez.

423 gelirse lock owner gösterilir.

---

# 46. REPORTER WORKSPACE ANA KURALI

Reporter aynı ekranda:

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

görmelidir.

Ses için ayrı modüle gitmek gerekmemelidir.

---

# 47. REPORTER LAYOUT

Öneri:

```text
┌──────────────────────────────────────────────────┐
│ Patient + Study + Doctor + SLA                  │
├──────────────────────┬───────────────────────────┤
│ Clinical Information │ Audio Player              │
│ Information Notes    │                           │
├──────────────────────┴───────────────────────────┤
│ Report Editor                                    │
│                                                  │
│                                                  │
├──────────────────────────────────────────────────┤
│ Save Status          Submit for Doctor Approval  │
└──────────────────────────────────────────────────┘
```

---

# 48. AUDIO PLAYER

Minimum:

```text
play
pause
seek
current time
duration
```

Desteklenebilir ekler:

```text
playback speed
keyboard shortcut
skip ±5 seconds
```

Pilot P0 değildir.

---

# 49. AUDIO SOURCE

Playback URL backend endpoint üzerinden alınır.

Signed URL expire olursa yeniden fetch edilir.

---

# 50. REPORT EDITOR

Pilot için rapor editor:

> plain text veya kontrollü rich text

olabilir.

Complex word processor P0 değildir.

---

# 51. REPORT EDITOR STATE

Editor local state kullanıcı yazarken tutulabilir.

Server persistence autosave ile yapılır.

---

# 52. AUTOSAVE

Debounce:

```text
2–5 saniye
```

aralığında olabilir.

State:

```text
Kaydediliyor
Kaydedildi
Kaydetme başarısız
```

gösterilmelidir.

---

# 53. AUTOSAVE FALSE SUCCESS YASAĞI

API request fail ise:

```text
Kaydedildi
```

gösterilemez.

---

# 54. UNSAVED CHANGES

Kullanıcı sayfadan çıkarken unsaved değişiklik varsa uyarı düşünülebilir.

Pilot için browser beforeunload kullanılabilir.

---

# 55. SUBMIT REPORT

Reporter:

```text
Hekim Onayına Gönder
```

action’ını kullanır.

Backend success sonrası:

```text
WAITING_APPROVAL
```

olur.

Reporter lock bırakılır.

---

# 56. SUBMIT CONFIRMATION

Rapor boşsa frontend submit butonunu disable edebilir.

Backend yine validation yapmalıdır.

---

# 57. DOCTOR APPROVAL QUEUE

Doctor için ayrı görünür:

```text
Onay Bekleyenler
```

alanı olmalıdır.

Header/nav badge:

```text
Onay Bekleyenler (4)
```

gibi olabilir.

---

# 58. APPROVAL NOTIFICATION

Realtime event geldiğinde:

- badge count güncellenir,
- toast gösterilebilir,
- query invalidate edilir.

---

# 59. APPROVAL WORKSPACE

Doctor minimum:

```text
Patient
Study
Clinical Information
PACS
Report
Information
Finalize
Return to Reporter
```

görmelidir.

---

# 60. APPROVAL LOCK

Doctor active approval edit’e girince backend approval lock oluşturuyorsa frontend heartbeat yapmalıdır.

---

# 61. DOCTOR REPORT EDIT

Doctor final öncesi report content düzenleyebiliyorsa:

- değişiklik kaydedilir,
- save state gösterilir.

Frontend final content’i sadece local state’te bırakmamalıdır.

---

# 62. RETURN TO REPORTER

Action:

```text
Raportöre Geri Gönder
```

Reason modal zorunludur.

Success:

```text
WAITING_TRANSCRIPTION
```

---

# 63. FINALIZE UX

Doctor:

```text
Final Onayla
```

action’ını kullanır.

Gerekirse confirmation dialog gösterilebilir.

---

# 64. FINALIZE SUCCESS

Backend finalize response:

```text
HBYS_PENDING
```

ise UI:

```text
Rapor final onaylandı.
HBYS gönderimi bekleniyor.
```

göstermelidir.

---

# 65. HBYS SUCCESS UX

Realtime/API sonucu:

```text
HBYS_SENT
```

olduğunda:

```text
HBYS’ye gönderildi
```

gösterilir.

---

# 66. HBYS FAILURE UX

```text
HBYS_FAILED
```

durumunda:

- kırmızı badge,
- hata kısa açıklaması,
- Operation/Manager retry action

görünmelidir.

Doctor yalnız read-only status görebilir.

---

# 67. HBYS PENDING ≠ SENT

Frontend bu iki durumu kesin ayırmalıdır.

---

# 68. OPERATION DASHBOARD

Operation ekranı operasyon odaklı olmalıdır.

Ana alanlar:

```text
Aktif İşler
SLA Uyarısı
Gecikenler
HBYS Hataları
İmaj Eksik
Hastane DR
Information Uyarıları
```

---

# 69. OPERATION TABLE

Minimum kolonlar:

```text
Hasta
Tetkik
Hastane
Kategori
Durum
Atanan Hekim
Atanan Raportör
Lock
Kalan/Gecikme
HBYS
```

---

# 70. OPERATION IMAGE MISSING

Operation IMAGE_MISSING satırında:

```text
Çözüldü / Tekrar Aktifleştir
```

action’ına erişebilir.

Reason/resolution note alınabilir.

---

# 71. OPERATION HBYS RETRY

HBYS_FAILED satırında:

```text
Tekrar Gönder
```

action’ı bulunabilir.

Reason girilebilir.

---

# 72. OPERATION FORCE UNLOCK

Aktif stale lock için:

```text
Kilidi Zorla Kaldır
```

action’ı olabilir.

Reason zorunludur.

Bu action belirgin ve riskli işlem olarak gösterilmelidir.

---

# 73. WONT REPORT UI

Operation/Manager:

```text
Yazılmayacak
```

işaretleyebilir.

Reason zorunludur.

Reactivate ayrı action olarak bulunur.

---

# 74. HOSPITAL DOCTOR UI

Study:

```text
Hastane DR
```

durumundaysa merkezi Doctor için active reading action gösterilmemelidir.

Operation/Manager external lock bilgisi görebilir.

---

# 75. SPECIAL LISTS

Liste 1–6:

- filter,
- badge,
- assignment action

olarak uygulanabilir.

Patient category değiştirilmemelidir.

---

# 76. MANAGER DASHBOARD

Minimum kartlar:

```text
Toplam Tetkik
Acil
Yoğun Bakım
Yatan
Normal

Okunmayan
Yazılmayan
Onay Bekleyen
Final
HBYS Hatalı
Geciken
```

---

# 77. MANAGER USERS

Minimum:

```text
User list
Create user
Role
Status
Hospital access
```

---

# 78. USER CREATE FORM

Alanlar:

```text
email
firstName
lastName
role
hospitalIds
temporaryPassword
```

Password response’dan tekrar okunmamalıdır.

---

# 79. MANAGER PERFORMANCE

P2/Pilot ilerleyen faz:

```text
Doctor study count
Doctor avg reading duration
Reporter report count
Reporter avg transcription duration
```

---

# 80. MANAGER COMPENSATION

Pilot:

```text
month
user
Acil
Yoğun Bakım
Yatan
Normal
Total
```

gösterir.

`calculatedAmount` null olabilir.

Frontend finansal formül hesaplamamalıdır.

---

# 81. AUDIT TIMELINE

Operation/Manager Study detayında audit timeline olabilir.

Örnek:

```text
14:02 İlk HL7
14:18 Tetkik kabul
14:30 Dr. X okumaya başladı
14:36 Dikte tamamlandı
14:40 Raportör Y yazmaya başladı
...
```

---

# 82. AUDIT IMMUTABLE UX

Audit UI’da:

- edit,
- delete

action’ı olmamalıdır.

---

# 83. INFORMATION NOTES

Information component Study workspace içinde görünmelidir.

Her not:

```text
Author
Role
Timestamp
Content
```

gösterir.

---

# 84. INFORMATION HISTORY

Note güncellenmişse:

```text
Geçmiş
```

açılabilir.

Eski versionlar gösterilebilir.

Delete action yoktur.

---

# 85. INFORMATION ALERT

Yeni note realtime geldiğinde:

- badge,
- highlight,
- toast

gibi dikkat çekici davranış olabilir.

---

# 86. REALTIME CLIENT

Socket connection merkezi bir client üzerinden yönetilmelidir.

Her component kendi ayrı socket instance’ını yaratmamalıdır.

---

# 87. REALTIME AUTH

Socket auth backend contract ile uyumlu olmalıdır.

Access token handshake veya güvenli auth mekanizması kullanılabilir.

---

# 88. REALTIME EVENT HANDLING

Event geldiğinde çoğu durumda:

```text
queryClient.invalidateQueries(...)
```

veya targeted cache update kullanılmalıdır.

---

# 89. SOCKET RECONNECT

Reconnect sonrası:

> server state yeniden fetch edilmelidir.

Kaçırılan eventlerin tamamı client memory’den tahmin edilmemelidir.

---

# 90. POLLING FALLBACK

WebSocket unavailable ise kritik listeler:

```text
5–15 saniye
```

aralığında polling/refetch kullanabilir.

Bu fallback açıkça belgelenir.

---

# 91. TANSTACK QUERY

Server state:

```text
studies
study detail
report
dictations
notifications
manager stats
```

TanStack Query ile yönetilmelidir.

---

# 92. QUERY KEYS

Tutarlı key factory önerilir.

Örnek:

```ts
studyKeys.all
studyKeys.list(filters)
studyKeys.detail(id)
studyKeys.report(id)
studyKeys.audit(id)
```

---

# 93. MUTATION INVALIDATION

Örnek:

start reading success:

```text
invalidate study list
update study detail
```

submit report:

```text
invalidate reporter list
invalidate doctor approval count
```

---

# 94. ZUSTAND

Zustand yalnız gerektiğinde:

```text
app shell
selected filters
player state
temporary UI preferences
```

için kullanılabilir.

Backend Study state’i Zustand source of truth olmamalıdır.

---

# 95. FORM MANAGEMENT

Forms için:

```text
React Hook Form
+
Zod
```

kullanılabilir.

Backend validation yine zorunludur.

---

# 96. SHARED TYPES

Frontend mümkün olduğunca:

```text
packages/shared
```

type/enums kullanmalıdır.

Duplicate:

```ts
enum StudyStatus {...}
```

frontend içinde oluşturulmamalıdır.

---

# 97. API TYPES

API response type’ları shared package’dan alınabilir.

Prisma model type’ı frontend import edilmemelidir.

---

# 98. ERROR HANDLING

Merkezi API error parser:

```text
error.code
error.message
details
```

ile çalışmalıdır.

---

# 99. BUSINESS ERROR UX

Örnek mapping:

```text
STUDY_LOCKED
→ Lock dialog

HOSPITAL_ACCESS_DENIED
→ Yetkisiz erişim

DICTATION_REQUIRED
→ Dikte tamamlanmalı

HBYS_NOT_RETRYABLE
→ Tekrar gönderim yapılamıyor
```

---

# 100. 401

Session refresh denenir.

Başarısızsa login’e dönülür.

---

# 101. 403

UI:

```text
Bu işlem için yetkiniz bulunmuyor.
```

gösterebilir.

---

# 102. 423

Özel lock UI kullanılmalıdır.

---

# 103. 500

Generic:

```text
İşlem sırasında bir sunucu hatası oluştu.
```

gösterilir.

Raw stack trace gösterilmez.

---

# 104. LOADING STATE

Önemli sayfalar:

```text
loading
empty
error
success
```

durumlarını ayrı tasarlamalıdır.

---

# 105. SKELETON

Study list/detail yüklenirken skeleton kullanılabilir.

P0 değildir ancak UX’i iyileştirir.

---

# 106. EMPTY STATE

Örnek:

```text
Onay bekleyen rapor bulunmuyor.
```

gibi açıklayıcı boş ekran olmalıdır.

---

# 107. TABLE PERFORMANCE

Pilot veri az olsa da:

- pagination,
- stable keys,
- controlled rendering

kullanılmalıdır.

---

# 108. FILTERS

Study pool filtreleri:

```text
Hospital
Category
Status/Pool
SLA
Special List
Search
```

olabilir.

---

# 109. SEARCH

Backend search endpointini kullanır.

Frontend büyük local array üzerinde tüm sistemi aramamalıdır.

---

# 110. ACCESSION VISIBILITY

Accession Number operasyon açısından önemli olduğundan list/detail ekranlarda kolay bulunabilir olmalıdır.

---

# 111. SIBLING STUDIES

Aynı hastanın başka raporlanmamış tetkiki varsa:

```text
hasUnreportedSiblingStudy
```

flag ile belirgin gösterilebilir.

Frontend patient bazında tüm workflow’u birleştirmemelidir.

Her Study ayrı iştir.

---

# 112. MULTI-HOSPITAL

User birden fazla hastaneye yetkiliyse hospital filter bulunabilir.

Default:

- tüm yetkili hastaneler,
- veya son seçili hastane

kullanılabilir.

---

# 113. HOSPITAL SCOPE

Frontend backend’in döndürmediği unauthorized hospital’ı UI’da oluşturmaz.

---

# 114. MANAGER ALL HOSPITALS

Manager all hospitals görebilir.

Hospital filter global dashboard’da bulunabilir.

---

# 115. DEVTOOLS

Route:

```text
/dev-tools
```

yalnız dev/pilot şartlarında gösterilir.

---

# 116. DEVTOOLS VISIBILITY

Frontend env tek başına yeterli güvenlik değildir.

Backend endpoint de gated olmalıdır.

---

# 117. DEVTOOLS UI

Minimum:

```text
Create/First HL7
Second HL7
Images Available
Mock HBYS Mode
Accelerated SLA
External Lock
External Unlock
```

---

# 118. DEVTOOLS WORKFLOW

Button click:

```text
frontend
→ real backend devtools endpoint
→ core service
→ database
→ UI refetch
```

olmalıdır.

Local fake status değişikliği olmamalıdır.

---

# 119. MOCK HBYS MODE

UI:

```text
SUCCESS
FAIL
TIMEOUT
```

select/toggle olarak sunabilir.

Active mode görünür olmalıdır.

---

# 120. TEST SLA UI

Accelerated mode aktifse:

```text
TEST SLA MODE
```

gibi belirgin uyarı gösterilmelidir.

Gerçek SLA ile karıştırılmamalıdır.

---

# 121. ACCESSIBILITY

Pilot desktop-first olsa da temel accessibility gözetilmelidir.

- button labels,
- form labels,
- keyboard navigation,
- contrast

makul seviyede olmalıdır.

---

# 122. KEYBOARD SHORTCUTS

Radyoloji kullanımında ileride faydalı olabilir.

Pilot P2/P3:

```text
audio play/pause
save
next study
```

Ancak ana workflow’dan önce yapılmamalıdır.

---

# 123. RESPONSIVE

Pilot:

> desktop-first.

Tablet desteği kabul edilebilir.

Telefon için tam optimize arayüz P0 değildir.

---

# 124. MINIMUM VIEWPORT

Ana çalışma ekranları en iyi:

```text
1280px+
```

desktop kullanımına göre tasarlanabilir.

---

# 125. UI POLISH

Öncelik:

```text
clarity
speed
workflow visibility
```

Animation değil.

---

# 126. DANGEROUS ACTIONS

Force unlock, Wont Report, Finalize gibi actionlar belirgin olmalıdır.

Yanlışlıkla tıklamayı azaltmak için confirmation kullanılabilir.

---

# 127. FINALIZE CONFIRMATION

Örnek:

```text
Bu raporu final onaylamak istediğinize emin misiniz?
Final onay sonrası rapor HBYS gönderim kuyruğuna alınacaktır.
```

---

# 128. FORCE UNLOCK CONFIRMATION

Reason zorunlu modal kullanılmalıdır.

---

# 129. REPORT DATA LOSS PROTECTION

Editor content:

- autosave,
- unsaved warning,
- mutation retry

ile korunmalıdır.

---

# 130. PAGE REFRESH

Reporter editor page refresh olduğunda:

> draft backend’den yeniden yüklenmelidir.

Local-only content’e güvenilmemelidir.

---

# 131. AUDIO PAGE REFRESH

Uploaded completed dictation backend’den listelenip tekrar oynatılabilir olmalıdır.

---

# 132. ACTIVE LOCK PAGE REFRESH

Page refresh sonrası backend:

- Study detail,
- lock owner,
- current user ownership

bilgisine göre workspace state yeniden kurulmalıdır.

---

# 133. LOCK SESSION

Lock `sessionId` frontend session/workspace ile ilişkilendirilebilir.

Heartbeat aynı sessionId ile gönderilir.

---

# 134. MULTIPLE TABS

Aynı kullanıcı Study’yi iki browser tabında açarsa race/confusion olabilir.

Backend lock session kontrolü esas olmalıdır.

Frontend mümkünse başka tab lock owner durumunu gösterebilir.

Pilot için advanced tab coordination zorunlu değildir.

---

# 135. NOTIFICATIONS

Notification center:

- unread count,
- list,
- mark read

destekleyebilir.

---

# 136. DOCTOR NOTIFICATIONS

Özellikle:

```text
Approval waiting
Revision requested
Information added
```

gösterilebilir.

---

# 137. OPERATION NOTIFICATIONS

Özellikle:

```text
HBYS failed
SLA overdue
Image missing
External lock conflict
Information
```

---

# 138. MANAGER NOTIFICATIONS

Özellikle:

```text
Revision
HBYS error
System/operation critical
```

---

# 139. FRONTEND TESTING

Minimum kritik test alanları:

```text
auth
role navigation
study list
lock error
audio recording state
report autosave
submit
finalize state
HBYS failure
```

---

# 140. COMPONENT TEST

Business-critical componentler test edilmelidir.

Örnek:

```text
LockBanner
DictationRecorder
ReportEditor
HbysStatusBadge
SlaIndicator
```

---

# 141. E2E

Mümkünse Playwright kullanılabilir.

Minimum:

```text
login doctor
start reading
reporter flow
doctor finalize
HBYS result
```

---

# 142. MULTI-SESSION E2E

Lock testleri için iki browser context kullanılabilir.

---

# 143. BUILD

Pilot release öncesi:

```text
pnpm --filter frontend build
```

başarılı olmalıdır.

---

# 144. ENV

Minimum:

```text
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_WS_URL
```

---

# 145. ENV VALIDATION

Eksik API URL olduğunda production build/runtime anlaşılır hata vermelidir.

Sessiz localhost fallback production’da kullanılmamalıdır.

---

# 146. VERCEL

Frontend Vercel’e deploy edilir.

API ve WebSocket URL environment üzerinden alınır.

---

# 147. CORS / COOKIE

Cross-origin auth nedeniyle request client:

```text
credentials: include
```

gerektiren endpointlerde doğru config kullanmalıdır.

---

# 148. HTTPS

Pilot Vercel/Railway HTTPS kullanmalıdır.

Browser microphone API production’da secure context ister.

---

# 149. MEDIARECORDER SUPPORT

Browser desteklemiyorsa kullanıcıya açık mesaj gösterilmelidir.

Pilot test için modern Chrome/Edge/Safari kombinasyonu kontrol edilebilir.

---

# 150. OBJECT STORAGE URL

Frontend storage secret bilmez.

Playback backend’den signed URL olarak alınır.

---

# 151. SECURITY

Frontend source code içinde:

```text
JWT secret
HBYS secret
PACS password
S3 secret
DB URL
```

bulunamaz.

---

# 152. NEXT_PUBLIC

`NEXT_PUBLIC_*` değişkenler kullanıcı browser’ına açık kabul edilmelidir.

Secret bu prefix ile tanımlanmaz.

---

# 153. XSS

Report rich text gösteriliyorsa unsafe HTML doğrudan render edilmemelidir.

Pilot plain text daha güvenli olabilir.

---

# 154. PATIENT DATA LOGGING

Browser console’a full patient/report object basılmamalıdır.

Development debug sonrası temizlenmelidir.

---

# 155. ANALYTICS

Üçüncü parti analytics pilot P0 değildir.

Gerçek hasta verisine geçilmeden önce privacy açısından ayrıca değerlendirilmelidir.

---

# 156. FRONTEND YAPMAMASI GEREKENLER

Codex:

```text
workflow state uydurmamalı
API endpoint uydurmamalı
fake success state bırakmamalı
frontend'de role security'ye güvenmemeli
HBYS gönderimini client'ta yapmamalı
HL7 parse etmemeli
PACS credential kullanmamalı
report version overwrite mantığı üretmemeli
```

---

# 157. API CONTRACT DEĞİŞİKLİĞİ

Codex yeni endpoint ihtiyacı bulursa:

1. mevcut contract ile çözülüyor mu kontrol eder,
2. gerekiyorsa task/progress notu oluşturur,
3. API contract güncellenmeden hayali endpoint kullanmaz.

---

# 158. BACKEND BLOCKED DURUMU

Backend endpoint hazır değilse Codex:

- layout,
- component,
- typed hook

hazırlayabilir.

Ancak real API acceptance olmadan task DONE olmaz.

---

# 159. MOCK API YASAĞI

Production/pilot source içinde permanent MSW/local JSON workflow bırakılmamalıdır.

Backend DevTools mock source of truth olacaktır.

---

# 160. FALLBACK REALTIME

WebSocket hazır değilse:

> polling.

Ancak bu durum PROGRESS’te belirtilir.

---

# 161. FALLBACK PACS

Gerçek Orthanc viewer hazır değilse test PACS metadata response ile placeholder viewer area yapılabilir.

Ancak “görüntü açıldı” diye fake başarı verilmez.

---

# 162. FALLBACK VAD

VAD yoksa normal recording devam eder.

Bu pilot blocker değildir.

---

# 163. ERROR BOUNDARY

Ana app shell için error boundary düşünülebilir.

Tek component hatası tüm uygulamayı beyaz ekran yapmamalıdır.

---

# 164. TOAST KULLANIMI

Toast:

- success,
- warning,
- failure

için kullanılabilir.

Ancak kritik bilgi sadece toast içinde kaybolmamalıdır.

HBYS failed gibi durumlar sayfa üzerinde kalıcı da görünmelidir.

---

# 165. MODAL KULLANIMI

Modal özellikle:

```text
reason
confirmation
dangerous action
```

için kullanılmalıdır.

Her işlem modal yapılmamalıdır.

---

# 166. DRAWER / SIDE PANEL

Study quick detail için drawer kullanılabilir.

Ancak aktif Doctor/Reporter workspace tam ekran veya geniş çalışma alanı olmalıdır.

---

# 167. RESPONSIVE TABLE

Tablolar çok genişse horizontal scroll kullanılabilir.

Kritik kolonlar sticky tutulabilir.

---

# 168. SLA PRIORITY SORT

Operation/Doctor listesinde gerektiğinde:

```text
arrivalAt ASC
```

veya SLA riskine göre sort desteklenebilir.

Frontend default sort backend contract ile uyumlu olmalıdır.

---

# 169. FIFO FUTURE SUPPORT

Pilot manual selection.

İleride backend FIFO aktif ederse frontend:

```text
Sıradaki Tetkiki Al
```

gibi action destekleyebilir.

Frontend FIFO algoritması yazmamalıdır.

---

# 170. APPROVAL PERSISTENCE

Doctor onay bekleyen sayısı navigation’da kalıcı görünür olmalıdır.

Sayfa değişince kaybolmamalıdır.

---

# 171. ACTIVE WORK INDICATOR

Doctor/Reporter kendi aktif Study’sini navigation/app shell’de gösterebilir.

Örnek:

```text
Aktif çalışma: ACC-2026-00125
```

Pilot için yararlıdır.

---

# 172. STUDY HEADER

Her workspace header minimum:

```text
Patient display
Accession
Study description
Hospital
Category
Status
SLA
```

göstermelidir.

---

# 173. PATIENT IDENTITY PILOT

Pilot test verisinde açık fake isimler gösterilebilir.

Production anonymization daha sonra backend policy ile sağlanacaktır.

Frontend kendi anonymization business rule’unu uydurmamalıdır.

---

# 174. REPORT VERSION UI

P2:

Doctor/Manager eski report version’ları görebilir.

Version list:

```text
v1 Final
v2 Revision
```

şeklinde olabilir.

---

# 175. REVISION INDICATOR

Study revision request varsa belirgin badge gösterilebilir.

Pilot P2.

---

# 176. ADDENDUM

Full addendum UI post-pilot olabilir.

Codex iş akışı net değilken kendi addendum ekranını uydurmamalıdır.

---

# 177. COMPENSATION FORMULA

Frontend `calculatedAmount` null gelirse:

```text
Henüz hesaplama formülü tanımlanmadı.
```

gibi gösterebilir.

Tutar hesaplamaz.

---

# 178. DEVTOOLS TEST ACCOUNT UX

DevTools kullanıcıya test akışı için açık adımlar gösterebilir:

```text
1. First HL7
2. Second HL7
3. Images
4. Doctor'a geç
```

Bu sağlık ekibinin pilot testini kolaylaştırabilir.

---

# 179. HEALTH STATUS

Manager/DevTools ekranında backend health göstergesi eklenebilir.

P1/P2.

---

# 180. NETWORK OFFLINE

Frontend network error durumunu backend business error’dan ayırmalıdır.

Örnek:

```text
Sunucuya ulaşılamıyor.
```

---

# 181. RETRY BUTTON

Uygun query error ekranlarında:

```text
Tekrar Dene
```

sunulabilir.

---

# 182. QUERY RETRY

TanStack Query GET requestlerde kontrollü retry kullanabilir.

Mutationlarda kör retry dikkatli kullanılmalıdır.

Özellikle:

```text
finalize
submit
start-reading
```

idempotency göz önüne alınmalıdır.

---

# 183. MUTATION DOUBLE CLICK

Critical buttonlar mutation sırasında disable edilmelidir.

Örnek:

```text
Final Onayla
```

iki kez tıklanıp duplicate request üretmemelidir.

Backend yine idempotent olmalıdır.

---

# 184. BUTTON LOADING

Mutation sırasında:

```text
Final Onaylanıyor...
Rapor Gönderiliyor...
```

gibi state gösterilebilir.

---

# 185. CLIENT CLOCK DRIFT

SLA countdown için `deadlineAt` kullanılır.

Backend refetch ile zaman periyodik doğrulanır.

---

# 186. LANGUAGE

Pilot ana UI dili:

> Türkçe

olacaktır.

Internal enum/API English kalabilir.

---

# 187. DATE FORMAT

UI Türkçe format gösterebilir.

Örnek:

```text
12.08.2026 18:45
```

Backend ISO UTC kalır.

---

# 188. NUMBER FORMAT

Duration ve counts kullanıcı dostu formatlanmalıdır.

Örnek:

```text
1 sa 18 dk
```

---

# 189. DESIGN SYSTEM

shadcn/ui componentleri tutarlı kullanılmalıdır.

Aynı action farklı sayfalarda tamamen farklı görsel dil kullanmamalıdır.

---

# 190. COLORS

Klinik/operasyonel önem nedeniyle aşırı dekoratif renk kullanılmamalıdır.

Kırmızı yalnız ciddi error/overdue için ağırlıklı kullanılabilir.

---

# 191. TABLE DENSITY

Radyoloji operasyonunda fazla veri görüleceği için:

> compact/dense table

uygun olabilir.

Ancak okunabilirlik korunmalıdır.

---

# 192. ACCESSIBLE LOCK INDICATOR

Lock yalnız ikonla değil:

```text
Okunuyor
Yazılıyor
```

gibi text ile de belirtilmelidir.

---

# 193. HEALTHCARE WORKFLOW PRIORITY

Frontend geliştirme sırası:

```text
Doctor
↓
Reporter
↓
Doctor Approval
↓
Operation
↓
Manager
```

olmalıdır.

Manager grafik polish Doctor/Reporter P0’dan önce yapılmamalıdır.

---

# 194. FRONTEND P0 SCOPE

Kesin P0:

```text
Login
Role navigation
Study list
Doctor workspace
Lock UX
Dictation
Reporter queue
Reporter workspace
Audio playback
Report autosave
Submit
Approval queue
Approval workspace
Finalize
HBYS status
HBYS retry Operation/Manager
```

---

# 195. FRONTEND P1

```text
SLA
Information
Image Missing
Wont Report
Hospital Doctor
Operation Dashboard
Realtime
Manager basic
DevTools
Audit
```

---

# 196. FRONTEND P2

```text
Performance
Compensation
Special Lists advanced UX
Revision version UI
Advanced PACS series
```

---

# 197. FRONTEND P3

```text
AI report UI
Mobile app
Full Addendum
Advanced BI
Production anonymization
```

---

# 198. TASK QUEUE

Codex:

> `docs/TASK_QUEUE.md`

içerisindeki en yüksek öncelikli uygun frontend task’ı seçmelidir.

---

# 199. TASK CLAIM

```text
TODO
→ IN_PROGRESS
```

yapılmalıdır.

---

# 200. TASK DONE

Task:

```text
implementation
+
typecheck
+
lint
+
relevant tests
+
real API acceptance
```

olmadan DONE yapılmaz.

---

# 201. FRONTEND PROGRESS

Codex düzenli:

```text
PROGRESS.md
```

Frontend Progress bölümünü günceller.

---

# 202. PROGRESS MINIMUM

```text
Completed frontend tasks
Current task
Blocked frontend tasks
Latest tests/build
Known UI/API issues
Next frontend task
```

---

# 203. SESSION START

Yeni Codex session:

```text
1. Read MASTER_SPEC
2. Read TASK_QUEUE
3. Read PROGRESS
4. git status
5. inspect recent frontend commits
6. select highest priority available frontend task
```

---

# 204. SESSION END

Mümkünse:

```text
task status
test result
build result
resume pointer
```

yazılır.

---

# 205. AGENT CONFLICT

Codex shared/API contract conflict görürse büyük backend değişikliği yapmamalıdır.

`AGENT_CONFLICT` / progress notu ile görünür bırakmalıdır.

---

# 206. QUALITY GATES

Her kritik frontend milestone:

```text
lint
typecheck
component tests
build
```

geçmelidir.

---

# 207. PILOT BROWSER TEST

En az modern desktop browserlarda:

```text
Chrome
Safari veya Edge
```

temel akış test edilmelidir.

Özellikle microphone davranışı kontrol edilmelidir.

---

# 208. DEPLOYED TEST

Localhost test yeterli değildir.

Vercel üzerinden:

```text
login
audio
report
final
HBYS status
```

çalışmalıdır.

---

# 209. PILOT FRONTEND READY

Frontend ready demek:

> ekranların çizilmiş olması

değildir.

Şu gerçek API zinciri çalışmalıdır:

```text
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
HBYS result
```

---

# 210. RELEASE BLOCKERS

Aşağıdakiler varsa frontend pilot ready değildir:

```text
Doctor can't complete reading
audio upload false-success
Reporter loses report text
lock error ignored
final button duplicates
HBYS pending shown as sent
cross-role action exposed and backend failure not handled
production build fails
```

---

# 211. SOURCE OF TRUTH

Frontend davranışı konusunda çelişki varsa:

```text
MASTER_SPEC.md
↓
WORKFLOW_STATE_MACHINE.md
↓
AUTH_ROLES_PERMISSIONS.md
↓
API_CONTRACT.md
↓
FRONTEND.md
↓
implementation
```

önceliği uygulanır.

---

# 212. SON KURAL

Codex’in frontend geliştirmedeki ana amacı:

> mümkün olduğunca fazla ekran üretmek

değildir.

Amaç:

> sağlık çalışanının ana Study üzerinde hızlı, anlaşılır ve güvenli şekilde çalışmasını sağlayan gerçek backend’e bağlı bir kullanıcı arayüzü oluşturmaktır.

Codex:

- business state uydurmaz,
- fake success göstermez,
- lock hatasını görmezden gelmez,
- Doctor ve Reporter’ı gereksiz modüller arasında dolaştırmaz,
- backend’de olmayan endpoint’i varsaymaz,
- güvenliği sadece gizli butonlarla uygulamaz,
- test/build geçmeden görevi tamamlamaz.