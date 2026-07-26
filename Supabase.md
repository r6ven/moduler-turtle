# Supabase kurulumu

> Durum: Production session migration uygulandı ve doğrulandı.
> `public.player_sessions` tablosu ile token tabanlı RPC'ler production
> projesinde mevcut. 26 Temmuz 2026 tarihli kontrolde normal girişten sonra
> bir aktif session kaydı oluştuğu görüldü.

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
3. Project Settings → API bölümünden URL ve anon/publishable key değerlerini
   alın.
4. Render ortam değişkenlerine `VITE_SUPABASE_URL` ve
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
