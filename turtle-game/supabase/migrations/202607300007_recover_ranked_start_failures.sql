-- A client-side start/hydration error must not consume the daily series.
-- Preserve the original release timestamp, so recovery never resets scoring time.
begin;

update public.ranked_sprint_attempts as attempt
set status='active',
    invalid_reason=null,
    completed_at=null
where attempt.status='invalid'
  and attempt.invalid_reason='start_failed'
  and attempt.current_released_at is not null
  and not exists (
    select 1
    from public.ranked_puzzle_results as result
    where result.attempt_id=attempt.attempt_id
      and result.slot=attempt.current_slot
  );

commit;
