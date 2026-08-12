# REALTIME_EVENTS.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Realtime Event Sözleşmesi

> **Doküman Türü:** WebSocket / Socket.IO Event Contract  
> **Üst Referanslar:**  
> `MASTER_SPEC.md`  
> `ARCHITECTURE.md`  
> `WORKFLOW_STATE_MACHINE.md`  
> `API_CONTRACT.md`  
> `AUTH_ROLES_PERMISSIONS.md`  
> `BACKEND.md`  
> `FRONTEND.md`
>
> **Realtime Teknolojisi:** WebSocket / Socket.IO  
> **Backend:** NestJS Gateway  
> **Frontend:** Socket.IO Client  
> **Ana Kural:** Realtime eventler source of truth değildir. PostgreSQL + REST API source of truth olmaya devam eder.

---

# 1. DOKÜMANIN AMACI

Bu doküman backend’in hangi realtime eventleri yayınlayacağını ve frontend’in bu eventlere nasıl tepki vereceğini tanımlar.

Amaç:

- lock değişikliklerini anlık göstermek,
- Study status değişikliklerini anlık yansıtmak,
- Doctor approval queue’yu güncel tutmak,
- HBYS success/failure durumlarını anlık göstermek,
- SLA warning/overdue bildirimlerini anlık göstermek,
- Information notlarını anlık bildirmek,
- external lock ve image missing gibi operasyonel olayları anlık yansıtmak

şeklindedir.

---

# 2. SOURCE OF TRUTH KURALI

Realtime event:

> sistem state’inin tek kaynağı değildir.

Örnek:

```text
study.status.changed
```

event’i kaçırılırsa frontend:

```text
GET /api/v1/studies/:id
```

ile gerçek state’i yeniden alabilmelidir.

---

# 3. EVENT ENVELOPE

Tüm realtime eventlerin ortak envelope’u olmalıdır.

Önerilen yapı:

```ts
interface RealtimeEvent<TPayload> {
  eventId: string;
  type: string;
  occurredAt: string;

  hospitalId?: string;
  studyId?: string;

  actor?: {
    userId?: string;
    role?: UserRole;
  };

  payload: TPayload;
}
```

---

# 4. EVENT ID

Her event:

```text
eventId
```

taşımalıdır.

Amaç:

- duplicate event kontrolü,
- debug,
- correlation.

UUID kullanılabilir.

---

# 5. TIMESTAMP

`occurredAt`:

> ISO 8601 UTC

olmalıdır.

Örnek:

```text
2026-08-12T15:55:12.000Z
```

Frontend lokal saate çevirebilir.

---

# 6. EVENT TYPE NAMING

Event isimleri:

> lowercase dot notation

ile tanımlanacaktır.

Örnek:

```text
study.status.changed
study.locked
study.unlocked
study.waiting_approval
hbys.delivery.sent
hbys.delivery.failed
sla.warning
sla.overdue
information.added
```

---

# 7. EVENT VERSIONING

Pilot ilk sürümde ayrı event version field zorunlu değildir.

İleride gerekirse:

```text
version: 1
```

eklenebilir.

Breaking payload değişikliği sessizce yapılmamalıdır.

---

# 8. AUTHENTICATION

Socket bağlantısı authenticated olmalıdır.

Backend bağlantı sırasında current user’ı doğrulamalıdır.

Unauthenticated socket:

> bağlantı kuramamalı veya protected room’lara girememelidir.

---

# 9. AUTH STRATEGY

Socket.IO handshake sırasında access token kullanılabilir.

Örnek client:

```ts
io(WS_URL, {
  auth: {
    token: accessToken
  }
})
```

Exact implementation backend/frontend birlikte belirlemelidir.

---

# 10. SOCKET TOKEN EXPIRY

Access token expire olursa frontend:

- token refresh,
- reconnect

yapabilmelidir.

Sonsuz reconnect loop oluşmamalıdır.

---

# 11. ROOM STRATEGY

Backend event dağıtımı için room kullanabilir.

Önerilen room tipleri:

```text
user:{userId}
role:{role}
hospital:{hospitalId}
study:{studyId}
```

---

# 12. USER ROOM

Kullanıcı bağlantı kurunca:

```text
user:{userId}
```

room’una alınabilir.

Kişiye özel eventler için kullanılır.

Örnek:

```text
study.waiting_approval
```

ilgili Doctor’a.

---

# 13. ROLE ROOM

Örnek:

```text
role:OPERATION
role:MANAGER
```

genel operasyon eventlerinde kullanılabilir.

Ancak role room hospital scope’u bypass etmemelidir.

---

# 14. HOSPITAL ROOM

Kullanıcı yetkili olduğu hastanelerin:

```text
hospital:{hospitalId}
```

room’larına alınabilir.

Bu sayede Study değişiklikleri yalnız yetkili kullanıcılara gönderilir.

---

# 15. STUDY ROOM

Aktif Study workspace açıldığında client:

```text
study:{studyId}
```

room’una subscribe olabilir.

Bu Study’ye özel:

- lock,
- status,
- information

eventleri alınabilir.

---

# 16. ROOM SECURITY

Client:

```text
study:{randomUuid}
```

room’una kendi başına yetkisiz katılamamalıdır.

Backend join sırasında hospital/resource permission kontrol etmelidir.

---

# 17. ANA EVENT LİSTESİ

Pilot minimum realtime eventleri:

```text
study.status.changed
study.locked
study.unlocked
study.waiting_approval

hbys.delivery.pending
hbys.delivery.sent
hbys.delivery.failed

sla.warning
sla.overdue

information.added
information.updated

study.image_missing
study.image_missing.resolved

study.external_locked
study.external_unlocked
study.external_lock_conflict

notification.created
```

---

# 18. STUDY.STATUS.CHANGED

Event:

```text
study.status.changed
```

Study workflow state değiştiğinde yayınlanır.

Payload:

```ts
interface StudyStatusChangedPayload {
  fromStatus: StudyStatus;
  toStatus: StudyStatus;
}
```

---

# 19. STATUS CHANGED EXAMPLE

```json
{
  "eventId": "evt-001",
  "type": "study.status.changed",
  "occurredAt": "2026-08-12T15:55:12.000Z",
  "hospitalId": "hospital-1",
  "studyId": "study-1",
  "payload": {
    "fromStatus": "UNREAD",
    "toStatus": "READING"
  }
}
```

---

# 20. FRONTEND ACTION — STATUS CHANGED

Codex event geldiğinde en az:

```text
invalidate study detail
invalidate related study lists
```

yapmalıdır.

TanStack Query örneği:

```text
studyKeys.detail(studyId)
studyKeys.lists()
```

---

# 21. STATUS CHANGED OPTIMISTIC UPDATE

Frontend doğrudan payload ile cache update yapabilir.

Ancak complex filter/list üyeliği nedeniyle güvenli varsayılan:

> invalidate + refetch

olabilir.

---

# 22. STUDY.LOCKED

Event:

```text
study.locked
```

Bir internal lock başarıyla oluşturulduğunda yayınlanır.

Payload:

```ts
interface StudyLockedPayload {
  ownerUserId: string;
  ownerDisplayName: string;
  ownerRole: UserRole;
  lockedAt: string;
  lockType: "INTERNAL";
}
```

---

# 23. LOCKED TARGET

Event:

- hospital room,
- study room

üzerinden yayınlanabilir.

Bu sayede Study listelerinde “Okunuyor / Yazılıyor” bilgisi anlık güncellenir.

---

# 24. FRONTEND ACTION — LOCKED

Frontend:

```text
update/invalidate Study list
update/invalidate Study detail
```

yapmalıdır.

Açık Study başka kullanıcıya ait lock aldıysa active actionlar disable edilmelidir.

---

# 25. STUDY.UNLOCKED

Event:

```text
study.unlocked
```

Payload:

```ts
interface StudyUnlockedPayload {
  previousOwnerUserId?: string;
  previousOwnerRole?: UserRole;
  releasedAt: string;
  reason:
    | "WORKFLOW_COMPLETED"
    | "USER_RELEASED"
    | "TTL_EXPIRED"
    | "FORCE_RELEASED";
}
```

---

# 26. FRONTEND ACTION — UNLOCKED

Study list/detail cache invalidate edilir.

Başka kullanıcı lock nedeniyle bekliyorsa Study yeniden açılabilir hale gelir.

---

# 27. FORCE RELEASE EVENT

Force release ayrı event olmak zorunda değildir.

`study.unlocked` payload:

```text
reason = FORCE_RELEASED
```

taşıyabilir.

Operation/Manager için audit ayrıca kalıcı kaynaktır.

---

# 28. STUDY.WAITING_APPROVAL

Event:

```text
study.waiting_approval
```

Reporter raporu submit ettiğinde ilgili Doctor’a gönderilir.

Payload:

```ts
interface StudyWaitingApprovalPayload {
  doctorId: string;
  reportId: string;
  reportVersionId: string;
  submittedAt: string;
}
```

---

# 29. WAITING APPROVAL TARGET

Ana target:

```text
user:{assignedDoctorId}
```

olmalıdır.

Gerekirse ilgili hospital Operation room’a da genel status changed gider.

---

# 30. FRONTEND ACTION — WAITING APPROVAL

Doctor frontend:

```text
invalidate approval list
increase/refetch approval count
show notification/toast
```

yapabilir.

---

# 31. APPROVAL TOAST

Örnek:

```text
Yeni bir rapor final onayınızı bekliyor.
```

Ancak toast tek görünürlük kaynağı değildir.

Approval badge/list kalıcı olmalıdır.

---

# 32. HBYS.DELIVERY.PENDING

Event:

```text
hbys.delivery.pending
```

Doctor final sonrası delivery queue’ya alındığında yayınlanabilir.

Payload:

```ts
interface HbysDeliveryPendingPayload {
  deliveryId: string;
  reportVersionId: string;
  queuedAt: string;
}
```

---

# 33. FRONTEND ACTION — HBYS PENDING

Study detail / list:

```text
HBYS Gönderiliyor
```

olarak güncellenir.

---

# 34. HBYS.DELIVERY.SENT

Event:

```text
hbys.delivery.sent
```

Payload:

```ts
interface HbysDeliverySentPayload {
  deliveryId: string;
  reportVersionId: string;
  sentAt: string;
  externalReportId?: string;
}
```

---

# 35. HBYS SENT TARGET

Event:

- hospital room,
- related Study room,
- assigned Doctor user room,
- Operation/Manager authorized recipients

için yayınlanabilir.

---

# 36. FRONTEND ACTION — HBYS SENT

Invalidate/update:

```text
Study detail
Study lists
HBYS failures
Manager dashboard
Operation dashboard
```

Gerekirse success toast:

```text
Rapor HBYS’ye başarıyla gönderildi.
```

---

# 37. HBYS.DELIVERY.FAILED

Event:

```text
hbys.delivery.failed
```

Payload:

```ts
interface HbysDeliveryFailedPayload {
  deliveryId: string;
  reportVersionId: string;
  failedAt: string;
  errorCode: string;
  message: string;
  attemptCount: number;
  retryable: boolean;
}
```

---

# 38. HBYS FAILURE TARGET

Minimum:

- authorized OPERATION,
- MANAGER.

İlgili Doctor’a read-only notification da gönderilebilir.

---

# 39. FRONTEND ACTION — HBYS FAILED

Operation/Manager:

```text
invalidate HBYS failed list
invalidate Study detail
show persistent warning
```

Retry action visible hale gelir.

---

# 40. HBYS FAILURE TOAST

Örnek:

```text
HBYS gönderimi başarısız oldu.
```

Ancak hata kalıcı listede de görünmelidir.

---

# 41. SLA.WARNING

Event:

```text
sla.warning
```

Deadline’a warning threshold kaldığında yayınlanır.

Payload:

```ts
interface SlaWarningPayload {
  deadlineAt: string;
  remainingSeconds: number;
  category: PatientCategory;
}
```

---

# 42. SLA WARNING TARGET

Authorized:

- Doctor pool,
- Operation,
- Manager

kullanıcılarına hospital scope içinde gönderilebilir.

---

# 43. FRONTEND ACTION — SLA WARNING

Frontend:

- Study row highlight,
- warning badge,
- Operation alert

günceller.

---

# 44. SLA.OVERDUE

Event:

```text
sla.overdue
```

Payload:

```ts
interface SlaOverduePayload {
  deadlineAt: string;
  overdueSeconds: number;
  category: PatientCategory;
}
```

---

# 45. FRONTEND ACTION — SLA OVERDUE

Study:

```text
Gecikme
```

görünümüne alınır.

Operation listesi invalidate edilir.

---

# 46. SLA EVENT DUPLICATION

SLA background checker aynı Study için her dakika duplicate WARNING event üretmemelidir.

Event state değişiminde veya kontrollü interval mantığında üretilmelidir.

---

# 47. SLA ACK ZORUNLU DEĞİLDİR

Pilot ilk sürümde kullanıcı SLA warning’i “acknowledge” etmek zorunda değildir.

İleride ayrı operational acknowledgement eklenebilir.

---

# 48. INFORMATION.ADDED

Event:

```text
information.added
```

Payload:

```ts
interface InformationAddedPayload {
  noteId: string;
  authorUserId: string;
  authorDisplayName: string;
  authorRole: UserRole;
  createdAt: string;
}
```

Full note content event içinde taşınmak zorunda değildir.

---

# 49. FRONTEND ACTION — INFORMATION ADDED

Study workspace/list:

- Information indicator,
- query invalidate,
- optional toast

yapabilir.

---

# 50. INFORMATION.UPDATED

Event:

```text
information.updated
```

Payload:

```ts
interface InformationUpdatedPayload {
  noteId: string;
  updatedByUserId: string;
  updatedAt: string;
  versionCount: number;
}
```

---

# 51. INFORMATION EVENT SECURITY

Sensitive note content tüm hospital room’a broadcast edilmemelidir.

Event metadata küçük tutulmalıdır.

Actual content REST API ile authorized olarak alınır.

---

# 52. STUDY.IMAGE_MISSING

Event:

```text
study.image_missing
```

Doctor Study’yi image missing işaretlediğinde yayınlanır.

Payload:

```ts
interface StudyImageMissingPayload {
  incidentId: string;
  reportedByUserId: string;
  reportedAt: string;
  reason?: string;
}
```

Reason payload’a konulacaksa yalnız yetkili room’lara gönderilmelidir.

---

# 53. FRONTEND ACTION — IMAGE MISSING

Operation:

```text
Image Missing list
```

invalidate edilir.

Doctor Study active reading listten çıkar.

---

# 54. STUDY.IMAGE_MISSING.RESOLVED

Event:

```text
study.image_missing.resolved
```

Payload:

```ts
interface StudyImageMissingResolvedPayload {
  incidentId: string;
  resolvedByUserId?: string;
  resolvedAt: string;
}
```

---

# 55. FRONTEND ACTION — IMAGE RESOLVED

Study:

```text
UNREAD
```

havuzuna yeniden girebilir.

Doctor listesi invalidate edilir.

---

# 56. STUDY.EXTERNAL_LOCKED

Event:

```text
study.external_locked
```

Payload:

```ts
interface StudyExternalLockedPayload {
  externalLockId: string;
  externalUserReference?: string;
  lockedAt: string;
  source: string;
}
```

---

# 57. EXTERNAL LOCK FRONTEND

Doctor listesinde:

```text
Hastane DR
```

durumu görünür hale gelir.

Start-reading action disable olur.

---

# 58. STUDY.EXTERNAL_UNLOCKED

Event:

```text
study.external_unlocked
```

Payload:

```ts
interface StudyExternalUnlockedPayload {
  externalLockId: string;
  releasedAt: string;
}
```

---

# 59. FRONTEND ACTION — EXTERNAL UNLOCKED

Study yeniden `UNREAD` ise Doctor pool invalidate edilir.

---

# 60. STUDY.EXTERNAL_LOCK_CONFLICT

Event:

```text
study.external_lock_conflict
```

Merkezi kullanıcı aktif çalışırken external lock geldiğinde yayınlanır.

Payload:

```ts
interface StudyExternalLockConflictPayload {
  internalOwnerUserId?: string;
  internalOwnerRole?: UserRole;
  externalUserReference?: string;
  detectedAt: string;
}
```

---

# 61. EXTERNAL CONFLICT TARGET

Minimum:

- OPERATION,
- MANAGER,
- ilgili active Doctor.

---

# 62. FRONTEND ACTION — EXTERNAL CONFLICT

Operation UI:

> kritik conflict uyarısı

göstermelidir.

Sistem kendi başına çalışmayı silmez.

---

# 63. NOTIFICATION.CREATED

Persist edilen Notification entity için generic event:

```text
notification.created
```

kullanılabilir.

Payload:

```ts
interface NotificationCreatedPayload {
  notificationId: string;
  type: NotificationType;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  studyId?: string;
  createdAt: string;
}
```

---

# 64. FRONTEND ACTION — NOTIFICATION CREATED

Frontend:

```text
invalidate notification list
invalidate unread count
```

yapar.

---

# 65. REVISION.REQUESTED

Pilot P2 event:

```text
revision.requested
```

Payload:

```ts
interface RevisionRequestedPayload {
  revisionId: string;
  source: RevisionSource;
  requestedAt: string;
}
```

---

# 66. REVISION TARGET

Minimum:

- assigned Doctor,
- related Reporter,
- OPERATION,
- MANAGER.

---

# 67. REPORT.VERSION.CREATED

Pilot P2 olarak:

```text
report.version.created
```

event’i kullanılabilir.

Ancak ilk pilotta status change + revision event yeterli olabilir.

---

# 68. USER STATUS EVENTS

Pilot için realtime user management zorunlu değildir.

Manager user deactivate ettiğinde current user session backend auth check ile kapanabilir.

İleride:

```text
user.session.revoked
```

event’i eklenebilir.

---

# 69. USER.SESSION.REVOKED

Opsiyonel:

```text
user.session.revoked
```

Target:

```text
user:{userId}
```

Frontend:

- logout,
- clear cache,
- disconnect socket.

---

# 70. ROOM JOIN EVENT

Client özel Study room’a subscribe olmak için internal socket command kullanabilir.

Örnek:

```text
study.join
```

Payload:

```json
{
  "studyId": "..."
}
```

Backend authorization sonrası join eder.

---

# 71. ROOM LEAVE EVENT

```text
study.leave
```

Workspace kapanınca gönderilebilir.

---

# 72. CLIENT COMMAND VS SERVER EVENT

Ayrım:

## Client command

```text
study.join
study.leave
```

## Server event

```text
study.status.changed
study.locked
...
```

İsimlendirme karıştırılmamalıdır.

---

# 73. ACK

Client commandlarda Socket.IO acknowledgement kullanılabilir.

Örnek:

```text
study.join
→ success / forbidden
```

---

# 74. BUSINESS ACTION WEBSOCKET ÜZERİNDEN YAPILMAZ

Pilot ana kural:

> start-reading, finalize, submit-report gibi business mutationlar REST API üzerinden yapılır.

WebSocket:

> notification/sync

içindir.

---

# 75. WEBSOCKET ÜZERİNDEN STATUS CHANGE YASAĞI

Client:

```text
socket.emit("study.setStatus", ...)
```

gibi arbitrary workflow mutation yapmamalıdır.

---

# 76. EVENT EMISSION POINT

Realtime event:

> başarılı business transaction sonrasında

yayınlanmalıdır.

Database update başarısızken success event yayınlanmamalıdır.

---

# 77. TRANSACTION + EVENT

Tercih:

```text
DB transaction complete
↓
realtime event emit
```

şeklindedir.

Event emit fail olursa DB state korunur.

Frontend REST refetch ile toparlanabilir.

---

# 78. EVENT EMIT FAILURE

Socket emit failure:

> business transaction rollback nedeni olmak zorunda değildir.

Çünkü realtime source of truth değildir.

Ancak loglanmalıdır.

---

# 79. QUEUE EVENT EMISSION

HBYS worker success/failure sonrası:

1. database delivery update,
2. workflow update,
3. audit,
4. realtime event

sırası tercih edilir.

---

# 80. EVENT PAYLOAD DATA MINIMIZATION

Realtime payload içinde mümkün olduğunca bulunmamalı:

```text
full patient identity
full clinical information
full report content
audio URL
secret/token
```

Client gerekirse REST fetch yapar.

---

# 81. EVENT AUTHORIZATION

Event yalnız kullanıcının zaten REST ile görmeye yetkili olduğu resource’lar için gönderilmelidir.

Realtime security REST security’den daha gevşek olamaz.

---

# 82. CROSS-HOSPITAL EVENT SECURITY

Hospital A kullanıcısı:

> Hospital B Study eventlerini almamalıdır.

Bu mutlaka test edilmelidir.

---

# 83. MANAGER EVENT SCOPE

Pilot varsayılan Manager all hospitals ise tüm hospital room’lara katılabilir.

İleride scoped Manager desteklenebilir.

---

# 84. DOCTOR EVENT SCOPE

Doctor:

- authorized hospitals,
- own approval/user events,
- currently joined Study

eventlerini alır.

Başka Doctor’ın private approval event’i gönderilmemelidir.

---

# 85. REPORTER EVENT SCOPE

Reporter:

- authorized hospitals,
- own assignment,
- related revision/information

eventlerini alabilir.

---

# 86. OPERATION EVENT SCOPE

Operation authorized hospitals için geniş operational event alabilir.

Özellikle:

```text
hbys.delivery.failed
sla.warning
sla.overdue
study.image_missing
study.external_lock_conflict
information.added
```

---

# 87. FRONTEND QUERY INVALIDATION MATRIX

## `study.status.changed`

Invalidate:

```text
study detail
study lists
role queues
manager dashboard if open
operation dashboard if open
```

---

# 88. `study.locked`

Invalidate/update:

```text
study detail
study lists
```

---

# 89. `study.unlocked`

Invalidate/update:

```text
study detail
study lists
```

---

# 90. `study.waiting_approval`

Doctor:

```text
approval list
approval count
notifications
```

---

# 91. `hbys.delivery.sent`

Invalidate:

```text
study detail
study list
hbys delivery list
operation dashboard
manager dashboard
```

---

# 92. `hbys.delivery.failed`

Invalidate:

```text
study detail
hbys failed pool
hbys delivery list
operation dashboard
manager dashboard
notifications
```

---

# 93. `sla.warning`

Invalidate/update:

```text
study list
study detail
operation SLA list
```

---

# 94. `sla.overdue`

Invalidate/update:

```text
study list
study detail
operation overdue list
manager dashboard
```

---

# 95. `information.added`

Invalidate:

```text
study information
study detail flags
notifications
```

---

# 96. `study.image_missing`

Invalidate:

```text
doctor list
operation image missing list
study detail
```

---

# 97. `study.image_missing.resolved`

Invalidate:

```text
doctor unread list
operation image missing list
study detail
```

---

# 98. `study.external_locked`

Invalidate:

```text
doctor unread list
hospital doctor list
study detail
```

---

# 99. `study.external_unlocked`

Invalidate:

```text
doctor unread list
hospital doctor list
study detail
```

---

# 100. DUPLICATE EVENT HANDLING

Frontend kısa süre içinde aynı:

```text
eventId
```

ile event alırsa ikinci kez işlemek zorunda değildir.

Basit bounded recent-event cache tutulabilir.

Pilot için zorunlu değil ancak toast spam’i önleyebilir.

---

# 101. EVENT ORDERING

WebSocket event sırası her zaman business transaction sırasını kusursuz garanti etmeyebilir.

Frontend event payload’a kör güvenmek yerine gerektiğinde refetch yapmalıdır.

---

# 102. STALE EVENT

Örnek:

Client:

```text
HBYS_SENT
```

state’ini REST’ten aldıktan sonra gecikmiş:

```text
HBYS_PENDING
```

event’i gelirse UI geri dönmemelidir.

Bu nedenle complex mutationlarda refetch tercih edilir.

---

# 103. RECONNECT STRATEGY

Socket reconnect olduğunda frontend:

```text
auth/me optionally verify
↓
rejoin authorized rooms
↓
invalidate active queries
↓
refetch
```

yapmalıdır.

---

# 104. CONNECTION STATE UI

Realtime bağlantı tamamen kritik değilse her kullanıcıya sürekli büyük websocket durumu gösterilmek zorunda değildir.

Ancak bağlantı uzun süre kesilmişse:

```text
Canlı güncellemeler geçici olarak kullanılamıyor.
```

uyarısı gösterilebilir.

---

# 105. POLLING FALLBACK

Socket kesildiyse kritik ekranlarda:

```text
5–15 saniyelik refetch
```

aktif edilebilir.

Socket geri geldiğinde polling azaltılabilir.

---

# 106. NO DATA LOSS

Socket kesilmesi:

- report save,
- finalize,
- dictation upload

gibi REST mutationları engellemek zorunda değildir.

Ancak aktif lock heartbeat de socket yerine REST ise devam etmelidir.

---

# 107. LOCK HEARTBEAT REALTIME DEĞİLDİR

Pilot contract’a göre lock heartbeat:

```text
POST /studies/:id/lock/heartbeat
```

REST üzerinden yapılabilir.

Socket connection lock’un source of truth’u değildir.

---

# 108. NOTIFICATION VS EVENT

Her realtime event persistent Notification entity oluşturmak zorunda değildir.

Örnek:

```text
study.locked
```

sadece realtime olabilir.

Ama:

```text
HBYS_FAILED
APPROVAL_WAITING
REVISION_REQUESTED
```

persistent notification da oluşturabilir.

---

# 109. PERSISTENT NOTIFICATION RULE

Kullanıcı event’i kaçırsa bile daha sonra bilmesi gereken olaylarda Notification oluşturulmalıdır.

Örnek:

```text
approval waiting
HBYS failed
revision requested
critical SLA warning
```

---

# 110. EVENT LOGGING

Backend debug/log minimum:

```text
event type
event id
hospital id
study id
target room type
```

tutabilir.

Sensitive payload loglanmamalıdır.

---

# 111. SOCKET ERROR CODES

Join/auth komutlarında internal errorlar:

```text
SOCKET_UNAUTHORIZED
SOCKET_FORBIDDEN
STUDY_ROOM_ACCESS_DENIED
```

kullanılabilir.

---

# 112. SOCKET CONNECTION LIMIT

Pilot 2–3 kullanıcı için kompleks rate limiting zorunlu değildir.

Ancak abuse’e karşı reasonable connection limits uygulanabilir.

---

# 113. SOCKET MEMORY SAFETY

Disconnect olduğunda room/session cleanup yapılmalıdır.

Client başına gereksiz listener leak oluşmamalıdır.

---

# 114. FRONTEND LISTENER CLEANUP

React component unmount olduğunda component-specific listener kaldırılmalıdır.

Merkezi socket manager varsa listener ownership açık olmalıdır.

---

# 115. ONE SOCKET PER APP SESSION

Tercih:

> bir authenticated frontend session = bir socket connection.

Her component kendi socket connection’ını yaratmamalıdır.

---

# 116. TANSTACK QUERY + SOCKET

Önerilen pattern:

```text
Socket event
↓
event handler
↓
queryClient.invalidateQueries
↓
REST refetch
```

Bu pilot için güvenli ve basittir.

---

# 117. DIRECT CACHE PATCH

Yoğun trafik ileride problem olursa event payload ile direct cache patch optimize edilebilir.

Pilot ilk sürüm için premature optimization yapılmamalıdır.

---

# 118. BACKEND IMPLEMENTATION

NestJS tarafında:

```text
RealtimeModule
RealtimeGateway
RealtimeService
```

gibi yapı kullanılabilir.

Domain service doğrudan Socket.IO server instance’ı bilmemelidir.

---

# 119. REALTIME SERVICE

Domain service:

```ts
realtimeService.emitStudyStatusChanged(...)
```

gibi abstraction çağırabilir.

---

# 120. EVENT FACTORY

Tutarlı envelope için merkezi event factory yararlı olabilir.

Örnek:

```ts
createRealtimeEvent({
  type,
  hospitalId,
  studyId,
  actor,
  payload
})
```

---

# 121. FRONTEND IMPLEMENTATION

Önerilen:

```text
lib/socket/
├── socket-client.ts
├── socket-provider.tsx
├── event-handlers.ts
└── event-types.ts
```

Shared types mümkünse `packages/shared` içinde olmalıdır.

---

# 122. SOCKET PROVIDER

Authenticated app shell:

> tek SocketProvider

kullanabilir.

Login sayfasında socket açılması gerekmez.

---

# 123. SOCKET LOGOUT

Logout:

```text
disconnect socket
clear listeners
clear query cache
```

yapmalıdır.

---

# 124. MULTIPLE TABS

Her tab ayrı socket açabilir.

Pilot için kabul edilebilir.

Server permission ve lock logic yine backend’de olmalıdır.

---

# 125. EVENT TYPE SHARED

Event isimleri duplicate string olarak birçok dosyaya dağılmamalıdır.

Shared constants kullanılabilir.

Örnek:

```ts
RealtimeEventType.STUDY_STATUS_CHANGED
```

---

# 126. PILOT EVENT TYPES SHARED LIST

```text
STUDY_STATUS_CHANGED
STUDY_LOCKED
STUDY_UNLOCKED
STUDY_WAITING_APPROVAL

HBYS_DELIVERY_PENDING
HBYS_DELIVERY_SENT
HBYS_DELIVERY_FAILED

SLA_WARNING
SLA_OVERDUE

INFORMATION_ADDED
INFORMATION_UPDATED

STUDY_IMAGE_MISSING
STUDY_IMAGE_MISSING_RESOLVED

STUDY_EXTERNAL_LOCKED
STUDY_EXTERNAL_UNLOCKED
STUDY_EXTERNAL_LOCK_CONFLICT

NOTIFICATION_CREATED
```

---

# 127. REALTIME UNIT TESTS

Backend minimum test:

```text
event envelope
hospital targeting
user targeting
unauthorized room rejection
```

---

# 128. REALTIME INTEGRATION TEST

Test:

Doctor A ve Doctor B authorized same hospital.

Doctor A Study açar.

Expected:

Doctor B list client:

```text
study.locked
```

eventini alır.

---

# 129. CROSS HOSPITAL REALTIME TEST

Doctor A sadece Hospital A.

Hospital B Study status değişir.

Expected:

Doctor A socket:

> event almamalıdır.

Bu security-critical testtir.

---

# 130. APPROVAL REALTIME TEST

Reporter report submit eder.

Expected:

assigned Doctor:

```text
study.waiting_approval
```

alır.

Başka Doctor:

> private approval notification almamalıdır.

---

# 131. HBYS REALTIME TEST

Mock SUCCESS:

```text
hbys.delivery.sent
```

Operation + Manager ve ilgili Study session’a gider.

Mock FAIL:

```text
hbys.delivery.failed
```

gider.

---

# 132. SLA REALTIME TEST

Accelerated SLA mode ile:

```text
WARNING
OVERDUE
```

eventleri gerçek saatler beklemeden test edilmelidir.

---

# 133. INFORMATION REALTIME TEST

Doctor note ekler.

Reporter aynı Study’deyse:

```text
information.added
```

alır ve note query invalidate olur.

---

# 134. RECONNECT TEST

Socket disconnect/reconnect simüle edilir.

Reconnect sonrası:

- room’lar geri bağlanır,
- REST state refetch edilir.

---

# 135. NO REALTIME RELEASE BLOCKER RULE

WebSocket tamamen çalışmıyorsa ama güvenli REST polling ile bütün P0 workflow çalışıyorsa:

> MAJOR issue olarak pilot yapılması değerlendirilebilir.

Ancak lock source of truth Redis/REST olduğu için concurrency güvenliği korunmalıdır.

---

# 136. REALTIME P1 PRIORITY

Realtime:

> P1.

Aşağıdakileri geciktirmemelidir:

```text
Auth
Lock
Dictation
Report
Final
HBYS
```

Ancak sağlık ekibinin operasyon UX’i için pilot sonuna kadar tamamlanması hedeflenir.

---

# 137. SOCKET SECRET YASAĞI

Realtime payload içinde:

```text
access token
refresh token
HBYS credential
PACS credential
S3 secret
```

gönderilmez.

---

# 138. PATIENT DATA MINIMIZATION

Event:

```text
study.status.changed
```

için hasta adı taşımaya gerek yoktur.

Frontend Study detail/list query’den bilgiyi zaten alır.

---

# 139. EVENT CONTRACT DEĞİŞİKLİĞİ

Claude event payload değiştirmek isterse:

1. bu dosya güncellenir,
2. shared type güncellenir,
3. backend emitter güncellenir,
4. frontend handler güncellenir,
5. tests güncellenir.

---

# 140. CODEX EVENT UYDURMA YASAĞI

Codex backend’in yayınlamadığı:

```text
doctor.report.ready.superfast
```

gibi event isimleri uydurmamalıdır.

---

# 141. CLAUDE EVENT UYDURMA YASAĞI

Claude ihtiyaç halinde kalıcı yeni event eklemeden önce bu contract’ı güncellemelidir.

---

# 142. PILOT MINIMUM REALTIME ACCEPTANCE

Pilot için minimum:

```text
[ ] socket authenticated
[ ] study.status.changed
[ ] study.locked
[ ] study.unlocked
[ ] study.waiting_approval
[ ] hbys.delivery.sent
[ ] hbys.delivery.failed
[ ] sla.warning
[ ] sla.overdue
[ ] information.added
[ ] reconnect + refetch
[ ] cross-hospital event security
```

---

# 143. FRONTEND MINIMUM REALTIME ACCEPTANCE

Codex tarafında:

```text
[ ] one central socket client
[ ] auth-aware connect/disconnect
[ ] reconnect
[ ] query invalidation
[ ] approval badge update
[ ] lock update
[ ] HBYS status update
[ ] SLA warning update
[ ] fallback polling
```

---

# 144. BACKEND MINIMUM REALTIME ACCEPTANCE

Claude tarafında:

```text
[ ] NestJS gateway
[ ] socket auth
[ ] hospital/user rooms
[ ] room authorization
[ ] normalized event envelope
[ ] domain event emit helpers
[ ] tests
```

---

# 145. SOURCE OF TRUTH

Realtime davranışında öncelik:

```text
MASTER_SPEC.md
↓
WORKFLOW_STATE_MACHINE.md
↓
API_CONTRACT.md
↓
REALTIME_EVENTS.md
↓
BACKEND.md / FRONTEND.md
↓
implementation
```

---

# 146. SON KURAL

Realtime sistemin amacı:

> business logic’i WebSocket’e taşımak

değildir.

Amaç:

> backend’de gerçekleşmiş gerçek ve yetkili state değişikliklerini doğru kullanıcıların ekranlarına hızlı şekilde yansıtmaktır.

Bu nedenle:

- mutationlar REST’te kalır,
- database source of truth kalır,
- room access backend tarafından doğrulanır,
- event payloadları minimum tutulur,
- reconnect sonrası REST refetch yapılır,
- realtime başarısızlığı veri bütünlüğünü bozamaz.