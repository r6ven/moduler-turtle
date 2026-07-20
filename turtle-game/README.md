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

- Dört yüksek çözünürlüklü ağaç varyantı ve antik fener pasif kum adalarında,
  merkez dışındaki kontrollü bölgelere tabanlarından oturtulur. Küçük haritalarda
  1-2, geniş haritalarda en fazla 3 ağaç bulunur; aynı haritadaki türler tekrar
  etmez ve mümkün olduğunda komşu hexlere yığılmaz.
- Ağaçlar zeytin, kıyı çamı, çiçekli ağaç ve low-poly bonsai modelleridir.
  Modeller 768x768 kayıpsız, şeffaf WebP varlıklarıdır; yüksek DPI Canvas üzerinde
  canlı renk, yumuşak komşu-hex gölgesi ve yüksek kaliteli ölçekleme ile çizilir.
- Her modelin dip toprağı ayrı bir yumuşak maskeyle seçilir ve Renderer tarafından
  bulunduğu hexin kum/aktif/yeşermiş yüzey tonuna dinamik olarak uyarlanır. Ağaç,
  taş, çimen ve çiçek renkleri bu işlemden etkilenmez.
- Çevrelerindeki taş, kum, çimen ve çiçekler model tabanının çevresinde aynı seeded
  kompozisyonun parçası olarak kümelenir.
- Modeller puzzle bağlantı mantığını değiştirmez; yalnız görsel çeşitlilik sağlar.
- Kaplumbağanın bölüm sonu yüzme turu boyunca antik fenerin sıcak ışığı yumuşak
  biçimde yanıp söner; normal puzzle sırasında sabit kalır.
- Ahşap köprü modeli değerlendirme sonrasında oyundan çıkarılmıştır.

## HD Görüntü

- Hex yüzeyleri ve önbellekleri kalite profiline göre en az `1.25x`, yüksek profilde
  en az `1.75x` backing piksel yoğunluğunda üretilir. Performans düşüşü dokuyu
  bulanıklaştırmak yerine parçacık ve hareketli efekt sayısını azaltır.
- Kum yüzeyi çok ölçekli tanecik, mineral izi ve ton kırılmaları kullanır.
- Su; kıyı, kanal yatağı, derinlik, çapraz renk kırılması, mikro yansıma ve kaynaktan
  ilerleyen ince akış izleri olarak ayrı katmanlarda çizilir.

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
