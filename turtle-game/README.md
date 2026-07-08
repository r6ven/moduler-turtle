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
