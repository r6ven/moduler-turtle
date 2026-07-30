import { tileKey } from "./HexMath.js";
import { hydratePuzzleDefinition } from "./PuzzleDefinition.js";
import { PuzzleValidator } from "./PuzzleValidator.js";
import { hashStringToSeed } from "./PuzzleRandom.js";

export const MAX_RANKED_REPLAY_MOVES = 2000;

function finalStateHash(grid) {
  const state = Object.values(grid)
    .filter((tile) => tile.active)
    .sort((first, second) => first.q - second.q || first.r - second.r)
    .map((tile) => `${tileKey(tile.q, tile.r)}:${tile.rotation}`)
    .join("|");
  const hash = hashStringToSeed(state);
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}

export function verifyPuzzleReplay({
  definition,
  replay,
  maximumMoves = MAX_RANKED_REPLAY_MOVES,
  compatibility
}) {
  try {
    if (!Array.isArray(replay)) {
      return { valid: false, solved: false, moveCount: 0, code: "invalid_replay" };
    }

    if (replay.length < 1 || replay.length > maximumMoves) {
      return {
        valid: false,
        solved: false,
        moveCount: replay.length,
        code: "replay_length_out_of_range"
      };
    }

    const hydrated = hydratePuzzleDefinition(definition, null, compatibility);

    for (const rawKey of replay) {
      if (typeof rawKey !== "string") {
        return {
          valid: false,
          solved: false,
          moveCount: replay.length,
          code: "invalid_move_key"
        };
      }

      const tile = hydrated.grid[rawKey];

      if (!tile || !tile.active || tileKey(tile.q, tile.r) !== rawKey) {
        return {
          valid: false,
          solved: false,
          moveCount: replay.length,
          code: "inactive_or_unknown_tile"
        };
      }

      tile.rotation = (tile.rotation + 1) % 6;
      tile.visualRotation = tile.rotation;
      tile.targetVisualRotation = tile.rotation;
    }

    const status = PuzzleValidator.inspectGrid(hydrated.grid);

    return {
      valid: true,
      solved: status.completed,
      moveCount: replay.length,
      finalStateHash: finalStateHash(hydrated.grid),
      connectedTileCount: status.connectedKeys.size,
      activeTileCount: status.totalActiveTiles,
      danglingExitCount: status.danglingExitCount,
      code: status.completed ? "ok" : "unsolved"
    };
  } catch (error) {
    return {
      valid: false,
      solved: false,
      moveCount: Array.isArray(replay) ? replay.length : 0,
      code: error?.code || "invalid_definition"
    };
  }
}
