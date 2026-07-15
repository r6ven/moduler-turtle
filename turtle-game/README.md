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

## Karar Bekleyen Mekanikler

- Kaplumbağanın puzzle sırasında tıklanan hexe gitme davranışı korunacak.
- Bu hareket; tıklanan aktif hex kaynağa bağlandığında ve tüm su çıkışları
  komşularıyla eşleştiğinde tetikleniyor.
- Davranış ileride doğru bağlantı kurma ödülü olarak kullanılacak.
- Ödülün görsel geri bildirim, ses, seri bonusu veya skor etkisi olmasına daha
  sonra karar verilecek. Şimdilik puan ve yıldız hesabı değişmeyecek.
