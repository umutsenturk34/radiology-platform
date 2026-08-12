# API_CONTRACT.md
## Radyoloji Görüntüleme ve Raporlama Platformu — REST API Sözleşmesi

> **Doküman Türü:** Frontend ↔ Backend API Contract  
> **Üst Referanslar:** `MASTER_SPEC.md`, `ARCHITECTURE.md`, `WORKFLOW_STATE_MACHINE.md`, `DATA_MODEL.md`  
> **API Stil:** REST  
> **Realtime:** WebSocket / Socket.IO  
> **Base Path:** `/api/v1`  
> **Ana Kural:** Frontend ve backend bu contract dışında birbirlerinden farklı endpoint veya veri modeli varsayamaz.

---

# 1. DOKÜMANIN AMACI

Bu doküman:

- Claude tarafından geliştirilecek backend,
- Codex tarafından geliştirilecek frontend

arasındaki kesin API sözleşmesini tanımlar.

Amaç:

- endpoint isimlerinin değişmemesi,
- request/response alanlarının ortak olması,
- hata kodlarının ortak olması,
- workflow actionlarının rastgele uygulanmaması,
- frontend'in backend davranışını tahmin etmek zorunda kalmaması,
- backend'in frontend için beklenmeyen response üretmemesi

sağlamaktır.

---

# 2. ANA KURAL

Frontend business state'i doğrudan değiştiremez.

Yanlış:

```http
PATCH /studies/{id}

{
  "status": "FINAL"
}
```

Doğru:

```http
POST /studies/{id}/finalize
```

Backend gerekli:

- yetki,
- state,
- lock,
- report,
- workflow

kontrollerini yapar.

---

# 3. BASE URL

Pilot örnek:

```text
Frontend:
https://radiology-platform.vercel.app

Backend:
https://radiology-api.up.railway.app
```

API:

```text
https://radiology-api.up.railway.app/api/v1
```

Gerçek adresler deployment sırasında environment variable üzerinden sağlanacaktır.

---

# 4. API VERSIONING

Tüm pilot endpointleri:

```text
/api/v1
```

prefix'i kullanacaktır.

Örnek:

```http
GET /api/v1/studies
```

---

# 5. CONTENT TYPE

Standart JSON endpointleri:

```http
Content-Type: application/json
```

Ses upload gibi binary işlemler:

```text
multipart/form-data
```

kullanabilir.

---

# 6. AUTHENTICATION

Authenticated endpointlerde:

```http
Authorization: Bearer <access-token>
```

kullanılır.

Access token kısa ömürlü olmalıdır.

Refresh token:

> Secure + HttpOnly cookie

olarak tutulması tercih edilir.

Frontend refresh token değerini JavaScript üzerinden okumamalıdır.

---

# 7. CORS

Pilot frontend ve backend farklı domainlerde çalışacağı için backend yalnızca izin verilen frontend origin'lerini kabul etmelidir.

Örnek:

```text
https://radiology-platform.vercel.app
```

Development:

```text
http://localhost:3000
```

Wildcard:

```text
*
```

authenticated production/pilot API için kullanılmamalıdır.

---

# 8. COOKIE / REFRESH

Cross-origin refresh cookie gerekiyorsa:

```text
HttpOnly
Secure
SameSite=None
```

ve backend:

```text
Access-Control-Allow-Credentials: true
```

kullanmalıdır.

Frontend refresh requestlerinde:

```ts
credentials: "include"
```

veya kullanılan HTTP client'ın eşdeğeri aktif olmalıdır.

---

# 9. RESPONSE ENVELOPE

Başarılı tekil response:

```json
{
  "data": {}
}
```

Liste response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "totalPages": 4
  }
}
```

---

# 10. ERROR ENVELOPE

Tüm business/API hataları tutarlı formatta dönmelidir.

```json
{
  "error": {
    "code": "STUDY_LOCKED",
    "message": "Study is currently locked by another user.",
    "details": {}
  }
}
```

Frontend mümkün olduğunca:

> `error.code`

üzerinden davranış göstermelidir.

`message` kullanıcıya gösterilebilir ancak business logic için kullanılmamalıdır.

---

# 11. HTTP STATUS KURALI

Temel kullanım:

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
423 Locked
429 Too Many Requests

500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
504 Gateway Timeout
```

Lock conflict için tercih:

```text
423 Locked
```

olacaktır.

---

# 12. ID FORMAT

Ana entity ID'leri:

> UUID string

olacaktır.

Örnek:

```json
{
  "id": "9be98f75-3a89-4cac-912a-5bc17ae08457"
}
```

Frontend numeric ID varsaymamalıdır.

---

# 13. DATE / TIME FORMAT

Tüm API timestamp'leri:

> ISO 8601 UTC

formatında gönderilir.

Örnek:

```text
2026-08-12T15:10:30.000Z
```

Frontend kullanıcının lokal saat diliminde gösterebilir.

---

# 14. ENUM FORMAT

Enumlar API'de uppercase string olarak kullanılır.

Örnek:

```text
UNREAD
READING
WAITING_TRANSCRIPTION
ACIL
DOCTOR
HBYS_FAILED
```

Frontend Türkçe label'ı ayrıca map eder.

---

# 15. PAGINATION

Standart liste query:

```http
?page=1&pageSize=25
```

Default:

```text
page = 1
pageSize = 25
```

Maximum pilot:

```text
pageSize = 100
```

---

# 16. SORT

Liste endpointlerinde desteklenebilecek ortak parametre:

```text
sortBy
sortOrder
```

Örnek:

```http
GET /studies?sortBy=arrivalAt&sortOrder=asc
```

`sortOrder`:

```text
asc
desc
```

---

# 17. AUTH — LOGIN

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "email": "doctor@test.local",
  "password": "..."
}
```

Response:

```json
{
  "data": {
    "accessToken": "...",
    "expiresIn": 900,
    "user": {
      "id": "...",
      "email": "doctor@test.local",
      "firstName": "Test",
      "lastName": "Doctor",
      "role": "DOCTOR",
      "status": "ACTIVE"
    }
  }
}
```

Refresh token HttpOnly cookie olarak set edilir.

---

# 18. LOGIN ERRORS

```text
INVALID_CREDENTIALS
USER_INACTIVE
USER_SUSPENDED
```

Yanlış parola ile kullanıcının var olup olmadığı açık edilmemelidir.

---

# 19. AUTH — REFRESH

```http
POST /api/v1/auth/refresh
```

Request body gerekmez.

Refresh cookie kullanılır.

Response:

```json
{
  "data": {
    "accessToken": "...",
    "expiresIn": 900
  }
}
```

---

# 20. AUTH — LOGOUT

```http
POST /api/v1/auth/logout
```

Backend:

- session revoke eder,
- refresh cookie temizler.

Response:

```http
204 No Content
```

---

# 21. AUTH — CURRENT USER

```http
GET /api/v1/auth/me
```

Response:

```json
{
  "data": {
    "id": "...",
    "email": "doctor@test.local",
    "firstName": "Test",
    "lastName": "Doctor",
    "role": "DOCTOR",
    "status": "ACTIVE",
    "hospitals": [
      {
        "id": "...",
        "code": "TEST_HOSPITAL",
        "name": "Test Hospital"
      }
    ]
  }
}
```

---

# 22. HOSPITALS — LIST AUTHORIZED

```http
GET /api/v1/hospitals
```

Normal kullanıcı yalnızca yetkili olduğu hastaneleri görür.

Manager yetkisine göre tüm hastaneleri görebilir.

Response:

```json
{
  "data": [
    {
      "id": "...",
      "code": "TEST_HOSPITAL",
      "name": "Test Hospital",
      "shortName": "TEST",
      "status": "TEST"
    }
  ]
}
```

---

# 23. STUDY LIST

```http
GET /api/v1/studies
```

Desteklenen temel query parametreleri:

```text
hospitalId
status
category
assignedDoctorId
assignedReporterId
specialListId
slaState
hbysStatus
search
page
pageSize
sortBy
sortOrder
```

---

# 24. STUDY FILTER EXAMPLE

```http
GET /api/v1/studies?hospitalId=...&status=UNREAD&category=ACIL&page=1&pageSize=25&sortBy=arrivalAt&sortOrder=asc
```

---

# 25. STUDY POOL PRESET

Frontend operasyon sekmeleri için kolay kullanım amacıyla:

```text
pool
```

query parametresi desteklenebilir.

Değerler:

```text
UNREAD
READ
WAITING_TRANSCRIPTION
WAITING_APPROVAL
FINALIZED
HBYS_FAILED
IMAGE_MISSING
WONT_REPORT
HOSPITAL_DOCTOR
```

Örnek:

```http
GET /api/v1/studies?pool=WAITING_TRANSCRIPTION
```

Backend pool'u gerçek state/filter kombinasyonuna çevirir.

---

# 26. STUDY LIST ITEM

Response item örneği:

```json
{
  "id": "...",
  "accessionNumber": "ACC-2026-00125",
  "patient": {
    "id": "...",
    "displayName": "Test Patient 001",
    "externalPatientId": "TEST-001"
  },
  "hospital": {
    "id": "...",
    "code": "TEST_HOSPITAL",
    "shortName": "TEST"
  },
  "studyDescription": "BT Toraks",
  "modality": "CT",
  "category": "ACIL",
  "status": "UNREAD",
  "arrivalAt": "2026-08-12T15:00:00.000Z",
  "sla": {
    "deadlineAt": "2026-08-12T17:00:00.000Z",
    "remainingSeconds": 3600,
    "state": "NORMAL"
  },
  "assignment": {
    "doctor": null,
    "reporter": null
  },
  "lock": null,
  "flags": {
    "hasInformation": false,
    "hasRevisionRequest": false,
    "hasUnreportedSiblingStudy": false,
    "imageMissing": false
  }
}
```

---

# 27. SLA RESPONSE

Ortak SLA yapısı:

```json
{
  "deadlineAt": "2026-08-12T17:00:00.000Z",
  "remainingSeconds": 1100,
  "overdueSeconds": 0,
  "state": "WARNING"
}
```

`state`:

```text
NORMAL
WARNING
OVERDUE
COMPLETED
```

Frontend deadline hesaplamasının kaynağı backend'dir.

---

# 28. STUDY DETAIL

```http
GET /api/v1/studies/{studyId}
```

Response:

```json
{
  "data": {
    "id": "...",
    "accessionNumber": "ACC-2026-00125",
    "status": "READING",
    "category": "ACIL",

    "patient": {
      "id": "...",
      "displayName": "Test Patient 001",
      "externalPatientId": "TEST-001",
      "birthDate": null,
      "gender": null
    },

    "hospital": {
      "id": "...",
      "code": "TEST_HOSPITAL",
      "name": "Test Hospital"
    },

    "study": {
      "description": "BT Toraks",
      "modality": "CT",
      "studyInstanceUid": "..."
    },

    "clinicalData": {
      "preDiagnosis": "...",
      "requestReason": "...",
      "patientComplaint": "...",
      "previousStudyInfo": "...",
      "requestingPhysician": "...",
      "department": "...",
      "additionalData": {}
    },

    "pacs": {
      "availabilityStatus": "AVAILABLE",
      "viewerAvailable": true,
      "series": []
    },

    "assignment": {
      "doctor": {
        "id": "...",
        "displayName": "Test Doctor"
      },
      "reporter": null
    },

    "lock": {
      "locked": true,
      "type": "INTERNAL",
      "ownerUserId": "...",
      "ownerDisplayName": "Test Doctor",
      "ownerRole": "DOCTOR",
      "lockedAt": "..."
    },

    "sla": {
      "deadlineAt": "...",
      "remainingSeconds": 1200,
      "overdueSeconds": 0,
      "state": "WARNING"
    },

    "flags": {
      "hasInformation": true,
      "imageMissing": false,
      "revisionRequested": false,
      "externalLockConflict": false
    }
  }
}
```

---

# 29. STUDY DETAIL SECURITY

Backend Study detail verirken:

```text
study.hospitalId ∈ currentUser.authorizedHospitals
```

kontrolünü zorunlu yapar.

Sadece UUID bilinmesi erişim hakkı vermez.

---

# 30. START READING

```http
POST /api/v1/studies/{studyId}/start-reading
```

Actor:

> DOCTOR

Gerekli current state:

```text
UNREAD
```

Backend:

1. authorization,
2. hospital authorization,
3. external lock,
4. internal lock,
5. state

kontrollerini yapar.

Sonra:

```text
UNREAD → READING
```

ve Doctor lock oluşturur.

---

# 31. START READING RESPONSE

```json
{
  "data": {
    "studyId": "...",
    "status": "READING",
    "lock": {
      "ownerUserId": "...",
      "ownerRole": "DOCTOR",
      "lockedAt": "...",
      "heartbeatIntervalSeconds": 20
    },
    "readingStartedAt": "..."
  }
}
```

---

# 32. START READING LOCK ERROR

Başka kullanıcı lock sahibiyse:

```http
423 Locked
```

```json
{
  "error": {
    "code": "STUDY_LOCKED",
    "message": "Study is currently locked by another user.",
    "details": {
      "ownerDisplayName": "Test Doctor",
      "ownerRole": "DOCTOR",
      "lockedAt": "..."
    }
  }
}
```

---

# 33. LOCK HEARTBEAT

```http
POST /api/v1/studies/{studyId}/lock/heartbeat
```

Request:

```json
{
  "sessionId": "..."
}
```

Response:

```json
{
  "data": {
    "valid": true,
    "expiresInSeconds": 60
  }
}
```

Sadece lock owner heartbeat yapabilir.

---

# 34. LOCK RELEASE

Normal workflow completion lock'u backend otomatik bırakır.

Kullanıcı güvenli biçimde çalışma ekranından çıkmak istediğinde:

```http
POST /api/v1/studies/{studyId}/lock/release
```

kullanılabilir.

Bu endpoint Study status'ünü otomatik olarak değiştirmek zorunda değildir.

Workflow recovery kuralları backend tarafından uygulanır.

---

# 35. FORCE RELEASE LOCK

```http
POST /api/v1/studies/{studyId}/lock/force-release
```

Actor:

> MANAGER veya uygun OPERATION yetkisi

Request:

```json
{
  "reason": "User session disconnected."
}
```

Audit zorunludur.

---

# 36. PACS VIEWER

```http
GET /api/v1/studies/{studyId}/pacs/viewer
```

Response:

```json
{
  "data": {
    "available": true,
    "viewerUrl": "https://...",
    "expiresAt": "...",
    "studyInstanceUid": "..."
  }
}
```

Frontend PACS credentials veya secret üretmemelidir.

---

# 37. PACS SERIES

```http
GET /api/v1/studies/{studyId}/pacs/series
```

Response:

```json
{
  "data": [
    {
      "seriesInstanceUid": "...",
      "seriesNumber": 1,
      "seriesDescription": "Parankim",
      "modality": "CT",
      "imageCount": 120
    }
  ]
}
```

---

# 38. DICTATION CREATE

Hekim yeni dikte başlattığında:

```http
POST /api/v1/studies/{studyId}/dictations
```

Actor:

> lock owner DOCTOR

Request:

```json
{
  "mimeType": "audio/webm;codecs=opus"
}
```

Response:

```json
{
  "data": {
    "id": "...",
    "studyId": "...",
    "status": "RECORDING",
    "startedAt": "..."
  }
}
```

---

# 39. DICTATION UPLOAD

Pilot tercih:

```http
POST /api/v1/dictations/{dictationId}/upload
```

Content-Type:

```text
multipart/form-data
```

Field:

```text
file
```

Backend object storage'a yükler.

Response:

```json
{
  "data": {
    "id": "...",
    "status": "COMPLETED",
    "mimeType": "audio/webm",
    "fileSize": 845321,
    "durationMs": 127000,
    "uploadedAt": "..."
  }
}
```

---

# 40. FUTURE DIRECT STORAGE UPLOAD

İleride büyük dosya ihtiyaçlarında presigned upload kullanılabilir.

Ancak pilot için:

> backend multipart upload

öncelikli ve daha basit yöntemdir.

Frontend presigned URL'yi zorunlu varsaymamalıdır.

---

# 41. DICTATION LIST

```http
GET /api/v1/studies/{studyId}/dictations
```

Response:

```json
{
  "data": [
    {
      "id": "...",
      "doctor": {
        "id": "...",
        "displayName": "Test Doctor"
      },
      "status": "COMPLETED",
      "durationMs": 127000,
      "mimeType": "audio/webm",
      "createdAt": "..."
    }
  ]
}
```

---

# 42. DICTATION PLAYBACK

```http
GET /api/v1/dictations/{dictationId}/playback
```

Response:

```json
{
  "data": {
    "url": "https://...",
    "expiresAt": "..."
  }
}
```

Object storage bucket public olmamalıdır.

Tercihen kısa süreli signed URL dönülür.

---

# 43. COMPLETE READING

```http
POST /api/v1/studies/{studyId}/complete-reading
```

Actor:

> DOCTOR ve lock owner

Gerekli:

- Study `READING`
- completed dictation

Request:

```json
{
  "dictationId": "..."
}
```

Backend mantıksal olarak:

```text
READING
→ READ
→ WAITING_TRANSCRIPTION
```

geçişlerini tamamlayabilir.

`READ` internal kısa süreli state olarak korunabilir.

Frontend'in `READ` state'ini ayrıca beklemesi zorunlu değildir.

---

# 44. COMPLETE READING RESPONSE

```json
{
  "data": {
    "studyId": "...",
    "status": "WAITING_TRANSCRIPTION",
    "readingCompletedAt": "...",
    "lockReleased": true
  }
}
```

---

# 45. DICTATION REQUIRED ERROR

Dikte tamamlanmamışsa:

```http
422 Unprocessable Entity
```

```json
{
  "error": {
    "code": "DICTATION_REQUIRED",
    "message": "A completed dictation is required before completing reading.",
    "details": {}
  }
}
```

---

# 46. MARK IMAGE MISSING

```http
POST /api/v1/studies/{studyId}/image-missing
```

Actor:

> DOCTOR

Request:

```json
{
  "reason": "Mediasten serisi eksik."
}
```

Backend:

```text
READING → IMAGE_MISSING
```

ve ilgili lock'u bırakır.

Response:

```json
{
  "data": {
    "studyId": "...",
    "status": "IMAGE_MISSING",
    "incidentId": "...",
    "lockReleased": true
  }
}
```

---

# 47. RESOLVE IMAGE MISSING

```http
POST /api/v1/studies/{studyId}/image-missing/resolve
```

Actor:

> OPERATION / MANAGER / SYSTEM integration

Request:

```json
{
  "resolutionNote": "Eksik seri PACS'e gönderildi."
}
```

Backend:

```text
IMAGE_MISSING → UNREAD
```

Response:

```json
{
  "data": {
    "studyId": "...",
    "status": "UNREAD"
  }
}
```

---

# 48. MARK WONT REPORT

```http
POST /api/v1/studies/{studyId}/wont-report
```

Request:

```json
{
  "reason": "Raporlama kapsamı dışında."
}
```

Yetki `AUTH_ROLES_PERMISSIONS.md` ile kesinleşir.

---

# 49. REACTIVATE WONT REPORT

```http
POST /api/v1/studies/{studyId}/reactivate
```

Request:

```json
{
  "reason": "Dosya tekrar raporlama kapsamına alındı."
}
```

Normal geçiş:

```text
WONT_REPORT → UNREAD
```

---

# 50. START TRANSCRIPTION

```http
POST /api/v1/studies/{studyId}/start-transcription
```

Actor:

> REPORTER

Required state:

```text
WAITING_TRANSCRIPTION
```

Backend:

- authorization,
- lock,
- assignment

kontrolleri sonrası:

```text
WAITING_TRANSCRIPTION
→ TRANSCRIBING
```

---

# 51. START TRANSCRIPTION RESPONSE

```json
{
  "data": {
    "studyId": "...",
    "status": "TRANSCRIBING",
    "report": {
      "id": "...",
      "currentVersion": {
        "id": "...",
        "versionNumber": 1,
        "status": "DRAFT",
        "content": ""
      }
    },
    "lock": {
      "ownerUserId": "...",
      "ownerRole": "REPORTER",
      "lockedAt": "...",
      "heartbeatIntervalSeconds": 20
    }
  }
}
```

---

# 52. GET REPORT

```http
GET /api/v1/studies/{studyId}/report
```

Response:

```json
{
  "data": {
    "id": "...",
    "status": "DRAFT",
    "currentVersion": {
      "id": "...",
      "versionNumber": 1,
      "content": "...",
      "source": "REPORTER",
      "status": "DRAFT",
      "createdBy": {
        "id": "...",
        "displayName": "Test Reporter"
      },
      "createdAt": "..."
    }
  }
}
```

---

# 53. SAVE REPORT DRAFT

```http
PUT /api/v1/studies/{studyId}/report/draft
```

Actor:

> current Reporter lock owner

Request:

```json
{
  "content": "Rapor taslak içeriği..."
}
```

Response:

```json
{
  "data": {
    "reportId": "...",
    "versionId": "...",
    "status": "DRAFT",
    "savedAt": "..."
  }
}
```

---

# 54. REPORT AUTOSAVE

Frontend belirli aralıklarla veya değişiklik sonrası debounce ile:

```http
PUT /studies/{studyId}/report/draft
```

çağırabilir.

Önerilen debounce:

```text
2–5 saniye
```

Ancak frontend:

> save başarılı olmadan “Kaydedildi”

göstermemelidir.

---

# 55. SUBMIT REPORT

```http
POST /api/v1/studies/{studyId}/submit-report
```

Actor:

> REPORTER + lock owner

Required:

```text
TRANSCRIBING
```

Request:

```json
{
  "content": "Tamamlanan rapor..."
}
```

Backend:

```text
TRANSCRIBING
→ WAITING_APPROVAL
```

Reporter lock bırakılır.

---

# 56. SUBMIT REPORT RESPONSE

```json
{
  "data": {
    "studyId": "...",
    "status": "WAITING_APPROVAL",
    "report": {
      "id": "...",
      "currentVersionId": "...",
      "status": "WAITING_APPROVAL"
    },
    "lockReleased": true
  }
}
```

Realtime:

```text
study.waiting_approval
```

event'i üretilebilir.

---

# 57. APPROVAL QUEUE

Doctor kendi onay bekleyen dosyalarını:

```http
GET /api/v1/studies?pool=WAITING_APPROVAL&assignedDoctorId=me
```

şeklinde sorgulayabilmelidir.

Alternatif convenience endpoint:

```http
GET /api/v1/me/approval-queue
```

eklenebilir ancak ilk tercih generic Study list endpointidir.

---

# 58. START APPROVAL

Hekim final kontrol için aktif edit yapacaksa:

```http
POST /api/v1/studies/{studyId}/start-approval
```

Actor:

> ilgili DOCTOR

Backend doctor lock oluşturur.

Study status:

```text
WAITING_APPROVAL
```

olarak kalabilir.

Approval için ayrıca yeni Study status oluşturulmaz.

---

# 59. UPDATE REPORT DURING APPROVAL

Hekim final öncesinde rapor metnini düzeltebilirse:

```http
PUT /api/v1/studies/{studyId}/report/approval-draft
```

Request:

```json
{
  "content": "Hekim tarafından düzeltilmiş rapor..."
}
```

Backend değişikliği yeni/aktif ReportVersion üzerinde kontrollü kaydeder.

Audit oluşturur.

---

# 60. RETURN TO REPORTER

Hekim raporu raportöre geri gönderecekse:

```http
POST /api/v1/studies/{studyId}/return-to-reporter
```

Request:

```json
{
  "reason": "Bulgular bölümü tekrar düzenlensin."
}
```

Geçiş:

```text
WAITING_APPROVAL
→ WAITING_TRANSCRIPTION
```

Reason zorunludur.

Realtime reporter notification oluşturulur.

---

# 61. FINALIZE REPORT

```http
POST /api/v1/studies/{studyId}/finalize
```

Actor:

> ilgili DOCTOR

Required:

- WAITING_APPROVAL
- valid completed report
- doctor authorization
- approval lock ownership if approval lock is being used

Request:

```json
{
  "content": "Final rapor içeriği..."
}
```

Backend:

1. final ReportVersion oluşturur/tamamlar,
2. finalizedAt kaydeder,
3. Study FINAL yapar,
4. HBYS delivery oluşturur,
5. Study HBYS_PENDING yapar,
6. queue job üretir.

---

# 62. FINALIZE RESPONSE

HBYS'nin bitmesi beklenmez.

Response:

```json
{
  "data": {
    "studyId": "...",
    "status": "HBYS_PENDING",
    "report": {
      "status": "FINAL",
      "versionId": "...",
      "finalizedAt": "..."
    },
    "hbysDelivery": {
      "id": "...",
      "status": "PENDING"
    }
  }
}
```

---

# 63. FINAL APPROVAL IS ASYNC FOR HBYS

Frontend:

```text
Finalize başarılı
```

ile:

```text
HBYS gönderildi
```

durumlarını aynı şey kabul etmemelidir.

Önce:

```text
HBYS_PENDING
```

sonra realtime/API ile:

```text
HBYS_SENT
```

veya:

```text
HBYS_FAILED
```

gelir.

---

# 64. HBYS DELIVERY DETAIL

```http
GET /api/v1/studies/{studyId}/hbys-deliveries
```

Response:

```json
{
  "data": [
    {
      "id": "...",
      "reportVersionId": "...",
      "status": "FAILED",
      "attemptCount": 3,
      "lastErrorCode": "HBYS_TIMEOUT",
      "lastErrorMessage": "Remote system timeout.",
      "queuedAt": "...",
      "completedAt": "..."
    }
  ]
}
```

---

# 65. HBYS DELIVERY ATTEMPTS

```http
GET /api/v1/hbys-deliveries/{deliveryId}/attempts
```

Actor:

> OPERATION / MANAGER

Response sensitive data içermemelidir.

---

# 66. HBYS MANUAL RETRY

```http
POST /api/v1/hbys-deliveries/{deliveryId}/retry
```

Actor:

> OPERATION / MANAGER

Request:

```json
{
  "reason": "HBYS tekrar erişilebilir."
}
```

Response:

```json
{
  "data": {
    "deliveryId": "...",
    "status": "PENDING",
    "attemptCount": 3
  }
}
```

Study:

```text
HBYS_FAILED → HBYS_PENDING
```

görünümüne geçer.

---

# 67. HBYS RETRY ERROR

Delivery retry edilemiyorsa:

```json
{
  "error": {
    "code": "HBYS_NOT_RETRYABLE",
    "message": "Delivery cannot be retried in its current state.",
    "details": {}
  }
}
```

---

# 68. INFORMATION NOTES — LIST

```http
GET /api/v1/studies/{studyId}/information
```

Response:

```json
{
  "data": [
    {
      "id": "...",
      "author": {
        "id": "...",
        "displayName": "Test Doctor",
        "role": "DOCTOR"
      },
      "content": "Ek bilgi...",
      "createdAt": "...",
      "updatedAt": "...",
      "versionCount": 1
    }
  ]
}
```

---

# 69. INFORMATION NOTE — CREATE

```http
POST /api/v1/studies/{studyId}/information
```

Request:

```json
{
  "content": "Hasta ile ilgili ek bilgi."
}
```

Response:

```json
{
  "data": {
    "id": "...",
    "content": "...",
    "createdAt": "..."
  }
}
```

Realtime:

```text
information.added
```

üretebilir.

---

# 70. INFORMATION NOTE — UPDATE

```http
PUT /api/v1/information/{noteId}
```

Request:

```json
{
  "content": "Güncellenmiş bilgi."
}
```

Backend eski version'ı silmez.

Yeni InformationNoteVersion oluşturur.

---

# 71. INFORMATION NOTE DELETE

Normal API'de:

```http
DELETE /information/{id}
```

endpointi bulunmayacaktır.

---

# 72. INFORMATION NOTE HISTORY

```http
GET /api/v1/information/{noteId}/versions
```

Response:

```json
{
  "data": [
    {
      "id": "...",
      "content": "...",
      "createdBy": {
        "id": "...",
        "displayName": "..."
      },
      "createdAt": "..."
    }
  ]
}
```

---

# 73. SPECIAL LISTS

```http
GET /api/v1/special-lists
```

Response:

```json
{
  "data": [
    {
      "id": "...",
      "code": "LIST_1",
      "name": "Liste 1"
    }
  ]
}
```

---

# 74. ASSIGN STUDY TO SPECIAL LIST

```http
POST /api/v1/studies/{studyId}/special-lists/{listId}
```

Category değişmez.

Response:

```http
204 No Content
```

---

# 75. REMOVE FROM SPECIAL LIST

```http
DELETE /api/v1/studies/{studyId}/special-lists/{listId}
```

Response:

```http
204 No Content
```

---

# 76. HOSPITAL DOCTOR — MANUAL ACQUIRE

Yetkili operasyon senaryosu:

```http
POST /api/v1/studies/{studyId}/hospital-doctor/acquire
```

Request:

```json
{
  "externalUserReference": "HOSPITAL-DOCTOR-001",
  "reason": "Hospital physician acquired study."
}
```

Normal:

```text
UNREAD → HOSPITAL_DOCTOR
```

---

# 77. HOSPITAL DOCTOR — RELEASE

```http
POST /api/v1/studies/{studyId}/hospital-doctor/release
```

Request:

```json
{
  "reason": "Hospital physician released study."
}
```

Normal:

```text
HOSPITAL_DOCTOR → UNREAD
```

---

# 78. REVISION REQUEST

```http
POST /api/v1/studies/{studyId}/revisions
```

Request:

```json
{
  "reason": "Acil hekimi tekrar değerlendirme istedi.",
  "details": "..."
}
```

Backend final tarihine göre:

- normal revision,
- addendum requirement

kararı verir.

---

# 79. REVISION REQUEST RESPONSE

Normal revizyon:

```json
{
  "data": {
    "id": "...",
    "studyId": "...",
    "status": "REQUESTED",
    "workflowResult": "REVISION_REQUESTED"
  }
}
```

İki ay sonrası:

```json
{
  "data": {
    "id": "...",
    "studyId": "...",
    "workflowResult": "ADDENDUM_REQUIRED"
  }
}
```

---

# 80. START REVISION

```http
POST /api/v1/revisions/{revisionId}/start
```

Actor yetkiye göre:

> DOCTOR / REPORTER / OPERATION

Kesin rol matrisi `AUTH_ROLES_PERMISSIONS.md` ile belirlenir.

Backend yeni ReportVersion açar.

---

# 81. REPORT VERSIONS

```http
GET /api/v1/studies/{studyId}/report/versions
```

Response:

```json
{
  "data": [
    {
      "id": "...",
      "versionNumber": 1,
      "status": "FINAL",
      "source": "REPORTER",
      "content": "...",
      "createdAt": "...",
      "finalizedAt": "..."
    }
  ]
}
```

Yetkisiz kullanıcı version history görmemelidir.

---

# 82. AUDIT LOG

Study bazlı audit:

```http
GET /api/v1/studies/{studyId}/audit
```

Actor:

> MANAGER / OPERATION ve tanımlanan yetkili roller

Response:

```json
{
  "data": [
    {
      "id": "...",
      "eventType": "DOCTOR_READING_STARTED",
      "actor": {
        "id": "...",
        "displayName": "Test Doctor",
        "role": "DOCTOR"
      },
      "createdAt": "...",
      "metadata": {}
    }
  ]
}
```

---

# 83. NOTIFICATIONS — LIST

```http
GET /api/v1/notifications
```

Query:

```text
unreadOnly=true
page
pageSize
```

Response:

```json
{
  "data": [
    {
      "id": "...",
      "type": "APPROVAL_WAITING",
      "title": "Onay Bekleyen Rapor",
      "message": "...",
      "studyId": "...",
      "priority": "HIGH",
      "readAt": null,
      "createdAt": "..."
    }
  ]
}
```

---

# 84. MARK NOTIFICATION READ

```http
POST /api/v1/notifications/{notificationId}/read
```

Response:

```http
204 No Content
```

---

# 85. MANAGER — USERS

```http
GET /api/v1/manager/users
```

Actor:

> MANAGER

Filtre:

```text
role
hospitalId
status
search
```

---

# 86. MANAGER — CREATE USER

```http
POST /api/v1/manager/users
```

Request:

```json
{
  "email": "newdoctor@test.local",
  "firstName": "Test",
  "lastName": "Doctor",
  "role": "DOCTOR",
  "hospitalIds": ["..."],
  "temporaryPassword": "..."
}
```

Pilot kullanım içindir.

Production user provisioning daha sonra değişebilir.

---

# 87. MANAGER — UPDATE USER

```http
PATCH /api/v1/manager/users/{userId}
```

Örnek:

```json
{
  "status": "INACTIVE",
  "hospitalIds": ["..."]
}
```

---

# 88. MANAGER DASHBOARD

```http
GET /api/v1/manager/dashboard
```

Query:

```text
hospitalId
dateFrom
dateTo
```

Response:

```json
{
  "data": {
    "studies": {
      "total": 120,
      "acil": 20,
      "yogunBakim": 10,
      "yatan": 30,
      "normal": 60
    },
    "workflow": {
      "unread": 12,
      "waitingTranscription": 8,
      "waitingApproval": 4,
      "finalized": 90,
      "hbysFailed": 2,
      "overdue": 5
    }
  }
}
```

---

# 89. MANAGER USER PERFORMANCE

```http
GET /api/v1/manager/performance
```

Query:

```text
hospitalId
role
dateFrom
dateTo
```

Response:

```json
{
  "data": [
    {
      "user": {
        "id": "...",
        "displayName": "Test Doctor",
        "role": "DOCTOR"
      },
      "studyCount": 42,
      "averageDurationSeconds": 370
    }
  ]
}
```

---

# 90. MANAGER MONTHLY COMPENSATION

```http
GET /api/v1/manager/compensation
```

Query:

```text
year
month
userId
```

Pilot ilk aşamada finansal tutar olmadan sayısal breakdown dönebilir.

Response:

```json
{
  "data": [
    {
      "userId": "...",
      "displayName": "Test Doctor",
      "year": 2026,
      "month": 8,
      "totals": {
        "acil": 10,
        "yogunBakim": 5,
        "yatan": 12,
        "normal": 40,
        "total": 67
      },
      "calculatedAmount": null
    }
  ]
}
```

AI geliştirici finansal formül uydurmayacaktır.

---

# 91. OPERATION — HBYS FAILURES

Generic endpoint kullanılabilir:

```http
GET /api/v1/studies?pool=HBYS_FAILED
```

Ayrıca convenience endpoint zorunlu değildir.

---

# 92. OPERATION — SLA RISK

```http
GET /api/v1/studies?slaState=WARNING
```

ve:

```http
GET /api/v1/studies?slaState=OVERDUE
```

kullanılır.

---

# 93. DEV TOOLS SECURITY

Tüm DevTools endpointleri:

```text
DEV_TOOLS_ENABLED=true
```

olmadan kayıt edilmemeli veya erişilememelidir.

Production:

```text
DEV_TOOLS_ENABLED=false
```

---

# 94. DEV TOOLS — CREATE TEST PATIENT/STUDY

```http
POST /api/v1/dev-tools/test-study
```

Request:

```json
{
  "hospitalId": "...",
  "patientName": "Test Patient 001",
  "accessionNumber": "TEST-ACC-001",
  "studyDescription": "BT Toraks",
  "modality": "CT",
  "category": "ACIL"
}
```

Bu endpoint mümkün olduğunca gerçek HL7 workflow'undan önce direkt Study yaratmak yerine test helper olarak kullanılmalıdır.

Ana entegrasyon testi için HL7 endpointleri tercih edilir.

---

# 95. DEV TOOLS — FIRST HL7

```http
POST /api/v1/dev-tools/hl7/first
```

Request:

```json
{
  "hospitalId": "...",
  "externalPatientId": "TEST-001",
  "patientName": "Test Patient 001",
  "accessionNumber": "TEST-ACC-001",
  "studyDescription": "BT Toraks",
  "modality": "CT",
  "category": "ACIL"
}
```

Backend gerçek:

> MockHl7Adapter → normalization → core workflow

akışını kullanır.

---

# 96. DEV TOOLS — SECOND HL7

```http
POST /api/v1/dev-tools/hl7/second
```

Request:

```json
{
  "hospitalId": "...",
  "externalPatientId": "TEST-001",
  "accessionNumber": "TEST-ACC-001"
}
```

Expected:

```text
WAITING_ACCEPTANCE → IMAGES_PENDING
```

---

# 97. DEV TOOLS — IMAGES AVAILABLE

```http
POST /api/v1/dev-tools/studies/{studyId}/images-available
```

Request:

```json
{
  "studyInstanceUid": "TEST-STUDY-UID"
}
```

Expected:

```text
IMAGES_PENDING → UNREAD
```

---

# 98. DEV TOOLS — MOCK HBYS MODE

```http
PUT /api/v1/dev-tools/mock-hbys
```

Request:

```json
{
  "mode": "FAIL"
}
```

Modes:

```text
SUCCESS
FAIL
TIMEOUT
```

Response:

```json
{
  "data": {
    "mode": "FAIL"
  }
}
```

---

# 99. DEV TOOLS — SLA MODE

```http
PUT /api/v1/dev-tools/sla
```

Request:

```json
{
  "accelerated": true,
  "durationMinutes": 5,
  "warningBeforeMinutes": 1
}
```

Bu sadece pilot/test environment içindir.

Production SLA kurallarını değiştiremez.

---

# 100. DEV TOOLS — EXTERNAL LOCK

```http
POST /api/v1/dev-tools/studies/{studyId}/external-lock
```

Request:

```json
{
  "externalUserReference": "TEST-HOSPITAL-DR"
}
```

Expected:

```text
UNREAD → HOSPITAL_DOCTOR
```

---

# 101. DEV TOOLS — EXTERNAL UNLOCK

```http
POST /api/v1/dev-tools/studies/{studyId}/external-unlock
```

Expected:

```text
HOSPITAL_DOCTOR → UNREAD
```

---

# 102. DEV TOOLS — FORCE STATE

Debug amaçlı gerekiyorsa:

```http
POST /api/v1/dev-tools/studies/{studyId}/force-state
```

Request:

```json
{
  "status": "UNREAD",
  "reason": "Testing recovery scenario."
}
```

Bu endpoint:

- sadece DevTools enabled,
- manager/test role,
- audit zorunlu

olmalıdır.

Normal test akışında tercih edilmemelidir.

---

# 103. SEARCH

Study list `search` alanı pilotta en az:

- accessionNumber
- patient display name
- externalPatientId
- studyDescription

üzerinde arama yapabilir.

Örnek:

```http
GET /api/v1/studies?search=TEST-ACC-001
```

---

# 104. LOCK OWNER VISIBILITY

Lock response içerisinde frontend'in ihtiyaç duyduğu minimum:

```json
{
  "locked": true,
  "ownerUserId": "...",
  "ownerDisplayName": "Test Doctor",
  "ownerRole": "DOCTOR",
  "lockedAt": "..."
}
```

bulunmalıdır.

Frontend bu bilgiyi başka endpointlerden birleştirmek zorunda bırakılmamalıdır.

---

# 105. SENSITIVE DATA

API response hiçbir zaman aşağıdakileri içermemelidir:

```text
passwordHash
refreshTokenHash
storage secret keys
database credentials
integration secret credentials
raw internal stack trace
```

---

# 106. AUTHORIZATION ERROR

Yetkisiz role:

```http
403 Forbidden
```

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not authorized to perform this action.",
    "details": {}
  }
}
```

---

# 107. HOSPITAL ACCESS ERROR

```json
{
  "error": {
    "code": "HOSPITAL_ACCESS_DENIED",
    "message": "User is not authorized for this hospital.",
    "details": {}
  }
}
```

---

# 108. INVALID STATE TRANSITION

```http
409 Conflict
```

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Study cannot perform this action in its current state.",
    "details": {
      "currentStatus": "UNREAD",
      "requiredStatus": "WAITING_APPROVAL"
    }
  }
}
```

---

# 109. LOCK NOT OWNED

```http
423 Locked
```

```json
{
  "error": {
    "code": "LOCK_NOT_OWNED",
    "message": "Current user does not own the study lock.",
    "details": {}
  }
}
```

---

# 110. EXTERNAL LOCK CONFLICT

```http
409 Conflict
```

```json
{
  "error": {
    "code": "EXTERNAL_LOCK_CONFLICT",
    "message": "Study is currently owned by the hospital physician workflow.",
    "details": {}
  }
}
```

---

# 111. IMAGES NOT AVAILABLE

```json
{
  "error": {
    "code": "IMAGES_NOT_AVAILABLE",
    "message": "Study images are not available for reading.",
    "details": {}
  }
}
```

---

# 112. VALIDATION ERROR

```http
422 Unprocessable Entity
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {
      "fields": {
        "reason": [
          "Reason is required."
        ]
      }
    }
  }
}
```

---

# 113. RATE LIMIT

```http
429 Too Many Requests
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests.",
    "details": {
      "retryAfterSeconds": 30
    }
  }
}
```

---

# 114. SERVER ERROR

Frontend'e stack trace verilmez.

```http
500 Internal Server Error
```

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected server error occurred.",
    "details": {}
  }
}
```

Backend internal log daha ayrıntılı olabilir.

---

# 115. REQUEST CORRELATION ID

Her request için:

```http
X-Request-Id
```

kullanılması önerilir.

Response:

```http
X-Request-Id: ...
```

aynı değeri dönebilir.

Integration debugging için yararlıdır.

---

# 116. IDEMPOTENCY HEADER

Kritik dış veya tekrar gönderilebilir işlemlerde:

```http
Idempotency-Key
```

desteklenebilir.

Özellikle:

- HL7 ingestion
- HBYS delivery
- external revision request

için yararlıdır.

---

# 117. API ACTION IDEMPOTENCY

Frontend network retry nedeniyle aynı:

```text
finalize
submit-report
complete-reading
```

requestini istemeden tekrar gönderebilir.

Backend mümkün olduğunca aynı başarılı action'ın duplicate tekrarını güvenli şekilde yönetmelidir.

Duplicate request veri çoğaltmamalıdır.

---

# 118. CONCURRENT REPORT SAVE

Report autosave sırasında stale update riskini azaltmak için request:

```json
{
  "content": "...",
  "baseUpdatedAt": "..."
}
```

veya version number taşıyabilir.

Pilot ilk implementasyonda lock mevcut olduğu için basitleştirilebilir.

Ancak aynı lock session içerisindeki race condition düşünülmelidir.

---

# 119. CLIENT GENERATED BUSINESS STATE YASAKTIR

Frontend aşağıdakileri backend'e keyfi göndermez:

```text
status
slaState
hbysStatus
assignedDoctorId
assignedReporterId
finalizedAt
```

Bu değerler action sonucunda backend tarafından belirlenir.

---

# 120. OPENAPI

Backend mümkünse NestJS Swagger/OpenAPI dokümantasyonu üretmelidir.

Development/pilot:

```text
/api/docs
```

üzerinden kullanılabilir.

Production'da erişim sınırlanabilir.

Ancak:

> Generated OpenAPI bu `API_CONTRACT.md` ile uyumlu olmalıdır.

---

# 121. SHARED API TYPES

`packages/shared` içerisinde aşağıdaki gibi type'lar bulunabilir:

```text
ApiSuccess<T>
ApiError
PaginatedResponse<T>

StudyListItem
StudyDetail
SlaInfo
LockInfo

ReportDto
ReportVersionDto
DictationDto
NotificationDto
```

Codex mümkün olduğunca bu ortak type'ları kullanmalıdır.

---

# 122. API CONTRACT TEST

Backend tarafında contract testleri yazılmalıdır.

Örneğin:

```text
POST /auth/login
→ expected schema

GET /studies
→ expected schema

POST /studies/:id/start-reading
→ expected schema

POST /studies/:id/finalize
→ expected schema
```

---

# 123. FRONTEND MOCK DATA KURALI

Codex bağımsız hard-coded frontend state oluşturup production kodunda bırakmamalıdır.

Geçici Story/UI testleri hariç:

> frontend gerçek API contract'ı kullanmalıdır.

Mock workflow backend `DevTools` üzerinden sağlanacaktır.

---

# 124. BACKEND ENDPOINT UYDURMA KURALI

Claude ihtiyaç nedeniyle yeni endpoint eklemek isterse:

1. Mevcut endpoint ile çözülebiliyor mu kontrol eder.
2. Gerekliyse `API_CONTRACT.md` güncellenir.
3. Shared type güncellenir.
4. Backend implement edilir.
5. Frontend etkisi kaydedilir.

Doküman güncellenmeden kalıcı yeni API oluşturulmamalıdır.

---

# 125. CODEX API DEĞİŞTİRME KURALI

Codex frontend'i kolaylaştırmak için kendi hayali endpoint'ini varsayamaz.

Örneğin contract:

```text
POST /studies/:id/start-reading
```

ise Codex:

```text
POST /doctor/start-study
```

uyduramaz.

---

# 126. PILOT API ACCEPTANCE — AUTH

Pilot kabul:

```text
✓ Doctor login
✓ Reporter login
✓ Operation login
✓ Manager login
✓ refresh
✓ logout
✓ /auth/me
✓ role protection
✓ hospital protection
```

---

# 127. PILOT API ACCEPTANCE — HL7

```text
✓ First Mock HL7
✓ Study created
✓ WAITING_ACCEPTANCE
✓ Second Mock HL7
✓ Accession matched
✓ IMAGES_PENDING
✓ Images available
✓ UNREAD
```

---

# 128. PILOT API ACCEPTANCE — DOCTOR

```text
✓ list studies
✓ study detail
✓ start reading
✓ lock created
✓ heartbeat
✓ second user rejected
✓ PACS viewer metadata
✓ dictation create
✓ dictation upload
✓ complete reading
✓ WAITING_TRANSCRIPTION
✓ lock released
```

---

# 129. PILOT API ACCEPTANCE — REPORTER

```text
✓ reporter pool
✓ start transcription
✓ reporter lock
✓ dictation playback
✓ report draft save
✓ submit report
✓ WAITING_APPROVAL
✓ lock released
```

---

# 130. PILOT API ACCEPTANCE — APPROVAL

```text
✓ doctor approval queue
✓ report detail
✓ start approval
✓ optional edit
✓ finalize
✓ HBYS_PENDING
```

---

# 131. PILOT API ACCEPTANCE — HBYS

Success:

```text
✓ Mock HBYS SUCCESS
✓ background job
✓ HBYS_SENT
```

Failure:

```text
✓ Mock HBYS FAIL
✓ HBYS_FAILED
✓ Operation/Manager sees error
✓ manual retry
✓ SUCCESS
✓ HBYS_SENT
```

Timeout:

```text
✓ Mock HBYS TIMEOUT
✓ retry behavior
✓ eventual failure or success
```

---

# 132. PILOT API ACCEPTANCE — SPECIAL STATES

```text
✓ IMAGE_MISSING
✓ image missing resolve
✓ UNREAD

✓ WONT_REPORT
✓ reactivate
✓ UNREAD

✓ HOSPITAL_DOCTOR
✓ release
✓ UNREAD
```

---

# 133. PILOT API ACCEPTANCE — AUDIT

En az aşağıdaki actionlar audit üretmelidir:

```text
HL7
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
reactivation
lock
revision
information
```

---

# 134. REALTIME VE API İLİŞKİSİ

Realtime event:

> API'nin alternatifi değildir.

Örnek:

```text
WebSocket event:
study.hbys.sent
```

geldiğinde frontend ilgili Study query'sini update/invalidate edebilir.

Ama reconnect sonrası doğru durum:

```http
GET /studies/{id}
```

üzerinden doğrulanabilir.

---

# 135. BACKWARD COMPATIBILITY

Pilot geliştirme sırasında API değişebilir.

Ancak Claude ve Codex aynı anda çalışacağı için değişiklik kontrolsüz yapılmamalıdır.

Contract değişikliği:

```text
API_CONTRACT.md
↓
shared types
↓
backend
↓
frontend
```

sırasında yapılmalıdır.

---

# 136. API CONTRACT ÖNCELİĞİ

API konusunda çelişki varsa öncelik:

1. `MASTER_SPEC.md` — iş kuralı
2. `WORKFLOW_STATE_MACHINE.md` — transition kuralı
3. `API_CONTRACT.md` — API davranışı
4. `DATA_MODEL.md` — persistence
5. kod

şeklindedir.

---

# 137. PILOT MINIMUM ENDPOINT LIST

Minimum pilotun tamamlanması için en az:

```text
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me

GET    /hospitals

GET    /studies
GET    /studies/:id

POST   /studies/:id/start-reading
POST   /studies/:id/lock/heartbeat

GET    /studies/:id/pacs/viewer

POST   /studies/:id/dictations
POST   /dictations/:id/upload
GET    /dictations/:id/playback

POST   /studies/:id/complete-reading

POST   /studies/:id/start-transcription
GET    /studies/:id/report
PUT    /studies/:id/report/draft
POST   /studies/:id/submit-report

POST   /studies/:id/start-approval
POST   /studies/:id/finalize

GET    /studies/:id/hbys-deliveries
POST   /hbys-deliveries/:id/retry

GET    /studies/:id/information
POST   /studies/:id/information

POST   /studies/:id/image-missing
POST   /studies/:id/image-missing/resolve

GET    /manager/dashboard

POST   /dev-tools/hl7/first
POST   /dev-tools/hl7/second
POST   /dev-tools/studies/:id/images-available
PUT    /dev-tools/mock-hbys
PUT    /dev-tools/sla
```

çalışıyor olmalıdır.

---

# 138. SON KURAL

Claude ve Codex API seviyesinde anlaşmazlık yaşadığında:

> implementasyonlardan birinin diğerine göre uyarlanması yerine önce bu contract kontrol edilir.

Contract yanlışsa:

> bu dosya güncellenir.

Contract doğruysa:

> sözleşmeye uymayan kod düzeltilir.

Bu dosya frontend ve backend arasındaki tek resmi REST API sözleşmesidir.