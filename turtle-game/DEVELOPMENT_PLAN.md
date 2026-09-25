# Zen Kaplumbağa — üç görevli geliştirme planı

## 25 Eylül 2026 — oynanış paketi

Bu dal, ikinci ve üçüncü görevlerden küçük, yayınlanabilir bir oyun döngüsü
iyileştirmesi seçer. Kaynaktan erişilen karo sayısı ve açık kanal ucu sayısı
oyun sırasında görünür; hedefe su geldiğinde, tüm ada henüz bitmediyse bu
ayrıca belirtilir. Hikâye ve antrenmanda son manuel dönüş geri alınabilir.
Geri alma da **bir hamle** sayılır; ipucu kullanımı önceki geri alma geçmişini
temizler. Öğreticinin ilk adımında ve dereceli sprintte geri alma yoktur.
Zafer turu geçilebilir; sonuç kaydı ve dereceli sunucu doğrulaması atlanmaz.
Kutlama parçacıkları mevcut kum/su paletine taşındı.

Doğrulama: `npm test` 68/68 geçti ve `npm run build` başarılı. Yerel tarayıcı
önizlemesi bu çalışma ortamındaki tarayıcı bağlantısı tarafından engellendi;
özellikle 360×640 ve yatay telefon düzeninin gerçek cihazda görsel kontrolü
yayın öncesi gereklidir. Supabase şeması, RPC, Edge Function ve dereceli skor
kuralları değişmedi.


Tarih: 7 Eylül 2026. Kaynak: canlı oyundaki masaüstü denemesi ve repo incelemesi.
Ana yön: su bağlantısı kurdukça canlanan ada bahçesi.

## Görev 1 — Okunabilirlik ve ilk oyun deneyimi

Amaç: oyuncunun karoyu, hedefi ve aldığı sonucu kolayca anlaması.

1. Tahtayı ekranın kullanılabilir alanına göre büyüt; bulmacanın mantıksal
   boyutunu değiştirme. Menü, ses, tam ekran ve sayaçları ortak bir HUD'da topla.
2. Üç adımlı öğretici: işaretli karoyu döndür; suyun kaynaktan başladığını öğren;
   hedefe ulaşmanın yanında bütün kanalları bağlama ve açık uç bırakmama kuralını öğren.
   İlk karoda belirgin ok kullan. Öğretici bitince tahta sıçramasın.
3. Kaynak ve hedef için renk yanında şekille de ayırt edilen sabit işaretler kullan.
   Kaplumbağa bu işaretleri kapatmasın. Bağlantısız suyu daha mat göster.
4. Sonuç ekranının metnini büyüt ve kontrastını artır. Manuel hamleleri, ipucuyla
   düzeltilen karoları ve yıldız koşullarını ayır. Puan ve kayıt kuralları değişmesin.
5. Kontrolleri klavyeyle kullanılabilen düğmeler yap; görünür odak işaretleri ekle.

Kabul ölçütleri:
- 1440×900, 390×844, 360×640 ve yatay telefonda HUD/tahta çakışması kontrol edilir.
- İlk adım yanlış karoda ilerlemez, doğru dokunuşla ikinci adıma geçer.
- Öğretici kapanması, menüden dönüş ve yeniden boyutlandırma giriş koordinatlarını bozmaz.
- İpuçlu sonuç, manuel hamle ile ipucusuz referansın neden farklı olduğunu açıklar.
- Hikâye, antrenman ve dereceli sonuç ayrımları korunur; testler ve build geçer.

Teslim: yerel çalışan sürüm, test/inceleme kaydı ve farklar. Yayın öncesi kullanıcı onayı.

## Görev 2 — Görsel kimlik ve etkileşim hissi

1. Menü: masaüstünde açık kitap kompozisyonu; mobilde daha küçük başlık ve geniş
   mod/seçim kartları. Sprint ayarları kesilmeden okunabilsin.
2. Menü ve tahta arasında ortak çizgi, malzeme ve tipografi dili. Kum, turkuaz ve
   zeytin paleti korunsun; dekorlar kanal ağızlarını örtmesin.
3. Doğru bağlantıda taş oturması → suyun ilerlemesi → su halkası → çiçeklenme →
   kaplumbağa tepkisi sırası. Tekrarlı bağlantılar görsel kalabalık yaratmasın.
4. Pembe daire kutlaması yerine su damlası ve taç yaprakları. Zafer turunu
   hızlandırma seçeneği; düşük hareket tercihine uygun sürüm.
5. Taş/su sesleri ve kıyı ambiyansı; müzik ve efekt için ayrı ses kontrolleri.
6. Kalite profillerine göre efekt bütçesi; düşük donanımda dokular yerine efekt
   yoğunluğu azaltılsın. Gerçek Android/iOS üzerinde uzun deneme yapılsın.

Kabul: menüde kesilen seçenek yok; ses/motion tercihleri korunur; aynı bağlantı
ödülü gereksiz yere yeniden tetiklenmez; cihaz performans kontrolü belgelenir.

## Görev 3 — Oynanış ve uzun vadeli ilerleme

1. Kademeli ipucu: önce bölgeyi göster, sonraki istekte düzelt. İpucu sayımı ve
   yıldız etkisi oyuncuya önceden açıklansın.
2. Hikâye/antrenmanda geri alma. Skorun kötüye kullanımını önleyecek sayaç kuralı
   tanımlansın; dereceli kurallara ve replay doğrulamasına bilinçsizce eklenmesin.
3. Süresi gizlenebilen, kesintisiz sakin mod; mevcut beşli sprint ayrı kalsın.
4. Hesap açmadan başlangıç: yerel misafir ilerlemesi ve sonradan hesaba güvenli
   aktarım. Giriş gerektiren yarışma ve kayıt işlemleri ayrı açıklansın.
5. Bölüm listesi yerine ada haritası; kalıcı bahçe detayları ve kozmetik açılımları.
   Tema sırası: kıyı, lotus bahçesi, gün batımı. Puan avantajı verilmesin.
6. Önce sabit taş, sonra zorunlu lotus durağı. İkinci kaynak ve tek yönlü kanal
   sonraki içerik dilimi; her mekanizma için öğretici, üretici, çözülebilirlik ve
   replay doğrulaması birlikte güncellensin.
7. Günlük sekmesinin işlevi dereceli sprintle çakışmayacak biçimde netleştirilsin.

Kabul: misafir→hesap geçişinde ilerleme kaybı yok; undo/ipuçları skor kurallarına
uyuyor; yeni bulmacalar çözülebilir; eski kayıtlar ve dereceli kurallar sürümleniyor.

## Uygulama sırası ve onay

Görev 1 → görsel inceleme ve yayın onayı → Görev 2 → Görev 3.
Bu plan üç iş paketidir; ayrı Codex görevleri veya otomasyonlar oluşturulmamıştır.
Görev 2 ve 3, bu ilk uygulama paketine dahil değildir.

## Görev 1 — 7 Eylül uygulama ve doğrulama kaydı

Durum: uygulama hazır; kullanıcı 7 Eylül'de GitHub yayınını açıkça onayladı.
Çalışma dalı: `codex/oyun-deneyimi-gorev-1`, temel commit: `84c5f58`.

- Büyük tahta, ortak HUD, telefon yatay düzeni ve kullanılabilir alana ortalama eklendi.
- Üç adımlı öğretici, sabit kaynak/hedef işaretleri ve mat bağlantısız su eklendi.
- Sonuç açıklamaları ve kontrast düzenlendi; mevcut puan kuralları korundu.
- Son yerel testler: `node --test` — standart izolasyonla 66/66 geçti.
  Gerekli alt süreç izni verilerek normal test çalıştırıcısı kullanıldı.
- Yayın derlemesi: `node node_modules/vite/bin/vite.js build` — başarılı, 74 modül.
- İlk görsel tur: masaüstü ve 390×844 önizlemesi kontrol edildi. Öğreticinin
  1→2→3→rehber geçişi UI üzerinden çalıştırıldı; karo yarıçapı `42.262`, tahta
  dikey ofseti `7.500` olarak değişmeden kaldı.
- HUD arasına ortalama düzenlemesinin dört ekran için sınırları ve dokunma
  koordinat dönüşümü otomatik testle doğrulandı. Dereceli puan-dışı bildirimi
  rehberle aynı sabit alana yerleştirildi.
- Sonradan eklenen HUD arasına ortalama düzenlemesinin görsel tekrar kontrolü,
  360×640, 1440×900, yatay telefon ve yenilenmiş sonuç ekranı kontrolü bekliyor.
  Tarayıcı bağlantısı son turda kullanılabilir değildi; bu kontroller geçti sayılmadı.
- GitHub yayın yetkisi verildi; bu kayıt commit öncesi hazırlandı. Uzak CI ve
  yayın sonucu yerel kişisel not defterinde güncellenecek.
