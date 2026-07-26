# Supabase kurulumu

> Durum: Production session migration uygulandı ve doğrulandı.
> `public.player_sessions` tablosu ile token tabanlı RPC'ler production
> projesinde mevcut. 26 Temmuz 2026 tarihli kontrolde normal girişten sonra
> bir aktif session kaydı oluştuğu görüldü. Login rate-limit migration'ı repo
> içinde hazırdır; production'a uygulanması beklenmektedir.

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

Aşağıdaki ikinci additive migration repo içinde hazırdır ancak production
Supabase projesinde ayrıca çalıştırılmalıdır:

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
4. Project Settings → API bölümünden URL ve anon/publishable key değerlerini
   alın.
5. Render ortam değişkenlerine `VITE_SUPABASE_URL` ve
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
