import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/config.js";
import { PuzzleGenerator } from "../src/PuzzleGenerator.js";
import { PuzzleValidator } from "../src/PuzzleValidator.js";

test("difficulty keeps growing within the radius-3 board", () => {
  assert.equal(CONFIG.difficulty.getMapRadius(1), 2);
  assert.equal(CONFIG.difficulty.getMapRadius(3), 3);
  assert.equal(CONFIG.difficulty.getMapRadius(40), 3);

  assert.equal(CONFIG.difficulty.getActiveTileCount(10, 3, 37), 24);
  assert.equal(CONFIG.difficulty.getActiveTileCount(12, 3, 37), 26);
  assert.equal(CONFIG.difficulty.getActiveTileCount(18, 3, 37), 32);
  assert.equal(CONFIG.difficulty.getActiveTileCount(40, 3, 37), 32);

  assert.equal(CONFIG.difficulty.getExtraLoopChance(5), 0);
  assert.equal(CONFIG.difficulty.getExtraLoopChance(6), 0.1);
  assert.equal(CONFIG.difficulty.getExtraLoopChance(12), 0.12);
  assert.equal(CONFIG.difficulty.getExtraLoopChance(30), 0.14);
});

test("level 1 exposes a one-turn, non-scoring tutorial target", () => {
  const generated = PuzzleGenerator.generate(1);
  const tile = generated.grid[generated.tutorialKey];

  assert.ok(generated.tutorialKey);
  assert.ok(tile?.active);
  assert.equal(tile.source, false);
  assert.equal(tile.sink, false);
  assert.equal(tile.locked, false);
  assert.equal(tile.tutorialTarget, true);
  assert.equal(tile.rotation, 5);

  const initialMinimumMoves = generated.minimumMoves;

  assert.equal(tile.rotate(), true);
  assert.equal(tile.rotation, 0);
  assert.equal(
    PuzzleGenerator.calculateMinimumMoves(generated.grid),
    initialMinimumMoves - 1
  );
});

test("locked tiles are solved, immutable clues", () => {
  for (const level of [8, 16, 24, 40]) {
    const generated = PuzzleGenerator.generate(level);
    const activeTiles = Object.values(generated.grid).filter(
      (tile) => tile.active
    );
    const lockedTiles = activeTiles.filter((tile) => tile.locked);
    const expectedCount = CONFIG.difficulty.getLockedTileCount(
      level,
      activeTiles.length
    );

    assert.equal(lockedTiles.length, expectedCount);

    lockedTiles.forEach((tile) => {
      assert.equal(tile.source, false);
      assert.equal(tile.sink, false);
      assert.equal(tile.rotation, 0);
      assert.equal(tile.rotate(), false);
      assert.equal(tile.rotation, 0);
    });
  }
});

test("generated levels retain an exactly solvable orientation", () => {
  for (const level of [1, 6, 12, 18, 24, 40]) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const generated = PuzzleGenerator.generate(level);
      const expectedCount = CONFIG.difficulty.getActiveTileCount(
        level,
        generated.mapRadius,
        Object.keys(generated.grid).length
      );

      assert.equal(generated.activeTileCount, expectedCount);

      Object.values(generated.grid).forEach((tile) => {
        if (tile.active) tile.setRotation(0, { animate: false });
      });

      const status = PuzzleValidator.inspectGrid(generated.grid);

      assert.equal(
        status.completed,
        true,
        `level ${level}, attempt ${attempt + 1} should be solvable`
      );
      assert.equal(status.danglingExitCount, 0);
    }
  }
});
