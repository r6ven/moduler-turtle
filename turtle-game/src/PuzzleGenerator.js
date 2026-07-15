import { CONFIG } from "./config.js";
import { Tile } from "./Tile.js";
import {
  DIR_NEIGHBORS,
  buildHexCoordinateList,
  getDirectionIndex,
  oppositeDir,
  shuffled,
  tileKey
} from "./HexMath.js";
import { PuzzleValidator } from "./PuzzleValidator.js";

export class PuzzleGenerator {
  static generate(level) {
    const mapRadius = CONFIG.difficulty.getMapRadius(level);
    const coords = buildHexCoordinateList(mapRadius);
    const cleanMap = PuzzleGenerator.createCleanSolvedMap(coords, level, mapRadius);
    const victoryOrder = new Map(
      cleanMap.pathKeys.map((key, index) => [key, index])
    );
    const grid = {};

    coords.forEach(({ q, r }) => {
      const key = tileKey(q, r);
      const active = cleanMap.activeKeys.has(key);

      grid[key] = new Tile(q, r, cleanMap.exitMap[key], active);
      grid[key].victoryIndex = victoryOrder.get(key) ?? -1;
    });

    PuzzleGenerator.assignTerminals(
      grid,
      cleanMap.pathKeys[0],
      cleanMap.pathKeys[cleanMap.pathKeys.length - 1]
    );
    PuzzleGenerator.addExtraLoops(grid, level);
    PuzzleGenerator.shuffleLevelRotations(grid);

    const activeTiles = Object.values(grid).filter((tile) => tile.active);
const minimumMoves = PuzzleGenerator.calculateMinimumMoves(grid);

return {
  grid,
  mapRadius,
  activeTileCount: activeTiles.length,
  minimumMoves
};
  }

  static createCleanSolvedMap(coords, level, mapRadius) {
    const exitMap = {};
    const activeKeys = new Set();
    const desiredLength = CONFIG.difficulty.getActiveTileCount(level, mapRadius, coords.length);
    const path = PuzzleGenerator.buildSparsePath(coords, desiredLength);

    coords.forEach(({ q, r }) => {
      exitMap[tileKey(q, r)] = new Array(6).fill(false);
    });

    path.forEach(({ q, r }) => {
      activeKeys.add(tileKey(q, r));
    });

    for (let i = 0; i < path.length - 1; i += 1) {
      const current = path[i];
      const next = path[i + 1];
      const dirIndex = getDirectionIndex(current, next);

      if (dirIndex === -1) continue;

      const currentKey = tileKey(current.q, current.r);
      const nextKey = tileKey(next.q, next.r);

      exitMap[currentKey][dirIndex] = true;
      exitMap[nextKey][oppositeDir(dirIndex)] = true;
    }

    return {
      exitMap,
      activeKeys,
      pathKeys: path.map(({ q, r }) => tileKey(q, r))
    };
  }

  static buildSparsePath(coords, desiredLength) {
    const coordSet = new Set(coords.map(({ q, r }) => tileKey(q, r)));
    const start = { q: 0, r: 0 };

    function tryBuildPath() {
      const path = [start];
      const used = new Set([tileKey(start.q, start.r)]);

      function dfs() {
        if (path.length >= desiredLength) {
          return true;
        }

        const current = path[path.length - 1];
        const options = shuffled(
          DIR_NEIGHBORS.map((dir) => ({
            q: current.q + dir.q,
            r: current.r + dir.r
          }))
        ).filter((candidate) => {
          const key = tileKey(candidate.q, candidate.r);
          return coordSet.has(key) && !used.has(key);
        });

        for (const next of options) {
          const key = tileKey(next.q, next.r);
          used.add(key);
          path.push(next);

          if (dfs()) {
            return true;
          }

          path.pop();
          used.delete(key);
        }

        return false;
      }

      return dfs() ? path : null;
    }

    for (let attempt = 0; attempt < 160; attempt += 1) {
      const path = tryBuildPath();

      if (path) {
        return path;
      }
    }

    const safePath = [start];
    const used = new Set(["0,0"]);

    while (safePath.length < desiredLength) {
      const current = safePath[safePath.length - 1];
      const options = shuffled(
        DIR_NEIGHBORS.map((dir) => ({
          q: current.q + dir.q,
          r: current.r + dir.r
        }))
      ).filter((candidate) => {
        const key = tileKey(candidate.q, candidate.r);
        return coordSet.has(key) && !used.has(key);
      });

      if (options.length === 0) break;

      const next = options[0];
      safePath.push(next);
      used.add(tileKey(next.q, next.r));
    }

    return safePath;
  }

  static addExtraLoops(grid, level) {
    const chance = CONFIG.difficulty.getExtraLoopChance(level);

    if (chance <= 0) return;

    Object.values(grid).forEach((tile) => {
      if (!tile.active || tile.source || tile.sink) return;

      DIR_NEIGHBORS.forEach((dir, index) => {
        if (Math.random() > chance) return;
        if (tile.exits[index]) return;

        const neighbor = grid[tileKey(tile.q + dir.q, tile.r + dir.r)];

        if (
          !neighbor ||
          !neighbor.active ||
          neighbor.source ||
          neighbor.sink
        ) {
          return;
        }

        tile.exits[index] = true;
        neighbor.exits[oppositeDir(index)] = true;
      });
    });
  }

  static assignTerminals(grid, sourceKey, sinkKey) {
    Object.values(grid).forEach((tile) => {
      tile.source = tileKey(tile.q, tile.r) === sourceKey;
      tile.sink = tileKey(tile.q, tile.r) === sinkKey;
      tile.endpoint = tile.source || tile.sink;
    });
  }

static calculateMinimumMoves(grid) {
  return Object.values(grid)
    .filter((tile) => tile.active)
    .reduce((total, tile) => {
      return total + PuzzleGenerator.getMinimumMovesForTile(tile);
    }, 0);
}

static getMinimumMovesForTile(tile) {
  const exits = tile.exits;

  let bestMoves = Infinity;

  for (let targetRotation = 0; targetRotation < 6; targetRotation += 1) {
    if (!PuzzleGenerator.hasSameExitShape(exits, targetRotation)) {
      continue;
    }

    const moves = (targetRotation - tile.rotation + 6) % 6;

    if (moves < bestMoves) {
      bestMoves = moves;
    }
  }

  if (!Number.isFinite(bestMoves)) {
    return (6 - tile.rotation) % 6;
  }

  return bestMoves;
}

static hasSameExitShape(exits, rotation) {
  for (let i = 0; i < 6; i += 1) {
    const rotatedIndex = (i + rotation) % 6;

    if (exits[i] !== exits[rotatedIndex]) {
      return false;
    }
  }

  return true;
}

  static shuffleLevelRotations(grid) {
    const tiles = Object.values(grid).filter((tile) => tile.active);

    tiles.forEach((tile) => {
      tile.setRotation(Math.floor(Math.random() * 6), { animate: false });
    });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const status = PuzzleValidator.inspectGrid(grid);
      const tooEasy = status.connectedCount > tiles.length * 0.45;
      const allSolved = status.completed;

      if (!tooEasy && !allSolved) {
        return;
      }

      tiles.forEach((tile) => {
        tile.setRotation(Math.floor(Math.random() * 6), { animate: false });
      });
    }

    tiles
      .filter((tile) => tile.q !== 0 || tile.r !== 0)
      .slice(0, 4)
      .forEach((tile) => {
        tile.setRotation(
          (tile.rotation + 1 + Math.floor(Math.random() * 5)) % 6,
          { animate: false }
        );
      });
  }
}
