# Supabase kurulumu

> Durum (30 Temmuz 2026): session ve login rate-limit migration'ları
> production'da uygulanmış ve doğrulanmıştır. Mevcut kullanıcılar, ilerleme
> ve oturumlar korunmaktadır.

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
`main` dalına bağlıdır. 26 Temmuz 2026 kontrolünde `7400239` commit'i `Live`
durumundaydı.

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
4. `turtle-game/supabase/migrations/202607300001_add_ranked_sprints.sql`
   dosyasını çalıştırın.
5. `turtle-game/supabase/migrations/202607300002_remove_legacy_ranked_rpcs.sql`
   dosyasını çalıştırın.
6. `turtle-game/supabase/migrations/202607300003_harden_ranked_rpc_grants.sql`
   dosyasını çalıştırın.
7. Project Settings → API bölümünden URL ve anon/publishable key değerlerini
   alın.
8. Render ortam değişkenlerine `VITE_SUPABASE_URL` ve
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

> Production durumu (30 Temmuz 2026): üç Ranked migration uygulanmıştır ve
> `generate-ranked-season`, `submit-ranked-replay`, `finalize-ranked-day`
> Edge Function'ları `ACTIVE` durumundadır. Oyuncu, oturum ve ilerleme verileri
> korunmuştur. Dereceli modu açmak için yalnız `RANKED_PUZZLE_SECRET` ile
> `RANKED_CRON_SECRET` Supabase Edge Function Secrets bölümüne eklenmeli ve
> ilk sezon üretilmelidir. Sezon bulunmadığı sürece istemci güvenli biçimde
> `series_unavailable` alır.

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

### Uygulama sırası

1. Supabase Database yedeği alın ve oyuncu/oturum sayılarını not edin.
2. SQL Editor'da `202607300001_add_ranked_sprints.sql` dosyasının tamamını
   çalıştırın. `fresh_project.sql` dosyasını production'da çalıştırmayın.
3. Edge Function secret'larını yalnız Supabase tarafına ekleyin:

```bash
supabase secrets set RANKED_PUZZLE_SECRET="uzun-rastgele-bir-deger" RANKED_CRON_SECRET="ayri-uzun-rastgele-bir-deger"
```

Bu değerleri `VITE_*`, Render Environment veya GitHub source içine koymayın.

4. Fonksiyonları deploy edin:

```bash
supabase functions deploy generate-ranked-season --no-verify-jwt
supabase functions deploy submit-ranked-replay --no-verify-jwt
supabase functions deploy finalize-ranked-day --no-verify-jwt
```

5. İlk kurulumda içinde bulunulan ayı bir kere elle üretin:

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/generate-ranked-season" \
  -H "x-cron-secret: RANKED_CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"seasonId":"2026-07"}'
```

6. Supabase Dashboard'da Edge Functions / Cron entegrasyonundan iki UTC görev
   kurun:

- her ayın 25'i 00:15 UTC: `generate-ranked-season` (gelecek ayı üretir);
- her gün 00:10 UTC: `finalize-ranked-day` (kapanan UTC gününü kesinleştirir).

Her aylık manifest 31 x 5 = 155 kimlik saklar. Kısa aylarda fazla günler
`play_date = null` ve `published = false` kalır. Oyuncu RPC'si yalnız bugünün
yayımlanmış ilk slotunu döndürür; sonraki definition yalnız önceki replay Edge
Function tarafından doğrulandıktan sonra açılır. Gelecek seed ve puzzle
tanımları doğrudan anon/authenticated erişimine kapalıdır. Tamamlanmış veya
geçersiz günlük hak tekrar açıldığında beşli seri yalnız derecesiz antrenman
olarak verilir.

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
