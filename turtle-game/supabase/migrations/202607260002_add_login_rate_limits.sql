-- Additive brute-force protection for the custom player-session RPCs.
-- Preserves every public.players row and all existing player_sessions.
--
-- Policy:
-- - Allow five login attempts per normalized username in a 15-minute window.
-- - Block the sixth and later attempts for 15 minutes.
-- - Clear the counter immediately after a successful login.
-- - Revoke direct anon/authenticated access to legacy password RPCs so the
--   protected session endpoint cannot be bypassed.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.players') is null
    or to_regclass('public.player_sessions') is null then
    raise exception 'player session migration must be installed first';
  end if;

  if to_regprocedure('public.login_player(text,text)') is null
    or to_regprocedure('public.register_player(text,text)') is null
    or to_regprocedure(
      'public.save_player_progress(text,text,integer,jsonb)'
    ) is null
    or to_regprocedure('public.reset_player_progress(text,text)') is null then
    raise exception 'legacy player RPCs are required for the protected wrappers';
  end if;

  if to_regprocedure('public.login_player_session(text,text)') is null
    or to_regprocedure('public.register_player_session(text,text)') is null
    or to_regprocedure('public.restore_player_session(text)') is null
    or to_regprocedure(
      'public.save_player_progress_session(text,integer,jsonb)'
    ) is null
    or to_regprocedure('public.reset_player_progress_session(text)') is null
    or to_regprocedure('public.logout_player_session(text)') is null then
    raise exception 'all player session RPCs must be installed first';
  end if;
end;
$$;

create table if not exists public.player_login_attempts (
  attempt_key text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1
    check (attempt_count between 1 and 1000000),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists player_login_attempts_updated_idx
  on public.player_login_attempts (updated_at);

alter table public.player_login_attempts enable row level security;
revoke all on table public.player_login_attempts
  from public, anon, authenticated;

create or replace function public._consume_player_login_attempt(
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_attempt_key text;
  v_now timestamptz := clock_timestamp();
  v_attempt_count integer;
  v_locked_until timestamptz;
  v_retry_after integer;
begin
  v_attempt_key := encode(
    digest(lower(trim(coalesce(p_username, ''))), 'sha256'),
    'hex'
  );

  delete from public.player_login_attempts
  where updated_at < v_now - interval '1 day';

  insert into public.player_login_attempts as attempts (
    attempt_key,
    window_started_at,
    attempt_count,
    locked_until,
    updated_at
  )
  values (
    v_attempt_key,
    v_now,
    1,
    null,
    v_now
  )
  on conflict (attempt_key) do update
  set
    window_started_at = case
      when attempts.window_started_at <= v_now - interval '15 minutes'
        and coalesce(attempts.locked_until, '-infinity'::timestamptz) <= v_now
        then v_now
      else attempts.window_started_at
    end,
    attempt_count = case
      when attempts.window_started_at <= v_now - interval '15 minutes'
        and coalesce(attempts.locked_until, '-infinity'::timestamptz) <= v_now
        then 1
      else least(attempts.attempt_count + 1, 1000000)
    end,
    locked_until = case
      when attempts.locked_until > v_now then attempts.locked_until
      when attempts.window_started_at <= v_now - interval '15 minutes'
        then null
      when attempts.attempt_count + 1 > 5
        then v_now + interval '15 minutes'
      else null
    end,
    updated_at = v_now
  returning attempt_count, locked_until
    into v_attempt_count, v_locked_until;

  if v_locked_until > v_now then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_locked_until - v_now)))::integer
    );

    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining_attempts', greatest(0, 5 - v_attempt_count)
  );
end;
$$;

create or replace function public._clear_player_login_attempts(
  p_username text
)
returns void
language sql
security definer
set search_path = pg_catalog, extensions, public
as $$
  delete from public.player_login_attempts
  where attempt_key = encode(
    digest(lower(trim(coalesce(p_username, ''))), 'sha256'),
    'hex'
  );
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
  v_limit jsonb;
  v_result jsonb;
  v_retry_after integer;
begin
  v_limit := public._consume_player_login_attempt(p_username);

  if coalesce((v_limit ->> 'allowed')::boolean, false) is not true then
    v_retry_after := coalesce(
      (v_limit ->> 'retry_after_seconds')::integer,
      900
    );

    return jsonb_build_object(
      'ok', false,
      'error', format(
        'Çok fazla giriş denemesi. %s saniye sonra tekrar deneyin.',
        v_retry_after
      ),
      'retry_after_seconds', v_retry_after
    );
  end if;

  v_result := to_jsonb(public.login_player(p_username, p_password));

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    return v_result;
  end if;

  perform public._clear_player_login_attempts(p_username);

  return v_result || public._issue_player_session(p_username);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'Oturum açılamadı.');
end;
$$;

revoke all on function public._consume_player_login_attempt(text)
  from public, anon, authenticated;
revoke all on function public._clear_player_login_attempts(text)
  from public, anon, authenticated;

revoke all on function public.login_player(text, text)
  from public, anon, authenticated;
revoke all on function public.register_player(text, text)
  from public, anon, authenticated;
revoke all on function public.save_player_progress(
  text,
  text,
  integer,
  jsonb
) from public, anon, authenticated;
revoke all on function public.reset_player_progress(text, text)
  from public, anon, authenticated;

revoke all on function public.login_player_session(text, text)
  from public, anon, authenticated;
grant execute on function public.login_player_session(text, text)
  to anon, authenticated;

commit;
