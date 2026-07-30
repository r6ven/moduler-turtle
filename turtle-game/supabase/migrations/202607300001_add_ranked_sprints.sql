-- Ranked Sprint v2. Additive only: no existing player or progress rows are changed.
begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.players') is null or to_regclass('public.player_sessions') is null then
    raise exception 'players and player_sessions must exist before ranked sprint migration';
  end if;
end;
$$;

create table if not exists public.ranked_seasons (
  season_id text primary key check (season_id ~ '^[0-9]{4}-[0-9]{2}$'),
  generator_version integer not null check (generator_version > 0),
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.ranked_puzzle_slots (
  season_id text not null references public.ranked_seasons(season_id) on delete restrict,
  play_date date,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  slot smallint not null check (slot between 1 and 5),
  profile_id text not null,
  difficulty_weight smallint not null check (difficulty_weight between 1 and 5),
  seed bigint not null check (seed between 0 and 4294967295),
  puzzle_id text not null unique,
  checksum text not null,
  definition jsonb not null,
  minimum_moves integer not null check (minimum_moves > 0),
  star_tolerance integer not null check (star_tolerance between 0 and 30),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (season_id, day_of_month, slot),
  unique (play_date, slot),
  unique (season_id, day_of_month, slot)
);

create table if not exists public.ranked_sprint_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  username text not null references public.players(username) on delete restrict,
  play_date date not null,
  season_id text not null references public.ranked_seasons(season_id) on delete restrict,
  status text not null default 'claimed' check (status in ('claimed','active','invalid','completed')),
  invalid_reason text,
  claimed_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  total_elapsed_ms bigint,
  total_moves integer,
  unique (username, play_date)
);

create table if not exists public.ranked_puzzle_results (
  attempt_id uuid not null references public.ranked_sprint_attempts(attempt_id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  puzzle_id text not null references public.ranked_puzzle_slots(puzzle_id) on delete restrict,
  checksum text not null,
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  moves integer not null check (moves between 1 and 100000),
  stars smallint not null check (stars between 1 and 3),
  completed_at timestamptz not null default clock_timestamp(),
  rank integer,
  participant_count integer,
  raw_score smallint check (raw_score between 1 and 10),
  weighted_score integer check (weighted_score between 1 and 50),
  finalized_at timestamptz,
  primary key (attempt_id, slot)
);

create table if not exists public.story_level_results_v2 (
  username text not null references public.players(username) on delete restrict,
  level integer not null check (level between 1 and 10000),
  puzzle_id text not null,
  generator_version integer not null default 2 check (generator_version = 2),
  stars smallint not null check (stars between 1 and 3),
  moves integer not null check (moves between 1 and 100000),
  time_seconds integer not null check (time_seconds between 0 and 864000),
  completed_at timestamptz not null default now(),
  primary key (username, level, generator_version)
);

create index if not exists ranked_attempts_date_status_idx on public.ranked_sprint_attempts(play_date, status);
create index if not exists ranked_results_puzzle_idx on public.ranked_puzzle_results(puzzle_id, elapsed_ms, moves);
create index if not exists ranked_story_level_idx on public.story_level_results_v2(level, stars desc, moves, time_seconds);

alter table public.ranked_seasons enable row level security;
alter table public.ranked_puzzle_slots enable row level security;
alter table public.ranked_sprint_attempts enable row level security;
alter table public.ranked_puzzle_results enable row level security;
alter table public.story_level_results_v2 enable row level security;
revoke all on public.ranked_seasons, public.ranked_puzzle_slots, public.ranked_sprint_attempts, public.ranked_puzzle_results, public.story_level_results_v2 from public, anon, authenticated;

create or replace function public.claim_ranked_sprint_attempt(p_session_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_season text := to_char(v_today, 'YYYY-MM');
  v_attempt uuid;
  v_puzzles jsonb;
begin
  v_username := public._player_session_username(p_session_token);
  if v_username is null then return jsonb_build_object('ok', false, 'error', 'Invalid session.'); end if;

  select jsonb_agg(jsonb_build_object(
    'slot', s.slot, 'profile_id', s.profile_id, 'difficulty_weight', s.difficulty_weight,
    'seed', s.seed, 'puzzle_id', s.puzzle_id, 'checksum', s.checksum,
    'minimum_moves', s.minimum_moves, 'generator_version', se.generator_version
  ) order by s.slot)
  into v_puzzles
  from public.ranked_puzzle_slots s
  join public.ranked_seasons se on se.season_id = s.season_id
  where s.play_date = v_today and s.published and se.status = 'published';

  if jsonb_array_length(coalesce(v_puzzles, '[]'::jsonb)) <> 5 then
    return jsonb_build_object('ok', false, 'error', 'Todays ranked series is not published yet.');
  end if;

  select attempt_id into v_attempt
  from public.ranked_sprint_attempts
  where username = v_username and play_date = v_today;

  if found then
    return jsonb_build_object(
      'ok', true, 'ranked', false, 'replay_training_only', true,
      'attempt_id', v_attempt, 'play_date', v_today,
      'season_id', v_season, 'puzzles', v_puzzles
    );
  end if;

  insert into public.ranked_sprint_attempts(username, play_date, season_id)
  values (v_username, v_today, v_season) returning attempt_id into v_attempt;

  return jsonb_build_object('ok', true, 'ranked', true, 'attempt_id', v_attempt, 'play_date', v_today, 'season_id', v_season, 'puzzles', v_puzzles);
exception when unique_violation then
  select attempt_id into v_attempt from public.ranked_sprint_attempts where username=v_username and play_date=v_today;
  return jsonb_build_object('ok', true, 'ranked', false, 'replay_training_only', true, 'attempt_id', v_attempt, 'play_date', v_today, 'season_id', v_season, 'puzzles', v_puzzles);
end;
$$;

create or replace function public.start_ranked_sprint_attempt(p_session_token text, p_attempt_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare v_username text;
begin
  v_username := public._player_session_username(p_session_token);
  update public.ranked_sprint_attempts set status='active', started_at=clock_timestamp()
  where attempt_id=p_attempt_id and username=v_username and status='claimed';
  if not found then return jsonb_build_object('ok', false, 'error', 'Ranked attempt could not start.'); end if;
  return jsonb_build_object('ok', true, 'started_at', clock_timestamp());
end;
$$;

create or replace function public.invalidate_ranked_sprint_attempt(p_session_token text, p_attempt_id uuid, p_reason text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare v_username text;
begin
  v_username := public._player_session_username(p_session_token);
  update public.ranked_sprint_attempts set status='invalid', invalid_reason=left(coalesce(p_reason,'client_invalidated'),80)
  where attempt_id=p_attempt_id and username=v_username and status in ('claimed','active');
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.submit_ranked_puzzle_result(p_session_token text, p_attempt_id uuid, p_slot integer, p_moves integer, p_checksum text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text; v_attempt public.ranked_sprint_attempts%rowtype; v_slot public.ranked_puzzle_slots%rowtype;
  v_previous_at timestamptz; v_now timestamptz := clock_timestamp(); v_elapsed bigint; v_stars smallint; v_count integer;
begin
  v_username := public._player_session_username(p_session_token);
  select * into v_attempt from public.ranked_sprint_attempts where attempt_id=p_attempt_id and username=v_username for update;
  if not found then return jsonb_build_object('ok',false,'error','Attempt not found.'); end if;
  if v_attempt.status not in ('active','invalid') then return jsonb_build_object('ok',false,'error','Attempt is not active.'); end if;
  if p_moves < 1 or p_moves > 100000 then return jsonb_build_object('ok',false,'error','Invalid move count.'); end if;
  select count(*) into v_count from public.ranked_puzzle_results where attempt_id=p_attempt_id;
  if p_slot <> v_count + 1 then return jsonb_build_object('ok',false,'error','Invalid puzzle order.'); end if;
  select * into v_slot from public.ranked_puzzle_slots where play_date=v_attempt.play_date and slot=p_slot;
  if not found or v_slot.checksum <> p_checksum then
    update public.ranked_sprint_attempts set status='invalid',invalid_reason='checksum_mismatch' where attempt_id=p_attempt_id;
    return jsonb_build_object('ok',false,'error','Puzzle version mismatch.');
  end if;
  select coalesce(max(completed_at),v_attempt.started_at) into v_previous_at from public.ranked_puzzle_results where attempt_id=p_attempt_id;
  v_elapsed := greatest(0,(extract(epoch from (v_now-v_previous_at))*1000)::bigint);
  v_stars := case when p_moves <= v_slot.minimum_moves+v_slot.star_tolerance then 3 when p_moves <= v_slot.minimum_moves+v_slot.star_tolerance+greatest(6,ceil(v_slot.minimum_moves*0.25)::integer) then 2 else 1 end;
  insert into public.ranked_puzzle_results(attempt_id,slot,puzzle_id,checksum,elapsed_ms,moves,stars,completed_at)
  values(p_attempt_id,p_slot,v_slot.puzzle_id,p_checksum,v_elapsed,p_moves,v_stars,v_now);
  if p_slot=5 then
    update public.ranked_sprint_attempts set status=case when status='invalid' then 'invalid' else 'completed' end,completed_at=v_now,total_elapsed_ms=(extract(epoch from (v_now-started_at))*1000)::bigint,total_moves=(select sum(moves) from public.ranked_puzzle_results where attempt_id=p_attempt_id) where attempt_id=p_attempt_id;
  end if;
  return jsonb_build_object('ok',true,'valid',v_attempt.status='active','provisional',true,'elapsed_ms',v_elapsed,'stars',v_stars,'sprint_complete',p_slot=5);
end;
$$;

create or replace function public.finalize_ranked_day(p_play_date date)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
begin
  if p_play_date >= (clock_timestamp() at time zone 'UTC')::date then return jsonb_build_object('ok',false,'error','UTC day is not closed.'); end if;
  with ordered as (
    select r.attempt_id,r.slot,s.difficulty_weight,
      rank() over(partition by a.play_date,r.slot order by r.elapsed_ms,r.moves) as place,
      count(*) over(partition by a.play_date,r.slot) as participants
    from public.ranked_puzzle_results r join public.ranked_sprint_attempts a using(attempt_id)
    join public.ranked_puzzle_slots s on s.play_date=a.play_date and s.slot=r.slot
    where a.play_date=p_play_date and a.status='completed'
  ), scored as (
    select *,greatest(1,10-floor(((place-1)*10.0)/greatest(participants,1)))::smallint as score from ordered
  )
  update public.ranked_puzzle_results r set rank=scored.place,participant_count=scored.participants,raw_score=scored.score,weighted_score=scored.score*scored.difficulty_weight,finalized_at=clock_timestamp()
  from scored where r.attempt_id=scored.attempt_id and r.slot=scored.slot;
  return jsonb_build_object('ok',true,'play_date',p_play_date);
end;
$$;

create or replace function public.get_ranked_daily_leaderboard(p_session_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare v_username text; v_today date := (clock_timestamp() at time zone 'UTC')::date; v_records jsonb;
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then return jsonb_build_object('ok',false,'error','Invalid session.'); end if;

  with ordered as (
    select a.username,r.elapsed_ms,r.moves,r.stars,s.difficulty_weight,
      rank() over(partition by r.slot order by r.elapsed_ms,r.moves) as place,
      count(*) over(partition by r.slot) as participants
    from public.ranked_sprint_attempts a
    join public.ranked_puzzle_results r using(attempt_id)
    join public.ranked_puzzle_slots s on s.play_date=a.play_date and s.slot=r.slot
    where a.play_date=v_today and a.status='completed'
  ), provisional_scores as (
    select *,greatest(1,10-floor(((place-1)*10.0)/greatest(participants,1)))::integer as raw_score
    from ordered
  ), totals as (
    select username,sum(raw_score*difficulty_weight) weighted_points,
      sum(elapsed_ms) elapsed_ms,sum(moves) moves,sum(stars) stars,true provisional
    from provisional_scores group by username
  )
  select coalesce(jsonb_agg(to_jsonb(totals) order by weighted_points desc,elapsed_ms,moves),'[]'::jsonb)
  into v_records from totals;

  return jsonb_build_object('ok',true,'records',v_records,'provisional',true);
end;
$$;

create or replace function public.get_ranked_monthly_leaderboard(p_session_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare v_username text; v_season text:=to_char((clock_timestamp() at time zone 'UTC')::date,'YYYY-MM'); v_records jsonb;
begin
  v_username:=public._player_session_username(p_session_token); if v_username is null then return jsonb_build_object('ok',false,'error','Invalid session.'); end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.weighted_points desc,q.elapsed_ms,q.moves),'[]'::jsonb) into v_records from (
    select a.username,sum(r.weighted_score) weighted_points,sum(r.elapsed_ms) elapsed_ms,sum(r.moves) moves,sum(r.stars) stars,count(distinct a.play_date) completed_days
    from public.ranked_sprint_attempts a join public.ranked_puzzle_results r using(attempt_id)
    where a.season_id=v_season and a.status='completed' and r.finalized_at is not null group by a.username
  ) q;
  return jsonb_build_object('ok',true,'season_id',v_season,'records',v_records);
end;
$$;

create or replace function public.save_story_v2_result(p_session_token text,p_level integer,p_puzzle_id text,p_stars integer,p_moves integer,p_time_seconds integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,extensions,public as $$
declare v_username text;
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then return jsonb_build_object('ok',false,'error','Invalid session.'); end if;
  if p_puzzle_id <> 'story-v2-'||p_level or p_level not between 1 and 10000 or p_stars not between 1 and 3 or p_moves not between 1 and 100000 or p_time_seconds not between 0 and 864000 then return jsonb_build_object('ok',false,'error','Invalid story result.'); end if;
  insert into public.story_level_results_v2(username,level,puzzle_id,stars,moves,time_seconds)
  values(v_username,p_level,p_puzzle_id,p_stars,p_moves,p_time_seconds)
  on conflict(username,level,generator_version) do update
  set puzzle_id=excluded.puzzle_id,
      stars=excluded.stars,
      moves=excluded.moves,
      time_seconds=excluded.time_seconds,
      completed_at=now()
  where excluded.stars > story_level_results_v2.stars
     or (excluded.stars = story_level_results_v2.stars and excluded.moves < story_level_results_v2.moves)
     or (excluded.stars = story_level_results_v2.stars and excluded.moves = story_level_results_v2.moves and excluded.time_seconds < story_level_results_v2.time_seconds);
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.get_story_v2_leaderboard()
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  with winners as (
    select distinct on(level) level,username,stars,moves,time_seconds,puzzle_id from public.story_level_results_v2 order by level,stars desc,moves,time_seconds,username
  ) select jsonb_build_object('ok',true,'records',coalesce(jsonb_agg(to_jsonb(winners) order by level),'[]'::jsonb)) from winners;
$$;

revoke all on function public.claim_ranked_sprint_attempt(text),public.start_ranked_sprint_attempt(text,uuid),public.invalidate_ranked_sprint_attempt(text,uuid,text),public.submit_ranked_puzzle_result(text,uuid,integer,integer,text),public.get_ranked_daily_leaderboard(text),public.get_ranked_monthly_leaderboard(text),public.save_story_v2_result(text,integer,text,integer,integer,integer),public.get_story_v2_leaderboard() from public;
grant execute on function public.claim_ranked_sprint_attempt(text),public.start_ranked_sprint_attempt(text,uuid),public.invalidate_ranked_sprint_attempt(text,uuid,text),public.submit_ranked_puzzle_result(text,uuid,integer,integer,text),public.get_ranked_daily_leaderboard(text),public.get_ranked_monthly_leaderboard(text),public.save_story_v2_result(text,integer,text,integer,integer,integer),public.get_story_v2_leaderboard() to anon,authenticated;
revoke all on function public.finalize_ranked_day(date) from public,anon,authenticated;
grant execute on function public.finalize_ranked_day(date) to service_role;
grant all on public.ranked_seasons, public.ranked_puzzle_slots, public.ranked_sprint_attempts, public.ranked_puzzle_results, public.story_level_results_v2 to service_role;

commit;
