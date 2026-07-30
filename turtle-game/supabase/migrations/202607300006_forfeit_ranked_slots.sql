-- Keep the five-puzzle attempt active when the current puzzle is interrupted.
-- Only the interrupted slot becomes ineligible for leaderboard scoring.
begin;

alter table public.ranked_sprint_attempts
  add column if not exists current_slot_score_eligible boolean not null default true;
alter table public.ranked_sprint_attempts
  add column if not exists current_slot_forfeit_reason text;
alter table public.ranked_puzzle_results
  add column if not exists score_eligible boolean not null default true;
alter table public.ranked_puzzle_results
  add column if not exists forfeit_reason text;

-- Recover attempts invalidated by the former all-or-nothing interruption model.
update public.ranked_sprint_attempts as attempt
set status='active',
    current_slot_score_eligible=false,
    current_slot_forfeit_reason=left(
      coalesce(attempt.invalid_reason,'client_interrupted'),80
    ),
    invalid_reason=null,
    completed_at=null
where attempt.status='invalid'
  and attempt.invalid_reason in (
    'menu_opened','page_hidden','page_unloaded',
    'left_for_story','left_for_training'
  )
  and not exists (
    select 1 from public.ranked_puzzle_results as result
    where result.attempt_id=attempt.attempt_id
      and result.slot=attempt.current_slot
  );

create or replace function public.start_ranked_attempt(
  p_session_token text,
  p_supported_definition_schemas integer[],
  p_supported_game_rules text[]
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
declare
  v_username text;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_season text := to_char(v_today,'YYYY-MM');
  v_season_row public.ranked_seasons%rowtype;
  v_attempt public.ranked_sprint_attempts%rowtype;
  v_slot public.ranked_puzzle_slots%rowtype;
  v_puzzles jsonb;
  v_results jsonb;
  v_now timestamptz := clock_timestamp();
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object(
      'ok',false,'code','invalid_session','error','Invalid session.'
    );
  end if;

  select * into v_season_row from public.ranked_seasons
  where season_id=v_season and status='published';
  if not found then
    return jsonb_build_object(
      'ok',false,'code','series_unavailable',
      'error','Todays ranked series is not published yet.'
    );
  end if;

  if not (
    v_season_row.definition_schema_version=
      any(coalesce(p_supported_definition_schemas,'{}'::integer[]))
  ) or not (
    v_season_row.rules_version=
      any(coalesce(p_supported_game_rules,'{}'::text[]))
  ) then
    return jsonb_build_object(
      'ok',false,'code','client_update_required',
      'error','Client update required.'
    );
  end if;

  select * into v_attempt from public.ranked_sprint_attempts
  where username=v_username and play_date=v_today for update;

  if found and v_attempt.status in ('invalid','completed') then
    select jsonb_agg(
      public._ranked_slot_payload(slot_row,null) order by slot_row.slot
    ) into v_puzzles
    from public.ranked_puzzle_slots as slot_row
    where slot_row.play_date=v_today and slot_row.published;
    return jsonb_build_object(
      'ok',true,'ranked',false,'replay_training_only',true,
      'attempt_id',v_attempt.attempt_id,'play_date',v_today,
      'season_id',v_season,'puzzles',coalesce(v_puzzles,'[]'::jsonb)
    );
  end if;

  if not found then
    insert into public.ranked_sprint_attempts(
      username,play_date,season_id,status,started_at,current_slot,
      current_released_at,next_slot_ready,current_slot_score_eligible,
      current_slot_forfeit_reason
    ) values (
      v_username,v_today,v_season,'active',v_now,1,
      v_now,false,true,null
    )
    on conflict(username,play_date) do nothing
    returning * into v_attempt;
    if not found then
      select * into v_attempt from public.ranked_sprint_attempts
      where username=v_username and play_date=v_today for update;
    end if;
  elsif v_attempt.current_released_at is null then
    update public.ranked_sprint_attempts
    set current_released_at=v_now,
        next_slot_ready=false,
        current_slot_score_eligible=true,
        current_slot_forfeit_reason=null
    where attempt_id=v_attempt.attempt_id returning * into v_attempt;
  end if;

  select * into v_slot from public.ranked_puzzle_slots
  where play_date=v_today and slot=v_attempt.current_slot and published;
  if not found then
    return jsonb_build_object(
      'ok',false,'code','slot_unavailable',
      'error','Current ranked slot is unavailable.'
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'mode','ranked','ranked',true,'slot',result.slot,
    'moves',result.move_count,'elapsed_ms',result.elapsed_ms,
    'stars',result.stars,'puzzle_id',result.puzzle_id,
    'final_state_hash',result.final_state_hash,
    'review_status',result.review_status,'risk_signals',result.risk_signals,
    'score_eligible',result.score_eligible,
    'forfeit_reason',result.forfeit_reason,
    'provisional',result.score_eligible and result.finalized_at is null
  ) order by result.slot),'[]'::jsonb)
  into v_results from public.ranked_puzzle_results as result
  where result.attempt_id=v_attempt.attempt_id
    and result.slot<v_attempt.current_slot;

  return jsonb_build_object(
    'ok',true,'ranked',true,
    'resumed',v_attempt.current_slot>1
      or not v_attempt.current_slot_score_eligible,
    'attempt_id',v_attempt.attempt_id,'play_date',v_today,
    'season_id',v_season,'completed_results',v_results,
    'puzzle',public._ranked_slot_payload(
      v_slot,v_attempt.current_released_at
    ) || jsonb_build_object(
      'score_eligible',v_attempt.current_slot_score_eligible,
      'forfeit_reason',v_attempt.current_slot_forfeit_reason
    )
  );
end;
$$;

create or replace function public.release_ranked_slot(
  p_session_token text,p_attempt_id uuid,p_slot integer
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
declare
  v_username text;
  v_attempt public.ranked_sprint_attempts%rowtype;
  v_slot public.ranked_puzzle_slots%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_username:=public._player_session_username(p_session_token);
  select * into v_attempt from public.ranked_sprint_attempts
  where attempt_id=p_attempt_id and username=v_username for update;
  if not found or v_attempt.status<>'active' then
    return jsonb_build_object(
      'ok',false,'code','attempt_not_active',
      'error','Ranked attempt is not active.'
    );
  end if;
  if p_slot<>v_attempt.current_slot then
    return jsonb_build_object(
      'ok',false,'code','invalid_slot','error','Unexpected ranked slot.'
    );
  end if;

  if v_attempt.current_released_at is null then
    if not v_attempt.next_slot_ready then
      return jsonb_build_object(
        'ok',false,'code','slot_not_ready',
        'error','Ranked slot is not ready.'
      );
    end if;
    update public.ranked_sprint_attempts
    set current_released_at=v_now,
        next_slot_ready=false,
        current_slot_score_eligible=true,
        current_slot_forfeit_reason=null
    where attempt_id=p_attempt_id returning * into v_attempt;
  end if;

  select * into v_slot from public.ranked_puzzle_slots
  where play_date=v_attempt.play_date and slot=p_slot and published;
  return jsonb_build_object(
    'ok',true,'attempt_id',p_attempt_id,
    'puzzle',public._ranked_slot_payload(
      v_slot,v_attempt.current_released_at
    ) || jsonb_build_object(
      'score_eligible',v_attempt.current_slot_score_eligible,
      'forfeit_reason',v_attempt.current_slot_forfeit_reason
    )
  );
end;
$$;

create or replace function public.forfeit_current_ranked_slot(
  p_session_token text,p_attempt_id uuid,p_slot integer,p_reason text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
declare
  v_username text;
  v_attempt public.ranked_sprint_attempts%rowtype;
  v_reason text := left(
    coalesce(nullif(p_reason,''),'client_interrupted'),80
  );
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object('ok',false,'code','invalid_session');
  end if;

  select * into v_attempt from public.ranked_sprint_attempts
  where attempt_id=p_attempt_id and username=v_username for update;
  if not found then
    return jsonb_build_object('ok',false,'code','attempt_not_found');
  end if;
  if v_attempt.status<>'active' then
    return jsonb_build_object('ok',false,'code','attempt_not_active');
  end if;
  if v_attempt.current_slot<>p_slot then
    return jsonb_build_object(
      'ok',false,'code','stale_slot','current_slot',v_attempt.current_slot
    );
  end if;
  if v_attempt.current_released_at is null then
    return jsonb_build_object('ok',false,'code','slot_not_released');
  end if;

  if v_attempt.current_slot_score_eligible then
    update public.ranked_sprint_attempts
    set current_slot_score_eligible=false,
        current_slot_forfeit_reason=v_reason
    where attempt_id=p_attempt_id returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'ok',true,'attempt_id',v_attempt.attempt_id,
    'slot',v_attempt.current_slot,'score_eligible',false,
    'forfeit_reason',v_attempt.current_slot_forfeit_reason
  );
end;
$$;

create or replace function public.accept_ranked_replay(
  p_session_token text,p_attempt_id uuid,p_slot integer,
  p_submission_id uuid,p_replay jsonb,p_move_count integer,
  p_final_state_hash text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
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
  v_username:=public._player_session_username(p_session_token);
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
        'score_eligible',v_existing.score_eligible,
        'forfeit_reason',v_existing.forfeit_reason,
        'provisional',v_existing.score_eligible
          and v_existing.finalized_at is null,
        'sprint_complete',p_slot=5
      );
    end if;
    return jsonb_build_object('ok',false,'code','slot_already_completed');
  end if;

  if v_attempt.status<>'active'
     or v_attempt.current_slot<>p_slot
     or v_attempt.current_released_at is null then
    return jsonb_build_object('ok',false,'code','attempt_not_ready');
  end if;
  if jsonb_typeof(p_replay)<>'array'
     or p_move_count<>jsonb_array_length(p_replay)
     or p_move_count not between 1 and 2000 then
    return jsonb_build_object(
      'ok',false,'code','invalid_replay_length'
    );
  end if;

  select * into v_slot from public.ranked_puzzle_slots
  where play_date=v_attempt.play_date and slot=p_slot and published;
  if not found then
    return jsonb_build_object('ok',false,'code','slot_unavailable');
  end if;

  v_elapsed:=greatest(
    0,(extract(epoch from (v_now-v_attempt.current_released_at))*1000)::bigint
  );
  v_stars:=case
    when p_move_count<=v_slot.minimum_moves+v_slot.star_tolerance then 3
    when p_move_count<=v_slot.minimum_moves+v_slot.star_tolerance+
      greatest(6,ceil(v_slot.minimum_moves*0.25)::integer) then 2
    else 1
  end;

  if v_attempt.current_slot_score_eligible then
    if v_elapsed<greatest(1500,p_move_count*80) then
      v_signals:=v_signals || jsonb_build_array('implausibly_fast');
    end if;
    if p_move_count<=v_slot.minimum_moves
       and v_elapsed<v_slot.minimum_moves*150 then
      v_signals:=v_signals || jsonb_build_array('minimum_solution_speed');
    end if;
    if jsonb_array_length(v_signals)>0 then
      v_review:='review_required';
    end if;
  end if;

  insert into public.ranked_puzzle_results(
    attempt_id,slot,submission_id,puzzle_id,gameplay_checksum,replay,
    move_count,final_state_hash,released_at,completed_at,elapsed_ms,stars,
    review_status,risk_signals,score_eligible,forfeit_reason
  ) values (
    p_attempt_id,p_slot,p_submission_id,v_slot.puzzle_id,
    v_slot.gameplay_checksum,p_replay,p_move_count,p_final_state_hash,
    v_attempt.current_released_at,v_now,v_elapsed,v_stars,
    v_review,v_signals,v_attempt.current_slot_score_eligible,
    v_attempt.current_slot_forfeit_reason
  );

  if v_review='review_required' then
    update public.ranked_sprint_attempts
    set review_status='review_required',risk_signals=risk_signals || v_signals
    where attempt_id=p_attempt_id;
  end if;

  if p_slot=5 then
    update public.ranked_sprint_attempts
    set status='completed',completed_at=v_now,current_released_at=null,
        next_slot_ready=false,
        total_elapsed_ms=(
          select sum(elapsed_ms) from public.ranked_puzzle_results
          where attempt_id=p_attempt_id
        ),
        total_moves=(
          select sum(move_count) from public.ranked_puzzle_results
          where attempt_id=p_attempt_id
        )
    where attempt_id=p_attempt_id;
  else
    update public.ranked_sprint_attempts
    set current_slot=p_slot+1,current_released_at=null,next_slot_ready=true,
        current_slot_score_eligible=true,current_slot_forfeit_reason=null
    where attempt_id=p_attempt_id;
  end if;

  return jsonb_build_object(
    'ok',true,'elapsed_ms',v_elapsed,'move_count',p_move_count,
    'stars',v_stars,'final_state_hash',p_final_state_hash,
    'review_status',v_review,'risk_signals',v_signals,
    'score_eligible',v_attempt.current_slot_score_eligible,
    'forfeit_reason',v_attempt.current_slot_forfeit_reason,
    'provisional',v_attempt.current_slot_score_eligible,
    'sprint_complete',p_slot=5
  );
end;
$$;

create or replace function public.finalize_ranked_day(p_play_date date)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
begin
  if p_play_date>=(clock_timestamp() at time zone 'UTC')::date then
    return jsonb_build_object('ok',false,'error','UTC day is not closed.');
  end if;

  with ordered as (
    select result.attempt_id,result.slot,slot_row.difficulty_weight,
      rank() over(
        partition by attempt.play_date,result.slot
        order by result.elapsed_ms,result.move_count
      ) as place,
      count(*) over(
        partition by attempt.play_date,result.slot
      ) as participants
    from public.ranked_puzzle_results as result
    join public.ranked_sprint_attempts as attempt using(attempt_id)
    join public.ranked_puzzle_slots as slot_row
      on slot_row.play_date=attempt.play_date
      and slot_row.slot=result.slot
    where attempt.play_date=p_play_date and attempt.status='completed'
      and attempt.review_status in ('clear','reviewed')
      and result.review_status in ('clear','reviewed')
      and result.score_eligible
  ), scored as (
    select *,
      greatest(
        1,10-floor(((place-1)*10.0)/greatest(participants,1))
      )::smallint as score
    from ordered
  )
  update public.ranked_puzzle_results as result
  set rank=scored.place,participant_count=scored.participants,
      raw_score=scored.score,
      weighted_score=scored.score*scored.difficulty_weight,
      finalized_at=clock_timestamp()
  from scored
  where result.attempt_id=scored.attempt_id and result.slot=scored.slot;

  return jsonb_build_object('ok',true,'play_date',p_play_date);
end;
$$;

create or replace function public.get_ranked_daily_leaderboard(
  p_session_token text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
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
    select attempt.username,result.elapsed_ms,
      result.move_count as moves,result.stars,slot_row.difficulty_weight,
      rank() over(
        partition by result.slot
        order by result.elapsed_ms,result.move_count
      ) as place,
      count(*) over(partition by result.slot) as participants
    from public.ranked_sprint_attempts as attempt
    join public.ranked_puzzle_results as result using(attempt_id)
    join public.ranked_puzzle_slots as slot_row
      on slot_row.play_date=attempt.play_date
      and slot_row.slot=result.slot
    where attempt.play_date=v_today and attempt.status='completed'
      and attempt.review_status in ('clear','reviewed')
      and result.review_status in ('clear','reviewed')
      and result.score_eligible
  ), provisional_scores as (
    select *,
      greatest(
        1,10-floor(((place-1)*10.0)/greatest(participants,1))
      )::integer as raw_score
    from ordered
  ), totals as (
    select username,
      sum(raw_score*difficulty_weight) as weighted_points,
      sum(elapsed_ms) as elapsed_ms,sum(moves) as moves,
      sum(stars) as stars,count(*) as scored_puzzles,true as provisional
    from provisional_scores group by username
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(totals) order by weighted_points desc,elapsed_ms,moves
    ),'[]'::jsonb
  ) into v_records from totals;

  return jsonb_build_object(
    'ok',true,'records',v_records,'provisional',true
  );
end;
$$;

create or replace function public.get_ranked_monthly_leaderboard(
  p_session_token text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,extensions,public as $$
declare
  v_username text;
  v_season text := to_char(
    (clock_timestamp() at time zone 'UTC')::date,'YYYY-MM'
  );
  v_records jsonb;
begin
  v_username:=public._player_session_username(p_session_token);
  if v_username is null then
    return jsonb_build_object('ok',false,'error','Invalid session.');
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(summary)
      order by summary.weighted_points desc,summary.elapsed_ms,summary.moves
    ),'[]'::jsonb
  ) into v_records
  from (
    select attempt.username,
      sum(result.weighted_score) as weighted_points,
      sum(result.elapsed_ms) as elapsed_ms,
      sum(result.move_count) as moves,sum(result.stars) as stars,
      count(*) as scored_puzzles,
      count(distinct attempt.play_date) as completed_days
    from public.ranked_sprint_attempts as attempt
    join public.ranked_puzzle_results as result using(attempt_id)
    where attempt.season_id=v_season and attempt.status='completed'
      and attempt.review_status in ('clear','reviewed')
      and result.score_eligible and result.finalized_at is not null
    group by attempt.username
  ) as summary;

  return jsonb_build_object(
    'ok',true,'season_id',v_season,'records',v_records
  );
end;
$$;

revoke all on function public.forfeit_current_ranked_slot(
  text,uuid,integer,text
) from public,anon,authenticated;
grant execute on function public.forfeit_current_ranked_slot(
  text,uuid,integer,text
) to anon,authenticated,service_role;

commit;
