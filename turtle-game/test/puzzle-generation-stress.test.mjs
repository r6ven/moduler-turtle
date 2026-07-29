import assert from "node:assert/strict";
import test from "node:test";

import { PuzzleGenerator } from "../src/PuzzleGenerator.js";

test("dense endless boards complete across a broad deterministic seed sample", () => {
  for (let seed = 0; seed < 80; seed += 1) {
    const generated = PuzzleGenerator.generate({
      mode: "endless",
      seed,
      mapRadius: 4,
      activeTileCount: 55,
      extraLoopChance: 0.24,
      lockedTileCount: 4
    });

    assert.equal(generated.activeTileCount, 55);
    assert.equal(generated.generationDiagnostics.targetLength, 55);
    assert.ok(
      generated.generationDiagnostics.nodeVisits <=
        generated.generationDiagnostics.maxNodeVisits,
      `seed ${seed} exceeded its path-search budget`
    );
  }
});
