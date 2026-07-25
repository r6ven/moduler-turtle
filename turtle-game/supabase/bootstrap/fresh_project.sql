-- FRESH PROJECT ONLY. Do not run this file on the existing production project.
-- It defines the legacy username/password contract expected by the additive
-- player-session migration. Passwords are stored only as bcrypt hashes.

create extension if not exists pgcrypto;

create table public.players (
  username text primary key check (username ~ '^[a-z0-9_.-]{3,32}$'),
  password_hash text not null,
  last_level integer not null default 1 check (last_level between 1 and 10000),
  best_by_level jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;
revoke all on table public.players from anon, authenticated;

create or replace function public.register_player(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_username text := lower(trim(p_username));
begin
  if v_username !~ '^[a-z0-9_.-]{3,32}$' or length(p_password) < 4 then
    return jsonb_build_object('ok', false, 'error', 'Geçersiz kullanıcı bilgileri.');
  end if;

  insert into public.players (username, password_hash)
  values (v_username, crypt(p_password, gen_salt('bf', 12)));

  return jsonb_build_object(
    'ok', true,
    'last_level', 1,
    'best_by_level', '{}'::jsonb
  );
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'Bu kullanıcı adı kullanımda.');
end;
$$;

create or replace function public.login_player(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_player public.players%rowtype;
begin
  select * into v_player
  from public.players
  where username = lower(trim(p_username))
    and password_hash = crypt(p_password, password_hash);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Kullanıcı adı veya şifre hatalı.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'last_level', v_player.last_level,
    'best_by_level', v_player.best_by_level
  );
end;
$$;

create or replace function public.save_player_progress(
  p_username text,
  p_password text,
  p_last_level integer,
  p_best_by_level jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if not exists (
    select 1 from public.players
    where username = lower(trim(p_username))
      and password_hash = crypt(p_password, password_hash)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Kimlik doğrulanamadı.');
  end if;

  update public.players
  set
    last_level = p_last_level,
    best_by_level = p_best_by_level,
    updated_at = now()
  where username = lower(trim(p_username));

  return jsonb_build_object(
    'ok', true,
    'last_level', p_last_level,
    'best_by_level', p_best_by_level
  );
end;
$$;

create or replace function public.reset_player_progress(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if not exists (
    select 1 from public.players
    where username = lower(trim(p_username))
      and password_hash = crypt(p_password, password_hash)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Kimlik doğrulanamadı.');
  end if;

  update public.players
  set last_level = 1, best_by_level = '{}'::jsonb, updated_at = now()
  where username = lower(trim(p_username));

  return jsonb_build_object('ok', true, 'last_level', 1, 'best_by_level', '{}'::jsonb);
end;
$$;

create or replace function public.get_leaderboard()
returns jsonb
language sql
security definer
set search_path = pg_catalog, extensions, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'username', username,
        'last_level', last_level,
        'best_by_level', best_by_level
      ) order by last_level desc, username asc
    ),
    '[]'::jsonb
  )
  from public.players;
$$;

revoke all on function public.register_player(text, text) from public;
revoke all on function public.login_player(text, text) from public;
revoke all on function public.save_player_progress(text, text, integer, jsonb) from public;
revoke all on function public.reset_player_progress(text, text) from public;
revoke all on function public.get_leaderboard() from public;

grant execute on function public.register_player(text, text) to anon, authenticated;
grant execute on function public.login_player(text, text) to anon, authenticated;
grant execute on function public.save_player_progress(text, text, integer, jsonb) to anon, authenticated;
grant execute on function public.reset_player_progress(text, text) to anon, authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;
