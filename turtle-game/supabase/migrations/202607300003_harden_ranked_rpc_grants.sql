-- Close the internal payload helper and cover the season foreign key.
-- Public Ranked entry points remain available because they authenticate the
-- game's own high-entropy player session token inside each RPC.
begin;

alter function public._ranked_slot_payload(
  public.ranked_puzzle_slots,
  timestamptz
) security invoker;

revoke all on function public._ranked_slot_payload(
  public.ranked_puzzle_slots,
  timestamptz
) from public, anon, authenticated;

grant execute on function public._ranked_slot_payload(
  public.ranked_puzzle_slots,
  timestamptz
) to service_role;

create index if not exists ranked_attempts_season_idx
  on public.ranked_sprint_attempts(season_id);

commit;
