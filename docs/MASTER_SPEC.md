# MASTER_SPEC.md
## Radyoloji Görüntüleme ve Raporlama Platformu — Ana Ürün Spesifikasyonu

> **Doküman Durumu:** Ana referans / Source of Truth  
> **Proje:** radiology-platform  
> **Pilot Hedef:** Sağlık ekibinin 2–3 kullanıcı ile sistemi uçtan uca test edebilmesi  
> **Frontend:** Next.js + TypeScript  
> **Backend:** Node.js + TypeScript + NestJS  
> **Pilot Frontend Hosting:** Vercel  
> **Pilot Backend Hosting:** Railway  
> **Veritabanı:** PostgreSQL  
> **Cache / Locking / Queue:** Redis  
> **Background Jobs:** BullMQ  
> **Realtime:** WebSocket  
> **Pilot Entegrasyonları:** Mock HL7 + Test PACS + Mock HBYS  
> **Gerçek Entegrasyonlar:** Daha sonraki hastane pilotunda adapter mantığı ile bağlanacaktır.

---

# 1. DOKÜMANIN AMACI

Bu doküman projenin en üst seviye iş ve ürün spesifikasyonudur.

Backend, frontend, veri modeli, API, entegrasyon, yetkilendirme, test ve deployment dokümanlarının tamamı bu dosya ile uyumlu olmak zorundadır.

Bu dosya ile çelişen teknik uygulama veya karar geçerli kabul edilmez.

Bir iş kuralının değiştirilmesi gerekiyorsa önce bu dosya güncellenmelidir.

Bu proje için temel prensip:

> Önce iş kuralı kesinleştirilir, ardından kod yazılır.

---

# 2. PROJENİN TEMEL AMACI

Platformun amacı radyolojik tetkiklerin hastaneden raporlama sistemine alınması, görüntülerin radyoloji hekimi tarafından değerlendirilmesi, hekimin sesli dikte oluşturması, raportörün bu dikteyi kullanarak raporu yazması, hekimin raporu final olarak onaylaması ve raporun hastanenin HBYS sistemine gönderilmesidir.

Sistem aynı zamanda aşağıdaki süreçleri takip etmelidir:

- Tetkikin sisteme geliş zamanı
- Tetkikin mevcut iş durumu
- Tetkikin hangi kullanıcı üzerinde olduğu
- Hekim okuma durumu
- Raportör yazım durumu
- Final onay durumu
- HBYS gönderim durumu
- Görüntü eksikliği
- Yazılmayacak dosyalar
- Hastane doktoru tarafından alınan dosyalar
- Revizyon işlemleri
- Ek rapor işlemleri
- SLA / kalan süre / gecikme
- Kullanıcı işlem geçmişi
- Manager ve operasyon kontrolleri

---

# 3. PİLOT SÜRÜMÜN AMACI

İlk sürüm doğrudan tüm hastanelere açılacak production sistemi değildir.

İlk hedef:

> Sağlık ekibinin internet üzerinden sisteme girerek tüm ana iş akışını gerçek kullanıcı rolleri ile test edebildiği çalışan bir pilot oluşturmaktır.

Pilot sistemde:

- Frontend Vercel üzerinde çalışacaktır.
- Backend Railway üzerinde çalışacaktır.
- PostgreSQL kullanılacaktır.
- Redis kullanılacaktır.
- Gerçek hastane HL7 bağlantısı yerine Mock HL7 kullanılabilecektir.
- Gerçek HBYS yerine Mock HBYS kullanılabilecektir.
- PACS testi için test PACS veya Orthanc gibi bir test sistemi kullanılabilecektir.
- Gerçek hasta verisi kullanılmayacaktır.
- Test hastaları kullanılacaktır.

Pilot tamamlandıktan sonra mock entegrasyonların yerine gerçek hastane adapterları bağlanacaktır.

---

# 4. ANA SİSTEM NESNESİ

Sistemde ana operasyonel nesne:

> Hasta / Tetkik Dosyası

olacaktır.

Bir hasta birden fazla tetkike sahip olabilir.

Her tetkik ayrı bir raporlama işi olarak takip edilmelidir.

Örnek:

Hasta:

- Hasta A

Tetkikler:

- BT Toraks
- BT Abdomen
- Kraniyal BT

Bu üç tetkik ayrı Study / Tetkik kayıtları olarak değerlendirilir.

Her tetkiğin kendi:

- Accession Number
- Durumu
- SLA süresi
- Hekimi
- Raportörü
- Diktesi
- Raporu
- HBYS gönderimi
- Audit geçmişi

bulunabilir.

---

# 5. HL7 AKIŞI

## 5.1 İlk HL7

Hastane hekimi hasta için radyolojik tetkik istemi oluşturur.

MHRS / hastane sistemi üzerinden randevu veya istem oluşturulması sonrasında ilk HL7 mesajı raporlama sistemine gelir.

Bu mesaj hasta/tetkik için ilk kaydın oluşturulmasını sağlar.

Bu aşamada görüntüler henüz gelmemiş olabilir.

---

## 5.2 İkinci HL7

Hasta tetkik için hastaneye geldiğinde ve tetkik kabul işlemi yapıldığında ikinci HL7 mesajı gelir.

İlk ve ikinci kayıt otomatik olarak eşleştirilmelidir.

Ana eşleştirme anahtarı:

> Accession Number

olacaktır.

Ek güvenlik amacıyla ikinci doğrulama olarak aşağıdaki alanlardan biri veya birkaçı kullanılabilir:

- Patient ID
- Order ID
- Protocol ID
- Hospital ID

Ancak temel kimlik Accession Number'dır.

---

# 6. GÖRÜNTÜ / PACS AKIŞI

Tetkik gerçekleştirildikten sonra görüntüler hastane tarafından PACS sistemine gönderilir.

Hasta/tetkik kaydı görüntüler ile ilişkilendirilmelidir.

Sistem aşağıdaki referansları destekleyebilecek şekilde tasarlanmalıdır:

- Study UID
- Series UID
- Accession Number
- PACS study reference
- Series name

Örnek seri isimleri:

- Parankim
- Mediasten
- Kemik

Görüntüler doğrudan PostgreSQL içerisinde tutulmamalıdır.

PACS sistemi görüntü kaynağı olarak kullanılmalıdır.

Pilot ortamda test PACS kullanılabilir.

---

# 7. HEKİM İŞ AKIŞI

Hekim sisteme giriş yaptıktan sonra yalnızca yetkili olduğu hastane ve çalışma alanlarını görebilmelidir.

Hekim başka bir hekimin özel çalışma havuzunu görememelidir.

Hekimin temel akışı:

1. Tetkik havuzunu açar.
2. Raporlanacak tetkiki açar.
3. Sistem dosyayı hekim adına kilitler.
4. Görüntüler görüntülenir.
5. Klinik bilgiler görüntülenir.
6. Hekim sesli dikte başlatır.
7. Görüntüleri incelerken konuşur.
8. Dikte tamamlanır.
9. Tetkik Okundu durumuna geçer.
10. Tetkik raportör havuzuna aktarılır.

---

# 8. FIFO / DOSYA SEÇİMİ

İlk pilot sürümde hekimlerin kendi çalışma havuzlarından hasta/tetkik seçmesine izin verilebilir.

Ancak sistem mimarisi ileride aşağıdaki çalışma modelini desteklemelidir:

> First In First Out / FIFO

Yani vardiyadaki hekim normal koşullarda en eski uygun tetkikten başlayarak ilerlemelidir.

Sistem gelecekte isteğe bağlı olarak:

- manuel seçim
- FIFO
- manager ataması
- özel liste ataması

modlarını destekleyebilecek şekilde tasarlanmalıdır.

---

# 9. SESLİ DİKTE

Hekim görüntüyü incelerken sesli dikte oluşturabilmelidir.

Ses kaydı tarayıcı üzerinden yapılacaktır.

Temel gereksinimler:

- Mikrofon izni
- Kaydı başlat
- Kaydı durdur
- Kaydı sonlandır
- Ses süresi
- Upload durumu
- Ses oynatma

Sessiz sürelerin gereksiz şekilde kaydedilmemesi veya sonradan ayıklanması beklenmektedir.

Sistem Voice Activity Detection / VAD kullanımına uygun tasarlanmalıdır.

Ses dosyaları veritabanına binary olarak yazılmamalıdır.

Object Storage kullanılmalıdır.

Database içerisinde yalnızca metadata ve storage path tutulmalıdır.

---

# 10. RAPORTÖR İŞ AKIŞI

Hekimin ses kaydını tamamladığı tetkikler raportör çalışma havuzuna düşer.

Raportör tetkiki açtığında sistem dosyayı raportör adına kilitler.

Raportör aynı ekranda:

- Hasta/tetkik bilgilerini
- Klinik bilgileri
- Hekim diktesini
- Ses oynatıcısını
- Rapor editörünü
- Information / not alanını

görebilmelidir.

Raportör ses kaydını dinler ve raporu yazar.

Raportör raporu tamamladığında tetkik:

> HEKİM ONAYI BEKLİYOR

durumuna geçmelidir.

---

# 11. HEKİM FİNAL ONAYI

Raportör raporu tamamladıktan sonra rapor mutlaka ilgili hekimin onayına gitmelidir.

Hekim onay bekleyen raporları kolay fark edebilmelidir.

Arayüzde aşağıdaki yöntemlerden biri veya birkaçı kullanılabilir:

- Badge
- Yanıp sönen bildirim
- Onay sayacı
- Sabit onay sekmesi
- Realtime notification

Hekim:

- Raporu görüntüler.
- Gerekirse düzeltir veya geri gönderir.
- Görüntüyü tekrar açabilir.
- Final onay verir.

Final onaydan sonra rapor:

> FINAL

durumuna geçer.

---

# 12. HBYS GÖNDERİMİ

Final onaydan sonra rapor otomatik olarak HBYS sistemine gönderilmelidir.

Raportörden ikinci bir gönderim işlemi beklenmez.

Akış:

Hekim Final Onay

→ HBYS Queue

→ HBYS Adapter

→ Gönderim

→ Başarılı / Başarısız

Başarılı ise:

> HBYS_SENT

Başarısız ise:

> HBYS_FAILED

durumu oluşmalıdır.

HBYS başarısızlığı:

- Manager
- Operasyon kullanıcısı

tarafından görülebilmelidir.

Gerektiğinde manuel Retry yapılabilmelidir.

---

# 13. LOCKING / EŞ ZAMANLI ÇALIŞMA

Bu proje için locking kritik bir iş kuralıdır.

Aynı tetkik üzerinde aynı anda iki aktif kullanıcı çalışamaz.

Örnek:

Dr. A dosyayı açtı.

→ Study lock oluşur.

Dr. B aynı dosyayı açmaya çalışır.

→ Açılması engellenir.

Raportör A dosyayı açtı.

→ Reporter lock oluşur.

Raportör B açmaya çalışır.

→ Açılması engellenir.

Kilitli dosya üzerinde kullanıcıya aşağıdaki bilgi gösterilebilir:

- Kim tarafından kullanıldığı
- Kullanıcı rolü
- İşlem başlangıç zamanı

Yetkili kullanıcı tarafından özel izin verilmesi halinde istisnai erişim mekanizması ileride desteklenebilir.

Lock mekanizması Redis tabanlı tasarlanacaktır.

Lock timeout / heartbeat mantığı bulunmalıdır.

Tarayıcı kapanması veya kullanıcı bağlantısının kesilmesi durumunda sonsuz lock oluşmamalıdır.

---

# 14. HASTANE DOKTORU LOCK EVENT

Hastane hekimi hastane HBYS üzerinden:

> Bu hastayı ben okuyacağım

anlamına gelen işlem yaptığında hastane sistemi raporlama platformuna bir kod/event gönderebilir.

Bu durumda ilgili tetkik merkezi raporlama sisteminde kilitlenebilmelidir.

Bu özellik gerçek hastane entegrasyon aşamasında adapter üzerinden sağlanacaktır.

Pilot ortamda bu event manuel veya mock olarak simüle edilebilmelidir.

---

# 15. ANA DURUMLAR

Temel tetkik durumları aşağıdaki mantığı desteklemelidir:

- INITIAL
- WAITING_ACCEPTANCE
- IMAGES_PENDING
- UNREAD
- READING
- READ
- WAITING_TRANSCRIPTION
- TRANSCRIBING
- WAITING_APPROVAL
- FINAL
- HBYS_PENDING
- HBYS_SENT
- HBYS_FAILED

Özel durumlar:

- IMAGE_MISSING
- WONT_REPORT
- HOSPITAL_DOCTOR
- REVISION_REQUESTED
- REVISION_IN_PROGRESS
- ADDENDUM_REQUIRED

Kesin state transition kuralları `WORKFLOW_STATE_MACHINE.md` içerisinde tanımlanacaktır.

---

# 16. OPERASYONEL HAVUZLAR

Arayüzde aşağıdaki operasyonel filtre / havuzlar bulunmalıdır:

- Okunmayan
- Okunan
- Yazılmayan
- Yazılan / Onay Bekleyen
- Onaylandı
- HBYS Gönderildi
- HBYS Gönderilmedi
- İmaj Eksik
- Yazılmayacak
- Hastane DR
- Liste 1
- Liste 2
- Liste 3
- Liste 4
- Liste 5
- Liste 6

Bu alanların bazıları gerçek state değil, filtrelenmiş görünüm olabilir.

Backend'de aynı veriyi gereksiz yere farklı tablolarda çoğaltmak yerine filtre mantığı tercih edilmelidir.

---

# 17. LİSTE 1–6

Liste 1–6 özel operasyonel hasta havuzlarıdır.

Amaç:

- Özellikli hasta
- Acil hızlandırma
- Nöbetçi hekime özel iş
- Manuel operasyon gruplaması

gibi senaryolar için hızlı liste oluşturabilmektir.

Tetkikin asıl hasta kategorisi değişmemelidir.

Liste üyeliği ayrı metadata olarak tutulmalıdır.

---

# 18. HASTA KATEGORİLERİ

Temel hasta kategorileri:

- ACIL
- YOGUN_BAKIM
- YATAN
- NORMAL

Hasta kategorisi esas olarak HBYS tarafından gönderilir.

Normal kullanıcı kategori bilgisini keyfi olarak değiştirmemelidir.

Ancak tetkik özel çalışma listesine aktarılabilir.

---

# 19. SLA / SÜRE TAKİBİ

Temel SLA süreleri:

- Acil: 2 saat
- Yatan: 12 saat
- Normal / Poliklinik: 24 saat

Yoğun bakım için iş kuralı entegrasyon / konfigürasyon dokümanında netleştirilebilir.

Temel göstergeler:

## Geliş

İkinci HL7 sonrasında tetkikin raporlama sürecine giriş zamanı.

## Kalan

SLA deadline'a kalan süre.

## Gecikme

SLA deadline geçildikten sonra geçen süre.

---

# 20. SLA UYARISI

Tetkikin sözleşmesel süresinin dolmasına yaklaşık:

> 20 dakika

kaldığında sistem dikkat çekici uyarı vermelidir.

Örnek yöntemler:

- Renk değişimi
- Badge
- Popup
- Realtime notification
- Sesli uyarı ileride opsiyonel

Pilot test ortamında gerçek 2/12/24 saat beklenmemesi için hızlandırılmış SLA test modu bulunmalıdır.

Örnek:

Normal SLA:

24 saat

Test SLA:

5 dakika

Warning:

son 1 dakika

---

# 21. RAPORTÖR SÜRE TAKİBİ

Raportör dosyayı üzerine aldığında yazım süresi takip edilebilmelidir.

Manager raportörlerin işlem sürelerini görebilmelidir.

Benzer şekilde hekimlerin ortalama okuma süresi manager tarafından takip edilebilmelidir.

---

# 22. INFORMATION / NOT ALANI

Tetkik üzerinde hekim veya raportör ek bilgi bırakabilmelidir.

Her not en az:

- Kullanıcı
- Rol
- Tarih
- Saat
- İçerik

bilgilerini taşımalıdır.

Notlar silinmemelidir.

Bir bilgi değiştirilmişse değişiklik geçmişi korunmalıdır.

Yeni Information kaydı operasyon / ilgili kullanıcı tarafında görsel uyarı oluşturabilmelidir.

---

# 23. RAPOR VERSİYONLAMA

Final rapor daha sonra revize edilebilir.

Eski rapor silinmemelidir.

Her revizyon ayrı version olarak saklanmalıdır.

Örnek:

Report v1

→ Final

Report v2

→ Revision

Report v3

→ Revision

Manager revize edilen raporları ayrıca takip edebilmelidir.

---

# 24. EK RAPOR / ADDENDUM

İki aylık faturalama süresi sonrası değişiklik gerektiğinde mevcut rapor doğrudan değiştirilmemelidir.

Yeni kayıt:

> Ek Rapor / Addendum

olarak oluşturulmalıdır.

İki ay kuralı mevcut iş kuralına göre tüm hastaneler için geçerlidir.

Faturalama süresi içindeki revizyon normal version update olarak yapılabilir.

Fatura dönemi sonrasında Ek Rapor hastane fatura birimi ile koordineli gönderilebilir.

---

# 25. İMAJ EKSİK

Hekim görüntünün eksik olduğunu belirtebilir.

Bu durumda tetkik:

> IMAGE_MISSING

durumuna alınır.

Normal raporlama havuzundan ayrılır.

Eksik görüntü tamamlandığında dosya otomatik olarak aktif akışa dönebilmelidir.

Bu geçiş audit log'a yazılmalıdır.

---

# 26. YAZILMAYACAK

Tetkik raporlanmayacak olarak işaretlenebilir.

Bu durumda:

> WONT_REPORT

durumuna alınır.

Kayıt silinmez.

Gerekirse daha sonra tekrar aktif raporlama akışına döndürülebilir.

---

# 27. HASTANE DR

Hastane doktorunun kendi üzerine aldığı tetkikler:

> HOSPITAL_DOCTOR

işaretine sahip olabilir.

Merkezi raporlama ekibi normal koşullarda bu dosyayı okumaz.

Ancak yetkili kullanıcı gerektiğinde atamayı değiştirebilmelidir.

---

# 28. KLİNİK BİLGİLER

HBYS üzerinden gelen klinik bilgiler tetkik ekranında gösterilebilmelidir.

Desteklenecek alanlar arasında:

- Klinik ön tanı
- İstem nedeni
- Hasta şikayeti
- Önceki tetkik bilgileri
- İstemi yapan hekim
- Servis / poliklinik
- Diğer klinik notlar

yer alabilir.

Alanlar hastane entegrasyonuna göre değişebilir.

Frontend bilinmeyen klinik alanlara karşı dayanıklı olmalıdır.

---

# 29. KULLANICI ROLLERİ

Temel roller:

## DOCTOR

- Tetkikleri görüntüler.
- Görüntüleri değerlendirir.
- Sesli dikte yapar.
- İmaj eksik bildirir.
- Raportör raporunu kontrol eder.
- Final onay verir.

## REPORTER

- Hekim diktesini dinler.
- Raporu yazar.
- Hekim onayına gönderir.

## OPERATION

- Hasta havuzlarını izler.
- Geciken tetkikleri takip eder.
- Information uyarılarını takip eder.
- HBYS hatalarını izler.
- Operasyonel sorunları kontrol eder.

## MANAGER

Tüm sistem yönetim yetkilerine sahip olabilir.

Örnek:

- Kullanıcılar
- Hastaneler
- Yetkiler
- Atamalar
- İstatistikler
- Hakediş
- Revizyon takibi
- HBYS hata takibi
- Audit
- Sistem konfigürasyonu

Detaylı izin matrisi `AUTH_ROLES_PERMISSIONS.md` içerisinde oluşturulacaktır.

---

# 30. HASTANE YETKİLENDİRMESİ

Bir kullanıcı:

- Tek hastaneye
- Birden fazla hastaneye
- Tüm hastanelere

yetkilendirilebilir.

Hekim yalnızca yetkili olduğu hastane bilgilerini görebilmelidir.

Manager hastane grubu yetkilendirmelerini yönetebilmelidir.

---

# 31. AUDIT LOG

Kritik işlemlerin tamamı audit kaydı oluşturmalıdır.

Örnek eventler:

- İlk HL7 alındı
- İkinci HL7 alındı
- Accession eşleşti
- Görüntüler geldi
- Dosya açıldı
- Lock oluşturuldu
- Lock kaldırıldı
- Hekim okumaya başladı
- Dikte başladı
- Dikte bitti
- Raportör yazmaya başladı
- Rapor kaydedildi
- Rapor tamamlandı
- Final onaylandı
- HBYS gönderildi
- HBYS gönderimi başarısız
- HBYS retry
- Revizyon oluşturuldu
- Addendum oluşturuldu
- Image missing
- Wont report
- Hastane doktoru aldı
- Hastane doktoru bıraktı
- Information notu eklendi

Audit kaydı minimum:

- Event type
- User ID
- Role
- Hospital ID
- Study ID
- Timestamp
- Metadata

tutmalıdır.

---

# 32. MANAGER İSTATİSTİKLERİ

Manager aşağıdaki istatistikleri görebilmelidir:

- Toplam tetkik
- Acil tetkik
- Yoğun bakım
- Yatan
- Normal
- Okunmayan
- Okunan
- Yazılmayan
- Final
- HBYS başarısız
- Geciken
- Revize edilen

Kullanıcı bazında:

- Hekim okuma sayısı
- Ortalama okuma süresi
- Raportör rapor sayısı
- Ortalama yazım süresi

bulunabilir.

---

# 33. AYLIK HAKEDİŞ

Her hekim ve raportör için aylık hakediş ekranı bulunmalıdır.

Bu alan yalnızca:

> MANAGER

tarafından görülebilmelidir.

Pilot sürümde temel sayaç ve raporlama yeterli olabilir.

Finansal hesap formülleri daha sonra ayrıca netleştirilebilir.

---

# 34. ACİL HEKİMİ REVİZYON PORTALI

Acil hekimlerinin WhatsApp yerine sisteme bağlı kısa bir URL üzerinden revizyon / tekrar değerlendirme talebi oluşturabilmesi hedeflenmektedir.

Bu portal:

- Hafif
- Hızlı erişilebilir
- Ana sisteme entegre
- Güvenli

olmalıdır.

Acil hekimi:

- İlgili tetkiki seçer
- Revizyon nedeni girer
- Not ekler
- Talebi gönderir

Sistem:

- Uyarı oluşturur.
- Revizyon nedenini hekime gösterir.
- Revizyon nedenini raportöre gösterir.
- Audit kaydı oluşturur.

Bu modül pilotun ileri fazında devreye alınabilir.

---

# 35. AI RAPORLAMA HAZIRLIĞI

Gelecekte yapay zekâ ile otomatik rapor taslağı oluşturulabilir.

Ancak:

> Raportör modülü sistemden kaldırılmayacaktır.

AI bir alternatif / yardımcı rapor kaynağı olarak düşünülmelidir.

Rapor kaynağı ileride:

- REPORTER
- MANUAL
- AI_DRAFT
- AI_ASSISTED

gibi işaretlenebilir.

Pilot ilk sürüm AI olmadan tamamen çalışabilmelidir.

---

# 36. REALTIME DAVRANIŞLAR

Aşağıdaki olayların realtime olarak frontend'e iletilmesi hedeflenir:

- Study locked
- Study unlocked
- Study status changed
- Reporter started
- Doctor started
- Approval waiting
- SLA warning
- SLA overdue
- HBYS sent
- HBYS failed
- Revision requested
- Information added
- Image status changed

Kesin event isimleri `REALTIME_EVENTS.md` içerisinde tanımlanacaktır.

---

# 37. MOCK HL7

Pilot testinde gerçek hastane entegrasyonu olmadan HL7 davranışı test edilebilmelidir.

Dev/Test paneli aşağıdaki işlemleri oluşturabilmelidir:

- İlk HL7 gönder
- İkinci HL7 gönder
- Aynı Accession Number ile eşleştir
- Hatalı Accession gönder
- Hasta kategorisi belirle
- Hastane belirle

Mock HL7 gerçek backend workflow'unu kullanmalıdır.

Frontend'de sahte local state kullanılmamalıdır.

---

# 38. MOCK HBYS

Pilot ortamda gerçek HBYS yerine mock service kullanılacaktır.

Mock HBYS en az üç mod desteklemelidir:

## SUCCESS

Rapor başarıyla kabul edilir.

## FAIL

HBYS hata döndürür.

## TIMEOUT

HBYS cevap vermez veya timeout oluşur.

Amaç:

- Retry
- Error UI
- Queue
- Audit
- Manager notification

mekanizmalarını gerçekçi şekilde test etmektir.

---

# 39. TEST PACS

Pilot sistemde gerçek hastane PACS'i zorunlu değildir.

Test için Orthanc veya benzeri DICOM sistemi kullanılabilir.

Test görüntüleri yalnızca demo / test amaçlı olacaktır.

Gerçek hasta verisi kullanılmayacaktır.

---

# 40. DEV TOOLS

Pilot ortamda normal production kullanıcılarının görmeyeceği bir test paneli bulunabilir.

Örnek:

`/dev-tools`

Fonksiyonlar:

- Test hasta oluştur
- İlk HL7
- İkinci HL7
- Görüntü geldi simüle et
- HBYS success
- HBYS fail
- HBYS timeout
- Lock oluştur
- Lock kaldır
- SLA hızlandır
- Revision oluştur

Bu araç yalnızca development / pilot yetkili kullanıcılarına açık olmalıdır.

Production'da kapatılabilmelidir.

---

# 41. GÜVENLİK PRENSİPLERİ

Pilot dahi olsa temel güvenlik kuralları uygulanmalıdır.

- Authentication
- Role Based Access Control
- Hospital Based Access Control
- Secure password storage
- HTTPS
- Audit trail
- Session expiry
- Refresh token management
- Input validation
- Rate limiting
- Secure headers
- Environment secrets
- CORS restrictions

Gerçek hasta verisi pilot ortamda kullanılmayacaktır.

---

# 42. KVKK / ANONİMLEŞTİRME

Sağlık ekibi hasta isimlerinin raporlama sürecinde anonim gösterilmesi fikrini önermiştir.

Örnek:

Gerçek Hasta:

Ayşe Yılmaz

Raporlama tarafında:

Patient-ADM-41283

Final sonrası:

Gerçek kimlik ile eşleşme.

Bu özellik teknik olarak desteklenebilir şekilde tasarlanabilir.

Ancak pilotun zorunlu ilk faz gereksinimi değildir.

Gerçek hastane entegrasyonu öncesi ayrıca hukuki ve operasyonel olarak netleştirilecektir.

---

# 43. FRONTEND TEMEL PRENSİPLERİ

Frontend:

- Hızlı olmalı
- Yoğun iş akışına uygun olmalı
- Gereksiz sayfa geçişi olmamalı
- Kritik bilgiler tek ekranda olmalı
- Realtime güncellenmeli
- SLA görünür olmalı
- Kilit durumu görünür olmalı
- Kullanıcı hangi tetkikin kimde olduğunu anlayabilmeli
- Onay bekleyen dosyalar dikkat çekmeli
- HBYS hataları görünür olmalı

Raportör özellikle:

> Ses kaydı + rapor editörü

alanına aynı hasta/tetkik ekranından ulaşmalıdır.

---

# 44. BACKEND TEMEL PRENSİPLERİ

Backend monolitik ancak modüler NestJS yapısı ile başlayacaktır.

Örnek modüller:

- Auth
- Users
- Hospitals
- Patients
- Studies
- Reports
- Dictations
- Workflow
- Locks
- SLA
- Notifications
- HL7
- PACS
- HBYS
- Revisions
- Audit
- Manager
- DevTools

İlk pilot için microservice zorunlu değildir.

Ancak entegrasyon adapterları core business logic'ten ayrılmalıdır.

---

# 45. ENTEGRASYON ADAPTER PRENSİBİ

Ana sistem hiçbir hastanenin özel entegrasyonuna doğrudan bağımlı olmamalıdır.

Örnek:

Core System

→ Integration Interface

→ Hospital Adapter

Örnek adapterlar:

- mock-hl7
- hospital-a-hl7
- mock-hbys
- hospital-a-hbys
- orthanc-pacs
- hospital-a-pacs

Bu sayede yeni hastane eklenirken core workflow yeniden yazılmamalıdır.

---

# 46. PİLOT DEPLOYMENT

Pilot:

Frontend:

> Vercel

Backend:

> Railway

üzerinde çalışacaktır.

Backend servisleri için ihtiyaçlar:

- Node.js
- PostgreSQL
- Redis
- Object Storage
- Environment Variables

Test PACS Railway dışında ayrı çalışabilir.

Kesin deployment adımları `DEPLOYMENT_PILOT.md` içerisinde tanımlanacaktır.

---

# 47. AI GELİŞTİRME MODELİ

Kod geliştirme iki ana AI ajanı arasında bölünecektir.

## Claude

Ana sorumluluk:

> Backend

Başlıca çalışma alanı:

- `/apps/backend`
- backend ile ilgili shared packages

## Codex

Ana sorumluluk:

> Frontend

Başlıca çalışma alanı:

- `/apps/frontend`

İki ajan da bu dosyayı okumak zorundadır.

Hiçbir ajan iş kurallarını kendi kararı ile değiştiremez.

---

# 48. AUTONOMOUS DEVELOPMENT PRENSİBİ

Projenin ilk pilotunun yoğun şekilde otonom AI ajanları tarafından geliştirilmesi hedeflenmektedir.

Görevler küçük ve bağımsız parçalara bölünecektir.

Her görev:

1. Requirement okunur.
2. Kod yazılır.
3. Test yazılır.
4. Test çalıştırılır.
5. Hata varsa düzeltilir.
6. Başarılıysa görev tamamlanır.
7. Commit oluşturulur.
8. Progress güncellenir.
9. Sonraki göreve geçilir.

Harici bağımlılık nedeniyle tamamlanamayan görev:

> BLOCKED_EXTERNAL

olarak işaretlenir.

Ajan başka bağımsız göreve devam eder.

---

# 49. 5 GÜNLÜK PİLOT HEDEFİ

Beş günlük yoğun geliştirme sürecinin hedefi bütün enterprise ürünün bitmesi değildir.

Hedef:

> Sağlık ekibinin uçtan uca ana akışı test edebilmesi.

Minimum başarılı pilot:

- Login çalışıyor
- Roller çalışıyor
- Hastane yetkileri çalışıyor
- Test hasta oluşturulabiliyor
- İlk HL7 işleniyor
- İkinci HL7 eşleşiyor
- Accession Number kontrolü çalışıyor
- Tetkik havuzu çalışıyor
- Doctor lock çalışıyor
- Ses kaydı çalışıyor
- Reporter queue çalışıyor
- Ses oynatma çalışıyor
- Rapor editörü çalışıyor
- Hekim onayı çalışıyor
- Mock HBYS otomatik gönderim çalışıyor
- HBYS fail simülasyonu çalışıyor
- Retry çalışıyor
- SLA çalışıyor
- Audit çalışıyor
- Realtime temel bildirimler çalışıyor
- Manager temel ekranı çalışıyor

---

# 50. PILOT ACCEPTANCE CRITERIA

Pilot ancak aşağıdaki uçtan uca senaryo başarılı olduğunda temel olarak kabul edilir:

1. Test hasta sisteme gelir.
2. İlk HL7 oluşturulur.
3. İkinci HL7 gelir.
4. Accession Number eşleşir.
5. Tetkik UNREAD olur.
6. Hekim tetkiki açar.
7. Lock oluşur.
8. İkinci hekim aynı tetkiki açamaz.
9. Hekim sesli dikte oluşturur.
10. Tetkik raportör havuzuna gider.
11. Raportör tetkiki açar.
12. Reporter lock oluşur.
13. Raportör sesi dinler.
14. Raportör raporu yazar.
15. Rapor hekime gönderilir.
16. Hekim final onay verir.
17. HBYS gönderimi otomatik başlar.
18. Mock HBYS SUCCESS döner.
19. Tetkik HBYS_SENT olur.
20. Bütün ana işlemler audit log'da görünür.

Ek hata testi:

1. Yeni tetkik final edilir.
2. Mock HBYS FAIL modundadır.
3. Gönderim başarısız olur.
4. UI hata gösterir.
5. Manager / Operation hatayı görür.
6. Retry yapılır.
7. Mock HBYS SUCCESS moduna alınır.
8. Rapor başarıyla gönderilir.

---

# 51. DOKÜMANTASYON HİYERARŞİSİ

Dokümanların öncelik sırası:

1. `MASTER_SPEC.md`
2. `WORKFLOW_STATE_MACHINE.md`
3. `API_CONTRACT.md`
4. `DATA_MODEL.md`
5. `AUTH_ROLES_PERMISSIONS.md`
6. `INTEGRATIONS.md`
7. `BACKEND.md`
8. `FRONTEND.md`
9. Diğer teknik dokümanlar

Alt seviye doküman üst seviye dokümanla çelişemez.

---

# 52. DEĞİŞİKLİK KURALI

İş mantığında değişiklik gerektiğinde:

1. Önce MASTER_SPEC güncellenir.
2. İlgili teknik dokümanlar güncellenir.
3. API değişiyorsa API_CONTRACT güncellenir.
4. State değişiyorsa WORKFLOW_STATE_MACHINE güncellenir.
5. Son olarak kod değiştirilir.

Kod tek başına source of truth değildir.

---

# 53. SCOPE DIŞI / İLK PİLOTTA ZORUNLU OLMAYANLAR

İlk beş günlük pilotun çalışması için aşağıdakilerin eksiksiz olması zorunlu değildir:

- Gerçek hastane HL7
- Gerçek HBYS
- Gerçek hastane PACS
- Kubernetes
- Multi-region
- High availability cluster
- Mobil uygulama
- AI otomatik rapor üretimi
- Gelişmiş finans modülü
- Gelişmiş BI
- Kesin üretim KVKK anonimleştirme modeli
- Çok hastaneli production scaling

Ancak mimari bu özelliklerin ileride eklenmesini engellememelidir.

---

# 54. ANA TASARIM PRENSİBİ

Sistemin temel hedefi yalnızca “rapor yazmak” değildir.

Sistem:

> Radyoloji raporlama operasyonunun uçtan uca yönetim platformudur.

Ana bileşenler:

HL7

→ Tetkik

→ PACS

→ Hekim

→ Dikte

→ Raportör

→ Rapor

→ Hekim Final

→ HBYS

→ Revizyon / Addendum

→ Operasyon / Manager

---

# 55. SON KURAL

Claude, Codex veya başka bir geliştirici bu dokümanda açıkça belirtilmeyen bir iş kuralı ile karşılaşırsa:

- Tahmin ederek sağlık iş kuralı üretmemelidir.
- Mevcut güvenli teknik varsayımla ilerlenebiliyorsa bunu açıkça not etmelidir.
- İş akışını değiştirecek bir karar gerekiyorsa görev BLOCKED_SPEC olarak işaretlenmelidir.
- MASTER_SPEC değiştirilmeden kritik iş kuralı uygulanmamalıdır.

Bu doküman projenin geliştirme süreci boyunca ana ürün spesifikasyonu olarak kullanılacaktır.