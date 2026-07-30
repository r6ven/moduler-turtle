import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRankedSeasonManifest, RANKED_MONTH_SLOT_COUNT } from "../src/RankedCalendar.js";
import { RANKED_GENERATOR_VERSION, RANKED_PUZZLE_PROFILES } from "../src/RankedSprintConfig.js";
import { RankedSprintSession } from "../src/RankedSprintSession.js";
import { calculatePercentileScore, finalizePuzzleScores, getMaximumDailyScore, summarizeMonthlyResults } from "../src/RankedScoring.js";
import { PUZZLE_GENERATOR_VERSION, PuzzleGenerator } from "../src/PuzzleGenerator.js";

function manifestPayload() {
  return {
    ok: true,
    attempt_id: "00000000-0000-0000-0000-000000000001",
    play_date: "2026-07-30",
    season_id: "2026-07",
    puzzles: RANKED_PUZZLE_PROFILES.map((profile) => ({ slot: profile.slot, seed: profile.slot * 100, puzzle_id: `ranked-v2-test-${profile.slot}`, checksum: `server-${profile.slot}` }))
  };
}

test("ranked generator contract tracks the browser generator version", () => {
  assert.equal(RANKED_GENERATOR_VERSION, PUZZLE_GENERATOR_VERSION);
});

test("ranked session uses the fixed five-profile ladder and cannot pause", () => {
  let now = 1000;
  const session = new RankedSprintSession({ now: () => now });
  session.claim(manifestPayload());
  assert.equal(session.getCurrentPuzzleRequest().mode, "daily");
  assert.equal(session.getCurrentPuzzleRequest().activeTileCount, 14);
  session.beginPuzzle({ minimumMoves: 20, puzzleId: "ranked-v2-test-1", checksum: "server-1", generatorVersion: 2 });
  session.activate();
  now = 5000;
  session.pauseTimer();
  now = 8000;
  assert.equal(session.getElapsedSeconds(), 7);
  session.invalidate("menu_opened");
  assert.equal(session.getStatus().valid, false);
  assert.equal(session.getStatus().invalidReason, "menu_opened");
});


test("a repeated daily series becomes pauseable training and never stays ranked", () => {
  let now = 0;
  const session = new RankedSprintSession({ now: () => now });
  session.claim({ ...manifestPayload(), ranked: false, replay_training_only: true });
  session.beginPuzzle({ minimumMoves: 20, puzzleId: "ranked-v2-test-1", checksum: "server-1", generatorVersion: 2 });
  session.activate();
  now = 2000;
  session.pauseTimer();
  now = 9000;
  assert.equal(session.getElapsedSeconds(), 2);
  session.addHint();
  assert.equal(session.getStatus().ranked, false);
  assert.equal(session.getStatus().valid, false);
  assert.equal(session.hintsUsed, 1);
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
  const sql = (await readFile(new URL("../supabase/migrations/202607300001_add_ranked_sprints.sql", import.meta.url), "utf8")).toLowerCase();
  const edge = await readFile(new URL("../supabase/functions/generate-ranked-season/index.ts", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.ranked_puzzle_slots/);
  assert.match(sql, /unique \(username, play_date\)/);
  assert.match(sql, /revoke all on public\.ranked_seasons, public\.ranked_puzzle_slots/);
  assert.match(sql, /where s\.play_date = v_today and s\.published/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.players/);
  assert.doesNotMatch(sql, /truncate\s+(table\s+)?public\.players/);
  assert.match(sql, /where excluded\.stars > story_level_results_v2\.stars/);
  assert.doesNotMatch(sql, /stars=greatest\(story_level_results_v2\.stars/);
  assert.match(edge, /PuzzleGenerator/);
  assert.match(edge, /RANKED_PUZZLE_SECRET/);
  assert.match(edge, /storedSlots: slots\.length/);
});
