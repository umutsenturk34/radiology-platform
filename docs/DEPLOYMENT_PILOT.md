# DEPLOYMENT_PILOT.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Pilot Deployment Rehberi

> **Doküman Türü:** Pilot Deployment / Environment / Release Guide  
> **Frontend Hosting:** Vercel  
> **Backend Hosting:** Railway  
> **Database:** PostgreSQL  
> **Redis:** Managed Redis  
> **Audio Storage:** S3-compatible Object Storage  
> **Pilot Entegrasyonlar:** Mock HL7 + Test PACS + Mock HBYS  
> **Pilot Kullanıcı Sayısı:** 2–3 aktif sağlık ekibi kullanıcısı  
> **Amaç:** Sağlık ekibine internet üzerinden kullanılabilir test ortamı sağlamak

---

# 1. DOKÜMANIN AMACI

Bu dosya ilk pilot ortamının nasıl deploy edileceğini tanımlar.

Pilot environment aşağıdaki ana parçaları içerir:

```text
Browser
↓
Vercel Frontend
↓
Railway Backend API
↓
PostgreSQL
↓
Redis
↓
Object Storage
```

Ayrıca backend:

```text
Mock HL7
Test PACS
Mock HBYS
BullMQ
WebSocket
```

bileşenlerini kullanır.

---

# 2. PILOT DEPLOYMENT PRENSİBİ

İlk pilot:

> production-grade enterprise infrastructure değildir.

Ama aşağıdakiler mutlaka gerçek çalışmalıdır:

```text
Authentication
Hospital authorization
Study workflow
Redis locking
Dictation upload/playback
Report workflow
Doctor final approval
HBYS mock delivery
Retry
Audit
```

---

# 3. PILOT ENVIRONMENT

Önerilen environment adı:

```text
pilot
```

Application davranışı:

```text
NODE_ENV=production
APP_ENV=pilot
```

şeklinde ayrıştırılabilir.

Bu sayede production build kullanılırken pilot-specific DevTools açık tutulabilir.

---

# 4. ENVIRONMENT AYRIMI

Minimum:

```text
development
test
pilot
production
```

mantıksal environment ayrımı desteklenmelidir.

Pilot ile gerçek production aynı kabul edilmemelidir.

---

# 5. PILOT FRONTEND

Frontend:

```text
apps/frontend
```

Vercel üzerinde çalışacaktır.

Örnek public domain:

```text
https://radiology-platform.vercel.app
```

Gerçek domain deployment sırasında belirlenir.

---

# 6. PILOT BACKEND

Backend:

```text
apps/backend
```

Railway üzerinde çalışacaktır.

Örnek:

```text
https://radiology-api.up.railway.app
```

Gerçek URL deployment sırasında environment olarak frontend'e verilir.

---

# 7. API BASE URL

Frontend environment:

```text
NEXT_PUBLIC_API_URL=https://<backend-domain>/api/v1
```

kullanır.

Kod içinde Railway domain hardcode edilmemelidir.

---

# 8. WEBSOCKET URL

Frontend:

```text
NEXT_PUBLIC_WS_URL=https://<backend-domain>
```

veya backend Socket.IO yapılandırmasına uygun URL kullanır.

Hard-coded localhost production build içinde bulunmamalıdır.

---

# 9. ROOT BUILD PREPARATION

Monorepo root aşağıdaki işleri desteklemelidir:

```text
install
lint
typecheck
build
```

Örnek:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
```

---

# 10. BACKEND BUILD

Backend build komutu net olmalıdır.

Örnek:

```bash
pnpm --filter backend build
```

Output NestJS production application olmalıdır.

---

# 11. BACKEND START

Örnek:

```bash
pnpm --filter backend start:prod
```

Exact script root/backend package.json ile uyumlu olmalıdır.

Deployment dokümanı package scriptlerinden farklı komut varsaymamalıdır.

---

# 12. FRONTEND BUILD

Örnek:

```bash
pnpm --filter frontend build
```

başarılı olmalıdır.

Local build geçmeden Vercel deployment yapılmamalıdır.

---

# 13. PACKAGE MANAGER

Repository boyunca:

```text
pnpm
```

kullanılmalıdır.

Aynı projede:

```text
npm install
yarn
pnpm
```

karıştırılmamalıdır.

---

# 14. NODE VERSION

Root seviyede mümkünse desteklenen Node.js versiyonu sabitlenmelidir.

Örnek:

```text
package.json engines
```

veya:

```text
.nvmrc
```

kullanılabilir.

Frontend ve backend aynı uyumlu major Node.js versiyonunda çalışmalıdır.

---

# 15. RAILWAY SERVICES

Pilot Railway projesinde mantıksal olarak:

```text
backend
postgresql
redis
```

bileşenleri bulunmalıdır.

Object storage ayrı dış servis olabilir.

---

# 16. POSTGRESQL

Backend:

```text
DATABASE_URL
```

üzerinden PostgreSQL bağlantısını alır.

Database credential kod içine yazılmaz.

---

# 17. DATABASE ENV

```text
DATABASE_URL=postgresql://...
```

secret olarak tutulmalıdır.

Frontend'e hiçbir şekilde gönderilmez.

---

# 18. REDIS

Backend:

```text
REDIS_URL
```

kullanır.

Redis minimum:

```text
Study locks
BullMQ
ephemeral coordination
```

için gereklidir.

---

# 19. REDIS PİLOT KRİTİKLİĞİ

Redis çalışmıyorsa:

> Doctor/Reporter active edit workflow güvenli kabul edilmez.

Lock sistemi fail-closed davranmalıdır.

---

# 20. OBJECT STORAGE

Audio için S3-compatible object storage kullanılmalıdır.

Minimum env:

```text
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_REGION
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
OBJECT_STORAGE_BUCKET
```

Exact SDK gereksinimine göre alanlar değişebilir.

---

# 21. OBJECT STORAGE BUCKET

Audio bucket:

> public olmamalıdır.

Playback authenticated backend üzerinden veya kısa süreli signed URL ile sağlanmalıdır.

---

# 22. AUDIO STORAGE KEY

Örnek:

```text
dictations/{hospitalId}/{studyId}/{dictationId}.webm
```

kullanılabilir.

Patient adı filename içine yazılmamalıdır.

---

# 23. BACKEND REQUIRED ENV

Pilot minimum:

```text
NODE_ENV
APP_ENV
PORT

DATABASE_URL
REDIS_URL

JWT_SECRET
JWT_REFRESH_SECRET

FRONTEND_URL

DEV_TOOLS_ENABLED
ALLOW_MOCK_INTEGRATIONS

OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_REGION
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
OBJECT_STORAGE_BUCKET
```

---

# 24. OPTIONAL BACKEND ENV

İhtiyaca göre:

```text
LOG_LEVEL

JWT_ACCESS_TTL
JWT_REFRESH_TTL

LOCK_TTL_SECONDS
LOCK_HEARTBEAT_SECONDS

HBYS_JOB_ATTEMPTS
HBYS_JOB_BACKOFF

DEFAULT_TIMEZONE
```

eklenebilir.

---

# 25. PILOT FEATURE FLAGS

Pilot:

```text
DEV_TOOLS_ENABLED=true
ALLOW_MOCK_INTEGRATIONS=true
```

olabilir.

Gerçek production:

```text
DEV_TOOLS_ENABLED=false
ALLOW_MOCK_INTEGRATIONS=false
```

olmalıdır.

---

# 26. FRONTEND ENV

Minimum:

```text
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_WS_URL
```

---

# 27. NEXT_PUBLIC SECURITY

`NEXT_PUBLIC_*` değişkenleri browser tarafından görülebilir kabul edilmelidir.

Bu nedenle aşağıdakiler asla `NEXT_PUBLIC_*` olmamalıdır:

```text
DATABASE_URL
JWT_SECRET
HBYS_SECRET
OBJECT_STORAGE_SECRET_KEY
PACS_PASSWORD
```

---

# 28. SECRET GENERATION

Development/pilot için:

```text
JWT_SECRET
JWT_REFRESH_SECRET
```

güçlü random secret olmalıdır.

Repository içine commit edilmez.

---

# 29. .ENV.EXAMPLE

Repo içinde secret içermeyen:

```text
.env.example
```

bulunmalıdır.

Örnek:

```env
DATABASE_URL=
REDIS_URL=

JWT_SECRET=
JWT_REFRESH_SECRET=

FRONTEND_URL=

DEV_TOOLS_ENABLED=false
ALLOW_MOCK_INTEGRATIONS=false

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_REGION=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
OBJECT_STORAGE_BUCKET=
```

---

# 30. DATABASE MIGRATION

Deployment sırasında schema migration uygulanmalıdır.

Örnek:

```bash
pnpm --filter backend prisma migrate deploy
```

Exact script package.json ile uyumlu olmalıdır.

---

# 31. MIGRATION PRE-DEPLOY

Migration:

> backend yeni kod traffic almadan önce veya kontrollü startup/release aşamasında

uygulanmalıdır.

Migration fail ise deploy başarılı kabul edilmez.

---

# 32. MIGRATION RESET YASAĞI

Pilot deployed DB üzerinde:

```text
prisma migrate reset
```

normal deployment komutu olarak kullanılmamalıdır.

Bu veri siler.

---

# 33. SEED

Pilot test kullanıcıları ve test hospital için seed ayrı komut olmalıdır.

Örnek:

```bash
pnpm --filter backend seed
```

---

# 34. SEED IDEMPOTENCY

Seed birden fazla çalıştırılırsa duplicate:

```text
User
Hospital
SLA Policy
```

oluşturmamalıdır.

---

# 35. PILOT SEED HOSPITAL

Minimum:

```text
TEST_HOSPITAL
```

oluşturulmalıdır.

İleride cross-hospital test için:

```text
TEST_HOSPITAL_A
TEST_HOSPITAL_B
```

önerilir.

---

# 36. PILOT USERS

Minimum:

```text
doctor@test.local
reporter@test.local
operation@test.local
manager@test.local
```

İki kullanıcı lock testi için ayrıca:

```text
doctor2@test.local
reporter2@test.local
```

yararlıdır.

---

# 37. PILOT PASSWORDS

Test passwordleri:

- repository içine yazılmamalı,
- public README içine yazılmamalı,
- sağlık ekibine ayrı güvenli kanaldan verilmelidir.

---

# 38. PILOT USER ACCESS

Test kullanıcıları yalnız:

```text
TEST_HOSPITAL
```

erişimine sahip olabilir.

Cross-hospital security testinde farklı access hazırlanır.

---

# 39. DEFAULT SLA SEED

Bilinen pilot defaults:

```text
ACIL = 120 dakika
YATAN = 720 dakika
NORMAL = 1440 dakika
Warning = 20 dakika
```

`YOGUN_BAKIM` değeri doğrulanmadan uydurulmamalıdır.

---

# 40. CORS

Backend yalnız izin verilen frontend originlerini kabul etmelidir.

Pilot minimum:

```text
Vercel production domain
localhost development domain
```

---

# 41. CORS WILDCARD

Authenticated pilot için:

```text
Access-Control-Allow-Origin: *
```

kullanılmamalıdır.

---

# 42. CORS CREDENTIALS

Refresh cookie kullanılıyorsa backend:

```text
credentials = true
```

desteklemelidir.

Frontend request de credentials göndermelidir.

---

# 43. REFRESH COOKIE

Cross-origin HTTPS pilot için cookie tipik olarak:

```text
HttpOnly
Secure
SameSite=None
```

ayarlarını gerektirir.

Exact cookie davranışı deployed ortamda test edilmelidir.

---

# 44. COOKIE DOMAIN

Gereksiz şekilde parent domain sabitlemek yerine browser/deployment yapısına uygun minimum config kullanılmalıdır.

Cookie local geliştirme ve deployed ortam için environment-aware olabilir.

---

# 45. AUTH DEPLOY TEST

Vercel üzerinden aşağıdaki akış mutlaka test edilmelidir:

```text
login
↓
authenticated request
↓
access token expiry/refresh
↓
logout
```

Localhost testi yeterli değildir.

---

# 46. HTTPS

Pilot frontend ve backend HTTPS kullanmalıdır.

Bu ayrıca browser microphone erişimi için gereklidir.

---

# 47. MICROPHONE TEST

Vercel domain üzerinde Doctor hesabı ile:

```text
permission
record
stop
upload
```

test edilmelidir.

Localhost’ta çalışması pilot acceptance için yeterli değildir.

---

# 48. AUDIO PLAYBACK TEST

Reporter:

```text
Vercel
↓
backend
↓
signed storage URL
↓
audio playback
```

akışını kullanabilmelidir.

---

# 49. OBJECT STORAGE CORS

Browser doğrudan object storage'a upload yapmıyorsa storage CORS ihtiyacı sınırlı olabilir.

Pilot backend multipart upload kullanıyorsa:

```text
Browser → Backend → Object Storage
```

akışı tercih edilir.

---

# 50. UPLOAD SIZE

Backend audio upload için configurable max size kullanmalıdır.

Aşırı büyük request backend’i destabilize etmemelidir.

---

# 51. MOCK HL7 DEPLOYMENT

Pilot DevTools:

```text
POST /dev-tools/hl7/first
POST /dev-tools/hl7/second
```

ile gerçek core HL7 service’i test eder.

---

# 52. TEST PACS DEPLOYMENT

Tercih:

```text
Orthanc
```

veya çalışan test PACS adapter.

Orthanc ayrı servis olarak deploy edilemiyorsa:

> P0 workflow TestPacsAdapter ile devam edebilir.

Ancak kullanıcıya fake görüntü success gösterilmemelidir.

---

# 53. ORTHANC

Orthanc kullanılıyorsa:

- test DICOM,
- test accession,
- Study UID,
- viewer access

önceden hazırlanmalıdır.

Production patient DICOM kullanılmamalıdır.

---

# 54. MOCK HBYS DEPLOYMENT

Pilot:

```text
MockHbysAdapter
```

kullanır.

Mode:

```text
SUCCESS
FAIL
TIMEOUT
```

DevTools üzerinden değiştirilebilir.

---

# 55. MOCK HBYS DEFAULT

Pilot ilk açılışta güvenli default:

```text
SUCCESS
```

olabilir.

Failure testinde kullanıcı açıkça FAIL/TIMEOUT seçer.

---

# 56. HBYS BULLMQ

Railway backend process:

- API,
- BullMQ worker

aynı process içinde pilotta çalışabilir.

Bu yaklaşım 2–3 kullanıcı pilotu için kabul edilebilir.

---

# 57. WORKER STARTUP

Backend process açıldığında worker gerçekten aktif olmalıdır.

Sadece API process çalışıp HBYS queue consumer olmaması kabul edilmez.

---

# 58. WORKER HEALTH

İleride ayrı worker health eklenebilir.

Pilot minimum end-to-end HBYS test worker’ın çalıştığını doğrular.

---

# 59. RAILWAY PORT

Backend platform tarafından verilen portu kullanmalıdır.

Kod sabit:

```text
3001
```

portuna zorlanmamalıdır.

Örnek:

```ts
const port = process.env.PORT ?? 3001;
```

---

# 60. HOST BINDING

Backend container/platform ortamında dış bağlantı kabul edecek şekilde listen etmelidir.

Framework/platform defaultlarıyla uyumlu olmalıdır.

---

# 61. HEALTH ENDPOINT

Deployment health check:

```text
GET /api/v1/health
```

kullanmalıdır.

Minimum:

```json
{
  "data": {
    "app": "ok",
    "database": "ok",
    "redis": "ok"
  }
}
```

benzeri contract olabilir.

Exact response backend contract ile uyumlu tutulur.

---

# 62. HEALTH FAILURE

DB veya Redis down ise health response yanlışlıkla full healthy göstermemelidir.

---

# 63. STARTUP ENV VALIDATION

Eksik kritik env varsa backend:

> açık hata ile startup fail

etmelidir.

Sessiz default credential üretmemelidir.

---

# 64. PRISMA CLIENT GENERATE

Build pipeline Prisma client generation gerektiriyorsa build script buna göre yapılandırılmalıdır.

Deploy sırasında generated client eksik olmamalıdır.

---

# 65. VERCEL ROOT DIRECTORY

Monorepo deployment frontend package’ını build edecek şekilde ayarlanmalıdır.

Build system:

```text
apps/frontend
```

ve workspace bağımlılıklarını görebilmelidir.

---

# 66. SHARED PACKAGE BUILD

Frontend build sırasında:

```text
packages/shared
```

erişilebilir olmalıdır.

Shared package ayrı npm registry’ye publish edilmek zorunda değildir.

Workspace dependency olarak kullanılabilir.

---

# 67. RAILWAY MONOREPO

Railway backend build:

```text
apps/backend
```

ve:

```text
packages/shared
```

paketlerine erişebilmelidir.

---

# 68. LOCKFILE

Deployment:

```text
pnpm-lock.yaml
```

kullanmalıdır.

Dependency graph reproducible olmalıdır.

---

# 69. BUILD FAILURE POLICY

Vercel veya Railway build fail ise deploy:

> başarılı sayılmaz.

Agent failure recovery dokümanına göre log inceler.

---

# 70. WEBSOCKET

Railway backend Socket.IO gateway expose eder.

Frontend deployed URL’ye bağlanır.

---

# 71. WEBSOCKET AUTH

Authenticated socket connection deployed ortamda test edilmelidir.

Unauthenticated client protected room alamamalıdır.

---

# 72. WEBSOCKET RECONNECT

Backend restart edilirse frontend:

```text
disconnect
↓
reconnect
↓
REST refetch
```

yapabilmelidir.

---

# 73. REALTIME FALLBACK

WebSocket pilot deployda sorun çıkarırsa geçici:

```text
TanStack Query polling
```

kullanılabilir.

Ancak issue `PROGRESS.md` içinde açık MAJOR issue olarak kalır.

---

# 74. LOCK HEARTBEAT

Doctor/Reporter aktif workspace Vercel üzerinden açıkken:

```text
frontend
↓
Railway lock heartbeat endpoint
↓
Redis
```

zinciri doğrulanmalıdır.

---

# 75. LOCK TTL DEPLOY TEST

Heartbeat kesilirse Redis lock configured TTL sonunda expire olmalıdır.

---

# 76. REDIS RESTART

Redis geçici unreachable ise edit workflow fail closed davranmalıdır.

Deployment acceptance sırasında en az kontrollü test yapılabilir.

---

# 77. LOGGING

Railway logs en az:

```text
requestId
event type
studyId
hospitalId
error code
```

gibi operational metadata içerebilir.

---

# 78. LOGGING YASAĞI

Logs içine:

```text
password
refresh token
JWT secret
full report content
audio binary
object storage secret
HBYS secret
```

yazılmamalıdır.

---

# 79. ERROR RESPONSE

Deployment ortamında raw stack trace frontend’e gitmemelidir.

---

# 80. DEVTOOLS DEPLOY SECURITY

Pilot DevTools açık olsa dahi:

```text
unauthenticated
Doctor
Reporter
```

endpointleri kullanamamalıdır.

Pilot default:

```text
MANAGER
```

erişimi.

---

# 81. DEVTOOLS UI

Frontend `/dev-tools` route:

- yalnız uygun role,
- yalnız pilot/dev environment

için navigation’da gösterilmelidir.

Backend security yine asıl kontroldür.

---

# 82. TEST MODE VISIBILITY

Accelerated SLA veya Mock HBYS kullanılıyorsa UI bunun test mode olduğunu gösterebilir.

Örnek:

```text
PILOT TEST MODE
Mock HBYS: FAIL
Accelerated SLA: ON
```

---

# 83. TEST/PILOT BANNER

İlk pilotta üst alanda küçük:

```text
TEST ORTAMI — GERÇEK HASTA VERİSİ KULLANMAYIN
```

uyarısı faydalıdır.

---

# 84. REAL PATIENT DATA YASAĞI

İlk internet pilotu:

> gerçek hasta verisi ile kullanılmamalıdır.

KVKK ve gerçek hospital integration security süreçleri tamamlanmadan sadece test data kullanılmalıdır.

---

# 85. TEST STUDY CREATION

Sağlık ekibinin pilot testi için Manager DevTools ile kendi test Study’sini oluşturabilmelidir.

Tercih:

```text
First HL7
↓
Second HL7
↓
Images Available
```

adımlarıdır.

---

# 86. DEPLOYMENT ORDER

İlk deploy önerilen sıra:

```text
1. PostgreSQL
2. Redis
3. Object Storage
4. Backend
5. Migration
6. Seed
7. Health test
8. Frontend
9. CORS/Auth test
10. Audio test
11. WebSocket test
12. E2E test
```

---

# 87. DATABASE BEFORE BACKEND

Backend ilk startup öncesi DB connection hazır olmalıdır.

---

# 88. REDIS BEFORE BACKEND

Lock/BullMQ kullanan pilot için Redis hazır olmalıdır.

---

# 89. MIGRATION BEFORE TEST

Frontend E2E başlamadan schema migration başarıyla uygulanmalıdır.

---

# 90. SEED BEFORE ROLE TEST

Role testlerinden önce test users oluşturulmalıdır.

---

# 91. BACKEND FIRST TEST

Backend deploy sonrası ilk test:

```text
GET /api/v1/health
```

olmalıdır.

---

# 92. BACKEND AUTH TEST

Daha sonra:

```text
POST /api/v1/auth/login
GET /api/v1/auth/me
```

çalışmalıdır.

---

# 93. FRONTEND FIRST TEST

Vercel URL açıldığında:

- login page,
- frontend build,
- API connectivity

kontrol edilir.

---

# 94. CORS TEST

Vercel domain’den backend çağrısı:

> browser CORS error vermemelidir.

---

# 95. REFRESH TEST

Access token refresh browser network tab ve uygulama davranışı üzerinden doğrulanmalıdır.

---

# 96. DOCTOR TEST

Deployed Doctor hesabı ile:

```text
login
↓
UNREAD Study
↓
start-reading
↓
lock
↓
audio
↓
complete-reading
```

çalışmalıdır.

---

# 97. REPORTER TEST

Deployed Reporter:

```text
login
↓
WAITING_TRANSCRIPTION
↓
lock
↓
audio playback
↓
report
↓
submit
```

çalışmalıdır.

---

# 98. APPROVAL TEST

Doctor:

```text
approval queue
↓
report
↓
finalize
↓
HBYS_PENDING
```

görmelidir.

---

# 99. HBYS SUCCESS TEST

Mock mode SUCCESS.

Expected:

```text
HBYS_PENDING
↓
HBYS_SENT
```

---

# 100. HBYS FAILURE TEST

Mock mode FAIL.

Expected:

```text
HBYS_PENDING
↓
retry
↓
HBYS_FAILED
```

---

# 101. MANUAL RETRY TEST

Operation/Manager:

```text
Mock mode SUCCESS
↓
manual retry
↓
HBYS_SENT
```

---

# 102. MULTI-USER TEST

Pilot release öncesi en az:

```text
Doctor
Reporter
Operation/Manager
```

ayrı authenticated browser sessionlarda kullanılmalıdır.

---

# 103. DOCTOR LOCK CONFLICT DEPLOY TEST

İki Doctor session aynı Study’yi almaya çalışır.

Expected:

```text
Doctor A = success
Doctor B = 423 STUDY_LOCKED
```

---

# 104. REPORTER LOCK CONFLICT DEPLOY TEST

İki Reporter session.

Expected:

```text
Reporter A = success
Reporter B = 423
```

---

# 105. CROSS-HOSPITAL SECURITY DEPLOY TEST

Doctor A yalnız Hospital A yetkili.

Hospital B Study direct API erişimi:

```text
403
```

olmalıdır.

---

# 106. REALTIME CROSS-HOSPITAL TEST

Hospital B event’i Doctor A socket’ına gitmemelidir.

---

# 107. AUDIT TEST

Deployed happy path sonrası Study audit timeline kritik eventleri içermelidir.

---

# 108. INFORMATION TEST

Doctor note ekler.

Reporter aynı Study’de note’ı görür.

History update çalışır.

Delete yoktur.

---

# 109. IMAGE MISSING TEST

Deployed:

```text
Doctor
→ IMAGE_MISSING
→ Operation Resolve
→ UNREAD
```

çalışmalıdır.

---

# 110. HOSPITAL DOCTOR TEST

DevTools:

```text
External Lock
→ HOSPITAL_DOCTOR
→ Doctor blocked
→ External Unlock
→ UNREAD
```

---

# 111. SLA TEST

Accelerated mode ile:

```text
NORMAL
→ WARNING
→ OVERDUE
```

state’leri görünür olmalıdır.

---

# 112. BROWSER TEST

Pilot minimum modern desktop browser:

```text
Chrome
+
Safari veya Edge
```

temel akışta test edilmelidir.

Audio/microphone özellikle kontrol edilir.

---

# 113. CACHE

Pilot frontend response caching Study workflow’unda stale data oluşturacak şekilde agresif olmamalıdır.

TanStack Query stale/refetch ayarları realtime/polling ile uyumlu tutulmalıdır.

---

# 114. SERVICE WORKER

Pilot ilk sürüm için offline service worker/PWA gerekli değildir.

Eski frontend build cache sorunları oluşturacak gereksiz complexity eklenmemelidir.

---

# 115. DOMAIN

İlk pilot için Vercel/Railway generated domain kullanılabilir.

Custom domain zorunlu değildir.

---

# 116. CUSTOM DOMAIN POST-PILOT

Gerçek kullanıcı ve hospital entegrasyonu öncesi custom domain değerlendirilebilir.

Pilot blocker değildir.

---

# 117. BACKUP

Pilot DB test verisi içerdiği için enterprise backup politikası P0 değildir.

Ancak provider backup/snapshot imkanları kullanılabiliyorsa yararlıdır.

---

# 118. DATA RESET

Pilot test data gerektiğinde temizlenebilir.

Ancak reset:

- açıkça test environment,
- kullanıcı bilgisiyle,
- kontrollü

olmalıdır.

Otomatik production startup reset yasaktır.

---

# 119. DEPLOYMENT VERSION

Pilot release:

```text
v0.1.0-pilot
```

olarak Git tag alabilir.

---

# 120. RELEASE COMMIT

Pilot release commit'i mümkünse:

```text
main
```

üzerinde temiz ve test edilmiş durumda olmalıdır.

Agent branch WIP hali doğrudan pilot release edilmemelidir.

---

# 121. BRANCH MERGE

Önerilen sıra:

```text
agent/backend
↓
tested merge

agent/frontend
↓
tested merge

main
↓
full quality gates
↓
deploy
```

Exact merge strategy kullanıcı/agent otomasyonuna göre değişebilir.

---

# 122. MERGE CONFLICT

Özellikle:

```text
packages/shared
TASK_QUEUE.md
PROGRESS.md
API_CONTRACT.md
```

conflictleri manuel/dikkatli çözülmelidir.

---

# 123. PRE-DEPLOY QUALITY GATE

Deploy öncesi minimum:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
relevant tests
```

başarılı olmalıdır.

---

# 124. DEPLOY BLOCKER

Aşağıdakilerden biri varsa deploy pilot-ready değildir:

```text
build fail
migration fail
auth fail
Redis fail
lock fail
audio upload fail
report save fail
finalize fail
HBYS worker fail
cross-hospital leak
```

---

# 125. RUNTIME BLOCKER

Deploy teknik olarak başarılı olsa bile:

```text
Doctor → Reporter → Doctor → HBYS
```

zinciri çalışmıyorsa pilot hazır değildir.

---

# 126. PILOT RELEASE CHECKLIST

```text
[ ] Backend deployed
[ ] Frontend deployed

[ ] PostgreSQL connected
[ ] Redis connected
[ ] Object storage connected

[ ] Migration PASS
[ ] Seed PASS

[ ] Health PASS

[ ] Doctor login PASS
[ ] Reporter login PASS
[ ] Operation login PASS
[ ] Manager login PASS

[ ] Cross-origin auth PASS
[ ] Refresh PASS
[ ] Logout PASS

[ ] First HL7 PASS
[ ] Second HL7 PASS
[ ] Images Available PASS

[ ] Doctor workflow PASS
[ ] Doctor lock conflict PASS
[ ] Dictation upload PASS

[ ] Reporter workflow PASS
[ ] Reporter lock conflict PASS
[ ] Audio playback PASS
[ ] Report autosave PASS

[ ] Doctor approval PASS
[ ] Finalization PASS

[ ] HBYS SUCCESS PASS
[ ] HBYS FAIL PASS
[ ] Manual Retry PASS

[ ] Audit PASS
[ ] Image Missing PASS
[ ] External Lock PASS

[ ] SLA accelerated test PASS

[ ] Cross-hospital security PASS

[ ] BLOCKER = 0
[ ] CRITICAL = 0
```

---

# 127. HEALTHCARE TEAM HANDOFF

Pilot sağlık ekibine verilirken paylaşılacak minimum:

```text
Frontend URL
Doctor test account
Reporter test account
Operation/Manager test account
Short test instructions
Known issues
```

Secret backend credentials paylaşılmaz.

---

# 128. HEALTHCARE TEAM TEST FLOW

Kısa kullanım:

```text
Manager DevTools
↓
First HL7
↓
Second HL7
↓
Images

Doctor
↓
Read + Dictate

Reporter
↓
Listen + Write

Doctor
↓
Final

System
↓
Mock HBYS
```

---

# 129. KNOWN ISSUES

Pilot release sırasında MAJOR ancak kabul edilen issue varsa açıkça yazılmalıdır.

Örnek:

```text
Known issue:
WebSocket reconnect occasionally delayed.
REST polling fallback active.
No data integrity impact.
```

---

# 130. KNOWN ISSUE SAKLAMA YASAĞI

Çalışmayan özellik:

> çalışıyor gibi sunulmamalıdır.

---

# 131. ROLLBACK

Yeni deployment ana P0 workflow’u bozarsa son çalışan release’e rollback yapılabilir.

Database migration compatibility kontrol edilmelidir.

---

# 132. ADDITIVE MIGRATION

Pilot süresince yeni migrationlar mümkün olduğunca additive olmalıdır.

Rollback riskini azaltır.

---

# 133. DEPLOYMENT FAILURE RECOVERY

Deploy fail olduğunda:

```text
read provider logs
↓
classify
↓
fix smallest root cause
↓
local build/test
↓
redeploy
```

`FAILURE_RECOVERY.md` uygulanır.

---

# 134. FRONTEND DEPLOY FAILURE

Önce:

```text
build log
TypeScript
env
workspace dependency
SSR/browser API
```

kontrol edilir.

---

# 135. BACKEND DEPLOY FAILURE

Önce:

```text
startup log
PORT
DATABASE_URL
REDIS_URL
Prisma generation
migration
required env
```

kontrol edilir.

---

# 136. LOGIN DEPLOY FAILURE

Local çalışıp Vercel’de çalışmıyorsa özellikle:

```text
CORS
credentials
SameSite
Secure
FRONTEND_URL
```

kontrol edilir.

---

# 137. AUDIO DEPLOY FAILURE

Özellikle:

```text
HTTPS
microphone browser permission
multipart body size
object storage credentials
storage endpoint
```

kontrol edilir.

---

# 138. HBYS DEPLOY FAILURE

Mock adapter olsa bile:

```text
Redis
BullMQ worker
queue registration
job attempts
```

kontrol edilir.

---

# 139. REAL HOSPITAL INTEGRATION YOK

İlk pilot release:

> gerçek hospital HL7/PACS/HBYS bağlantısına bağımlı değildir.

Gerçek entegrasyon ayrı onboarding fazıdır.

---

# 140. PRODUCTION'A GEÇİŞ DEĞİLDİR

Bu deployment:

> sağlık ekibi pilot/test ortamıdır.

Production öncesi ayrıca:

```text
KVKK/security review
real integration
network/VPN
production credentials
backup
monitoring
operational support
```

çalışmaları gerekecektir.

---

# 141. PILOT SUCCESS TANIMI

Deployment başarılı sayılırsa sağlık ekibi internet üzerinden:

```text
Study oluşturabilir
↓
Doctor okuyabilir
↓
Reporter yazabilir
↓
Doctor final verebilir
↓
Mock HBYS sonucu görülebilir
```

olmalıdır.

---

# 142. SOURCE OF TRUTH

Deployment konusunda öncelik:

```text
ARCHITECTURE.md
↓
IMPLEMENTATION_PLAN.md
↓
QUALITY_GATES.md
↓
FAILURE_RECOVERY.md
↓
DEPLOYMENT_PILOT.md
↓
platform config
```

şeklindedir.

---

# 143. SON KURAL

Pilot deployment’ın amacı:

> Vercel ve Railway üzerinde “deploy başarılı” etiketi görmek

değildir.

Amaç:

> sağlık ekibinin gerçek browser sessionları üzerinden ana radyoloji raporlama workflow’unu güvenli ve uçtan uca kullanabilmesidir.

Pilot release:

```text
Doctor
→ Reporter
→ Doctor Final
→ HBYS
```

zinciri deployed ortamda doğrulanmadan tamamlanmış kabul edilmez.