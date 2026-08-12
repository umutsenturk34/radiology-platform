# AUTH_ROLES_PERMISSIONS.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Rol ve Yetki Matrisi

> **Doküman Türü:** Authentication / Authorization / RBAC Spesifikasyonu  
> **Üst Referanslar:** `MASTER_SPEC.md`, `ARCHITECTURE.md`, `WORKFLOW_STATE_MACHINE.md`, `DATA_MODEL.md`, `API_CONTRACT.md`  
> **Yetki Modeli:** RBAC + Hospital Scope + Resource Scope + Workflow Permission  
> **Temel Roller:** DOCTOR, REPORTER, OPERATION, MANAGER

---

# 1. DOKÜMANIN AMACI

Bu doküman sistem kullanıcılarının hangi işlemleri yapabileceğini kesinleştirir.

Yetki kontrolü yalnızca frontend görünürlüğü ile yapılmaz.

Backend her kritik istekte en az aşağıdaki kontrolleri yapmalıdır:

1. Kullanıcı authenticated mı?
2. Kullanıcı active mı?
3. Rol işlemi yapmaya yetkili mi?
4. Kullanıcı ilgili hastaneye erişebiliyor mu?
5. Kullanıcı ilgili Study üzerinde resource-level yetkiye sahip mi?
6. Study mevcut workflow state açısından işleme uygun mu?
7. Gerekliyse kullanıcı aktif lock sahibi mi?

---

# 2. YETKİ KATMANLARI

Sistem yetkisi dört ayrı seviyede düşünülmelidir.

## 2.1 Authentication

Kullanıcının kim olduğu.

## 2.2 Role Permission

Kullanıcının rolünün ne yapabildiği.

## 2.3 Hospital Scope

Kullanıcının hangi hastanelere erişebildiği.

## 2.4 Resource / Workflow Permission

Kullanıcının belirli Study / Report üzerinde o anda işlem yapıp yapamayacağı.

Örnek:

DOCTOR rolü genel olarak final onay verebilir.

Ancak:

- başka hastanedeki Study,
- başka hekime ait approval queue,
- doğru state'te olmayan Study

üzerinde final onay veremez.

---

# 3. ANA ROLLER

```ts
enum UserRole {
  DOCTOR
  REPORTER
  OPERATION
  MANAGER
}
```

Pilot sürümün ana rolleri bunlardır.

İleride ayrı dış kullanıcı rolleri eklenebilir.

---

# 4. DOCTOR

DOCTOR radyoloji hekimidir.

Ana sorumlulukları:

- raporlanacak tetkiki açmak,
- görüntüleri değerlendirmek,
- sesli dikte oluşturmak,
- imaj eksikliği bildirmek,
- raportörün yazdığı raporu kontrol etmek,
- final onay vermek.

---

# 5. DOCTOR — HASTANE ERİŞİMİ

Doctor yalnızca `UserHospitalAccess` ile yetkili olduğu hastanelerin Study kayıtlarını görebilir.

Örnek:

```text
Doctor A

Hospital A ✓
Hospital B ✓
Hospital C ✕
```

Doctor A, Hospital C Study UUID'sini bilse bile erişememelidir.

Backend:

```text
HOSPITAL_ACCESS_DENIED
```

döndürmelidir.

---

# 6. DOCTOR — HAVUZ GÖRÜNÜRLÜĞÜ

Sağlık ekibinin beklentisine göre hekim başka hekimin özel çalışma havuzunu görmemelidir.

Doctor genel olarak:

- yetkili hastane UNREAD havuzunu,
- kendi üzerinde bulunan READING Study'leri,
- kendi onayına gelen WAITING_APPROVAL Study'leri

görebilir.

Başka hekime özel assignment verilmiş dosyalar, ilgili iş kuralı aktifse görünmemelidir.

---

# 7. DOCTOR — FIFO

İlk pilotta Doctor'ın uygun Study'leri manuel seçmesine izin verilebilir.

Ancak ileride FIFO aktif olduğunda Doctor:

- istediği Study'yi keyfi seçememeli,
- backend'in verdiği sıradaki uygun Study ile çalışmalıdır.

FIFO bir frontend kuralı değil backend selection rule'dur.

---

# 8. DOCTOR — START READING

Doctor şu action'ı yapabilir:

```text
POST /studies/:id/start-reading
```

Koşullar:

- ilgili hastaneye yetkili,
- Study uygun state'te,
- external lock yok,
- internal lock yok,
- assignment kuralı ihlal edilmiyor.

---

# 9. DOCTOR — READING LOCK

Doctor Study'yi okumaya başladığında:

- Study kendisine assignment edilir,
- internal Doctor lock oluşur.

Başka Doctor veya Reporter aktif çalışma ekranını açamaz.

Doctor yalnızca kendi lock'una heartbeat gönderebilir.

---

# 10. DOCTOR — PACS

Doctor yetkili ve uygun Study üzerinde:

```text
GET /studies/:id/pacs/viewer
GET /studies/:id/pacs/series
```

kullanabilir.

Doctor başka hastanenin PACS viewer bilgisini alamaz.

---

# 11. DOCTOR — DICTATION

Doctor kendi aktif READING Study'si üzerinde:

- dictation create,
- upload,
- complete reading

işlemleri yapabilir.

Başka Doctor'ın Study'sine dictation yükleyemez.

Reporter dictation oluşturamaz.

---

# 12. DOCTOR — IMAGE MISSING

Doctor aktif değerlendirme sırasında:

```text
POST /studies/:id/image-missing
```

işlemi yapabilir.

Normal durumda reason zorunludur.

Doctor `image-missing/resolve` yapamaz.

Resolution OPERATION / MANAGER / SYSTEM integration yetkisindedir.

---

# 13. DOCTOR — REPORTER RAPORUNU GÖRME

Doctor kendi onayına gelen Study'nin:

- mevcut report version'ını,
- diktesini,
- görüntülerini,
- klinik bilgilerini

görebilir.

Başka hekimin onay listesindeki raporu normal workflow açısından final etmek için açamaz.

---

# 14. DOCTOR — FINAL ONAY

Doctor:

```text
POST /studies/:id/finalize
```

işlemini yalnızca:

- Study kendisine bağlıysa,
- Study `WAITING_APPROVAL` state'indeyse,
- final rapor mevcutsa,
- gerekli approval lock koşulu sağlanmışsa

yapabilir.

---

# 15. DOCTOR — RETURN TO REPORTER

Doctor raporu final yerine raportöre geri gönderebilir.

```text
POST /studies/:id/return-to-reporter
```

Reason zorunludur.

Bu işlem audit ve notification üretmelidir.

---

# 16. DOCTOR — YAPAMAYACAĞI İŞLEMLER

Doctor normalde:

- user oluşturamaz,
- user yetkisi değiştiremez,
- hastane entegrasyonu değiştiremez,
- HBYS manual retry yapamaz,
- başka kullanıcının lock'unu force release yapamaz,
- audit log'u değiştiremez,
- SLA policy değiştiremez,
- manager hakediş ekranını göremez,
- başka hekimin özel performans istatistiklerini göremez.

---

# 17. REPORTER

REPORTER hekimin diktesini kullanarak raporu yazar.

Ana sorumlulukları:

- WAITING_TRANSCRIPTION havuzunu görmek,
- uygun Study'yi almak,
- sesi dinlemek,
- rapor yazmak,
- raporu hekimin onayına göndermek.

---

# 18. REPORTER — HASTANE ERİŞİMİ

Reporter yalnızca yetkili olduğu hastanelerin Study kayıtlarını görebilir.

Hospital scope tüm Study ve audio erişimlerine uygulanmalıdır.

---

# 19. REPORTER — HAVUZ

Reporter temel olarak:

```text
WAITING_TRANSCRIPTION
```

Study'leri görür.

Aktif üzerine aldığı:

```text
TRANSCRIBING
```

Study'leri görebilir.

Başka Reporter'ın aktif lock'lu dosyasında edit yapamaz.

---

# 20. REPORTER — START TRANSCRIPTION

Reporter:

```text
POST /studies/:id/start-transcription
```

işlemini yapabilir.

Koşullar:

- hospital authorization,
- Study `WAITING_TRANSCRIPTION`,
- başka internal lock yok,
- external conflict yok.

---

# 21. REPORTER — LOCK

Reporter Study üzerine aldığında:

> REPORTER lock

oluşur.

Başka Reporter aynı Study'yi açamaz.

Başka Doctor Study'yi aktif edit amacıyla açamaz.

---

# 22. REPORTER — AUDIO

Reporter ilgili Study'nin completed dictation sesini dinleyebilir.

```text
GET /dictations/:id/playback
```

Reporter ses dosyasını değiştiremez veya silemez.

---

# 23. REPORTER — REPORT DRAFT

Reporter aktif lock sahibi olduğu Study üzerinde:

```text
PUT /studies/:id/report/draft
```

ile draft kaydedebilir.

Başka Reporter'ın report draft'ını değiştiremez.

---

# 24. REPORTER — SUBMIT REPORT

Reporter:

```text
POST /studies/:id/submit-report
```

işlemi ile raporu hekimin onayına gönderir.

Sonuç:

```text
WAITING_APPROVAL
```

olur.

Reporter lock bırakılır.

---

# 25. REPORTER — FINAL YETKİSİ YOK

Reporter:

> final tıbbi onay veremez.

Dolayısıyla:

```text
POST /studies/:id/finalize
```

Reporter için:

```text
403 FORBIDDEN
```

olmalıdır.

---

# 26. REPORTER — HBYS YETKİSİ

Reporter:

- otomatik HBYS gönderimini tetikleyemez,
- manual HBYS retry yapamaz,
- HBYS entegrasyon config değiştiremez.

HBYS gönderim sonucu Study ekranında görünürse okuyabilir.

---

# 27. REPORTER — INFORMATION

Reporter Study üzerinde Information note:

- ekleyebilir,
- kendi oluşturduğu veya yetkili olduğu notu güncelleyebilir.

Ancak note delete edemez.

Tüm değişiklikler history oluşturur.

---

# 28. REPORTER — IMAGE MISSING

Reporter klinik görüntü değerlendirme sahibi olmadığı için normalde `IMAGE_MISSING` kararını vermez.

Bu işlem Doctor yetkisidir.

Reporter görüntü problemi fark ederse Information note ekleyebilir veya operation'a bildirim oluşturabilir.

---

# 29. REPORTER — YAPAMAYACAĞI İŞLEMLER

Reporter:

- final onay veremez,
- doctor assignment değiştiremez,
- kullanıcı yönetemez,
- HBYS retry yapamaz,
- force lock release yapamaz,
- SLA policy değiştiremez,
- audit log değiştiremez,
- manager finans/hakediş ekranını göremez.

---

# 30. OPERATION

OPERATION günlük raporlama operasyonunun kontrol rolüdür.

Sağlık ekibine göre bu rol bulunmalıdır.

Bu rol:

> raporlama firması tarafından günlük iş akışını takip eden kullanıcı

olarak değerlendirilir.

---

# 31. OPERATION — ANA SORUMLULUKLAR

Operation:

- hasta havuzlarını izler,
- SLA riski olan dosyaları görür,
- geciken dosyaları görür,
- HBYS başarısız gönderimleri görür,
- Information uyarılarını takip eder,
- imaj eksik dosyaları takip eder,
- hastane doktoru durumlarını izler,
- operasyonel atama sorunlarını takip eder,
- entegrasyon problemlerini takip eder.

---

# 32. OPERATION — HASTANE SCOPE

Operation hesabı:

- tek hastaneye,
- birden fazla hastaneye,
- tüm hastanelere

yetkilendirilebilir.

Operation global rol olsa bile yalnızca authorized hospitals verisini görmelidir.

MANAGER dışında hiçbir rol otomatik tüm hastaneleri görmemelidir.

---

# 33. OPERATION — STUDY VIEW

Operation yetkili hastanelerde Study listelerini geniş kapsamda görebilir.

Örneğin:

- UNREAD
- WAITING_TRANSCRIPTION
- WAITING_APPROVAL
- IMAGE_MISSING
- WONT_REPORT
- HOSPITAL_DOCTOR
- HBYS_FAILED
- SLA WARNING
- SLA OVERDUE

---

# 34. OPERATION — STUDY CONTENT

Operation'ın clinical content erişimi minimum ihtiyaç prensibine göre sınırlandırılmalıdır.

Pilot için operasyonel takip amacıyla:

- hasta/tetkik temel bilgileri,
- status,
- assignment,
- SLA,
- lock,
- information,
- integration error

görebilir.

Tam rapor ve görüntü erişimi gerekiyorsa ayrıca açık yetki verilebilir.

Varsayılan:

> Operation görüntüyü klinik okuma amacıyla kullanmaz.

---

# 35. OPERATION — HBYS RETRY

Operation:

```text
POST /hbys-deliveries/:id/retry
```

işlemini yapabilir.

Reason audit için istenebilir.

HBYS payload içeriğini keyfi değiştiremez.

---

# 36. OPERATION — IMAGE MISSING RESOLVE

Operation:

```text
POST /studies/:id/image-missing/resolve
```

işlemini, görüntünün teknik olarak tamamlandığı doğrulandıktan sonra yapabilir.

Bu işlem Study'yi:

```text
IMAGE_MISSING → UNREAD
```

durumuna döndürür.

---

# 37. OPERATION — WONT REPORT

Operation'a `WONT_REPORT` yetkisi verilebilir.

Pilot önerisi:

- mark wont report: OPERATION / MANAGER
- reactivate: OPERATION / MANAGER

Reason zorunlu olmalıdır.

---

# 38. OPERATION — HOSPITAL DOCTOR

Operation:

- HOSPITAL_DOCTOR durumunu görebilir,
- hastane doktoru release event'ini operasyonel olarak işleyebilir,
- gerektiğinde yetkili iş kuralı ile dosyayı merkezi havuza geri alabilir.

Bu işlem audit edilmelidir.

---

# 39. OPERATION — SPECIAL LISTS

Operation:

- Liste 1–6 üyeliği ekleyebilir,
- kaldırabilir,
- özellikli / hızlandırılacak Study'leri özel listeye taşıyabilir.

Patient category bu işlemle değişmez.

---

# 40. OPERATION — ASSIGNMENT

Sağlık ekibi belirli durumlarda atama değişikliği yapılabilmesini istemiştir.

Operation'a kontrollü:

- doctor reassignment,
- reporter reassignment

yetkisi verilebilir.

Ancak aktif lock varken assignment sessizce değiştirilmemelidir.

Önce conflict çözülmelidir.

---

# 41. OPERATION — LOCK FORCE RELEASE

Pilot önerisi:

Operation aktif lock'u force release edebilir, ancak:

- reason zorunlu,
- audit zorunlu,
- lock owner bilgisi loglanmalı.

Bu yetki istenirse sadece MANAGER ile sınırlandırılabilir.

İlk pilotta OPERATION + MANAGER olarak kullanılabilir.

---

# 42. OPERATION — AUDIT

Operation Study bazlı audit log'u görüntüleyebilir.

Audit'i değiştiremez veya silemez.

---

# 43. OPERATION — USER MANAGEMENT

Operation normalde:

- user oluşturamaz,
- user role değiştiremez,
- hospital access değiştiremez.

Bu işlemler MANAGER yetkisidir.

---

# 44. OPERATION — CONFIGURATION

Operation:

- SLA temel policy değiştiremez,
- integration secret değiştiremez,
- system configuration değiştiremez.

---

# 45. MANAGER

MANAGER raporlama firmasının ana yönetim kullanıcısıdır.

Sağlık ekibinin geri bildirimine göre:

> tüm sistem yetkileri

bu rolde bulunabilir.

Ancak audit ve geçmiş veriyi değiştirmek gibi veri bütünlüğünü bozan işlemler yine yapılamamalıdır.

---

# 46. MANAGER — HASTANE ERİŞİMİ

Manager başlangıçta tüm hastaneleri görebilir.

Ancak sistem isterse Manager için de hospital scope destekleyebilir.

Pilot varsayılan:

> Manager = all hospitals.

---

# 47. MANAGER — USER MANAGEMENT

Manager:

- user listeler,
- user oluşturur,
- user active/inactive yapar,
- role atar,
- hospital access tanımlar,
- geçici şifre oluşturabilir.

Manager plain password göremez.

---

# 48. MANAGER — HOSPITAL MANAGEMENT

Manager:

- hastane tanımlar,
- aktif/inaktif yapar,
- user-hospital yetkilerini yönetir.

Integration secret yönetimi ayrı teknik güvenlik katmanına bırakılabilir.

---

# 49. MANAGER — STUDY MANAGEMENT

Manager tüm operasyonel Study durumlarını görebilir.

Manager gerektiğinde:

- assignment değiştirebilir,
- lock force release yapabilir,
- special list yönetebilir,
- WONT_REPORT reactivate yapabilir,
- Hospital Doctor durumunu yönetebilir,
- revision süreçlerini görebilir,
- HBYS retry yapabilir.

---

# 50. MANAGER — REPORT ACCESS

Manager operasyonel ve audit ihtiyacı için raporları görüntüleyebilir.

Ancak:

> Manager klinik final onay rolü değildir.

Manager DOCTOR değilse yalnızca yönetici yetkisiyle tıbbi final vermemelidir.

Tıbbi final:

> DOCTOR action

olarak kalmalıdır.

Bu önemli bir separation-of-duty kuralıdır.

---

# 51. MANAGER — PERFORMANCE

Manager aşağıdaki kullanıcı metriklerini görebilir:

- Doctor okuma sayısı
- Doctor ortalama okuma süresi
- Reporter rapor sayısı
- Reporter ortalama yazım süresi
- kategori bazlı iş sayıları

---

# 52. MANAGER — COMPENSATION

Sadece Manager:

- aylık hakediş ekranını,
- kullanıcı bazlı hasta sayılarını,
- kategori breakdown'larını

görebilir.

Doctor, Reporter ve Operation bu ekranı görmemelidir.

---

# 53. MANAGER — REVISION MONITORING

Revize edilen raporlar için manager uyarı ve takip alanı bulunmalıdır.

Manager:

- revision request listesi,
- revision reason,
- original version,
- current version,
- status

bilgilerini görebilir.

---

# 54. MANAGER — AUDIT

Manager tüm authorized scope içindeki audit kayıtlarını görüntüleyebilir.

Audit:

- update edilemez,
- silinemez.

---

# 55. MANAGER — DEV TOOLS

Pilot ortamda Manager:

- Mock HL7
- Mock HBYS
- accelerated SLA
- external lock simulation

gibi DevTools işlemlerini kullanabilir.

Bu yetkiler production'da `DEV_TOOLS_ENABLED=false` olduğunda tamamen devre dışı kalmalıdır.

---

# 56. MANAGER — YAPAMAYACAĞI İŞLEMLER

Manager bile normal uygulama üzerinden:

- AuditLog silemez,
- Final ReportVersion overwrite edemez,
- Information history silemez,
- plain password görüntüleyemez,
- security secret response üzerinden alamaz.

“Tüm sistem yetkileri” veri bütünlüğünü bozma yetkisi değildir.

---

# 57. ROLE ACTION MATRIX

| Action | Doctor | Reporter | Operation | Manager |
|---|---:|---:|---:|---:|
| Login | ✓ | ✓ | ✓ | ✓ |
| Authorized hospitals view | ✓ | ✓ | ✓ | ✓ |
| Study list | ✓ | ✓ | ✓ | ✓ |
| Study detail | ✓ | ✓ | ✓ | ✓ |
| Start reading | ✓ | ✕ | ✕ | ✕ |
| PACS viewer for clinical reading | ✓ | Optional View | Optional View | Optional View |
| Create dictation | ✓ | ✕ | ✕ | ✕ |
| Complete reading | ✓ | ✕ | ✕ | ✕ |
| Mark image missing | ✓ | ✕ | Optional | ✓ |
| Resolve image missing | ✕ | ✕ | ✓ | ✓ |
| Start transcription | ✕ | ✓ | ✕ | ✕ |
| Listen dictation | ✓ | ✓ | Optional | ✓ |
| Edit report draft | ✕ | ✓ | ✕ | ✕ |
| Submit report | ✕ | ✓ | ✕ | ✕ |
| Start approval | ✓ | ✕ | ✕ | ✕ |
| Return to reporter | ✓ | ✕ | ✕ | ✕ |
| Finalize report | ✓ | ✕ | ✕ | ✕ |
| HBYS retry | ✕ | ✕ | ✓ | ✓ |
| Add information note | ✓ | ✓ | ✓ | ✓ |
| Delete information note | ✕ | ✕ | ✕ | ✕ |
| Special list management | ✕ | ✕ | ✓ | ✓ |
| Wont Report | Optional | ✕ | ✓ | ✓ |
| Reactivate Wont Report | ✕ | ✕ | ✓ | ✓ |
| Hospital Doctor management | ✕ | ✕ | ✓ | ✓ |
| Force lock release | ✕ | ✕ | ✓ | ✓ |
| Revision request | ✓ | Optional | ✓ | ✓ |
| Revision monitoring | Own | Related | ✓ | ✓ |
| Audit view | Limited | Limited | ✓ | ✓ |
| User management | ✕ | ✕ | ✕ | ✓ |
| Hospital access management | ✕ | ✕ | ✕ | ✓ |
| Performance dashboard | Own optional | Own optional | Operational | ✓ |
| Compensation | ✕ | ✕ | ✕ | ✓ |
| DevTools pilot | ✕ | ✕ | Optional | ✓ |

`Optional` değerler frontend/backend uygulaması sırasında minimum privilege prensibine göre açılmalıdır.

---

# 58. API ENDPOINT PERMISSION MATRIX

## Auth

```text
POST /auth/login
PUBLIC

POST /auth/refresh
SESSION

POST /auth/logout
AUTHENTICATED

GET /auth/me
AUTHENTICATED
```

---

# 59. STUDIES ENDPOINTS

```text
GET /studies
DOCTOR / REPORTER / OPERATION / MANAGER
+ hospital scope
+ role-specific filtering

GET /studies/:id
DOCTOR / REPORTER / OPERATION / MANAGER
+ hospital scope
+ resource permission
```

---

# 60. DOCTOR ACTION ENDPOINTS

```text
POST /studies/:id/start-reading
DOCTOR

POST /studies/:id/complete-reading
DOCTOR + LOCK OWNER

POST /studies/:id/image-missing
DOCTOR + resource permission

POST /studies/:id/start-approval
DOCTOR + assigned doctor

PUT /studies/:id/report/approval-draft
DOCTOR + approval permission

POST /studies/:id/return-to-reporter
DOCTOR + assigned doctor

POST /studies/:id/finalize
DOCTOR + assigned doctor
```

---

# 61. REPORTER ENDPOINTS

```text
POST /studies/:id/start-transcription
REPORTER

PUT /studies/:id/report/draft
REPORTER + LOCK OWNER

POST /studies/:id/submit-report
REPORTER + LOCK OWNER
```

---

# 62. DICTATION ENDPOINTS

```text
POST /studies/:id/dictations
DOCTOR + READING LOCK

POST /dictations/:id/upload
DOCTOR + owner

GET /studies/:id/dictations
DOCTOR / REPORTER / authorized operational view

GET /dictations/:id/playback
DOCTOR / REPORTER / authorized operational view
```

---

# 63. LOCK ENDPOINTS

```text
POST /studies/:id/lock/heartbeat
LOCK OWNER

POST /studies/:id/lock/release
LOCK OWNER

POST /studies/:id/lock/force-release
OPERATION / MANAGER
```

Force release reason zorunludur.

---

# 64. HBYS ENDPOINTS

```text
GET /studies/:id/hbys-deliveries
OPERATION / MANAGER
+ related Doctor read-only olabilir

GET /hbys-deliveries/:id/attempts
OPERATION / MANAGER

POST /hbys-deliveries/:id/retry
OPERATION / MANAGER
```

---

# 65. INFORMATION ENDPOINTS

```text
GET /studies/:id/information
DOCTOR / REPORTER / OPERATION / MANAGER

POST /studies/:id/information
DOCTOR / REPORTER / OPERATION / MANAGER

PUT /information/:noteId
Author or authorized OPERATION / MANAGER

GET /information/:noteId/versions
Authorized related users
```

DELETE endpoint yoktur.

---

# 66. MANAGER ENDPOINTS

```text
GET /manager/users
MANAGER

POST /manager/users
MANAGER

PATCH /manager/users/:id
MANAGER

GET /manager/dashboard
MANAGER

GET /manager/performance
MANAGER

GET /manager/compensation
MANAGER
```

---

# 67. SPECIAL LIST ENDPOINTS

```text
GET /special-lists
Authorized users read

POST /studies/:id/special-lists/:listId
OPERATION / MANAGER

DELETE /studies/:id/special-lists/:listId
OPERATION / MANAGER
```

---

# 68. IMAGE MISSING RESOLUTION

```text
POST /studies/:id/image-missing/resolve
OPERATION / MANAGER / SYSTEM integration
```

Doctor report eder.

Operation/Manager resolve eder.

---

# 69. WONT REPORT ENDPOINTS

Pilot:

```text
POST /studies/:id/wont-report
OPERATION / MANAGER

POST /studies/:id/reactivate
OPERATION / MANAGER
```

Doctor için bu action daha sonra gerekirse ayrıca açılabilir.

---

# 70. HOSPITAL DOCTOR ENDPOINTS

```text
POST /studies/:id/hospital-doctor/acquire
SYSTEM / OPERATION / MANAGER

POST /studies/:id/hospital-doctor/release
SYSTEM / OPERATION / MANAGER
```

Gerçek entegrasyonda çoğu işlem SYSTEM actor olacaktır.

---

# 71. REVISION PERMISSIONS

Revision request kaynakları:

- DOCTOR
- OPERATION
- MANAGER
- external physician portal
- SYSTEM/HBYS

Reporter doğrudan revision request oluşturmak zorunda değildir.

Reporter ilgili revision workflow'a assignment sonrası dahil olabilir.

---

# 72. ADDENDUM PERMISSIONS

Addendum daha kontrollü bir süreçtir.

Pilot temel kural:

- MANAGER / OPERATION addendum gerektiğini görür.
- Doctor klinik içerik/onay sürecine dahil olur.
- HBYS gönderim adımı normal final gönderimden farklı olabilir.

Kesin süreç ayrı geliştirme fazında netleştirilebilir.

---

# 73. STUDY LIST ROLE FILTERING

Aynı `/studies` endpoint'i role göre farklı scope uygular.

Örneğin Doctor:

```text
hospital in authorized hospitals
AND visible by doctor workflow
```

Reporter:

```text
hospital in authorized hospitals
AND visible by reporter workflow
```

Operation:

```text
hospital in authorized hospitals
AND broad operational visibility
```

Manager:

```text
all authorized scope
```

Frontend role filtrelerini güvenlik olarak kullanmamalıdır.

---

# 74. DOCTOR APPROVAL SCOPE

Doctor'ın approval listesi:

```text
status = WAITING_APPROVAL
AND assignedDoctorId = currentUser.id
```

olmalıdır.

Başka Doctor'ın approval Study'si default listede görünmemelidir.

---

# 75. REPORTER ACTIVE SCOPE

Reporter aktif çalışma listesi:

```text
status = TRANSCRIBING
AND assignedReporterId = currentUser.id
```

olmalıdır.

---

# 76. RESOURCE OWNERSHIP

Bir kullanıcı yalnız role bakılarak değil, resource ownership ile de doğrulanır.

Örnek:

DOCTOR rolü doğru olsa bile:

```text
study.assignedDoctorId != currentUser.id
```

ise final onay reddedilebilir.

---

# 77. LOCK OWNERSHIP

Aşağıdaki actionlar lock ownership gerektirir:

- complete reading
- dictation upload
- save reporter draft
- submit report
- approval edit
- gerekli durumlarda finalize

Backend lock owner doğrulamasını yapmalıdır.

Frontend'in “bu benim dosyam” demesi yeterli değildir.

---

# 78. MANAGER FORCE ACTIONS

Manager force action kullandığında:

- reason zorunlu,
- AuditLog zorunlu,
- eski assignment/lock bilgisi metadata'ya yazılmalıdır.

Force actionlar normal happy path değildir.

---

# 79. OPERATION FORCE ACTIONS

Operation'a force permission verilen işlemler sınırlı olmalıdır.

Pilot öneri:

- force lock release,
- study reassignment,
- special list,
- HBYS retry,
- image missing resolve,
- wont report/reactivate.

Clinical finalization verilmemelidir.

---

# 80. ROLE IMPERSONATION

Pilot ilk sürümde:

> user impersonation yapılmamalıdır.

Manager “Doctor olarak giriş yap” tarzı özellik kullanmamalıdır.

Test için ayrı seed hesapları kullanılmalıdır.

---

# 81. DEV TOOLS PERMISSION

DevTools erişimi iki şart gerektirir:

```text
DEV_TOOLS_ENABLED = true
```

ve:

```text
role = MANAGER
```

Pilot için Operation'a bazı test fonksiyonları açılabilir.

Production'da route tamamen disabled olmalıdır.

---

# 82. PASSWORD SECURITY

Manager yeni kullanıcı oluştururken temporary password verebilir.

Ancak:

- password hashlenir,
- response'da tekrar dönülmez,
- log'a yazılmaz.

İleride first-login password change eklenebilir.

---

# 83. ACCOUNT DISABLE

User `INACTIVE` veya `SUSPENDED` olduğunda:

- yeni login engellenir,
- mevcut refresh sessions revoke edilebilir,
- aktif session'ın bir sonraki auth check'inde erişimi kesilebilir.

Aktif lock varsa operasyonel recovery yapılmalıdır.

---

# 84. SESSION SECURITY

Refresh session:

- user,
- IP,
- user agent,
- expiry

metadata'sı ile tutulabilir.

Logout session revoke etmelidir.

---

# 85. MINIMUM PRIVILEGE

Yeni bir yetki eklenirken:

> default deny

uygulanmalıdır.

Yani açıkça izin verilmemiş action otomatik izinli sayılmaz.

---

# 86. FRONTEND ROLE UI

Frontend rol bazında navigasyonu özelleştirebilir.

Örnek:

## Doctor

- Okuma Havuzu
- Onay Bekleyenler
- Notifications

## Reporter

- Yazılmayanlar
- Yazdıklarım
- Notifications

## Operation

- Operasyon Havuzu
- SLA
- HBYS Hataları
- İmaj Eksik
- Information

## Manager

- Dashboard
- Studies
- Users
- Hospitals
- Performance
- Compensation
- Audit
- DevTools

Ancak gizlenen menü security değildir.

---

# 87. FRONTEND FORBIDDEN RESPONSE

Frontend `403` aldığında:

- kullanıcıya anlaşılır uyarı göstermeli,
- action'ı success gibi göstermemeli,
- protected data'yı local state'te uydurmamalıdır.

---

# 88. AUDIT ACCESS

Doctor ve Reporter için audit visibility minimum tutulabilir.

Örnek:

kendi Study'sinin basit işlem geçmişi.

Operation ve Manager:

> detaylı operational audit

görebilir.

---

# 89. CLINICAL DATA ACCESS

Doctor:

> tam gerekli klinik bilgi.

Reporter:

> rapor yazımı için gerekli klinik bilgi.

Operation:

> operasyon için gereken minimum clinical metadata.

Manager:

> yetki ve operasyon ihtiyacına göre erişim.

Gerçek production KVKK modeli ayrıca sıkılaştırılabilir.

---

# 90. PATIENT IDENTITY

Pilot test verisinde tüm roller test hasta adını görebilir.

Gerçek anonymization aktif edilirse rol bazında displayName backend tarafından maskelenmelidir.

Frontend kendi başına isim gizleme mantığına güvenmemelidir.

---

# 91. REPORT VERSION HISTORY

Doctor:

- ilgili Study rapor geçmişini görebilir.

Reporter:

- ilgili raporun çalışma için gerekli versionlarını görebilir.

Operation:

- revision tracking için görebilir.

Manager:

- tüm authorized version history görebilir.

Final version değiştirilemez.

---

# 92. NOTIFICATION SCOPE

Notification doğrudan kullanıcı veya role/hospital scope ile hedeflenmelidir.

Örnek:

Approval waiting:

> assigned Doctor.

HBYS failure:

> authorized Operation + Manager.

Revision requested:

> assigned Doctor + related Reporter + Operation/Manager.

---

# 93. EXTERNAL PHYSICIAN PORTAL

Acil hekimi revizyon portalı internal Manager/Doctor account yetkisini kullanmamalıdır.

İleride:

- short-lived token,
- specific Study scope,
- revision-request-only permission

ile ayrı güvenlik modeli kurulmalıdır.

Bu portal kullanıcıya ana sistemde geniş erişim vermemelidir.

---

# 94. BACKEND GUARD STRATEJİSİ

NestJS tarafında aşağıdaki guard/decorator yapısı kullanılabilir:

```text
JwtAuthGuard
RoleGuard
HospitalAccessGuard
StudyAccessGuard
WorkflowPermissionGuard
LockOwnershipGuard
```

Her endpoint ihtiyaç kadar guard kullanmalıdır.

---

# 95. ROLE DECORATOR

Örnek:

```ts
@Roles(UserRole.DOCTOR)
```

tek başına yeterli değildir.

Örneğin finalize endpoint ayrıca:

- HospitalAccess
- StudyAssignment
- StudyStatus
- Lock

kontrolleri ister.

---

# 96. CENTRAL PERMISSION SERVICE

Kompleks resource permission için merkezi servis önerilir.

Örnek:

```ts
permissionService.canStartReading(user, study)
permissionService.canStartTranscription(user, study)
permissionService.canFinalizeReport(user, study)
permissionService.canRetryHbys(user, delivery)
```

Bu sayede permission logic controller'lara dağılmaz.

---

# 97. PERMISSION ERROR KODLARI

Temel errorlar:

```text
UNAUTHORIZED
FORBIDDEN
HOSPITAL_ACCESS_DENIED
RESOURCE_ACCESS_DENIED
STUDY_NOT_ASSIGNED_TO_USER
NOT_AUTHORIZED_FOR_TRANSITION
LOCK_NOT_OWNED
DEV_TOOLS_DISABLED
```

---

# 98. SECURITY LOGGING

Aşağıdaki olaylar audit/security log oluşturmalıdır:

- failed login attempts,
- user disabled,
- role changed,
- hospital access changed,
- force lock release,
- assignment override,
- HBYS manual retry,
- user creation,
- manager config action.

---

# 99. ROLE CHANGE

Bir kullanıcının role'ü değiştirildiğinde:

- active sessions revoke edilmesi değerlendirilebilir,
- AuditLog oluşturulur.

Örnek:

```text
REPORTER → DOCTOR
```

sadece Manager yapabilir.

---

# 100. HOSPITAL ACCESS CHANGE

Hospital access ekleme/çıkarma:

> MANAGER

tarafından yapılır.

Audit:

```text
USER_HOSPITAL_ACCESS_GRANTED
USER_HOSPITAL_ACCESS_REVOKED
```

oluşturulmalıdır.

---

# 101. ACTIVE WORK PROTECTION

Bir kullanıcının erişimi kaldırılırken aktif Study lock'u varsa sistem:

- aktif işlemi fark etmeli,
- manager/operation'a uyarı verebilmeli,
- stale lock bırakmamalıdır.

Pilot için session revoke + lock TTL recovery yeterli olabilir.

---

# 102. MANAGER CLINICAL ACTION RESTRICTION

Manager “tüm sistem yetkileri” kavramına rağmen clinical workflow actor değilse:

```text
start-reading
dictation
submit-report
finalize
```

actionlarını doğrudan gerçekleştirmemelidir.

Test için ayrı Doctor/Reporter seed hesapları kullanılacaktır.

Bu separation-of-duty veri bütünlüğünü korur.

---

# 103. PILOT TEST ACCOUNTS

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

Tümü Test Hospital'a erişebilir.

---

# 104. PILOT ROLE ACCEPTANCE — DOCTOR

Test:

1. Doctor login olur.
2. UNREAD Study görür.
3. Study açar.
4. Lock oluşur.
5. Dictation oluşturur.
6. Complete reading yapar.
7. Başka Doctor'ın onay dosyasını finalize edemez.
8. Kendi approval Study'sini finalize eder.

---

# 105. PILOT ROLE ACCEPTANCE — REPORTER

Test:

1. Reporter login olur.
2. WAITING_TRANSCRIPTION Study görür.
3. Start transcription yapar.
4. Audio dinler.
5. Draft yazar.
6. Submit report yapar.
7. Finalize endpointine erişemez.

---

# 106. PILOT ROLE ACCEPTANCE — OPERATION

Test:

1. Operation tüm yetkili operational havuzları görür.
2. HBYS_FAILED Study görür.
3. HBYS retry yapabilir.
4. IMAGE_MISSING resolve edebilir.
5. Force lock release yapabilir.
6. User oluşturamaz.
7. Final report onaylayamaz.

---

# 107. PILOT ROLE ACCEPTANCE — MANAGER

Test:

1. Manager dashboard görür.
2. Users ekranı görür.
3. User oluşturabilir.
4. Hospital access değiştirebilir.
5. HBYS failure görebilir.
6. Force lock release yapabilir.
7. Performance görür.
8. Compensation görür.
9. Audit görür.
10. DevTools kullanabilir.

---

# 108. CROSS-HOSPITAL SECURITY TEST

En az iki test hastanesi oluşturulmalıdır.

Doctor A:

```text
Hospital A authorized
Hospital B unauthorized
```

Test:

```text
GET Hospital B Study by UUID
```

sonuç:

```text
403 HOSPITAL_ACCESS_DENIED
```

olmalıdır.

---

# 109. CROSS-ROLE SECURITY TEST

Reporter:

```text
POST /studies/:id/finalize
```

→ 403.

Doctor:

```text
POST /hbys-deliveries/:id/retry
```

→ 403.

Operation:

```text
POST /studies/:id/finalize
```

→ 403.

---

# 110. LOCK SECURITY TEST

Doctor A Study'yi kilitler.

Doctor B:

```text
start-reading
```

→ 423.

Reporter:

```text
start-transcription
```

→ uygun state olmadığı için reject.

Manager sadece force-release endpointi ile lock'u kaldırabilir.

---

# 111. PERMISSION SOURCE OF TRUTH

Permission konusunda öncelik:

1. `MASTER_SPEC.md`
2. `WORKFLOW_STATE_MACHINE.md`
3. `AUTH_ROLES_PERMISSIONS.md`
4. `API_CONTRACT.md`
5. backend implementation
6. frontend visibility

Frontend hiçbir zaman permission source of truth değildir.

---

# 112. SON KURAL

Yeni bir rol veya kritik yetki eklenecekse:

1. İş gereksinimi doğrulanır.
2. Gerekirse `MASTER_SPEC.md` güncellenir.
3. Bu dosya güncellenir.
4. API etkisi kontrol edilir.
5. Backend guard/permission logic güncellenir.
6. Frontend navigation/action visibility güncellenir.
7. Permission testleri yazılır.

Yetki değişiklikleri yalnızca arayüzde buton gösterip gizlemek yoluyla uygulanamaz.