-- Retire the private Ranked v1 prototype API after the v2 contract is live.
-- These functions exposed the full five-puzzle manifest or accepted
-- unverified client-reported results. Existing players and progress are not
-- touched.
begin;

drop function if exists public.claim_ranked_sprint_attempt(text);
drop function if exists public.start_ranked_sprint_attempt(text, uuid);
drop function if exists public.submit_ranked_puzzle_result(
  text,
  uuid,
  integer,
  integer,
  text
);

commit;
