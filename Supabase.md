# Supabase kurulumu

> Durum (1 Eylül 2026): session, login rate-limit ve Ranked Sprint v2
> production'da aktiftir. `2026-09` sezonu 155 saklanan / 150 yayımlanan
> slotla oluşturulmuştur. İki UTC cron görevi çalışır; mevcut kullanıcılar,
> ilerleme ve oturumlar korunmaktadır.

## Production durumu

Production projesinde aşağıdaki veri-korumalı migration uygulanmıştır:

```text
turtle-game/supabase/migrations/202607260001_add_player_sessions.sql
```

Doğrudan doğrulanan bileşenler:

- `public.player_sessions`
- `login_player_session(text, text)`
- `save_player_progress_session(text, integer, jsonb)`

Aynı migration ayrıca kayıt, oturum yenileme, ilerleme sıfırlama ve çıkış için
ilgili `*_session` RPC'lerini kurar. Aşağıdaki doğrulama sorgusu altı dış RPC'nin
tamamını gerektiğinde yeniden kontrol eder.

Mevcut bir kullanıcıyla çıkış ve yeniden giriş başarıyla test edildi. Ardından
`public.player_sessions` tablosunda `active_sessions = 1` görüldü. Bu sonuç,
frontend'in eski parola fallback'i yerine token tabanlı session akışını
kullandığını doğrular. Aktif session sayısının kullanıcı çıkış yaptığında veya
token süresi dolduğunda yeniden sıfıra düşmesi normaldir.

Migration'ı tekrar çalıştırmaya gerek yoktur. Mevcut kullanıcıları korumak için
`turtle-game/supabase/bootstrap/fresh_project.sql` dosyasını production üzerinde
çalıştırmayın. Bu dosya yalnızca yeni ve boş Supabase projeleri içindir.

## Login rate-limit / brute-force koruması

Aşağıdaki ikinci additive migration production Supabase projesine uygulanmıştır:

```text
turtle-game/supabase/migrations/202607260002_add_login_rate_limits.sql
```

Bu migration:

- kullanıcı adı başına 15 dakikada beş giriş denemesine izin verir;
- altıncı ve sonraki denemeleri 15 dakika engeller;
- başarılı girişten sonra sayacı temizler;
- kullanıcı adını açık metin yerine SHA-256 özet anahtarıyla takip eder;
- eski parola RPC'lerinin `anon` ve `authenticated` tarafından doğrudan
  çağrılmasını engelleyerek rate-limit bypass'ını kapatır;
- `public.players` veya mevcut `player_sessions` satırlarını silmez.

Migration bir transaction içinde çalışır; ön kontroller başarısız olursa hiçbir
kısmi yetki değişikliği uygulanmaz. Uygulamadan önce yine de `public.players`
yedeği alın ve kullanıcı sayısını not edin. Bu koruma kullanıcı-adı bazlıdır;
IP tabanlı global bot koruması veya CAPTCHA istenirse özel auth RPC'lerinin bir
Edge Function/Turnstile katmanının arkasına taşınması gerekir.

### Gelecekte yapılacaklar

- IP bazlı rate-limit ekleyin. İstemci IP'si güvenilir biçimde yalnızca sunucu
  katmanında okunacağı için login çağrısını bir Supabase Edge Function üzerinden
  geçirin ve kullanıcı-adı limitine ek olarak IP başına pencere/engel uygulayın.
- Edge Function devreye alınırken Turnstile/CAPTCHA doğrulamasını ekleyin ve
  istemcinin Postgres login RPC'sini doğrudan çağırmasını kapatın.

Rate-limit migration sonrasında yetki sınırını doğrulamak için:

```sql
select
  to_regclass('public.player_login_attempts') as attempts_table,
  has_function_privilege(
    'anon',
    'public.login_player(text,text)',
    'execute'
  ) as legacy_login_exposed,
  has_function_privilege(
    'anon',
    'public.login_player_session(text,text)',
    'execute'
  ) as protected_login_exposed;
```

Beklenen sonuç: `attempts_table` dolu, `legacy_login_exposed = false` ve
`protected_login_exposed = true`.

## Production doğrulama sorguları

Session altyapısını tekrar kontrol etmek için:

```sql
select
  to_regclass('public.player_sessions') as sessions_table,
  to_regprocedure(
    'public.login_player_session(text,text)'
  ) as login_rpc,
  to_regprocedure(
    'public.save_player_progress_session(text,integer,jsonb)'
  ) as save_rpc;
```

Tüm dış session RPC'lerini listelemek için:

```sql
select proname
from pg_proc
where proname in (
  'login_player_session',
  'register_player_session',
  'restore_player_session',
  'save_player_progress_session',
  'reset_player_progress_session',
  'logout_player_session'
)
order by proname;
```

Normal bir girişten sonra aktif session kontrolü:

```sql
select
  count(*) as active_sessions,
  max(created_at) as latest_session,
  max(last_seen_at) as latest_activity
from public.player_sessions
where expires_at > now();
```

Migration `public.players` tablosunda `DELETE`, `TRUNCATE` veya kolon dönüşümü
yapmaz. Mevcut hesaplar, şifre hashleri ve ilerleme JSON'ları yerinde kalır.
`player_sessions` yalnızca süreli oturum belirteçlerinin SHA-256 özetini saklar.

## Render yapılandırması

Production Render Static Site doğru şekilde `r6ven/moduler-turtle` reposunun
`main` dalına bağlıdır. 1 Eylül 2026 kontrolünde servis `Live` durumundadır ve
automatik deploy açıktır.

Render servisinde şu anda özel environment variable tanımlı değildir:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Uygulama yine de `turtle-game/src/config.js` içindeki production Supabase fallback
değerleriyle çalışır. Bu nedenle Render değişkenlerinin boş olması giriş,
ilerleme kaydı veya session RPC'lerini engellemez.

Taşınabilirlik ve yapılandırmayı kaynak koddan ayırmak için bu iki değişkenin
Render → Environment bölümüne eklenmesi önerilir ancak mevcut production için
zorunlu değildir. Eklenirse Vite değerleri build sırasında kullandığı için
**Save, rebuild, and deploy** seçilmelidir. Frontend'e hiçbir zaman
`service_role` anahtarı eklenmemelidir.

## Yeni/boş Supabase projesi

1. `turtle-game/supabase/bootstrap/fresh_project.sql` dosyasını çalıştırın.
2. Ardından `turtle-game/supabase/migrations/202607260001_add_player_sessions.sql`
   dosyasını çalıştırın.
3. `turtle-game/supabase/migrations/202607260002_add_login_rate_limits.sql`
   dosyasını çalıştırın.
4. `202607300001` ile başlayan Ranked migration'ları dosya sırasıyla
   `202607300007_recover_ranked_start_failures.sql` dahil çalıştırın.
5. `20260901111648_automate_ranked_operations.sql` içindeki proje URL'sini
   hedef projeye göre değiştirip migration'ı çalıştırın.
6. Project Settings → API bölümünden URL ve anon/publishable key değerlerini
   alın.
7. Render ortam değişkenlerine `VITE_SUPABASE_URL` ve
   `VITE_SUPABASE_ANON_KEY` değerlerini ekleyin.

Yerel geliştirme için `turtle-game/.env.example` dosyasını `.env` olarak
kopyalayıp değerleri doldurun. Anon/publishable key gizli servis anahtarı
değildir; güvenlik RLS, tablo grant'leri ve dar yetkili `security definer`
RPC'leriyle sağlanır.

## Geri alma

Frontend geriye uyumludur ve acil durumda eski RPC akışına dönebilir. Migration'ı
geri almak gerekirse önce uygulamayı eski RPC moduna alın; daha sonra yalnızca
`player_sessions` tablosu ile `*_session` fonksiyonları kaldırılabilir.
`public.players` tablosuna dokunmayın.

## Dereceli Sprint v2 güvenli slot/replay akışı

> Production durumu (1 Eylül 2026): üç Ranked Edge Function aktiftir.
> `2026-09` sezonu yayımlanmıştır. Sunucu sırları Supabase Vault'ta tutulur;
> `pg_cron` + `pg_net` gelecek sezon üretimini ve önceki gün
> finalizasyonunu otomatik çalıştırır.

Aşağıdaki migration **additive** yapıdadır; mevcut `public.players`, ilerleme
JSON'ları, parolalar ve oturumlar silinmez veya sıfırlanmaz:

```text
turtle-game/supabase/migrations/202607300001_add_ranked_sprints.sql
```

Migration şunları ekler:

- sürümlü gameplay/presentation definition içeren aylık, değiştirilemez puzzle
  havuzu;
- oyuncu/gün başına tek ilk dereceli deneme kısıtı;
- istemci uyumluluğunu günlük hakkı tüketmeden kontrol eden atomik başlangıç;
- yalnız mevcut slotu açan idempotent release ve `released_at` tabanlı sunucu
  süresi;
- hamle replay'ini saf doğrulayıcıyla yeniden oynatan `submit-ranked-replay`
  Edge Function'ı;
- yalnız `service_role` tarafından çağrılabilen replay-context ve atomik kabul
  RPC'leri;
- şüpheli fakat geçerli sonuçları otomatik silmek yerine `review_required`
  olarak işaretleyen risk sinyalleri;
- UTC gün sonu yüzdelik puan kesinleştirmesi;
- günlük ve aylık dereceli leaderboard RPC'leri;
- eski rastgele hikâye kayıtlarına dokunmadan ayrı `story_level_results_v2`
  casual/istemci bildirimli hikâye leaderboard'u.

### Production operasyonu

Uygulanan otomasyon migration'ı:

```text
turtle-game/supabase/migrations/20260901111648_automate_ranked_operations.sql
```

Bu migration:

- `pg_net` ve `pg_cron` eklentilerini etkinleştirir;
- `ranked_cron_secret`, `ranked_puzzle_secret` ve
  `ranked_project_url` değerlerini Supabase Vault'ta oluşturur;
- yapılandırmayı yalnız `service_role` rolüne açan
  `get_ranked_server_config()` RPC'sini kurar;
- her gün 00:10 UTC'de önceki günü finalize eder;
- her ayın 25'i 00:15 UTC'de gelecek sezonu üretir.

Edge Function'lar kaynakta sabitlenmiş `@supabase/supabase-js@2.110.8`
sürümünü kullanır. GitHub Actions üç fonksiyonu birlikte deploy eder ve
Supabase CLI `2.116.0` sürümüne sabitlenmiştir. Vault değerlerini `VITE_*`,
Render Environment veya GitHub source içine koymayın.

Yeni bir Supabase projesine taşırken migration içindeki proje URL'sini hedef
proje URL'siyle değiştirin. Var olan Vault secret isimlerini koruyun; migration
mevcut isimleri yeniden üretmez.

Mevcut production projesinde `pg_net` daha önce `public` şemasına kurulmuştur.
`extensions` şemasına taşıma, eklentiyi drop/recreate etmeyi ve kısa süreli cron
HTTP kesintisini gerektirdiği için bakım penceresine ertelenmiştir. Bu işlem oyun
verilerine dokunmaz; ancak bekleyen ve geçmiş `pg_net` HTTP kayıtlarını silebilir.
Repo migration'ı yeni kurulumlarda doğrudan `extensions` şemasını kullanır.

### Doğrulama sorgusu

```sql
select count(*) as players_after from public.players;
select season_id, count(*) as stored_slots,
       count(*) filter (where published) as published_slots
from public.ranked_puzzle_slots
group by season_id
order by season_id desc;

select
  has_table_privilege('anon','public.ranked_puzzle_slots','select') as anon_can_read_future,
  to_regprocedure(
    'public.start_ranked_attempt(text,integer[],text[])'
  ) as atomic_start_rpc,
  has_function_privilege(
    'anon',
    'public.get_ranked_replay_context(text,uuid,integer)',
    'execute'
  ) as anon_can_read_replay_context,
  has_function_privilege(
    'anon',
    'public.accept_ranked_replay(text,uuid,integer,uuid,jsonb,integer,text)',
    'execute'
  ) as anon_can_accept_replay,
  to_regprocedure('public.finalize_ranked_day(date)') as finalize_rpc;
```

Beklenen: kullanıcı sayısı değişmemiş, sezon başına `stored_slots = 155` ve
`anon_can_read_future = false`, `anon_can_read_replay_context = false` ve
`anon_can_accept_replay = false`. Temmuzda 155, 30 günlük ayda 150, normal
şubatta 140 puzzle yayımlanır. Migration dosyası BOM içermeyen UTF-8 olarak
saklanır; SQL Editor'a yapıştırırken dosyanın en başında görünmez karakter
olmamalıdır.

### Puan modeli

- Puzzle sırası: sunucu ölçümlü süre, sonra hamle.
- Eşit süre+hamle eşit sıra ve puan alır.
- UTC gün kapanınca ilk yüzde 10 = 10, sonraki dilim = 9, son dilim = 1.
- Beş zorluk ağırlığı: 1, 2, 2, 3, 5; günlük tavan 130 puan.
- Gün içi sonuçlar geçicidir; aylık tablo yalnız kesinleşmiş puanları toplar.
- Aylık eşitlik: toplam puan, toplam süre, toplam hamle.
- Yıldızlar ayrıca saklanır ve puana eklenmez.
