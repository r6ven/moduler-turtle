# Zen Kaplumbağa

Canvas tabanlı, modüler JavaScript ile hazırlanmış sakin hex puzzle oyunu.

## Kurulum

```bash
npm install
npm run dev
```

Tarayıcıda Vite'ın verdiği lokal adresi aç.

## Build

```bash
npm run build
```

Render, Netlify veya benzeri servislere `dist` klasörü yayınlanabilir.

## Klasör Mantığı

- `Game.js`: Oyunun ana koordinatörü.
- `PuzzleGenerator.js`: Çözülebilir ve temiz puzzle üretir.
- `PuzzleValidator.js`: Bağlantı, boşta uç ve tamamlanma kontrolü yapar.
- `Renderer.js`: Canvas çizimlerini yönetir.
- `InputManager.js`: Mobil ve mouse girişlerini hex koordinatına çevirir.
- `ProgressSystem.js`: Hamle, ipucu, yıldız ve kayıt işlerini tutar.

## Ada Modelleri

- Ağaçlar oyun üretiminden ve render zincirinden çıkarılmıştır.
- Pasif kum adalarında yoğun yapraklı, seyrek yapraklı, yapraksız ve çiçekli olmak
  üzere dört prosedürel çalı varyantı bulunur. Küçük haritalarda 1-2, geniş
  haritalarda en fazla 3 çalı üretilir ve mümkün olduğunda komşu hexlere yığılmaz.
- Çalılar tam 90 derece tepeden görünür; yan yüzey, gövde yüksekliği, perspektif veya
  zemin gölgesi kullanılmaz. Dallar merkezden radyal yayılır, yaprak ve çiçekler
  seeded kompozisyonla üst yüzeye yerleşir.
- Çevrelerindeki taş, kum, çimen ve çiçekler aynı seeded kompozisyonun parçasıdır.
- Modeller puzzle bağlantı mantığını değiştirmez; yalnız görsel çeşitlilik sağlar.
- Kaplumbağanın bölüm sonu yüzme turu boyunca antik fenerin sıcak ışığı yumuşak
  biçimde yanıp söner; normal puzzle sırasında sabit kalır.
- Ahşap köprü modeli değerlendirme sonrasında oyundan çıkarılmıştır.

## HD Görüntü

- Hex yüzeyleri ve önbellekleri kalite profiline göre en az `1.25x`, yüksek profilde
  en az `1.75x` backing piksel yoğunluğunda üretilir. Performans düşüşü dokuyu
  bulanıklaştırmak yerine parçacık ve hareketli efekt sayısını azaltır.
- Kum yüzeyi çok ölçekli tanecik, mineral izi ve ton kırılmaları kullanır.
- Su motoru çizgi üst üste bindirme kullanmaz. Kıyı, kanal yatağı, derin su ve yüzey
  aynı katman geometrisinden üretilir; kanal ağzı tam dış hex konturunda biter.
- Komşu hexler arasında ayrıca çizilen bağlantı şeridi devre dışıdır. Eşleşen iki
  kanal yalnızca temas eden ortak hex sınırında buluşur.
- İki kollu kanallar bir ağızdan diğerine kuadratik, yuvarlatılmış tek şerit olarak
  döner. Çok kollu merkezlerde aynı renkli küçük oval birleşim kullanılır; ayrı
  portal, havuz veya kapama yaması yoktur.
- Sakin suda kısa seeded kırınımlar, kaynağa bağlı suda yönlü ve çoklu ince kesik
  akış izleri bulunur. Yalnız başlangıç ve bitiş hexlerinde portal çizilir.
  Ana menüdeki kaynak ve bitiş kuyuları taş örgü, derinlik
  ve su halkası katmanlarıyla oyun içindeki akış dilini takip eder.

## Karar Bekleyen Mekanikler

- Kaplumbağanın puzzle sırasında tıklanan hexe gitme davranışı korunacak.
- Bu hareket; tıklanan aktif hex kaynağa bağlandığında ve tüm su çıkışları
  komşularıyla eşleştiğinde tetikleniyor.
- Davranış ileride doğru bağlantı kurma ödülü olarak kullanılacak.
- Ödülün görsel geri bildirim, ses, seri bonusu veya skor etkisi olmasına daha
  sonra karar verilecek. Şimdilik puan ve yıldız hesabı değişmeyecek.

## Güvenlik İlkesi

- Geliştirme sırasında değiştirilen veya incelenen dosyalarda görülen güncel
  OWASP Top 10 riskleri, görevle çelişmediği sürece ayrıca talep beklenmeden
  giderilir.
- İstemci girdileri ve Supabase dahil uzak kaynaklardan gelen bütün veriler
  güvenilmez kabul edilir; çıktı kodlanır, sayısal alanlar doğrulanır ve yetki
  kontrolleri yalnızca istemciye bırakılmaz.
- Gizli anahtarlar istemci paketine eklenmez. Supabase erişimi RLS, dar yetkili
  RPC fonksiyonları ve sunucu tarafı doğrulamayla sınırlandırılmalıdır.
- Güvenlik düzeltmeleri production build ve ilgili kötü niyetli/sınır değer
  senaryolarıyla doğrulanır. Backend şeması, credential değişimi veya kırıcı bir
  migration gerekiyorsa durum belgelenir ve uygulama adımı ayrıca planlanır.
- Bu sürekli kontrol, yayın öncesi bağımsız güvenlik incelemesi ve bağımlılık
  taramasının yerine geçmez.

## Cihaz Oturumu

- Kalıcı cihaz oturumu geçici olarak yalnız `seydayilmaz` kullanıcı adına açıktır.
- Kimlik bilgisi düz metin olarak saklanmaz; IndexedDB'deki dışarı aktarılamaz AES-GCM
  anahtarıyla şifrelenmiş veri `localStorage` içinde tutulur.
- Uygulama her açıldığında kayıt Supabase RPC üzerinden yeniden doğrulanır. Hatalı,
  bozulmuş veya geçersiz kayıt silinir; `Çıkış Yap` cihaz oturumunu da kaldırır.
- Render deploy'u aynı origin altında tarayıcı depolamasını silmediği için oturum korunur.
- Bu geçici çözüm XSS çalıştırabilen zararlı kodlara karşı Supabase Auth oturum belirteci
  kadar güçlü değildir; uzun vadeli hedef Supabase Auth'a geçmektir.
