import { DIR_NEIGHBORS, oppositeDir, tileKey } from "./HexMath.js";

export class PuzzleValidator {
  static calculateConnectedKeys(grid) {
    const startKey = "0,0";
    const visited = new Set();

    if (!grid[startKey] || !grid[startKey].active) {
      return visited;
    }

    const queue = [startKey];
    visited.add(startKey);

    while (queue.length > 0) {
      const currentKey = queue.shift();
      const tile = grid[currentKey];

      if (!tile || !tile.active) continue;

      const actualExits = tile.getActualExits();

      for (let i = 0; i < 6; i += 1) {
        if (!actualExits[i]) continue;

        const dir = DIR_NEIGHBORS[i];
        const neighborKey = tileKey(tile.q + dir.q, tile.r + dir.r);
        const neighbor = grid[neighborKey];

        if (!neighbor || !neighbor.active || visited.has(neighborKey)) continue;

        const neighborExits = neighbor.getActualExits();

        if (neighborExits[oppositeDir(i)]) {
          visited.add(neighborKey);
          queue.push(neighborKey);
        }
      }
    }

    return visited;
  }

  static isExitMatched(tile, dirIndex, grid) {
    if (!tile || !tile.active) return false;

    const exits = tile.getActualExits();

    if (!exits[dirIndex]) return false;

    const dir = DIR_NEIGHBORS[dirIndex];
    const neighbor = grid[tileKey(tile.q + dir.q, tile.r + dir.r)];

    if (!neighbor || !neighbor.active) return false;

    const neighborExits = neighbor.getActualExits();

    return neighborExits[oppositeDir(dirIndex)] === true;
  }

  static tileHasAllExitsMatched(tile, grid) {
    if (!tile || !tile.active) return true;

    const exits = tile.getActualExits();

    for (let i = 0; i < 6; i += 1) {
      if (exits[i] && !PuzzleValidator.isExitMatched(tile, i, grid)) {
        return false;
      }
    }

    return true;
  }

  static countDanglingExits(grid) {
    let count = 0;

    Object.values(grid).forEach((tile) => {
      if (!tile.active) return;

      const exits = tile.getActualExits();

      for (let i = 0; i < 6; i += 1) {
        if (exits[i] && !PuzzleValidator.isExitMatched(tile, i, grid)) {
          count += 1;
        }
      }
    });

    return count;
  }

  static inspectGrid(grid) {
    const connectedKeys = PuzzleValidator.calculateConnectedKeys(grid);
    const activeTiles = Object.values(grid).filter((tile) => tile.active);
    const danglingExitCount = PuzzleValidator.countDanglingExits(grid);

    let fullyValidConnectedCount = 0;

    Object.keys(grid).forEach((key) => {
      const tile = grid[key];

      const isValid = tile.active &&
        connectedKeys.has(key) &&
        PuzzleValidator.tileHasAllExitsMatched(tile, grid);

      if (isValid) {
        fullyValidConnectedCount += 1;
      }
    });

    return {
      connectedKeys,
      activeTiles,
      connectedCount: fullyValidConnectedCount,
      totalActiveTiles: activeTiles.length,
      danglingExitCount,
      completed: connectedKeys.size === activeTiles.length && danglingExitCount === 0
    };
  }

  static applyBloomState(grid, status = PuzzleValidator.inspectGrid(grid)) {
    Object.keys(grid).forEach((key) => {
      const tile = grid[key];

      tile.flowerBloomed = tile.active &&
        status.connectedKeys.has(key) &&
        PuzzleValidator.tileHasAllExitsMatched(tile, grid);
    });

    return status;
  }
}
