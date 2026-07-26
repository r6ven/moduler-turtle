# Supabase kurulumu

> Durum: Beklemede. Bu dosyadaki Supabase işlemleri şimdilik
> uygulanmayacak; daha sonra yapılacak işler için repo içinde not olarak
> tutulmaktadır.

## Mevcut production projesi

Mevcut kullanıcıları korumak için `turtle-game/supabase/bootstrap/fresh_project.sql` dosyasını production üzerinde çalıştırmayın. Bu dosya yalnızca boş bir Supabase projesi içindir.

1. Supabase Dashboard → SQL Editor bölümünü açın.
2. Güvenlik için önce `public.players` tablosunun yedeğini alın.
3. Aşağıdaki kontrolleri çalıştırıp kullanıcı sayısını not edin:

```sql
select count(*) as player_count from public.players;
select proname from pg_proc where proname in (
  'register_player',
  'login_player',
  'save_player_progress',
  'reset_player_progress',
  'get_leaderboard'
);
```

4. `turtle-game/supabase/migrations/202607260001_add_player_sessions.sql` dosyasının tamamını SQL Editor'da çalıştırın.
5. Kullanıcı sayısının değişmediğini doğrulayın:

```sql
select count(*) as player_count from public.players;
select count(*) as active_sessions from public.player_sessions;
```

Migration `public.players` tablosunda `DELETE`, `TRUNCATE` veya kolon dönüşümü yapmaz. Mevcut hesaplar, şifre hashleri ve ilerleme JSON'ları yerinde kalır. Yeni `player_sessions` tablosu yalnızca süreli oturum belirteçlerini SHA-256 özeti halinde saklar.

Frontend migration uygulanmadan da eski RPC'lere geri dönerek çalışır. Güvenlik iyileştirmesinin aktif olması için migration uygulanmalıdır. Migration sonrasında ilk normal girişte parola yalnızca giriş RPC'sine gider; başarılı girişten sonra bellekte parola yerine 30 günlük rastgele oturum belirteci tutulur. Eski cihaz oturumu kullanan izinli kullanıcı ilk başarılı yenilemede otomatik olarak token formatına yükseltilir.

## Yeni/boş Supabase projesi

1. `turtle-game/supabase/bootstrap/fresh_project.sql` dosyasını çalıştırın.
2. Ardından `turtle-game/supabase/migrations/202607260001_add_player_sessions.sql` dosyasını çalıştırın.
3. Project Settings → API bölümünden URL ve anon/publishable key değerlerini alın.
4. Render ortam değişkenlerine şunları ekleyin:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Yerel geliştirme için `turtle-game/.env.example` dosyasını `.env` olarak kopyalayıp değerleri doldurun. Anon key gizli servis anahtarı değildir; güvenlik RLS, tablo grant'leri ve dar yetkili `security definer` RPC'leriyle sağlanır. `service_role` anahtarını hiçbir zaman frontend ortamına eklemeyin.

## Geri alma

Frontend geriye uyumlu olduğu için acil durumda yeni session RPC'lerini kullanmadan eski akışa dönebilir. Migration'ı geri almak gerekirse önce uygulamayı eski RPC moduna alın; daha sonra yalnızca `player_sessions` tablosu ve `*_session` fonksiyonları kaldırılabilir. `public.players` tablosuna dokunmayın.
