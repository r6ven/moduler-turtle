-- Additive migration: preserves every existing public.players row.
-- Requires the existing login_player/register_player RPCs and the
-- username, last_level, best_by_level columns documented by the client.

create extension if not exists pgcrypto;

do $$
declare
  v_insecure_function text;
begin
  if to_regclass('public.players') is null then
    raise exception 'public.players is missing; use supabase/bootstrap/fresh_project.sql first';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'username'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'last_level'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'best_by_level'
      and udt_name = 'jsonb'
  ) then
    raise exception 'public.players must expose username, last_level and jsonb best_by_level columns';
  end if;

  if to_regprocedure('public.login_player(text,text)') is null
    or to_regprocedure('public.register_player(text,text)') is null then
    raise exception 'legacy login_player/register_player RPCs are required for a data-preserving upgrade';
  end if;

  if (
    select count(distinct p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'login_player',
        'register_player',
        'save_player_progress',
        'reset_player_progress',
        'get_leaderboard'
      )
  ) <> 5 then
    raise exception 'all five legacy player RPCs are required before the session migration';
  end if;

  select p.proname into v_insecure_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'login_player',
      'register_player',
      'save_player_progress',
      'reset_player_progress',
      'get_leaderboard'
    )
    and not p.prosecdef
  limit 1;

  if v_insecure_function is not null then
    raise exception 'RPC % must be SECURITY DEFINER before RLS can be enabled safely', v_insecure_function;
  end if;
end;
$$;

alter table public.players enable row level security;
revoke all on table public.players from anon, authenticated;
create table if not exists public.player_sessions (
  session_token_hash text primary key,
  username text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists player_sessions_username_idx
  on public.player_sessions (lower(username));
create index if not exists player_sessions_expiry_idx
  on public.player_sessions (expires_at);

alter table public.player_sessions enable row level security;
revoke all on table public.player_sessions from anon, authenticated;

create or replace function public._safe_progress_metric(
  p_record jsonb,
  p_key text
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_text text;
  v_value bigint;
begin
  v_text := p_record ->> p_key;

  if v_text is null or v_text !~ '^[0-9]{1,10}$' then
    return null;
  end if;

  v_value := v_text::bigint;
  return least(v_value, 2147483647)::integer;
exception when others then
  return null;
end;
$$;

create or replace function public._merge_best_by_level(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb := case
    when jsonb_typeof(p_existing) = 'object' then p_existing
    else '{}'::jsonb
  end;
  v_level text;
  v_new jsonb;
  v_old jsonb;
  v_old_stars integer;
  v_new_stars integer;
  v_old_moves integer;
  v_new_moves integer;
  v_old_time integer;
  v_new_time integer;
begin
  if jsonb_typeof(p_incoming) <> 'object' then
    return v_result;
  end if;

  for v_level, v_new in select * from jsonb_each(p_incoming)
  loop
    if v_level !~ '^[1-9][0-9]{0,3}$' or jsonb_typeof(v_new) <> 'object' then
      continue;
    end if;

    v_old := coalesce(v_result -> v_level, '{}'::jsonb);
    v_old_stars := coalesce(public._safe_progress_metric(v_old, 'stars'), 0);
    v_new_stars := coalesce(public._safe_progress_metric(v_new, 'stars'), 0);
    v_old_moves := public._safe_progress_metric(v_old, 'bestMoves');
    v_new_moves := public._safe_progress_metric(v_new, 'bestMoves');
    v_old_time := public._safe_progress_metric(v_old, 'bestTimeSeconds');
    v_new_time := public._safe_progress_metric(v_new, 'bestTimeSeconds');

    v_result := jsonb_set(
      v_result,
      array[v_level],
      jsonb_build_object(
        'stars', least(3, greatest(v_old_stars, v_new_stars)),
        'bestMoves', case
          when v_old_moves is null then v_new_moves
          when v_new_moves is null then v_old_moves
          else least(v_old_moves, v_new_moves)
        end,
        'bestTimeSeconds', case
          when v_old_time is null then v_new_time
          when v_new_time is null then v_old_time
          else least(v_old_time, v_new_time)
        end
      ),
      true
    );
  end loop;

  return v_result;
end;
$$;

create or replace function public._issue_player_session(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_token text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  delete from public.player_sessions where expires_at <= now();

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.player_sessions (
    session_token_hash,
    username,
    expires_at
  ) values (
    encode(digest(v_token, 'sha256'), 'hex'),
    lower(trim(p_username)),
    v_expires_at
  );

  return jsonb_build_object(
    'session_token', v_token,
    'session_expires_at', v_expires_at
  );
end;
$$;

create or replace function public._player_session_username(p_session_token text)
returns text
language sql
security definer
set search_path = pg_catalog, extensions, public
as $$
  select username
  from public.player_sessions
  where session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    and expires_at > now()
  limit 1;
$$;

create or replace function public.login_player_session(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb;
begin
  v_result := to_jsonb(public.login_player(p_username, p_password));

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    return v_result;
  end if;

  return v_result || public._issue_player_session(p_username);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'Oturum açılamadı.');
end;
$$;

create or replace function public.register_player_session(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb;
begin
  v_result := to_jsonb(public.register_player(p_username, p_password));

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    return v_result;
  end if;

  return v_result || public._issue_player_session(p_username);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'Kayıt oluşturulamadı.');
end;
$$;

create or replace function public.restore_player_session(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_username text;
  v_last_level integer;
  v_best_by_level jsonb;
  v_expires_at timestamptz;
begin
  v_username := public._player_session_username(p_session_token);

  if v_username is null then
    return jsonb_build_object('ok', false, 'error', 'Oturum geçersiz veya süresi dolmuş.');
  end if;

  select p.last_level, p.best_by_level
    into v_last_level, v_best_by_level
  from public.players p
  where lower(p.username) = v_username
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Oyuncu bulunamadı.');
  end if;

  update public.player_sessions
  set last_seen_at = now()
  where session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
  returning expires_at into v_expires_at;

  return jsonb_build_object(
    'ok', true,
    'username', v_username,
    'last_level', coalesce(v_last_level, 1),
    'best_by_level', coalesce(v_best_by_level, '{}'::jsonb),
    'session_expires_at', v_expires_at
  );
end;
$$;

create or replace function public.save_player_progress_session(
  p_session_token text,
  p_last_level integer,
  p_best_by_level jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_username text;
  v_last_level integer;
  v_best_by_level jsonb;
begin
  if p_last_level < 1 or p_last_level > 10000 then
    return jsonb_build_object('ok', false, 'error', 'Geçersiz seviye değeri.');
  end if;

  if jsonb_typeof(p_best_by_level) <> 'object'
    or (select count(*) from jsonb_object_keys(p_best_by_level)) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'Geçersiz ilerleme verisi.');
  end if;

  v_username := public._player_session_username(p_session_token);

  if v_username is null then
    return jsonb_build_object('ok', false, 'error', 'Oturum geçersiz veya süresi dolmuş.');
  end if;

  update public.players p
  set
    last_level = greatest(coalesce(p.last_level, 1), p_last_level),
    best_by_level = public._merge_best_by_level(
      coalesce(p.best_by_level, '{}'::jsonb),
      p_best_by_level
    )
  where lower(p.username) = v_username
  returning p.last_level, p.best_by_level
    into v_last_level, v_best_by_level;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Oyuncu bulunamadı.');
  end if;

  update public.player_sessions
  set last_seen_at = now()
  where session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex');

  return jsonb_build_object(
    'ok', true,
    'last_level', v_last_level,
    'best_by_level', v_best_by_level
  );
end;
$$;

create or replace function public.reset_player_progress_session(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_username text;
begin
  v_username := public._player_session_username(p_session_token);

  if v_username is null then
    return jsonb_build_object('ok', false, 'error', 'Oturum geçersiz veya süresi dolmuş.');
  end if;

  update public.players
  set last_level = 1, best_by_level = '{}'::jsonb
  where lower(username) = v_username;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Oyuncu bulunamadı.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'last_level', 1,
    'best_by_level', '{}'::jsonb
  );
end;
$$;

create or replace function public.logout_player_session(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  delete from public.player_sessions
  where session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex');

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public._safe_progress_metric(jsonb, text) from public, anon, authenticated;
revoke all on function public._merge_best_by_level(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._issue_player_session(text) from public, anon, authenticated;
revoke all on function public._player_session_username(text) from public, anon, authenticated;

revoke all on function public.login_player_session(text, text) from public;
revoke all on function public.register_player_session(text, text) from public;
revoke all on function public.restore_player_session(text) from public;
revoke all on function public.save_player_progress_session(text, integer, jsonb) from public;
revoke all on function public.reset_player_progress_session(text) from public;
revoke all on function public.logout_player_session(text) from public;

grant execute on function public.login_player_session(text, text) to anon, authenticated;
grant execute on function public.register_player_session(text, text) to anon, authenticated;
grant execute on function public.restore_player_session(text) to anon, authenticated;
grant execute on function public.save_player_progress_session(text, integer, jsonb) to anon, authenticated;
grant execute on function public.reset_player_progress_session(text) to anon, authenticated;
grant execute on function public.logout_player_session(text) to anon, authenticated;
