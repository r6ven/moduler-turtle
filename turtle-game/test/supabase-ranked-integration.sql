\set ON_ERROR_STOP on

begin;

do $$
declare
  v_primary_token text;
  v_other_token text;
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_season text := to_char(v_today, 'YYYY-MM');
  v_response jsonb;
  v_repeat jsonb;
  v_context jsonb;
  v_accepted jsonb;
  v_attempt_id uuid;
  v_submission_id uuid := gen_random_uuid();
  v_second_submission_id uuid := gen_random_uuid();
  v_released_at text;
  v_attempt_count integer;
begin
  insert into public.players(username, password_hash)
  values
    ('ranked_ci_primary', crypt('test-pass', gen_salt('bf', 4))),
    ('ranked_ci_other', crypt('test-pass', gen_salt('bf', 4)));

  v_primary_token := public._issue_player_session('ranked_ci_primary')->>'session_token';
  v_other_token := public._issue_player_session('ranked_ci_other')->>'session_token';

  insert into public.ranked_seasons(
    season_id, generator_version, definition_schema_version,
    rules_version, status, published_at
  ) values (v_season, 2, 1, 'ranked-v2', 'published', clock_timestamp());

  insert into public.ranked_puzzle_slots(
    season_id, play_date, day_of_month, slot, profile_id,
    difficulty_weight, seed, puzzle_id, generator_version,
    definition_schema_version, rules_version, gameplay_checksum,
    presentation_checksum, gameplay_definition, presentation_definition,
    minimum_moves, star_tolerance, published
  )
  select
    v_season, v_today, extract(day from v_today)::integer, series.slot,
    'ci-profile-' || series.slot, series.slot, series.slot,
    'ranked-v2-ci-' || series.slot, 2, 1, 'ranked-v2',
    'gameplay-ci-' || series.slot, 'presentation-ci-' || series.slot,
    jsonb_build_object(
      'schemaVersion', 1,
      'rulesVersion', 'ranked-v2',
      'puzzleId', 'ranked-v2-ci-' || series.slot,
      'board', jsonb_build_object('mapRadius', 1, 'activeTileCount', 2),
      'tiles', '[]'::jsonb
    ),
    jsonb_build_object(
      'schemaVersion', 1,
      'puzzleId', 'ranked-v2-ci-' || series.slot,
      'tiles', '[]'::jsonb
    ),
    10, 3, true
  from generate_series(1, 5) as series(slot);

  v_response := public.start_ranked_attempt(
    v_primary_token, array[999], array['ranked-v2']
  );
  if v_response->>'code' <> 'client_update_required' then
    raise exception 'incompatible client was not rejected: %', v_response;
  end if;
  select count(*) into v_attempt_count
  from public.ranked_sprint_attempts where username='ranked_ci_primary';
  if v_attempt_count <> 0 then
    raise exception 'compatibility check consumed the daily attempt';
  end if;

  v_response := public.start_ranked_attempt(
    v_primary_token, array[1], array['ranked-v2']
  );
  if coalesce((v_response->>'ok')::boolean, false) is not true
     or not (v_response ? 'puzzle') or v_response ? 'puzzles'
     or (v_response->'puzzle'->>'slot')::integer <> 1 then
    raise exception 'atomic start leaked or omitted puzzle slots: %', v_response;
  end if;
  v_attempt_id := (v_response->>'attempt_id')::uuid;
  v_released_at := v_response->'puzzle'->>'released_at';

  v_repeat := public.start_ranked_attempt(
    v_primary_token, array[1], array['ranked-v2']
  );
  if v_repeat->>'attempt_id' <> v_attempt_id::text
     or v_repeat->'puzzle'->>'released_at' <> v_released_at then
    raise exception 'start retry reset attempt identity or release time';
  end if;

  v_repeat := public.release_ranked_slot(v_primary_token, v_attempt_id, 2);
  if v_repeat->>'code' <> 'invalid_slot' then
    raise exception 'future slot was released before verification: %', v_repeat;
  end if;

  v_context := public.get_ranked_replay_context(
    v_other_token, v_attempt_id, 1
  );
  if v_context->>'code' <> 'attempt_not_found' then
    raise exception 'another player could inspect replay context: %', v_context;
  end if;

  v_context := public.get_ranked_replay_context(
    v_primary_token, v_attempt_id, 1
  );
  if coalesce((v_context->>'ok')::boolean, false) is not true
     or v_context->>'puzzle_id' <> 'ranked-v2-ci-1' then
    raise exception 'replay context unavailable: %', v_context;
  end if;

  v_accepted := public.accept_ranked_replay(
    v_primary_token, v_attempt_id, 1, v_submission_id,
    '["0,0"]'::jsonb, 1, 'ci-final-state'
  );
  if coalesce((v_accepted->>'ok')::boolean, false) is not true then
    raise exception 'verified replay was not accepted: %', v_accepted;
  end if;

  v_repeat := public.accept_ranked_replay(
    v_primary_token, v_attempt_id, 1, v_submission_id,
    '["0,0"]'::jsonb, 1, 'ignored-on-idempotent-retry'
  );
  if coalesce((v_repeat->>'duplicate')::boolean, false) is not true then
    raise exception 'submission retry was not idempotent: %', v_repeat;
  end if;

  v_response := public.release_ranked_slot(v_primary_token, v_attempt_id, 2);
  if coalesce((v_response->>'ok')::boolean, false) is not true
     or (v_response->'puzzle'->>'slot')::integer <> 2 then
    raise exception 'next verified slot was not released: %', v_response;
  end if;
  v_released_at := v_response->'puzzle'->>'released_at';
  v_repeat := public.release_ranked_slot(v_primary_token, v_attempt_id, 2);
  if v_repeat->'puzzle'->>'released_at' <> v_released_at then
    raise exception 'idempotent release reset the slot timer';
  end if;

  v_response := public.forfeit_current_ranked_slot(
    v_primary_token, v_attempt_id, 2, 'menu_opened'
  );
  if coalesce((v_response->>'ok')::boolean, false) is not true
     or coalesce((v_response->>'score_eligible')::boolean, true) is not false then
    raise exception 'current slot was not forfeited: %', v_response;
  end if;
  v_repeat := public.forfeit_current_ranked_slot(
    v_primary_token, v_attempt_id, 2, 'page_hidden'
  );
  if v_repeat->>'forfeit_reason' <> 'menu_opened' then
    raise exception 'slot forfeit retry was not idempotent: %', v_repeat;
  end if;

  v_accepted := public.accept_ranked_replay(
    v_primary_token, v_attempt_id, 2, v_second_submission_id,
    '["0,0"]'::jsonb, 1, 'ci-second-final-state'
  );
  if coalesce((v_accepted->>'ok')::boolean, false) is not true
     or coalesce((v_accepted->>'score_eligible')::boolean, true) is not false then
    raise exception 'forfeited slot was not solved as score-ineligible: %', v_accepted;
  end if;

  v_response := public.release_ranked_slot(v_primary_token, v_attempt_id, 3);
  if coalesce((v_response->>'ok')::boolean, false) is not true
     or coalesce((v_response->'puzzle'->>'score_eligible')::boolean, false) is not true then
    raise exception 'next slot did not return to ranked scoring: %', v_response;
  end if;

  if has_function_privilege(
    'anon',
    'public.get_ranked_replay_context(text,uuid,integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.accept_ranked_replay(text,uuid,integer,uuid,jsonb,integer,text)',
    'execute'
  ) then
    raise exception 'private replay RPCs are exposed to public roles';
  end if;

  begin
    update public.ranked_puzzle_slots
    set gameplay_checksum='mutated'
    where season_id=v_season and slot=1;
    raise exception 'published puzzle mutation unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm = 'published puzzle mutation unexpectedly succeeded' then
        raise;
      end if;
  end;
end;
$$;

rollback;
