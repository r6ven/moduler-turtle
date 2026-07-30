# Codex çalışma defteri

Bu dosya moduler-turtle üzerinde çalışırken sonraki görevlerde bağlamı
korumak için kullandığım kişisel teknik not defteridir. Uygulamanın çalışma
zamanında kullanılmaz.

## Kullanıcıyla çalışma biçimi

- Kullanıcı sonuç odaklı ilerlemek istiyor; istenen değişiklik tamamlanınca
  test, commit ve push adımlarının durumu açıkça belirtilmeli.
- Render dağıtımı klasör yapısına duyarlı. Mevcut `turtle-game` kökü ve public
  dosya yolları korunmalı.
- Aynı hikâye seviyesi ve aynı günlük puzzle bütün cihazlarda aynı bulmaca
  olmalı. Ekrana göre puzzle geometrisi değiştirilmemeli; sadece görsel ölçek
  uyarlanmalı.
- Kalıcı Vite geliştirme sunucusunu araç çağrısında ön planda başlatma. Yerel
  görsel kontrol gerekiyorsa sonlanan build/test komutları veya kullanıcının
  başlattığı sunucu kullanılmalı.
- Kullanıcının mevcut dosya ve ilerlemeleri korunmalı. Supabase değişiklikleri
  geriye uyumlu migration olarak hazırlanmalı; kullanıcı verisini sıfırlayan
  işlem yapılmamalı.

## Mimari yön

- Üç hedef mod var: hikâye, sonsuz ve günlük puzzle.
- Ortak puzzle motoru kullanılacak; ilerleme ve skor alanları modlara göre
  ayrılacak.
- Hikâye modu mevcut doğrusal ilerlemenin devamı olacak fakat içerik üretimine
  en son geniş ölçekte girilecek.
- Öncelik güvenilir puzzle çekirdeği:
  1. Seeded RNG ve bağımsız RNG akışları.
  2. Yapılandırılabilir, geriye uyumlu generator girişi.
  3. Sürümlü `puzzleId`, generator sürümü ve checksum.
  4. DFS işlem bütçesi ve güvenli hata/fallback davranışı.
  5. Determinizm, çözülebilirlik ve performans testleri.
- Günlük puzzle seed + generator sürümüyle tekrar üretilebilmeli. Yayımlanan
  manifest ileride Supabase'de saklanmalı.
- Sonsuz mod için ilk ürün adayı beş puzzle'lık Sprint. Kategori; generator
  sürümü, tahta profili, zorluk ve koşu uzunluğuyla tanımlanmalı.
- Tema, hikâye ve çevresel olaylar generator içine doldurulmamalı. Generator
  yalnızca puzzle tanımı üretmeli; renderer ve mod katmanları diğer verileri
  işlemeli.

## Generator çalışması — 2026-07-29

- Başlangıç durumu: `PuzzleGenerator.generate(level)` doğrudan level'a bağlı.
- `HexMath.shuffled`, loop ekleme ve başlangıç rotasyonları `Math.random()`
  kullanıyor.
- `buildSparsePath` DFS'i 160 deneme yapıyor fakat düğüm ziyaret bütçesi yok;
  yoğun tahtalarda uzun sürebilir.
- `Tile.decorSeed` Date.now ve global sayaç kullandığı için görsel dekor seed'i
  puzzle seed'inden bağımsız.
- İlk uygulama hedefi: eski `generate(level)` çağrılarını bozmadan
  `generate(options)` desteği ve deterministik günlük/sonsuz üretim.

## Sonraki kontrol listesi

- Deterministik seed ile iki üretimin puzzle tanımı ve checksum'ı aynı mı?
- Farklı seed'ler anlamlı ölçüde farklı puzzle üretiyor mu?
- Üretilen bütün temsili profiller sıfır rotasyonda tamamen çözülebiliyor mu?
- Aktif karo sayısı her koşulda istenen sayıya eşit mi?
- DFS bütçesi aşıldığında ana iş parçacığı donmadan açıklayıcı hata/fallback
  oluşuyor mu?
- `npm test` ve `npm run build` başarılı mı?

## Generator ve mod ayrımı sonucu — 2026-07-29

- Ana menü oturum açıldıktan sonra Hikâye, Sonsuz ve Günlük olarak üçe
  ayrıldı. Hikâye varsayılan sekme; mevcut `Devam Et`, `Bölümler`, `Rekorlar`
  ve kayıt sıfırlama akışı bu panelin içinde kaldı.
- Sonsuz ve Günlük sekmeleri şimdilik yalnızca izole hazırlık panelleri.
  Hikâye oyunu başlatan callback'leri çağırmıyor ve `ProgressSystem` verisine
  dokunmuyorlar.
- `PuzzleGenerator.generate(level)` geriye uyumlu kaldı.
- Yeni `generate(options)` girişi `story`, `endless`, `daily`; seed, puzzleId,
  mapRadius, activeTileCount, loop ihtimali ve kilit sayısını destekliyor.
- Günlük mod açık seed olmadan üretim yapmıyor.
- Yol, loop, dekor, rotasyon, landmark ve kilit seçimi için birbirinden
  türetilmiş bağımsız RNG akışları kullanılıyor.
- Üretim çıktısı generator sürümü, seed, checksum, seri hale getirilebilir
  puzzle tanımı ve arama teşhis bilgisi taşıyor.
- DFS arama bütçesi deterministik yeniden denemelere bölündü. 600 seed'lik
  manuel stres kontrolü ve 80 seed'lik kalıcı test hatasız geçti.
- Son doğrulama: 36 test başarılı, Vite production build başarılı.

## Buradan sonraki en güvenli adımlar

1. Sonsuz sekmesine tahta/zorluk profili seçimi ve beş puzzle'lık Sprint
   oturum yöneticisi ekle; kayıtları hikâye ilerlemesinden ayrı tut.
2. Günlük puzzle için UTC tarih + slot + generatorVersion seed üreticisi ve
   istemci tarafı günlük manifest modeli ekle.
3. Supabase tablolarını ancak istemci veri modeli kararlı olduktan sonra,
   mevcut `players` verisini değiştirmeyen ek migration'larla kur.
4. Public leaderboard'dan önce kişisel rekor ve tamamlama akışını bitir.
## Sonsuz Sprint sonucu — 2026-07-30

- `EndlessSprintSession`, Hikâye `ProgressSystem` verisinden tamamen ayrı bir
  çalışma zamanı tutuyor. Beş puzzle, tek run seed, toplam/tekil süre, hamle,
  ipucu, menü ve görünürlük duraklatması destekleniyor.
- Tahta profilleri: compact radius-2/14, classic radius-3/22, dense
  radius-3/30. Cihaza göre geometri değişmiyor; aynı seed ve profil aynı
  puzzle serisini üretiyor.
- Zorluk profilleri: calm, balanced ve expert. Bunlar loop ihtimali, kilitli
  karo sayısı ve yıldız toleransını belirliyor.
- Sonsuz menüsü aktif Sprint sırasında ayarları kilitliyor ve `Sprint'e Dön`
  akışı sunuyor. Hikâyeye bilinçli geçiş yarım Sprint'i sıfırlıyor; hikâye
  kayıtları hiçbir durumda değişmiyor.
- `ModeRecordStore`, tamamlanan Sonsuz Sprint'leri şimdilik bu cihazda
  kullanıcı + tahta + zorluk kategorisi için en iyi sonucu koruyacak şekilde
  saklıyor. Supabase ortak Sonsuz/Günlük leaderboard migration'ı henüz yok.
- Rekor ekranı Hikâye/Sonsuz/Günlük sekmelerine ayrıldı. Hikâye leaderboard'u
  her kullanıcıyı uzun kartlar halinde göstermek yerine her bölümün tek
  kazananını yıldız > hamle > süre sırasıyla seçiyor. Sonsuz her
  tahta/zorluk kategorisinin en iyi Sprint'ini gösteriyor; Günlük veri
  modeline hazır boş durum taşıyor.
- Son doğrulama: 41 test başarılı, Vite production build başarılı.

## Sonraki adım

1. Günlük puzzle için UTC tarih + generatorVersion tabanlı manifest ve beşli
   günlük seri yöneticisi.
2. Sonsuz ve Günlük rekorlarını bütün oyuncular arasında paylaşmak için mevcut
   kullanıcıları silmeyen ek Supabase tabloları/RPC migration'ı.
3. Sprint sonuç ekranına kategori bazlı kişisel en iyi karşılaştırması ve
   paylaşılabilir run kimliği.
## Dereceli Sprint v2 uygulama notu — 2026-07-30

- Hikâye üretimi `story:v2:<level>` seed'i ve `story-v2-<level>` kimliğiyle
  sabitlendi; eski `best_by_level` kişisel ilerleme verisi korunuyor.
- Kilitli karo üretimi bütün modlardan çıkarıldı. Zorluk aktif karo, loop ve
  final minimum-hamle/başlangıç-bağlantı kalite kapısıyla ölçülüyor.
- Sonsuz sekmesi Antrenman ve Dereceli olarak ayrıldı. Dereceli: ortak günlük
  beşli, tek ilk hak ve ipucusuz. Kesinti bütün seriyi değil, yalnızca o anki
  slotu puan dışı bırakır; oyuncu slotu çözer ve sonraki slotlar yeniden puanlıdır.
- Aylık havuz server-only Edge Function tarafından 155 kimlik olarak hazırlanır;
  kısa ayların fazla slotları yayımlanmaz.
- Ranked v2 migration'ları production'a uygulandı; üç Edge Function aktif.
- `RANKED_PUZZLE_SECRET` ve `RANKED_CRON_SECRET` henüz Dashboard'a eklenmediği
  ve sezon üretilmediği için mod güvenli biçimde `series_unavailable` kalır.
- Migration/deploy/cron ayrıntıları Supabase.md içinde; mevcut kullanıcı
  satırlarına dokunulmamalı.
- Günlük Puzzle ana sekmesi hâlâ ayrı iskelet ve bu çalışmanın kapsamı dışında.
## Secure ranked replay contract - 2026-07-30

- Ranked start is atomic and compatibility is checked before the daily attempt
  exists. It returns only the current gameplay/presentation definition.
- The next slot is released only after the Edge verifier accepts the prior
  replay. Releasing the same slot again preserves the original `released_at`.
- Ranked moves are an ordered array of active tile keys; one entry means one
  clockwise 60-degree rotation. Move count is always derived from its length.
- `submit-ranked-replay` verifies gameplay checksum/schema/rules and replays the
  solution with the browser-independent validator before a service-only RPC
  records it in a locked transaction.
- Published seasons and slot definitions are immutable. Gameplay and visual
  presentation have separate checksums so art changes do not alter competition.
- Story leaderboard remains explicitly casual/client-reported. Do not present
  it as server-verified until story replay verification is implemented.
- Production migration and Edge deployment must preserve `players`, progress,
  passwords, and sessions. Never run `fresh_project.sql` in production.

## Ranked interruption contract - 2026-07-30

- Never invalidate a full ranked attempt because of menu, page hide/unload,
  logout, or switching to story/training.
- Mark only the released current slot `score_eligible=false`; keep the attempt
  active and require a verified replay before the next slot can be released.
- Every newly released slot resets score eligibility to true. Leaderboards and
  finalization include only eligible puzzle results, but finishing the daily
  series still requires all five verified solutions.
- Client start/hydration failures preserve the server attempt and its original
  release timestamp so retrying never consumes the daily entitlement or resets
  competition time.
