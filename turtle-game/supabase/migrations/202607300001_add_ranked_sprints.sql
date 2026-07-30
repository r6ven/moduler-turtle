-- Secure Ranked Sprint v2. Additive only: existing players and progress are untouched.
begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.players') is null
     or to_regclass('public.player_sessions') is null then
    raise exception 'players and player_sessions must exist before ranked sprint migration';
  end if;
end;
$$;

-- The first private Ranked prototype used a different table contract
-- (checksum/definition and claim/start RPCs). Production never published a
-- season on that contract, but those empty tables may still exist. Upgrade
-- them only when they are positively identified and contain no player data.
-- If any Ranked data exists, abort instead of silently discarding it.
do $$
declare
  v_legacy boolean;
  v_rows bigint;
begin
  select
    to_regclass('public.ranked_puzzle_slots') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ranked_puzzle_slots'
        and column_name = 'checksum'
    )
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ranked_puzzle_slots'
        and column_name = 'gameplay_checksum'
    )
  into v_legacy;

  if not v_legacy then
    return;
  end if;

  execute '
    select
      (select count(*) from public.ranked_seasons)
      + (select count(*) from public.ranked_puzzle_slots)
      + (select count(*) from public.ranked_sprint_attempts)
      + (select count(*) from public.ranked_puzzle_results)
  ' into v_rows;

  if v_rows <> 0 then
    raise exception
      'Legacy Ranked schema contains % rows; refusing automatic replacement',
      v_rows;
  end if;

  drop table public.ranked_puzzle_results cascade;
  drop table public.ranked_sprint_attempts cascade;
  drop table public.ranked_puzzle_slots cascade;
  drop table public.ranked_seasons cascade;
end;
$$;

create table if not exists public.ranked_seasons (
  season_id text primary key check (season_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  generator_version integer not null check (generator_version > 0),
  definition_schema_version integer not null check (definition_schema_version > 0),
  rules_version text not null,
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
  generator_version integer not null check (generator_version > 0),
  definition_schema_version integer not null check (definition_schema_version > 0),
  rules_version text not null,
  gameplay_checksum text not null,
  presentation_checksum text not null,
  gameplay_definition jsonb not null,
  presentation_definition jsonb not null,
  minimum_moves integer not null check (minimum_moves > 0),
  star_tolerance integer not null check (star_tolerance between 0 and 30),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (season_id, day_of_month, slot),
  unique (play_date, slot)
);

create table if not exists public.ranked_sprint_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  username text not null references public.players(username) on delete restrict,
  play_date date not null,
  season_id text not null references public.ranked_seasons(season_id) on delete restrict,
  status text not null default 'active' check (status in ('active','invalid','completed')),
  invalid_reason text,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  current_slot smallint not null default 1 check (current_slot between 1 and 5),
  current_released_at timestamptz,
  next_slot_ready boolean not null default false,
  total_elapsed_ms bigint,
  total_moves integer,
  review_status text not null default 'clear' check (review_status in ('clear','review_required','reviewed')),
  risk_signals jsonb not null default '[]'::jsonb,
  unique (username, play_date)
);

create table if not exists public.ranked_puzzle_results (
  attempt_id uuid not null references public.ranked_sprint_attempts(attempt_id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  submission_id uuid not null,
  puzzle_id text not null references public.ranked_puzzle_slots(puzzle_id) on delete restrict,
  gameplay_checksum text not null,
  replay jsonb not null check (jsonb_typeof(replay) = 'array'),
  move_count integer not null check (move_count between 1 and 2000),
  final_state_hash text not null,
  released_at timestamptz not null,
  completed_at timestamptz not null default clock_timestamp(),
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  stars smallint not null check (stars between 1 and 3),
  review_status text not null default 'clear' check (review_status in ('clear','review_required','reviewed')),
  risk_signals jsonb not null default '[]'::jsonb,
  rank integer,
  participant_count integer,
  raw_score smallint check (raw_score between 1 and 10),
  weighted_score integer check (weighted_score between 1 and 50),
  finalized_at timestamptz,
  primary key (attempt_id, slot),
  unique (attempt_id, submission_id)
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

create index if not exists ranked_attempts_date_status_idx
  on public.ranked_sprint_attempts(play_date, status);
create index if not exists ranked_attempts_season_idx
  on public.ranked_sprint_attempts(season_id);
create index if not exists ranked_results_puzzle_idx
  on public.ranked_puzzle_results(puzzle_id, elapsed_ms, move_count);
create index if not exists ranked_story_level_idx
  on public.story_level_results_v2(level, stars desc, moves, time_seconds);

alter table public.ranked_seasons enable row level security;
alter table public.ranked_puzzle_slots enable row level security;
alter table public.ranked_sprint_attempts enable row level security;
alter table public.ranked_puzzle_results enable row level security;
alter table public.story_level_results_v2 enable row level security;

revoke all on public.ranked_seasons, public.ranked_puzzle_slots,
  public.ranked_sprint_attempts, public.ranked_puzzle_results,
  public.story_level_results_v2 from public, anon, authenticated;

create or replace function public._ranked_slot_payload(
  p_slot public.ranked_puzzle_slots,
  p_released_at timestamptz default null
)
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'slot', p_slot.slot,
    'profile_id', p_slot.profile_id,
    'difficulty_weight', p_slot.difficulty_weight,
    'puzzle_id', p_slot.puzzle_id,
    'generator_version', p_slot.generator_version,
    'schema_version', p_slot.definition_schema_version,
    'rules_version', p_slot.rules_version,
    'gameplay_checksum', p_slot.gameplay_checksum,
    'presentation_checksum', p_slot.presentation_checksum,
    'gameplay_definition', p_slot.gameplay_definition,
    'presentation_definition', p_slot.presentation_definition,
    'minimum_moves', p_slot.minimum_moves,
    'star_tolerance', p_slot.star_tolerance,
    'released_at', p_released_at
  );
$$;

create or replace function public._protect_ranked_season()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.status in ('published','closed') and (
    new.generator_version is distinct from old.generator_version
    or new.definition_schema_version is distinct from old.definition_schema_version
    or new.rules_version is distinct from old.rules_version
    or new.status = 'draft'
    or (old.status='closed' and new.status<>'closed')
  ) then
    raise exception 'Published ranked seasons are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ranked_season on public.ranked_seasons;
create trigger protect_ranked_season
before update on public.ranked_seasons
for each row execute function public._protect_ranked_season();

create or replace function public._protect_ranked_slot()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_status text;
begin
  select status into v_status
  from public.ranked_seasons
  where season_id = case
    when tg_op='DELETE' then old.season_id
    else new.season_id
  end;

  if v_status in ('published','closed') then
    raise exception 'Published ranked puzzle definitions are immutable';
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ranked_slot on public.ranked_puzzle_slots;
create trigger protect_ranked_slot
before insert or update or delete on public.ranked_puzzle_slots
for each row execute function public._protect_ranked_slot();

create or replace function public.start_ranked_attempt(
  p_session_token text,
  p_supported_definition_schemas integer[],
  p_supported_game_rules text[]
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_season text := to_char(v_today, 'YYYY-MM');
  v_season_row public.ranked_seasons%rowtype;
  v_attempt public.ranked_sprint_attempts%rowtype;
  v_slot public.ranked_puzzle_slots%rowtype;
  v_puzzles jsonb;
  v_results jsonb;
  v_now timestamptz := clock_timestamp();
begin
  v_username := public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object('ok',false,'code','invalid_session','error','Invalid session.');
  end if;

  select * into v_season_row from public.ranked_seasons
  where season_id=v_season and status='published';
  if not found then
    return jsonb_build_object('ok',false,'code','series_unavailable','error','Todays ranked series is not published yet.');
  end if;

  if not (v_season_row.definition_schema_version = any(coalesce(p_supported_definition_schemas,'{}'::integer[])))
     or not (v_season_row.rules_version = any(coalesce(p_supported_game_rules,'{}'::text[]))) then
    return jsonb_build_object('ok',false,'code','client_update_required','error','Client update required.');
  end if;

  select * into v_attempt from public.ranked_sprint_attempts
  where username=v_username and play_date=v_today
  for update;

  if found and v_attempt.status in ('invalid','completed') then
    select jsonb_agg(public._ranked_slot_payload(s,null) order by s.slot)
    into v_puzzles from public.ranked_puzzle_slots s
    where s.play_date=v_today and s.published;
    return jsonb_build_object(
      'ok',true,'ranked',false,'replay_training_only',true,
      'attempt_id',v_attempt.attempt_id,'play_date',v_today,
      'season_id',v_season,'puzzles',coalesce(v_puzzles,'[]'::jsonb)
    );
  end if;

  if not found then
    insert into public.ranked_sprint_attempts(
      username,play_date,season_id,status,started_at,current_slot,
      current_released_at,next_slot_ready
    ) values (
      v_username,v_today,v_season,'active',v_now,1,v_now,false
    )
    on conflict(username,play_date) do nothing
    returning * into v_attempt;

    if not found then
      select * into v_attempt from public.ranked_sprint_attempts
      where username=v_username and play_date=v_today for update;
    end if;
  elsif v_attempt.current_released_at is null then
    update public.ranked_sprint_attempts
    set current_released_at=v_now,next_slot_ready=false
    where attempt_id=v_attempt.attempt_id
    returning * into v_attempt;
  end if;

  select * into v_slot from public.ranked_puzzle_slots
  where play_date=v_today and slot=v_attempt.current_slot and published;
  if not found then
    return jsonb_build_object('ok',false,'code','slot_unavailable','error','Current ranked slot is unavailable.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'mode','ranked','ranked',true,'slot',r.slot,
    'moves',r.move_count,'elapsed_ms',r.elapsed_ms,'stars',r.stars,
    'puzzle_id',r.puzzle_id,'final_state_hash',r.final_state_hash,
    'review_status',r.review_status,'risk_signals',r.risk_signals,
    'provisional',r.finalized_at is null
  ) order by r.slot),'[]'::jsonb)
  into v_results
  from public.ranked_puzzle_results r
  where r.attempt_id=v_attempt.attempt_id
    and r.slot<v_attempt.current_slot;

  return jsonb_build_object(
    'ok',true,'ranked',true,'resumed',v_attempt.current_slot>1,
    'attempt_id',v_attempt.attempt_id,'play_date',v_today,
    'season_id',v_season,'completed_results',v_results,
    'puzzle',public._ranked_slot_payload(v_slot,v_attempt.current_released_at)
  );
end;
$$;

create or replace function public.release_ranked_slot(
  p_session_token text,
  p_attempt_id uuid,
  p_slot integer
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text;
  v_attempt public.ranked_sprint_attempts%rowtype;
  v_slot public.ranked_puzzle_slots%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_username := public._player_session_username(p_session_token);
  select * into v_attempt from public.ranked_sprint_attempts
  where attempt_id=p_attempt_id and username=v_username for update;

  if not found or v_attempt.status <> 'active' then
    return jsonb_build_object('ok',false,'code','attempt_not_active','error','Ranked attempt is not active.');
  end if;
  if p_slot <> v_attempt.current_slot then
    return jsonb_build_object('ok',false,'code','invalid_slot','error','Unexpected ranked slot.');
  end if;

  if v_attempt.current_released_at is null then
    if not v_attempt.next_slot_ready then
      return jsonb_build_object('ok',false,'code','slot_not_ready','error','Ranked slot is not ready.');
    end if;
    update public.ranked_sprint_attempts
    set current_released_at=v_now,next_slot_ready=false
    where attempt_id=p_attempt_id returning * into v_attempt;
  end if;

  select * into v_slot from public.ranked_puzzle_slots
  where play_date=v_attempt.play_date and slot=p_slot and published;
  return jsonb_build_object(
    'ok',true,'attempt_id',p_attempt_id,
    'puzzle',public._ranked_slot_payload(v_slot,v_attempt.current_released_at)
  );
end;
$$;

create or replace function public.invalidate_ranked_sprint_attempt(
  p_session_token text,
  p_attempt_id uuid,
  p_reason text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare v_username text;
begin
  v_username := public._player_session_username(p_session_token);
  update public.ranked_sprint_attempts
  set status='invalid',invalid_reason=left(coalesce(p_reason,'client_invalidated'),80)
  where attempt_id=p_attempt_id and username=v_username and status='active';
  return jsonb_build_object('ok',found);
end;
$$;

create or replace function public.get_ranked_replay_context(
  p_session_token text,
  p_attempt_id uuid,
  p_slot integer
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text;
  v_attempt public.ranked_sprint_attempts%rowtype;
  v_slot public.ranked_puzzle_slots%rowtype;
  v_existing public.ranked_puzzle_results%rowtype;
begin
  v_username := public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object('ok',false,'code','invalid_session');
  end if;

  select * into v_attempt from public.ranked_sprint_attempts
  where attempt_id=p_attempt_id and username=v_username;
  if not found then
    return jsonb_build_object('ok',false,'code','attempt_not_found');
  end if;

  select * into v_existing from public.ranked_puzzle_results
  where attempt_id=p_attempt_id and slot=p_slot;
  if found then
    return jsonb_build_object(
      'ok',true,'already_completed',true,
      'submission_id',v_existing.submission_id
    );
  end if;

  if v_attempt.status <> 'active'
     or v_attempt.current_slot <> p_slot
     or v_attempt.current_released_at is null then
    return jsonb_build_object('ok',false,'code','attempt_not_ready');
  end if;

  select * into v_slot from public.ranked_puzzle_slots
  where play_date=v_attempt.play_date and slot=p_slot and published;
  if not found then
    return jsonb_build_object('ok',false,'code','slot_unavailable');
  end if;

  return jsonb_build_object(
    'ok',true,'puzzle_id',v_slot.puzzle_id,
    'gameplay_checksum',v_slot.gameplay_checksum,
    'schema_version',v_slot.definition_schema_version,
    'rules_version',v_slot.rules_version,
    'gameplay_definition',v_slot.gameplay_definition
  );
end;
$$;

create or replace function public.accept_ranked_replay(
  p_session_token text,
  p_attempt_id uuid,
  p_slot integer,
  p_submission_id uuid,
  p_replay jsonb,
  p_move_count integer,
  p_final_state_hash text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text;
  v_attempt public.ranked_sprint_attempts%rowtype;
  v_slot public.ranked_puzzle_slots%rowtype;
  v_existing public.ranked_puzzle_results%rowtype;
  v_now timestamptz := clock_timestamp();
  v_elapsed bigint;
  v_stars smallint;
  v_signals jsonb := '[]'::jsonb;
  v_review text := 'clear';
begin
  v_username := public._player_session_username(p_session_token);
  select * into v_attempt from public.ranked_sprint_attempts
  where attempt_id=p_attempt_id and username=v_username for update;
  if not found then
    return jsonb_build_object('ok',false,'code','attempt_not_found');
  end if;

  select * into v_existing from public.ranked_puzzle_results
  where attempt_id=p_attempt_id and slot=p_slot;
  if found then
    if v_existing.submission_id=p_submission_id then
      return jsonb_build_object(
        'ok',true,'duplicate',true,'elapsed_ms',v_existing.elapsed_ms,
        'move_count',v_existing.move_count,'stars',v_existing.stars,
        'final_state_hash',v_existing.final_state_hash,
        'review_status',v_existing.review_status,
        'risk_signals',v_existing.risk_signals,
        'provisional',v_existing.finalized_at is null,
        'sprint_complete',p_slot=5
      );
    end if;
    return jsonb_build_object('ok',false,'code','slot_already_completed');
  end if;

  if v_attempt.status <> 'active'
     or v_attempt.current_slot <> p_slot
     or v_attempt.current_released_at is null then
    return jsonb_build_object('ok',false,'code','attempt_not_ready');
  end if;
  if jsonb_typeof(p_replay) <> 'array'
     or p_move_count <> jsonb_array_length(p_replay)
     or p_move_count not between 1 and 2000 then
    return jsonb_build_object('ok',false,'code','invalid_replay_length');
  end if;

  select * into v_slot from public.ranked_puzzle_slots
  where play_date=v_attempt.play_date and slot=p_slot and published;
  if not found then
    return jsonb_build_object('ok',false,'code','slot_unavailable');
  end if;

  v_elapsed := greatest(
    0,
    (extract(epoch from (v_now-v_attempt.current_released_at))*1000)::bigint
  );
  v_stars := case
    when p_move_count <= v_slot.minimum_moves+v_slot.star_tolerance then 3
    when p_move_count <= v_slot.minimum_moves+v_slot.star_tolerance+
      greatest(6,ceil(v_slot.minimum_moves*0.25)::integer) then 2
    else 1
  end;

  if v_elapsed < greatest(1500,p_move_count*80) then
    v_signals := v_signals || jsonb_build_array('implausibly_fast');
  end if;
  if p_move_count <= v_slot.minimum_moves
     and v_elapsed < v_slot.minimum_moves*150 then
    v_signals := v_signals || jsonb_build_array('minimum_solution_speed');
  end if;
  if jsonb_array_length(v_signals)>0 then v_review:='review_required'; end if;

  insert into public.ranked_puzzle_results(
    attempt_id,slot,submission_id,puzzle_id,gameplay_checksum,replay,
    move_count,final_state_hash,released_at,completed_at,elapsed_ms,stars,
    review_status,risk_signals
  ) values (
    p_attempt_id,p_slot,p_submission_id,v_slot.puzzle_id,
    v_slot.gameplay_checksum,p_replay,p_move_count,p_final_state_hash,
    v_attempt.current_released_at,v_now,v_elapsed,v_stars,v_review,v_signals
  );

  if v_review='review_required' then
    update public.ranked_sprint_attempts
    set review_status='review_required',
        risk_signals=risk_signals || v_signals
    where attempt_id=p_attempt_id;
  end if;

  if p_slot=5 then
    update public.ranked_sprint_attempts
    set status='completed',completed_at=v_now,current_released_at=null,
        next_slot_ready=false,
        total_elapsed_ms=(select sum(elapsed_ms) from public.ranked_puzzle_results where attempt_id=p_attempt_id),
        total_moves=(select sum(move_count) from public.ranked_puzzle_results where attempt_id=p_attempt_id)
    where attempt_id=p_attempt_id;
  else
    update public.ranked_sprint_attempts
    set current_slot=p_slot+1,current_released_at=null,next_slot_ready=true
    where attempt_id=p_attempt_id;
  end if;

  return jsonb_build_object(
    'ok',true,'elapsed_ms',v_elapsed,'move_count',p_move_count,
    'stars',v_stars,'final_state_hash',p_final_state_hash,
    'review_status',v_review,'risk_signals',v_signals,
    'provisional',true,'sprint_complete',p_slot=5
  );
end;
$$;

create or replace function public.finalize_ranked_day(p_play_date date)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
begin
  if p_play_date >= (clock_timestamp() at time zone 'UTC')::date then
    return jsonb_build_object('ok',false,'error','UTC day is not closed.');
  end if;

  with ordered as (
    select r.attempt_id,r.slot,s.difficulty_weight,
      rank() over(partition by a.play_date,r.slot order by r.elapsed_ms,r.move_count) as place,
      count(*) over(partition by a.play_date,r.slot) as participants
    from public.ranked_puzzle_results r
    join public.ranked_sprint_attempts a using(attempt_id)
    join public.ranked_puzzle_slots s
      on s.play_date=a.play_date and s.slot=r.slot
    where a.play_date=p_play_date and a.status='completed'
      and a.review_status in ('clear','reviewed')
      and r.review_status in ('clear','reviewed')
  ), scored as (
    select *,greatest(1,10-floor(((place-1)*10.0)/greatest(participants,1)))::smallint as score
    from ordered
  )
  update public.ranked_puzzle_results r
  set rank=scored.place,participant_count=scored.participants,
      raw_score=scored.score,
      weighted_score=scored.score*scored.difficulty_weight,
      finalized_at=clock_timestamp()
  from scored
  where r.attempt_id=scored.attempt_id and r.slot=scored.slot;

  return jsonb_build_object('ok',true,'play_date',p_play_date);
end;
$$;

create or replace function public.get_ranked_daily_leaderboard(p_session_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_records jsonb;
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object('ok',false,'error','Invalid session.');
  end if;

  with ordered as (
    select a.username,r.elapsed_ms,r.move_count as moves,r.stars,
      s.difficulty_weight,
      rank() over(partition by r.slot order by r.elapsed_ms,r.move_count) as place,
      count(*) over(partition by r.slot) as participants
    from public.ranked_sprint_attempts a
    join public.ranked_puzzle_results r using(attempt_id)
    join public.ranked_puzzle_slots s
      on s.play_date=a.play_date and s.slot=r.slot
    where a.play_date=v_today and a.status='completed'
      and a.review_status in ('clear','reviewed')
      and r.review_status in ('clear','reviewed')
  ), provisional_scores as (
    select *,greatest(1,10-floor(((place-1)*10.0)/greatest(participants,1)))::integer as raw_score
    from ordered
  ), totals as (
    select username,sum(raw_score*difficulty_weight) weighted_points,
      sum(elapsed_ms) elapsed_ms,sum(moves) moves,sum(stars) stars,true provisional
    from provisional_scores group by username
  )
  select coalesce(
    jsonb_agg(to_jsonb(totals) order by weighted_points desc,elapsed_ms,moves),
    '[]'::jsonb
  ) into v_records from totals;

  return jsonb_build_object('ok',true,'records',v_records,'provisional',true);
end;
$$;

create or replace function public.get_ranked_monthly_leaderboard(p_session_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, extensions, public as $$
declare
  v_username text;
  v_season text:=to_char((clock_timestamp() at time zone 'UTC')::date,'YYYY-MM');
  v_records jsonb;
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object('ok',false,'error','Invalid session.');
  end if;
  select coalesce(
    jsonb_agg(to_jsonb(q) order by q.weighted_points desc,q.elapsed_ms,q.moves),
    '[]'::jsonb
  ) into v_records from (
    select a.username,sum(r.weighted_score) weighted_points,
      sum(r.elapsed_ms) elapsed_ms,sum(r.move_count) moves,sum(r.stars) stars,
      count(distinct a.play_date) completed_days
    from public.ranked_sprint_attempts a
    join public.ranked_puzzle_results r using(attempt_id)
    where a.season_id=v_season and a.status='completed'
      and a.review_status in ('clear','reviewed')
      and r.finalized_at is not null
    group by a.username
  ) q;
  return jsonb_build_object('ok',true,'season_id',v_season,'records',v_records);
end;
$$;

create or replace function public.save_story_v2_result(
  p_session_token text,p_level integer,p_puzzle_id text,p_stars integer,
  p_moves integer,p_time_seconds integer
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
declare v_username text;
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object('ok',false,'error','Invalid session.');
  end if;
  if p_puzzle_id <> 'story-v2-'||p_level
     or p_level not between 1 and 10000
     or p_stars not between 1 and 3
     or p_moves not between 1 and 100000
     or p_time_seconds not between 0 and 864000 then
    return jsonb_build_object('ok',false,'error','Invalid story result.');
  end if;
  insert into public.story_level_results_v2(
    username,level,puzzle_id,stars,moves,time_seconds
  ) values(v_username,p_level,p_puzzle_id,p_stars,p_moves,p_time_seconds)
  on conflict(username,level,generator_version) do update
  set puzzle_id=excluded.puzzle_id,stars=excluded.stars,
      moves=excluded.moves,time_seconds=excluded.time_seconds,completed_at=now()
  where excluded.stars > story_level_results_v2.stars
     or (excluded.stars = story_level_results_v2.stars and excluded.moves < story_level_results_v2.moves)
     or (excluded.stars = story_level_results_v2.stars and excluded.moves = story_level_results_v2.moves and excluded.time_seconds < story_level_results_v2.time_seconds);
  return jsonb_build_object('ok',true,'verified',false);
end;
$$;

create or replace function public.get_story_v2_leaderboard()
returns jsonb language sql security definer
set search_path=pg_catalog,public as $$
  with winners as (
    select distinct on(level) level,username,stars,moves,time_seconds,puzzle_id,
      false as verified
    from public.story_level_results_v2
    order by level,stars desc,moves,time_seconds,username
  )
  select jsonb_build_object(
    'ok',true,'verified',false,
    'records',coalesce(jsonb_agg(to_jsonb(winners) order by level),'[]'::jsonb)
  ) from winners;
$$;

revoke all on function public._ranked_slot_payload(public.ranked_puzzle_slots,timestamptz),
  public.start_ranked_attempt(text,integer[],text[]),
  public.release_ranked_slot(text,uuid,integer),
  public.invalidate_ranked_sprint_attempt(text,uuid,text),
  public.get_ranked_replay_context(text,uuid,integer),
  public.accept_ranked_replay(text,uuid,integer,uuid,jsonb,integer,text),
  public.get_ranked_daily_leaderboard(text),
  public.get_ranked_monthly_leaderboard(text),
  public.save_story_v2_result(text,integer,text,integer,integer,integer),
  public.get_story_v2_leaderboard() from public,anon,authenticated;

grant execute on function public.start_ranked_attempt(text,integer[],text[]),
  public.release_ranked_slot(text,uuid,integer),
  public.invalidate_ranked_sprint_attempt(text,uuid,text),
  public.get_ranked_daily_leaderboard(text),
  public.get_ranked_monthly_leaderboard(text),
  public.save_story_v2_result(text,integer,text,integer,integer,integer),
  public.get_story_v2_leaderboard() to anon,authenticated;

revoke all on function public.get_ranked_replay_context(text,uuid,integer),
  public.accept_ranked_replay(text,uuid,integer,uuid,jsonb,integer,text),
  public.finalize_ranked_day(date) from public,anon,authenticated;

grant execute on function public._ranked_slot_payload(public.ranked_puzzle_slots,timestamptz),
  public.get_ranked_replay_context(text,uuid,integer),
  public.accept_ranked_replay(text,uuid,integer,uuid,jsonb,integer,text),
  public.finalize_ranked_day(date) to service_role;

grant all on public.ranked_seasons, public.ranked_puzzle_slots,
  public.ranked_sprint_attempts, public.ranked_puzzle_results,
  public.story_level_results_v2 to service_role;

commit;