# FAILURE_RECOVERY.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Hata Kurtarma ve Otonom Devam Kuralları

> **Doküman Türü:** Autonomous Agent Failure / Recovery Policy  
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
> `QUALITY_GATES.md`
>
> **Amaç:** Claude ve Codex hata aldığında kontrollü şekilde toparlanmasını, sorunu görünür bırakmasını ve mümkün olan bağımsız görevlere devam etmesini sağlamak.

---

# 1. ANA PRENSİP

Bir hata oluşması:

> tüm geliştirme sürecinin durması

anlamına gelmez.

Ajanın görevi:

```text
detect
↓
classify
↓
diagnose
↓
attempt safe fix
↓
test
↓
recover or block
↓
continue independent work
```

şeklindedir.

---

# 2. HATA SINIFLARI

Hatalar aşağıdaki sınıflardan birine atanmalıdır:

```text
SPEC_FAILURE
EXTERNAL_FAILURE
TECHNICAL_FAILURE
TEST_FAILURE
BUILD_FAILURE
DEPENDENCY_FAILURE
DATABASE_FAILURE
REDIS_FAILURE
QUEUE_FAILURE
INTEGRATION_FAILURE
DEPLOYMENT_FAILURE
SECURITY_FAILURE
DATA_INTEGRITY_FAILURE
AGENT_CONFLICT
UNKNOWN_FAILURE
```

---

# 3. TASK STATUS İLE İLİŞKİ

Hata task seviyesinde şu sonuçlardan birine dönüşebilir:

```text
IN_PROGRESS
BLOCKED_SPEC
BLOCKED_EXTERNAL
BLOCKED_TECHNICAL
DONE
```

Hata alınması otomatik olarak `BLOCKED` anlamına gelmez.

Önce makul recovery denenmelidir.

---

# 4. BLOCKED OLMA KRİTERİ

Bir görev yalnızca şu durumlarda blocked yapılmalıdır:

- gerekli iş kuralı bilinmiyor,
- dış credential/doküman yok,
- gerekli dış servis erişimi yok,
- teknik problem güvenli sürede çözülemiyor,
- çözüm başka P0 bağımlılığa bağlı,
- ilerlemek veri bütünlüğünü veya security'yi riske atıyor.

---

# 5. SONSuz DENEME YASAĞI

Ajan aynı hatayı sürekli tekrar etmemelidir.

Örnek yanlış davranış:

```text
install fails
↓
install again
↓
same error
↓
install again
↓
same error
↓
hours pass
```

Doğru davranış:

```text
attempt 1
↓
inspect error
↓
attempt targeted fix
↓
attempt 2
↓
alternative approach
↓
still fails
↓
document
↓
BLOCKED_TECHNICAL if necessary
↓
continue next independent task
```

---

# 6. MAKSİMUM DÖNGÜ PRENSİBİ

Aynı çözüm yöntemini:

> 3'ten fazla

kör şekilde tekrarlamamak esastır.

Üçüncü başarısız denemeden sonra:

- yeni hipotez üret,
- farklı çözüm dene,
- bağımlılığı bypass et,
- görevi block et

seçeneklerinden biri uygulanmalıdır.

---

# 7. ERROR FIRST RESPONSE

Bir komut başarısız olduğunda ajan önce:

1. exit code,
2. error message,
3. ilgili log,
4. değiştirilen son dosyalar,
5. dependency chain

kontrol etmelidir.

Hata mesajını okumadan rastgele paket değiştirmemelidir.

---

# 8. SON DEĞİŞİKLİK KONTROLÜ

Bir test/build önceden çalışıyorken yeni değişiklik sonrası bozulduysa:

> ilk şüphe son diff olmalıdır.

Ajan:

```text
git diff
```

ve ilgili son commit/değişiklikleri incelemelidir.

---

# 9. GÜVENLİ GERİ ALMA

Yeni değişiklik açıkça sistemi bozduysa ajan yalnız kendi güvenli değişikliklerini geri alabilir.

Ancak:

```text
git reset --hard
git clean -fd
```

gibi veri kaybettirebilecek komutlar varsayılan recovery yöntemi değildir.

Özellikle başka ajanın çalışmasını silebilecek komutlardan kaçınılmalıdır.

---

# 10. BAŞKA AJANIN KODUNU SİLME YASAĞI

Claude:

> frontend'i düzeltmek için Codex'in büyük değişikliklerini silmemelidir.

Codex:

> backend'i düzeltmek için Claude'un modüllerini yeniden yazmamalıdır.

Cross-agent conflict:

```text
AGENT_CONFLICT
```

olarak değerlendirilmelidir.

---

# 11. SPEC_FAILURE

İş kuralı net değilse oluşur.

Örnek:

```text
Yoğun bakım SLA kaç saat?
```

Sağlık ekibi kesin değer vermediyse ajan:

- 2 saat,
- 12 saat,
- 24 saat

değerlerinden birini kendisi seçemez.

Task:

```text
BLOCKED_SPEC
```

yapılmalıdır.

---

# 12. SPEC FAILURE ACTION

`BLOCKED_SPEC` kaydı minimum şunları içermelidir:

```text
Question:
Exact ICU SLA duration is not defined.

Impact:
SLA policy seed cannot be finalized for YOGUN_BAKIM.

Safe progress:
ACIL/YATAN/NORMAL can continue.

Required decision:
Healthcare team confirmation.
```

---

# 13. BLOCKED_SPEC TÜM PROJEYİ DURDURMAZ

Örneğin Yoğun Bakım SLA bilinmiyorsa:

- Auth,
- Study workflow,
- Doctor,
- Reporter,
- HBYS

geliştirmesi devam eder.

Sadece ilgili task bloklanır.

---

# 14. EXTERNAL_FAILURE

Gerekli dış kaynak yoksa oluşur.

Örnek:

```text
Hospital PACS credentials missing
HBYS endpoint unavailable
VPN not configured
HL7 sample missing
```

Task:

```text
BLOCKED_EXTERNAL
```

olmalıdır.

---

# 15. EXTERNAL FAILURE FALLBACK

Gerçek entegrasyon unavailable ise:

> mock/test adapter

varsa core pilot devam etmelidir.

Örnek:

```text
Real HBYS blocked
↓
MockHbysAdapter continues
```

Bu proje için özellikle beklenen davranıştır.

---

# 16. GERÇEK ENTEGRASYON UYDURMA YASAĞI

Ajan:

> “Muhtemelen HBYS endpoint böyle çalışır.”

diyerek vendor-specific kod yazmamalıdır.

Gerçek doküman yoksa:

```text
BLOCKED_EXTERNAL
```

kullanılır.

---

# 17. TECHNICAL_FAILURE

Kod veya tool problemi.

Örnek:

```text
package incompatibility
TypeScript error
Docker startup issue
library API mismatch
```

Ajan önce kendisi çözmeye çalışmalıdır.

---

# 18. TECHNICAL FAILURE RECOVERY

Sıra:

1. Error message analiz et.
2. İlgili dependency/version kontrol et.
3. Son değişikliği incele.
4. Minimal reproduction yap.
5. Targeted fix uygula.
6. İlgili testi çalıştır.
7. Full quality gate çalıştır.

---

# 19. DEPENDENCY_FAILURE

Bir npm/pnpm paketi:

- install olmuyor,
- peer conflict oluşturuyor,
- beklenen API'yi sunmuyor

ise önce gerçekten gerekli olup olmadığı sorgulanmalıdır.

---

# 20. DEPENDENCY FAILURE STRATEGY

Sıra:

```text
Can existing stack solve it?
↓
yes → remove unnecessary dependency

no
↓
compatible package/version available?
↓
yes → use compatible version

no
↓
simple custom implementation possible?
↓
yes → implement minimal solution

no
↓
BLOCKED_TECHNICAL
```

---

# 21. PAKET GÜNCELLEME YASAĞI

Tek bir hata nedeniyle tüm package tree:

```text
upgrade everything to latest
```

şeklinde güncellenmemelidir.

Bu davranış yeni hatalar oluşturabilir.

Targeted dependency değişikliği tercih edilmelidir.

---

# 22. LOCKFILE KURALI

`pnpm-lock.yaml` bilinçsizce silinmemelidir.

Lockfile ancak gerçek dependency recovery gerektiriyorsa kontrollü değiştirilir.

---

# 23. TEST_FAILURE

Test kırıldığında önce şu ayrım yapılır:

```text
implementation wrong?
test outdated?
environment issue?
flaky?
```

Test sırf geçsin diye assertion zayıflatılmamalıdır.

---

# 24. TESTİ SİLME YASAĞI

Kritik test fail olduğunda:

> testi silmek

recovery değildir.

Özellikle:

- workflow,
- permissions,
- lock,
- HBYS

testleri korunmalıdır.

---

# 25. TEST EXPECTATION DEĞİŞTİRME

Test spesifikasyonla uyumluysa:

> kod teste göre düzeltilir.

Test eski spesifikasyona dayanıyorsa:

> önce docs/contract kontrol edilir.

Sadece build yeşil olsun diye test expectation değiştirilmez.

---

# 26. BUILD_FAILURE

Build fail ise task release-ready değildir.

Backend build failure:

- module import,
- TS compile,
- generated Prisma client,
- env assumptions

kontrol edilmelidir.

Frontend build failure:

- server/client boundary,
- missing env,
- dynamic browser API,
- TypeScript

kontrol edilmelidir.

---

# 27. FRONTEND BROWSER API RECOVERY

Örneğin `MediaRecorder`, `window`, `navigator` build sırasında SSR hatası verirse:

- browser-only component,
- `use client`,
- runtime guard

kullanılmalıdır.

Next.js'in tamamı client app'e dönüştürülmemelidir.

---

# 28. DATABASE_FAILURE

Database failure türleri:

```text
connection refused
migration conflict
schema mismatch
unique constraint
transaction failure
seed failure
```

---

# 29. DATABASE CONNECTION FAILURE

Kontrol sırası:

1. `DATABASE_URL`
2. PostgreSQL service running?
3. network/port
4. credential
5. Prisma config
6. migration state

---

# 30. MIGRATION FAILURE

Migration fail ise doğrudan production DB'de manuel kolon oluşturmak varsayılan çözüm değildir.

Development:

- migration incelenir,
- gerekirse yeni corrective migration yazılır.

Pilot data korunması gerekiyorsa destructive reset yapılmaz.

---

# 31. DATABASE RESET KURALI

Ajan:

```text
prisma migrate reset
```

gibi destructive komutları yalnız development/test database olduğundan emin olduğunda kullanabilir.

Pilot/production database:

> varsayılan olarak resetlenmez.

---

# 32. SEED FAILURE

Seed duplicate nedeniyle fail oluyorsa seed:

> idempotent

hale getirilmelidir.

Her çalıştırmada yeni Doctor/Manager yaratmak doğru çözüm değildir.

---

# 33. DATA_INTEGRITY_FAILURE

En ciddi hata sınıflarından biridir.

Örnek:

```text
final report overwritten
wrong patient merged
cross-hospital data leak
two users editing same Study
old report version deleted
```

Bu durumda:

> ilgili P0 çalışma durdurulur.

---

# 34. DATA INTEGRITY RESPONSE

Ajan:

1. Yeni mutation'ları durdurur.
2. Sorunun kapsamını belirler.
3. Reproduction test yazar.
4. Root cause düzeltir.
5. Regression test ekler.
6. Audit/data etkisini kontrol eder.

Task ancak test geçince devam eder.

---

# 35. SECURITY_FAILURE

Örnek:

```text
Reporter can finalize
Doctor can view unauthorized hospital
passwordHash leaked
DevTools public
```

Bunlar:

> CRITICAL/BLOCKER

olarak değerlendirilir.

---

# 36. SECURITY FAILURE RESPONSE

Security failure bulunduğunda:

- UI polish bırakılır,
- P2 işler durdurulur,
- güvenlik problemi düzeltilir,
- regression test eklenir.

---

# 37. REDIS_FAILURE

Redis kullanımları:

- lock,
- BullMQ,
- ephemeral data.

Redis unavailable ise:

> aynı Study üzerinde güvenli locking garanti edilemiyorsa Doctor/Reporter edit workflow fail closed davranmalıdır.

---

# 38. REDIS FAIL-CLOSED KURALI

Lock Redis doğrulanamıyorsa:

> sistem ikinci editöre erişim vermemelidir.

Yanlış:

```text
Redis down
→ assume unlocked
→ allow reading
```

Doğru:

```text
Redis down
→ LOCK_SERVICE_UNAVAILABLE
→ reject active editing
```

---

# 39. REDIS RECOVERY

Kontrol:

```text
REDIS_URL
service running
TLS requirement
network
auth
client config
```

Redis geri geldiğinde stale database assignment ayrıca kontrol edilebilir.

---

# 40. QUEUE_FAILURE

BullMQ job çalışmıyorsa:

- Redis connectivity,
- worker running,
- queue name,
- job serialization,
- retry config

kontrol edilmelidir.

---

# 41. HBYS QUEUE FAILURE SAFETY

Doctor final başarıyla DB'ye yazıldı ancak job enqueue başarısızsa:

> rapor final durumunu kaybetmemelidir.

Delivery:

```text
PENDING / enqueue recovery required
```

şeklinde görünür kalmalıdır.

Silent lost delivery olmamalıdır.

---

# 42. QUEUE RECOVERY JOB

Gerekirse background reconciliation:

```text
find PENDING deliveries without active job
↓
re-enqueue
```

eklenebilir.

Pilot için basit recovery script/job yeterli olabilir.

---

# 43. INTEGRATION_FAILURE

Integration failure:

- HL7,
- PACS,
- HBYS,
- external lock

kaynaklı olabilir.

Her integration error:

> core application crash

oluşturmamalıdır.

---

# 44. HBYS FAILURE NORMAL OPERATIONDIR

HBYS remote failure:

> uygulamanın tamamen çöktüğü anlamına gelmez.

Beklenen workflow:

```text
error
↓
retry
↓
HBYS_FAILED if exhausted
↓
Operation visibility
```

---

# 45. PACS FAILURE

PACS unavailable olduğunda:

- Doctor'a viewer error göster,
- Operation'a teknik uyarı üret,
- Study verisini silme,
- yanlış IMAGES_AVAILABLE verme.

---

# 46. HL7 INVALID MESSAGE

Invalid HL7:

- retry loop'a sokulmamalı,
- failed integration event,
- error detail,
- operation visibility

oluşturmalıdır.

---

# 47. DEPLOYMENT_FAILURE

Railway/Vercel deploy hataları local code failure'dan ayrılmalıdır.

Kontrol:

```text
build logs
env vars
start command
Node version
port
database access
Redis access
CORS
```

---

# 48. RAILWAY FAILURE

Backend deploy oluyor ancak crash ise:

1. Railway logs oku.
2. `PORT` handling kontrol et.
3. DB migration durumunu kontrol et.
4. Redis env kontrol et.
5. startup command kontrol et.

---

# 49. VERCEL FAILURE

Frontend build fail:

- missing env,
- SSR browser API,
- unsupported package,
- type error

kontrol edilir.

Frontend build geçiyor ama API çalışmıyorsa:

- API URL,
- HTTPS,
- CORS,
- cookies

kontrol edilir.

---

# 50. CORS FAILURE

Local çalışıyor, deployed login çalışmıyorsa tipik kontrol:

```text
FRONTEND_URL
allowed origins
credentials=true
cookie SameSite
cookie Secure
frontend credentials include
```

Random CORS library değişiklikleri yapılmamalıdır.

---

# 51. COOKIE FAILURE

Refresh cookie görünmüyorsa:

- HTTPS,
- domain,
- SameSite,
- Secure,
- path,
- cross-origin credentials

kontrol edilir.

JWT secret değiştirmek cookie problemini çözme yöntemi değildir.

---

# 52. WEBSOCKET FAILURE

WebSocket deploy ortamında çalışmıyorsa:

1. Backend gateway health.
2. Railway websocket support/config.
3. URL/protocol.
4. CORS.
5. auth handshake.

kontrol edilir.

---

# 53. REALTIME FALLBACK

Realtime çözülemiyorsa pilot tamamen durmamalıdır.

Geçici safe fallback:

```text
TanStack Query polling/refetch
```

kullanılabilir.

Task:

```text
MAJOR known issue
```

olarak kalabilir.

---

# 54. OBJECT STORAGE FAILURE

Audio upload fail ise:

- credential,
- endpoint,
- bucket,
- CORS,
- content type,
- size

kontrol edilmelidir.

---

# 55. OBJECT STORAGE FAIL SAFETY

Upload başarısızsa:

> dictation COMPLETED yapılmamalıdır.

Study:

> reading complete

edilememelidir.

---

# 56. LOCAL STORAGE FALLBACK

Development sırasında object storage unavailable ise local adapter kullanılabilir.

Ancak deployed pilot:

> remote storage

kullanmalıdır.

Local fallback pilot-ready kabul edilmez.

---

# 57. AUDIO FAILURE

Microphone unavailable:

> frontend crash olmamalıdır.

UI:

```text
Mikrofon erişimi gerekli
```

göstermelidir.

---

# 58. AUDIO DATA LOSS SAFETY

Kullanıcı kaydı bitirdi ancak upload fail olduysa:

- kayıt mümkünse local memory'de korunmalı,
- retry sunulmalı,
- reading tamamlanmamalı.

---

# 59. REPORT SAVE FAILURE

Report autosave fail olduğunda:

> kullanıcıya açıkça hata gösterilmelidir.

UI yanlışlıkla:

```text
Kaydedildi
```

yazmamalıdır.

---

# 60. REPORT DRAFT RECOVERY

Autosave fail sonrası:

- current editor content local state'te korunur,
- retry yapılabilir,
- kullanıcı başka Study'ye geçmeden uyarılabilir.

---

# 61. FINALIZE FAILURE

Doctor finalize tıkladığında DB transaction fail olursa:

- final başarılı gösterilmemeli,
- HBYS job yaratılmış gibi davranılmamalı,
- user retry yapabilmeli.

---

# 62. PARTIAL FINALIZATION FAILURE

Rapor FINAL oldu ama HBYS job oluşturulamadıysa:

- clinical final korunur,
- delivery PENDING/recovery-required olarak kalır,
- background reconciliation yapılabilir.

Rapor DRAFT'a geri dönmemelidir.

---

# 63. APPROVAL LOCK FAILURE

Doctor approval lock doğrulanamıyorsa:

> final edit/finalization fail closed

olmalıdır.

İkinci kullanıcıya concurrent edit izni verilmemelidir.

---

# 64. AGENT_CONFLICT

İki agent aynı dosyayı değiştirdiyse:

- conflict çözümü minimum scope olmalıdır,
- bir agent diğerinin özelliğini tamamen kaldırmamalıdır.

---

# 65. SHARED FILE CONFLICT

Özellikle:

```text
packages/shared
TASK_QUEUE.md
PROGRESS.md
API_CONTRACT.md
```

iki agent tarafından değiştirilebilir.

Bu dosyalarda conflict dikkatli çözülmelidir.

---

# 66. CONTRACT CONFLICT

Claude endpoint'i değiştirmiş ama Codex eski contract'a göre çalışıyorsa:

> önce API_CONTRACT kontrol edilir.

Contract değişmediyse Claude'un implementasyonu düzeltilir.

Contract bilinçli değiştiyse frontend güncellenir.

---

# 67. PROGRESS FILE CONFLICT

`PROGRESS.md` için agent kendi bölümlerini değiştirmelidir.

Öneri:

```text
Backend Progress
Frontend Progress
Shared/Integration
Blockers
```

bölümleri kullanmak conflict riskini azaltır.

---

# 68. TASK_QUEUE CONFLICT

Agent yalnız kendi aldığı task'ın:

```text
Status
Completion note
```

alanını değiştirmelidir.

Başka taskların statusunu değiştirmemelidir.

---

# 69. UNKNOWN_FAILURE

Hata tanınmıyorsa:

1. Error kaydedilir.
2. Reproduction yapılır.
3. Minimal scope belirlenir.
4. Docs/dependencies kontrol edilir.
5. İki farklı çözüm denenir.
6. Çözülemiyorsa BLOCKED_TECHNICAL.

---

# 70. DEBUG LOG KURALI

Debug için geçici log eklenebilir.

Ancak task tamamlanırken:

- sensitive data logları kaldırılmalı,
- gereksiz console.log temizlenmelidir.

---

# 71. SECRET LOGGING YASAĞI

Hiçbir debug sırasında:

```text
JWT_SECRET
DATABASE_URL password
HBYS password
S3 secret
full refresh token
```

loglanmamalıdır.

---

# 72. PROGRESS BLOCKER FORMAT

Her blocker şu formatı kullanmalıdır:

```text
### BLOCKER: BACKEND-XXX

Type:
BLOCKED_EXTERNAL

Problem:
...

Evidence:
...

Attempts:
1. ...
2. ...

Impact:
...

Independent work still available:
...

Required action:
...
```

---

# 73. TECHNICAL BLOCKER FORMAT

Örnek:

```text
Type:
BLOCKED_TECHNICAL

Problem:
Orthanc container cannot start on current architecture.

Attempts:
1. standard image
2. alternate tag
3. local Docker configuration

Fallback:
Use TestPacsAdapter so P0 workflow continues.

Follow-up:
Retry Orthanc as P1 task.
```

---

# 74. BLOCKER TRANSPARENCY

Ajan blocker'ı saklamamalıdır.

Örneğin:

> PACS çalışmıyor ama frontend'de çalışıyor gibi göstermek

yasaktır.

---

# 75. PARTIAL COMPLETION

Task'ın bir kısmı tamamlandı ama acceptance tamamlanmadıysa:

```text
IN_PROGRESS
```

kalmalıdır.

Completion note:

```text
Implemented 4/5 acceptance criteria.
Remaining: deployed object storage playback.
```

yazılabilir.

---

# 76. DEGRADE, DON'T FAKE

Bir özellik tam çalışmıyorsa güvenli degrade yapılabilir.

Örnek:

WebSocket yok:

```text
polling
```

kullan.

Yanlış:

```text
fake websocket success state
```

göstermek.

---

# 77. P0 FİX ÖNCELİĞİ

Bir P0 blocker bulunduğunda yeni P2 özellik geliştirmeye geçilmemelidir.

Öncelik:

```text
P0 recovery
↓
P1
↓
P2
```

---

# 78. ANCAK BAĞIMSIZ P0 DEVAM EDEBİLİR

P0 task dış bağımlılık nedeniyle blocked ise başka bağımsız P0 task devam eder.

Örnek:

```text
Object Storage blocked
```

iken:

```text
Auth
Workflow
HBYS
```

devam edebilir.

---

# 79. ROLLBACK PRENSİBİ

Rollback:

> son güvenli working state'e dönmek

içindir.

Rollback sırasında:

- başka agent commitleri,
- unrelated feature'lar,
- docs

silinmemelidir.

---

# 80. GIT STATUS KONTROLÜ

Riskli değişiklik öncesi ajan:

```text
git status
```

kontrol etmelidir.

Uncommitted başka agent work varsa destructive işlem yapılmamalıdır.

---

# 81. KÜÇÜK COMMIT AVANTAJI

Küçük commitlerin amacı recovery'yi kolaylaştırmaktır.

Örnek:

```text
auth
lock
dictation
report
```

ayrı commitlerdir.

Tek bir dev commit içinde her şeyi yapmak recovery'yi zorlaştırır.

---

# 82. BROKEN COMMIT YASAĞI

Mümkün olduğunca:

> build tamamen bozuk

commit oluşturulmamalıdır.

WIP commit gerekirse açıkça:

```text
wip(...)
```

şeklinde ve mümkünse agent branch'inde kalmalıdır.

---

# 83. GÜNLÜK RECOVERY CHECK

Gün sonunda agent:

```text
What is broken?
What is blocked?
What can continue?
What needs external input?
```

sorularını PROGRESS'e yansıtmalıdır.

---

# 84. SESSION RESTART RECOVERY

Agent/session kapanırsa yeni agent ilk olarak:

1. `MASTER_SPEC.md`
2. `TASK_QUEUE.md`
3. `PROGRESS.md`
4. `git status`
5. son commitler

okumalıdır.

Rastgele yeni task'a başlamamalıdır.

---

# 85. MACHINE RESTART RECOVERY

Bilgisayar yeniden başladıysa:

```text
PostgreSQL
Redis
Docker/Orthanc
backend
frontend
agent processes
```

yeniden başlatılmalıdır.

Projede startup komutları dokümante edilmelidir.

---

# 86. AGENT CRASH

Claude/Codex process kapanırsa task durumu otomatik DONE değildir.

`IN_PROGRESS` olarak kalır.

Yeni agent task'ın:

- diff,
- test state,
- progress note

bilgilerini inceleyip devam eder.

---

# 87. QUOTA / USAGE LIMIT

AI agent kullanım limiti nedeniyle durursa bu:

> code failure

değildir.

Mevcut progress korunur.

Agent tekrar kullanılabilir olduğunda:

```text
TASK_QUEUE
↓
highest priority unfinished
```

üzerinden devam eder.

---

# 88. QUOTA RECOVERY

Limit nedeniyle yarım kalan task:

```text
IN_PROGRESS
```

kalabilir.

PROGRESS:

```text
Paused due to agent usage limit.
No code failure.
Resume from test X.
```

şeklinde notlanabilir.

---

# 89. ENVIRONMENT MISSING

Gerekli env yoksa agent değer uydurmamalıdır.

Örnek:

```text
JWT_SECRET
```

development için random safe secret oluşturulabilir.

Ama:

```text
REAL_HBYS_PASSWORD
```

uydurulamaz.

---

# 90. .ENV EXAMPLE

Ajan gerçek secret yerine:

```text
.env.example
```

oluşturabilir.

Örnek:

```text
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
```

Gerçek secret commitlenmez.

---

# 91. FRONTEND API UNAVAILABLE

Backend geçici çalışmıyorsa Codex:

- UI component,
- types,
- hooks

üzerinde ilerleyebilir.

Ancak API dependent task DONE yapılmaz.

---

# 92. BACKEND FRONTEND UNAVAILABLE

Frontend henüz yoksa Claude backend integration testleriyle devam eder.

Backend task frontend'e bağlı değildir unless task acceptance specifically requires UI E2E.

---

# 93. FALLBACK MATRIX

## PACS unavailable

```text
TestPacsAdapter
```

## WebSocket unavailable

```text
REST polling/refetch
```

## VAD unavailable

```text
basic record/upload/playback
```

## Real HBYS unavailable

```text
MockHbysAdapter
```

## Real HL7 unavailable

```text
MockHl7Adapter
```

Bu fallback'ler core pilotu devam ettirmek içindir.

---

# 94. FALLBACK YASAKLARI

Aşağıdakilerin unsafe fallback'i yoktur:

```text
authorization
hospital scope
locking
final report preservation
audit critical events
HBYS delivery tracking
```

Bunlar çalışmıyorsa ilgili workflow blocked kabul edilir.

---

# 95. LOCK FALLBACK YOKTUR

Redis lock çalışmıyorsa:

> local frontend flag

ile lock taklit edilmez.

Bu pilotun kritik güvenlik kuralıdır.

---

# 96. AUTH FALLBACK YOKTUR

Backend auth bozuksa:

> “test için auth'u kapatalım”

P0 acceptance çözümü değildir.

DevTools dahi yetkilendirilmelidir.

---

# 97. REPORT VERSION FALLBACK YOKTUR

Revision için eski final raporu overwrite etmek:

> geçici çözüm

olarak kabul edilemez.

---

# 98. CROSS-HOSPITAL FALLBACK YOKTUR

Hospital guard sorunu çözülmeden bütün Study'leri herkese göstermek yasaktır.

---

# 99. CRITICAL ISSUE ESCALATION

Aşağıdaki durumlar PROGRESS'in en üstüne yazılmalıdır:

```text
data leak
final report overwrite
lock bypass
wrong patient match
secret leak
auth bypass
```

---

# 100. RECOVERY TEST REQUIREMENT

Her kritik bug fix sonrası:

> regression test

eklenmelidir.

Örnek:

Bug:

```text
Reporter could finalize report
```

Fix sonrası test:

```text
Reporter finalize → 403
```

kalıcı hale getirilir.

---

# 101. BUG FIX COMPLETION

Bug fix DONE olabilmek için:

```text
bug reproduced
↓
fix implemented
↓
regression test added
↓
test passes
↓
related quality gates pass
```

gereklidir.

---

# 102. DEPLOYMENT ROLLBACK

Pilot deploy yeni release sonrası bozulursa:

- son çalışan deploy'a rollback yapılabilir,
- failing commit investigation edilir.

Ancak database migration backward compatibility ayrıca kontrol edilmelidir.

---

# 103. MIGRATION ROLLBACK SAFETY

Destructive migration sonrası sadece application rollback yapmak yeterli olmayabilir.

Bu nedenle pilotta schema değişiklikleri mümkün olduğunca:

- additive,
- backward-compatible

olmalıdır.

---

# 104. ADDITIVE MIGRATION PREFERENCE

Tercih:

```text
new column nullable
↓
code update
↓
backfill if required
↓
later constraints
```

Doğrudan kritik kolon drop etmekten daha güvenlidir.

---

# 105. HEALTH CHECK RECOVERY

Backend health fail ederse hangi dependency'nin down olduğu ayırt edilmelidir.

Örnek:

```json
{
  "app": "ok",
  "database": "ok",
  "redis": "down"
}
```

Bu operational recovery'yi kolaylaştırır.

---

# 106. ERROR CODE PRESERVATION

Recovery sırasında API error contract rastgele değiştirilmemelidir.

Örneğin lock sorunu düzeltirken:

```text
STUDY_LOCKED
```

yerine farklı random code eklenmemelidir.

---

# 107. NO HIDDEN WORKAROUNDS

Temporary workaround varsa açıkça notlanmalıdır.

Örnek:

```text
Temporary fallback:
REST polling every 10s because WebSocket deployment issue remains.
```

Bu bilgi PROGRESS'e yazılır.

---

# 108. WORKAROUND CLEANUP

Temporary workaround için gerektiğinde:

```text
DISCOVERED-XXX
```

task oluşturulmalıdır.

Workaround kalıcı mimari gibi unutulmamalıdır.

---

# 109. AGENT RECOVERY DECISION TREE

```text
Task fails
│
├── Missing business rule?
│       └── BLOCKED_SPEC
│
├── Missing external access/doc?
│       └── BLOCKED_EXTERNAL
│
├── Security/data integrity issue?
│       └── Stop affected workflow + fix P0
│
├── Technical problem?
│       ├── targeted diagnosis
│       ├── safe fix
│       └── still unsolved → BLOCKED_TECHNICAL
│
└── Independent tasks available?
        └── Continue next highest priority
```

---

# 110. BACKEND AGENT RECOVERY LOOP

Claude için:

```text
read failing command
↓
inspect backend diff
↓
check spec/contract
↓
fix smallest root cause
↓
run targeted test
↓
run backend quality gate
↓
commit
↓
continue
```

---

# 111. FRONTEND AGENT RECOVERY LOOP

Codex için:

```text
reproduce UI/build error
↓
check API contract
↓
check browser/server boundary
↓
fix minimal component/hook
↓
run typecheck/test/build
↓
verify against real API if available
↓
commit
↓
continue
```

---

# 112. NO FULL REWRITE RECOVERY

Bir modül sorunlu diye ilk tercih:

> tamamen sıfırdan yeniden yazmak

olmamalıdır.

Önce root cause bulunmalıdır.

Full rewrite ancak küçük modülde açıkça daha güvenliyse yapılabilir.

---

# 113. TIME-BOXED DEBUGGING

Pilot geliştirmede çok uzun süren non-P0 debugging taskları minimum viable çözümle ertelenebilir.

Örnek:

VAD 3 saat hata çıkarıyor.

Doğru:

```text
basic audio P0 works
VAD moved to P2
```

Yanlış:

```text
Doctor/Reporter workflow stopped entire day for VAD
```

---

# 114. P0 BASİTLEŞTİRME

Bir P0 feature karmaşık hale geldiyse iş kuralını bozmadan basitleştirilebilir.

Örnek:

Object storage:

> direct multipart backend upload

ilk pilot için presigned multipart upload'dan daha basittir.

---

# 115. İŞ KURALI BASİTLEŞTİRİLEMEZ

Teknik çözüm basitleştirilebilir.

Ancak iş kuralı basitleştirilemez.

Örnek:

```text
lock zor geldi
→ lock'u kaldıralım
```

yasaktır.

---

# 116. PROGRESS RESUME POINTER

Agent durmadan önce mümkünse PROGRESS'e:

```text
Resume from:
BACKEND-037
Current failing test:
hbys-worker.spec.ts timeout scenario
Next action:
inspect BullMQ timeout handling
```

yazmalıdır.

Bu sonraki agent'ın sıfırdan analiz yapmasını önler.

---

# 117. FAILURE SUMMARY

Her gün sonu kısa özet:

```text
Resolved today:
...

Still blocked:
...

Fallbacks active:
...

Risks:
...

Next recovery actions:
...
```

bulunmalıdır.

---

# 118. PILOT RELEASE FAILURE POLICY

Release öncesi:

```text
BLOCKER > 0
```

veya:

```text
CRITICAL > 0
```

ise pilot sağlık ekibine verilmemelidir.

---

# 119. MAJOR ISSUE POLICY

MAJOR issue olabilir ancak:

- workaround varsa,
- data/security riski yoksa,
- ana workflow çalışıyorsa

pilot bilinen issue olarak test edilebilir.

PROGRESS'te açıkça belirtilmelidir.

---

# 120. FAILURE SOURCE OF TRUTH

Hata durumunda karar önceliği:

1. `MASTER_SPEC.md`
2. `WORKFLOW_STATE_MACHINE.md`
3. `API_CONTRACT.md`
4. `AUTH_ROLES_PERMISSIONS.md`
5. `QUALITY_GATES.md`
6. `FAILURE_RECOVERY.md`
7. mevcut kod

şeklindedir.

---

# 121. SON KURAL

Bir hata oluştuğunda ajanın amacı:

> her ne pahasına olursa olsun yeşil build üretmek

değildir.

Amaç:

> doğrulanmış iş kurallarını koruyarak sistemi güvenli şekilde tekrar çalışan duruma getirmek ve mümkün olan geliştirmeye devam etmektir.

Ajan:

- hata saklamaz,
- business rule uydurmaz,
- test silmez,
- security bypass etmez,
- başka agent'ın işini yok etmez,
- tek bir blocker nedeniyle tüm bağımsız işleri durdurmaz.