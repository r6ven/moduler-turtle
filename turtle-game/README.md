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

- Ağaç ve antik fener, pasif kum adalarında kontrollü rastgele konumlarda ve bölüm
  başına en fazla birer tane üretilir; çevrelerindeki taş, kum, çimen ve çiçekler
  aynı seeded dekor düzeninin parçasıdır.
- Modeller basit Canvas sembolleri değildir; `public/images/hex-tree.webp` ve
  `hex-ancient-lantern.webp` şeffaf üretim varlıkları kullanılır.
- Modeller puzzle bağlantı mantığını değiştirmez; yalnız görsel çeşitlilik sağlar.
- Kaplumbağanın bölüm sonu yüzme turu boyunca antik fenerin sıcak ışığı yumuşak
  biçimde yanıp söner; normal puzzle sırasında sabit kalır.
- Ahşap köprü modeli değerlendirme sonrasında oyundan çıkarılmıştır.

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
