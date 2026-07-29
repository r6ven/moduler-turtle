import assert from "node:assert/strict";
import test from "node:test";

import {
  PUZZLE_GENERATOR_VERSION,
  PuzzleGenerator
} from "../src/PuzzleGenerator.js";
import { PuzzleValidator } from "../src/PuzzleValidator.js";

function solvedStatus(generated) {
  Object.values(generated.grid).forEach((tile) => {
    if (tile.active) tile.setRotation(0, { animate: false });
  });

  return PuzzleValidator.inspectGrid(generated.grid);
}

test("daily generation requires an explicit seed", () => {
  assert.throws(
    () => PuzzleGenerator.generate({ mode: "daily" }),
    /require an explicit deterministic seed/
  );
});

test("the same daily request produces the same definition and checksum", () => {
  const request = {
    mode: "daily",
    puzzleId: "daily-2026-07-29-03",
    seed: "2026-07-29:slot-3:hard:v1",
    mapRadius: 3,
    activeTileCount: 28,
    extraLoopChance: 0.18,
    lockedTileCount: 2
  };
  const first = PuzzleGenerator.generate(request);
  const second = PuzzleGenerator.generate(request);

  assert.equal(first.generatorVersion, PUZZLE_GENERATOR_VERSION);
  assert.equal(first.checksum, second.checksum);
  assert.deepEqual(first.definition, second.definition);
  assert.deepEqual(
    Object.values(first.grid).map((tile) => ({
      decorSeed: tile.decorSeed,
      landmark: tile.landmark,
      landmarkVariant: tile.landmarkVariant
    })),
    Object.values(second.grid).map((tile) => ({
      decorSeed: tile.decorSeed,
      landmark: tile.landmark,
      landmarkVariant: tile.landmarkVariant
    }))
  );
});

test("different endless seeds create different puzzle identities", () => {
  const base = {
    mode: "endless",
    mapRadius: 3,
    activeTileCount: 26,
    extraLoopChance: 0.12,
    lockedTileCount: 1
  };
  const first = PuzzleGenerator.generate({ ...base, seed: 1001 });
  const second = PuzzleGenerator.generate({ ...base, seed: 1002 });

  assert.notEqual(first.checksum, second.checksum);
  assert.notDeepEqual(first.definition.tiles, second.definition.tiles);
});

test("configured endless boards keep their exact size and solved topology", () => {
  for (const seed of [1, 7, 42, 20260729, 0xffffffff]) {
    const generated = PuzzleGenerator.generate({
      mode: "endless",
      puzzleId: `endless-large-hard-${seed}`,
      seed,
      mapRadius: 4,
      activeTileCount: 48,
      extraLoopChance: 0.2,
      lockedTileCount: 3
    });
    const status = solvedStatus(generated);

    assert.equal(generated.activeTileCount, 48);
    assert.equal(generated.definition.board.activeTileCount, 48);
    assert.equal(status.completed, true, `seed ${seed} should be solvable`);
    assert.equal(status.danglingExitCount, 0);
    assert.ok(
      generated.generationDiagnostics.nodeVisits <=
        generated.generationDiagnostics.maxNodeVisits
    );
  }
});

test("legacy story generation remains supported", () => {
  const generated = PuzzleGenerator.generate(12);

  assert.equal(generated.mode, "story");
  assert.equal(generated.mapRadius, 3);
  assert.equal(generated.activeTileCount, 26);
  assert.equal(solvedStatus(generated).completed, true);
});
