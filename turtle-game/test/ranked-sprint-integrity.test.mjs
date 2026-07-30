import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRankedSeasonManifest, RANKED_MONTH_SLOT_COUNT } from "../src/RankedCalendar.js";
import {
  calculateObjectChecksum,
  hydratePuzzleDefinition,
  RANKED_RULES_VERSION
} from "../src/PuzzleDefinition.js";
import { RANKED_GENERATOR_VERSION, RANKED_PUZZLE_PROFILES } from "../src/RankedSprintConfig.js";
import { RankedSprintSession } from "../src/RankedSprintSession.js";
import { verifyPuzzleReplay } from "../src/PuzzleReplayVerifier.js";
import { calculatePercentileScore, finalizePuzzleScores, getMaximumDailyScore, summarizeMonthlyResults } from "../src/RankedScoring.js";
import { PUZZLE_GENERATOR_VERSION, PuzzleGenerator } from "../src/PuzzleGenerator.js";

function createPuzzlePayload(profile) {
  const generated = PuzzleGenerator.generate({
    mode: "daily",
    rulesVersion: RANKED_RULES_VERSION,
    puzzleId: `ranked-v2-test-${profile.slot}`,
    seed: profile.slot * 100,
    mapRadius: profile.mapRadius,
    activeTileCount: profile.activeTileCount,
    extraLoopChance: profile.extraLoopChance,
    tutorial: false,
    quality: {
      minimumMoves: profile.minimumMoves,
      maxInitialConnectedRatio: 0.25
    }
  });

  return {
    slot: profile.slot,
    puzzle_id: generated.puzzleId,
    generator_version: generated.generatorVersion,
    schema_version: generated.schemaVersion,
    rules_version: generated.rulesVersion,
    gameplay_checksum: generated.gameplayChecksum,
    presentation_checksum: generated.presentationChecksum,
    gameplay_definition: generated.definition,
    presentation_definition: generated.presentationDefinition,
    minimum_moves: generated.minimumMoves,
    star_tolerance: profile.starTolerance,
    difficulty_weight: profile.difficultyWeight,
    released_at: "2026-07-30T12:00:00Z"
  };
}

function manifestPayload({ ranked = true } = {}) {
  const puzzles = RANKED_PUZZLE_PROFILES.map(createPuzzlePayload);
  return {
    ok: true,
    ranked,
    attempt_id: "00000000-0000-0000-0000-000000000001",
    play_date: "2026-07-30",
    season_id: "2026-07",
    ...(ranked ? { puzzle: puzzles[0] } : { puzzles })
  };
}

test("ranked generator contract tracks the browser generator version", () => {
  assert.equal(RANKED_GENERATOR_VERSION, PUZZLE_GENERATOR_VERSION);
});

test("ranked checksums ignore JSON object key order", () => {
  const generatedOrder = {
    mode: "ranked",
    board: { mapRadius: 2, activeTileCount: 14 },
    tiles: [{ key: "0,0", rotation: 2 }]
  };
  const databaseOrder = {
    tiles: [{ rotation: 2, key: "0,0" }],
    board: { activeTileCount: 14, mapRadius: 2 },
    mode: "ranked"
  };

  assert.equal(
    calculateObjectChecksum(generatedOrder),
    calculateObjectChecksum(databaseOrder)
  );
});

test("interrupting one ranked puzzle forfeits only that slot", () => {
  let now = 1000;
  const session = new RankedSprintSession({ now: () => now });
  session.start(manifestPayload());
  const payload = session.getCurrentPuzzlePayload();
  assert.equal(payload.slot, 1);
  assert.equal(payload.activeTileCount, 14);
  assert.equal(session.hasPlayablePuzzle(), false);
  session.beginPuzzle(hydratePuzzleDefinition(
    payload.definition,
    payload.presentationDefinition
  ));
  assert.equal(session.hasPlayablePuzzle(), true);
  session.addMove("0,0");
  now = 5000;
  session.pauseTimer();
  now = 8000;
  assert.equal(session.getElapsedSeconds(), 7);
  assert.deepEqual(session.replay, ["0,0"]);

  assert.equal(session.forfeitCurrentPuzzle("menu_opened"), true);
  assert.equal(session.getStatus().valid, true);
  assert.equal(session.getStatus().scoreEligible, false);
  assert.equal(session.getStatus().forfeitReason, "menu_opened");
  assert.equal(session.forfeitCurrentPuzzle("page_hidden"), false);

  const pending = session.completeCurrentPuzzle();
  assert.equal(pending.scoreEligible, false);
  session.acceptSubmission({
    ok: true, elapsed_ms: 7000, move_count: 1, stars: 3,
    final_state_hash: "fnv1a32-test",
    score_eligible: false,
    forfeit_reason: "menu_opened"
  });
  const nextPayload = {
    ...createPuzzlePayload(RANKED_PUZZLE_PROFILES[1]),
    score_eligible: true,
    forfeit_reason: null
  };
  session.acceptReleasedPuzzle(nextPayload);
  assert.equal(session.getStatus().puzzleIndex, 2);
  assert.equal(session.getStatus().scoreEligible, true);
  assert.equal(session.getStatus().forfeitReason, null);
  assert.equal(session.getStatus().valid, true);
});

test("ranked submission retries keep one stable id and replay", () => {
  let now = 1000;
  const session = new RankedSprintSession({ now: () => now });
  session.start(manifestPayload());
  const payload = session.getCurrentPuzzlePayload();
  session.beginPuzzle(hydratePuzzleDefinition(
    payload.definition,
    payload.presentationDefinition
  ));
  session.addMove("0,0");
  now = 2500;

  const first = session.completeCurrentPuzzle();
  const retry = session.completeCurrentPuzzle();
  assert.equal(retry.submissionId, first.submissionId);
  assert.deepEqual(retry.replay, first.replay);
  assert.match(first.submissionId, /^[0-9a-f-]{36}$/i);

  const accepted = session.acceptSubmission({
    ok: true, elapsed_ms: 1750, move_count: 1, stars: 3,
    final_state_hash: "fnv1a32-test"
  });
  assert.equal(accepted.elapsedMs, 1750);
  assert.equal(session.hasPendingSubmission(), false);

  const nextPayload = createPuzzlePayload(RANKED_PUZZLE_PROFILES[1]);
  session.acceptReleasedPuzzle(nextPayload);
  assert.equal(session.hasPlayablePuzzle(), false);
  session.beginPuzzle(hydratePuzzleDefinition(
    nextPayload.gameplay_definition,
    nextPayload.presentation_definition
  ));
  assert.equal(session.hasPlayablePuzzle(), true);
});

test("an active ranked attempt resumes at the server slot with prior totals", () => {
  const session = new RankedSprintSession({ now: () => 5000 });
  session.start({
    ...manifestPayload(),
    resumed: true,
    puzzle: createPuzzlePayload(RANKED_PUZZLE_PROFILES[2]),
    completed_results: [
      {
        slot: 1, moves: 18, elapsed_ms: 12000, stars: 3,
        puzzle_id: "ranked-v2-test-1"
      },
      {
        slot: 2, moves: 30, elapsed_ms: 19000, stars: 2,
        puzzle_id: "ranked-v2-test-2"
      }
    ]
  });

  const status = session.getStatus();
  assert.equal(status.puzzleIndex, 3);
  assert.equal(status.totalMoves, 48);
  assert.equal(status.totalTimeSeconds, 31);
  const payload = session.getCurrentPuzzlePayload();
  session.beginPuzzle(hydratePuzzleDefinition(
    payload.definition,
    payload.presentationDefinition
  ));
  session.addMove("0,0");
  assert.equal(session.completeCurrentPuzzle().slot, 3);
});

test("a repeated daily series becomes pauseable training and never stays ranked", () => {
  let now = 0;
  const session = new RankedSprintSession({ now: () => now });
  session.start({
    ...manifestPayload({ ranked: false }),
    replay_training_only: true
  });
  const payload = session.getCurrentPuzzlePayload();
  session.beginPuzzle(hydratePuzzleDefinition(
    payload.definition,
    payload.presentationDefinition
  ));
  now = 2000;
  session.pauseTimer();
  now = 9000;
  assert.equal(session.getElapsedSeconds(), 2);
  session.addHint();
  assert.equal(session.getStatus().ranked, false);
  assert.equal(session.getStatus().valid, false);
  assert.equal(session.hintsUsed, 1);
});

test("a solved replay is accepted while fabricated moves are rejected", () => {
  const payload = createPuzzlePayload(RANKED_PUZZLE_PROFILES[0]);
  const hydrated = hydratePuzzleDefinition(payload.gameplay_definition);
  const replay = [];

  Object.entries(hydrated.grid).forEach(([key, tile]) => {
    if (!tile.active) return;
    const { moves } = PuzzleGenerator.getClosestSolvedRotation(tile);
    for (let index = 0; index < moves; index += 1) replay.push(key);
  });

  const verified = verifyPuzzleReplay({
    definition: payload.gameplay_definition,
    replay
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.solved, true);
  assert.equal(verified.moveCount, replay.length);
  assert.match(verified.finalStateHash, /^fnv1a32-/);

  const unknown = verifyPuzzleReplay({
    definition: payload.gameplay_definition,
    replay: ["99,99"]
  });
  assert.equal(unknown.valid, false);
  assert.equal(unknown.code, "inactive_or_unknown_tile");

  const unsolved = verifyPuzzleReplay({
    definition: payload.gameplay_definition,
    replay: [payload.gameplay_definition.tiles[0].key]
  });
  assert.equal(unsolved.solved, false);

  const malformedDefinition = structuredClone(payload.gameplay_definition);
  malformedDefinition.tiles[0].exits[0] = 1;
  const malformed = verifyPuzzleReplay({
    definition: malformedDefinition,
    replay: [malformedDefinition.tiles[0].key]
  });
  assert.equal(malformed.valid, false);
  assert.equal(malformed.code, "invalid_definition");
});

test("presentation changes do not alter the gameplay checksum", () => {
  const payload = createPuzzlePayload(RANKED_PUZZLE_PROFILES[0]);
  const changedPresentation = structuredClone(payload.presentation_definition);
  changedPresentation.tiles[0].decorSeed += 1;

  assert.equal(
    calculateObjectChecksum(payload.gameplay_definition),
    payload.gameplay_checksum
  );
  assert.notEqual(
    calculateObjectChecksum(changedPresentation),
    payload.presentation_checksum
  );
});

test("percentile scoring preserves ties and daily maximum", () => {
  const scored = finalizePuzzleScores([
    { username: "A", elapsedMs: 1000, moves: 10, difficultyWeight: 5 },
    { username: "B", elapsedMs: 1000, moves: 10, difficultyWeight: 5 },
    { username: "C", elapsedMs: 2000, moves: 9, difficultyWeight: 5 }
  ]);
  assert.deepEqual(scored.map((row) => row.rank), [1, 1, 3]);
  assert.equal(scored[0].rawScore, scored[1].rawScore);
  assert.equal(calculatePercentileScore(1, 1), 10);
  assert.equal(calculatePercentileScore(100, 100), 1);
  assert.equal(getMaximumDailyScore(), 130);
  assert.equal(summarizeMonthlyResults(scored).weightedPoints, scored.reduce((sum, row) => sum + row.weightedScore, 0));
});

test("every month stores 155 identities but publishes only real UTC dates", () => {
  assert.throws(
    () => createRankedSeasonManifest({ seasonId: "2026-13", secretSeed: "x" }),
    /valid UTC year and month/
  );

  for (const seasonId of ["2024-02", "2025-02", "2026-04", "2026-07"]) {
    const manifest = createRankedSeasonManifest({ seasonId, secretSeed: "server-only" });
    assert.equal(manifest.slots.length, RANKED_MONTH_SLOT_COUNT);
    assert.equal(manifest.slots.filter((slot) => slot.published).length, manifest.daysInMonth * 5);
    assert.equal(new Set(manifest.slots.map((slot) => slot.puzzleId)).size, 155);
  }
});

test("one thousand ranked candidates satisfy final quality gates without locks", () => {
  for (const profile of RANKED_PUZZLE_PROFILES) {
    for (let index = 0; index < 200; index += 1) {
      const generated = PuzzleGenerator.generate({
        mode: "daily",
        puzzleId: `quality-${profile.id}-${index}`,
        seed: `quality-${profile.id}-${index}`,
        mapRadius: profile.mapRadius,
        activeTileCount: profile.activeTileCount,
        extraLoopChance: profile.extraLoopChance,
        tutorial: false,
        quality: { minimumMoves: profile.minimumMoves, maxInitialConnectedRatio: 0.25 }
      });
      assert.equal(generated.quality.completed, false);
      assert.ok(generated.minimumMoves >= profile.minimumMoves);
      assert.ok(generated.quality.connectedRatio <= 0.25);
      assert.ok(generated.qualityAttempt < 32);
      assert.equal(Object.values(generated.grid).some((tile) => tile.locked), false);
    }
  }
});

test("ranked migration is additive and future manifests stay private", async () => {
  const migrationUrl = new URL("../supabase/migrations/202607300001_add_ranked_sprints.sql", import.meta.url);
  const bytes = await readFile(migrationUrl);
  const sql = bytes.toString("utf8").toLowerCase();
  const edge = await readFile(new URL("../supabase/functions/generate-ranked-season/index.ts", import.meta.url), "utf8");
  const verifierEdge = await readFile(new URL("../supabase/functions/submit-ranked-replay/index.ts", import.meta.url), "utf8");
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(sql, /create table if not exists public\.ranked_puzzle_slots/);
  assert.match(sql, /unique \(username, play_date\)/);
  assert.match(sql, /revoke all on public\.ranked_seasons, public\.ranked_puzzle_slots/);
  assert.match(sql, /where s\.play_date=v_today and s\.published/);
  assert.match(sql, /create or replace function public\.start_ranked_attempt/);
  assert.match(sql, /current_released_at/);
  assert.match(sql, /for update/);
  assert.match(sql, /p_submission_id uuid/);
  assert.match(sql, /before insert or update or delete on public\.ranked_puzzle_slots/);
  assert.match(sql, /grant execute on function public\._ranked_slot_payload[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.players/);
  assert.doesNotMatch(sql, /truncate\s+(table\s+)?public\.players/);
  assert.match(sql, /where excluded\.stars > story_level_results_v2\.stars/);
  assert.doesNotMatch(sql, /stars=greatest\(story_level_results_v2\.stars/);
  assert.match(edge, /PuzzleGenerator/);
  assert.match(edge, /RANKED_PUZZLE_SECRET/);
  assert.match(edge, /presentation_definition/);
  assert.match(edge, /published_season_is_immutable/);
  assert.match(edge, /storedSlots: slots\.length/);
  assert.match(verifierEdge, /verifyPuzzleReplay/);
  assert.match(verifierEdge, /get_ranked_replay_context/);
  assert.match(verifierEdge, /accept_ranked_replay/);
  assert.match(verifierEdge, /submissionId/);
  assert.doesNotMatch(verifierEdge, /moveCount\s*:\s*body/);
});


test("ranked checksum migration canonicalizes jsonb without deleting players", async () => {
  const migrationUrl = new URL(
    "../supabase/migrations/202607300004_canonicalize_ranked_checksums.sql",
    import.meta.url
  );
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /_ranked_canonical_jsonb/);
  assert.match(sql, /order by item\.key/);
  assert.match(sql, /update public\.ranked_puzzle_slots/);
  assert.match(sql, /enable trigger protect_ranked_slot/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.players/);
  assert.doesNotMatch(sql, /truncate\s+(table\s+)?public\.players/);
});


test("slot forfeit migration preserves the attempt and scores later slots", async () => {
  const migrationUrl = new URL(
    "../supabase/migrations/202607300006_forfeit_ranked_slots.sql",
    import.meta.url
  );
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /current_slot_score_eligible boolean not null default true/);
  assert.match(sql, /score_eligible boolean not null default true/);
  assert.match(sql, /create or replace function public\.forfeit_current_ranked_slot/);
  assert.match(sql, /set current_slot_score_eligible=false/);
  assert.match(sql, /set current_slot=p_slot\+1[\s\S]*current_slot_score_eligible=true/);
  assert.match(sql, /and result\.score_eligible/);
  assert.match(sql, /grant execute on function public\.forfeit_current_ranked_slot/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.players/);
  assert.doesNotMatch(sql, /truncate\s+(table\s+)?public\.players/);
});
