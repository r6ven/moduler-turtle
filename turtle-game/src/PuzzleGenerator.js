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
import {
  createPuzzleRandomStreams,
  createRuntimePuzzleSeed,
  hashStringToSeed,
  normalizePuzzleSeed
} from "./PuzzleRandom.js";

export const PUZZLE_GENERATOR_VERSION = 1;

const SUPPORTED_MODES = new Set(["story", "endless", "daily"]);
const MAX_MAP_RADIUS = 6;

export class PuzzleGenerator {
  static generate(request) {
    const options = PuzzleGenerator.resolveGenerationOptions(request);
    const randomStreams = createPuzzleRandomStreams(options.seed);
    const coords = buildHexCoordinateList(options.mapRadius);
    const cleanMap = PuzzleGenerator.createCleanSolvedMap(
      coords,
      options,
      randomStreams.get("path")
    );
    const victoryOrder = new Map(
      cleanMap.pathKeys.map((key, index) => [key, index])
    );
    const decorRandom = randomStreams.get("decor");
    const grid = {};

    coords.forEach(({ q, r }) => {
      const key = tileKey(q, r);
      const active = cleanMap.activeKeys.has(key);
      const tile = new Tile(q, r, cleanMap.exitMap[key], active);

      tile.victoryIndex = victoryOrder.get(key) ?? -1;
      tile.decorSeed = Math.floor(decorRandom() * 0x100000000) >>> 0;
      tile.pulsePhase = decorRandom() * Math.PI * 2;
      grid[key] = tile;
    });

    PuzzleGenerator.assignTerminals(
      grid,
      cleanMap.pathKeys[0],
      cleanMap.pathKeys[cleanMap.pathKeys.length - 1]
    );
    PuzzleGenerator.addExtraLoops(
      grid,
      options.extraLoopChance,
      randomStreams.get("loops")
    );
    PuzzleGenerator.assertSolvedTopology(grid, options);
    PuzzleGenerator.assignLandmarks(grid, randomStreams.get("landmarks"));
    PuzzleGenerator.shuffleLevelRotations(
      grid,
      randomStreams.get("rotations")
    );
    PuzzleGenerator.assignLockedTiles(
      grid,
      options.lockedTileCount,
      randomStreams.get("locked-tiles")
    );
    const tutorialKey = options.tutorial
      ? PuzzleGenerator.prepareTutorialTile(grid, 1)
      : null;
    const activeTiles = Object.values(grid).filter((tile) => tile.active);
    const minimumMoves = PuzzleGenerator.calculateMinimumMoves(grid);
    const definition = PuzzleGenerator.createPuzzleDefinition(
      grid,
      options,
      minimumMoves
    );
    const checksum = PuzzleGenerator.calculateDefinitionChecksum(definition);

    return {
      grid,
      mapRadius: options.mapRadius,
      activeTileCount: activeTiles.length,
      minimumMoves,
      tutorialKey,
      puzzleId: options.puzzleId,
      mode: options.mode,
      seed: options.seed,
      generatorVersion: PUZZLE_GENERATOR_VERSION,
      checksum,
      definition,
      generationDiagnostics: cleanMap.diagnostics
    };
  }

  static resolveGenerationOptions(request) {
    const isLegacyRequest = typeof request === "number";
    const input = isLegacyRequest ? { level: request } : request;

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("PuzzleGenerator.generate expects a level or options object.");
    }

    const mode = input.mode || "story";

    if (!SUPPORTED_MODES.has(mode)) {
      throw new RangeError(`Unsupported puzzle mode: ${mode}`);
    }

    if (mode === "daily" && input.seed == null) {
      throw new TypeError("Daily puzzles require an explicit deterministic seed.");
    }

    const level = PuzzleGenerator.toBoundedInteger(input.level ?? 1, 1, 10000);
    const mapRadius = PuzzleGenerator.toBoundedInteger(
      input.mapRadius ?? CONFIG.difficulty.getMapRadius(level),
      1,
      MAX_MAP_RADIUS
    );
    const totalTileCount = 1 + 3 * mapRadius * (mapRadius + 1);
    const defaultActiveTileCount = CONFIG.difficulty.getActiveTileCount(
      level,
      mapRadius,
      totalTileCount
    );
    const activeTileCount = PuzzleGenerator.toBoundedInteger(
      input.activeTileCount ?? defaultActiveTileCount,
      2,
      totalTileCount
    );
    const extraLoopChance = PuzzleGenerator.toBoundedNumber(
      input.extraLoopChance ?? CONFIG.difficulty.getExtraLoopChance(level),
      0,
      0.5
    );
    const defaultLockedTileCount = CONFIG.difficulty.getLockedTileCount(
      level,
      activeTileCount
    );
    const lockedTileCount = PuzzleGenerator.toBoundedInteger(
      input.lockedTileCount ?? defaultLockedTileCount,
      0,
      Math.max(0, activeTileCount - 2)
    );
    const seed = input.seed == null
      ? createRuntimePuzzleSeed()
      : normalizePuzzleSeed(input.seed);
    const tutorial = Boolean(
      input.tutorial ?? (mode === "story" && level === 1)
    );
    const defaultNodeBudget = Math.min(
      250000,
      Math.max(12000, totalTileCount * activeTileCount * 24)
    );
    const maxNodeVisits = PuzzleGenerator.toBoundedInteger(
      input.search?.maxNodeVisits ?? defaultNodeBudget,
      1000,
      1000000
    );
    const maxAttempts = PuzzleGenerator.toBoundedInteger(
      input.search?.maxAttempts ?? 32,
      1,
      128
    );
    const puzzleId = typeof input.puzzleId === "string" && input.puzzleId.trim()
      ? input.puzzleId.trim()
      : `${mode}-v${PUZZLE_GENERATOR_VERSION}-${seed}`;

    return Object.freeze({
      mode,
      level,
      mapRadius,
      activeTileCount,
      extraLoopChance,
      lockedTileCount,
      seed,
      puzzleId,
      tutorial,
      search: Object.freeze({ maxNodeVisits, maxAttempts })
    });
  }

  static toBoundedInteger(value, minimum, maximum) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new TypeError(`Expected a finite integer, received ${value}.`);
    }

    return Math.max(minimum, Math.min(maximum, Math.floor(number)));
  }

  static toBoundedNumber(value, minimum, maximum) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new TypeError(`Expected a finite number, received ${value}.`);
    }

    return Math.max(minimum, Math.min(maximum, number));
  }
  static createCleanSolvedMap(coords, options, random) {
    const exitMap = {};
    const activeKeys = new Set();
    const pathResult = PuzzleGenerator.buildSparsePath(
      coords,
      options.activeTileCount,
      random,
      options.search
    );
    const path = pathResult.path;

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

      if (dirIndex === -1) {
        throw new Error("Puzzle path contains non-adjacent hexes.");
      }

      const currentKey = tileKey(current.q, current.r);
      const nextKey = tileKey(next.q, next.r);

      exitMap[currentKey][dirIndex] = true;
      exitMap[nextKey][oppositeDir(dirIndex)] = true;
    }

    return {
      exitMap,
      activeKeys,
      pathKeys: path.map(({ q, r }) => tileKey(q, r)),
      diagnostics: pathResult.diagnostics
    };
  }

  static buildSparsePath(coords, desiredLength, random, searchOptions = {}) {
    const coordSet = new Set(coords.map(({ q, r }) => tileKey(q, r)));
    const start = { q: 0, r: 0 };
    const targetLength = Math.max(
      2,
      Math.min(Math.floor(desiredLength), coords.length)
    );
    const maxNodeVisits = Math.max(
      1000,
      Math.floor(searchOptions.maxNodeVisits || 50000)
    );
    const maxAttempts = Math.max(
      1,
      Math.floor(searchOptions.maxAttempts || 32)
    );
    const adjacency = new Map();

    coords.forEach((coord) => {
      adjacency.set(
        tileKey(coord.q, coord.r),
        DIR_NEIGHBORS
          .map((dir) => ({ q: coord.q + dir.q, r: coord.r + dir.r }))
          .filter((candidate) => coordSet.has(tileKey(candidate.q, candidate.r)))
      );
    });

    let nodeVisits = 0;
    let attempts = 0;
    let bestPath = [start];
    let solvedPath = null;
    let attemptDeadline = maxNodeVisits;

    function tryBuildPath() {
      const path = [start];
      const used = new Set([tileKey(start.q, start.r)]);

      function dfs() {
        nodeVisits += 1;

        if (path.length > bestPath.length) {
          bestPath = path.map((coord) => ({ ...coord }));
        }

        if (path.length >= targetLength) {
          return true;
        }

        if (nodeVisits >= attemptDeadline) {
          return false;
        }

        const current = path[path.length - 1];
        const currentKey = tileKey(current.q, current.r);
        const options = adjacency
          .get(currentKey)
          .filter((candidate) => !used.has(tileKey(candidate.q, candidate.r)))
          .map((candidate) => {
            const candidateKey = tileKey(candidate.q, candidate.r);
            const onwardCount = adjacency
              .get(candidateKey)
              .filter((next) => !used.has(tileKey(next.q, next.r)))
              .length;

            return {
              candidate,
              onwardCount,
              tieBreaker: random()
            };
          })
          .sort((first, second) => (
            first.onwardCount - second.onwardCount ||
            first.tieBreaker - second.tieBreaker
          ));

        for (const option of options) {
          if (nodeVisits >= attemptDeadline) break;

          const next = option.candidate;
          const key = tileKey(next.q, next.r);

          used.add(key);
          path.push(next);

          if (dfs()) return true;

          path.pop();
          used.delete(key);
        }

        return false;
      }

      return dfs() ? path.map((coord) => ({ ...coord })) : null;
    }

    while (attempts < maxAttempts && nodeVisits < maxNodeVisits) {
      const remainingAttempts = maxAttempts - attempts;
      const remainingBudget = maxNodeVisits - nodeVisits;
      const attemptBudget = Math.max(
        1,
        Math.floor(remainingBudget / remainingAttempts)
      );

      attemptDeadline = nodeVisits + attemptBudget;
      attempts += 1;
      solvedPath = tryBuildPath();

      if (solvedPath) break;
    }

    if (!solvedPath) {
      throw new Error(
        `Puzzle path search exhausted its ${maxNodeVisits} node budget ` +
        `(target ${targetLength}, best ${bestPath.length}, attempts ${attempts}).`
      );
    }

    return {
      path: solvedPath,
      diagnostics: Object.freeze({
        targetLength,
        nodeVisits,
        attempts,
        maxNodeVisits,
        budgetExhausted: nodeVisits >= maxNodeVisits
      })
    };
  }
  static addExtraLoops(grid, chance, random) {

    if (chance <= 0) return;

    Object.values(grid).forEach((tile) => {
      if (!tile.active || tile.source || tile.sink) return;

      DIR_NEIGHBORS.forEach((dir, index) => {
        if (tile.exits[index]) return;

        const currentKey = tileKey(tile.q, tile.r);
        const neighborKey = tileKey(tile.q + dir.q, tile.r + dir.r);
        const neighbor = grid[neighborKey];

        if (
          !neighbor ||
          !neighbor.active ||
          neighbor.source ||
          neighbor.sink
        ) {
          return;
        }

        if (currentKey.localeCompare(neighborKey) >= 0) return;
        if (random() > chance) return;

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

  static assignLandmarks(grid, random) {
    const tiles = Object.values(grid);
    const inactiveTiles = shuffled(tiles.filter((tile) => !tile.active), random);
    const shrubCount = Math.min(
      Math.max(0, inactiveTiles.length - 1),
      inactiveTiles.length >= 12 ? 3 : inactiveTiles.length >= 7 ? 2 : 1
    );
    const firstVariant = inactiveTiles[0]?.decorSeed % 4 || 0;
    const shrubTiles = [];

    for (let index = 0; index < shrubCount; index += 1) {
      const separatedIndex = inactiveTiles.findIndex((tile) => {
        return shrubTiles.every((shrubTile) => {
          const deltaQ = tile.q - shrubTile.q;
          const deltaR = tile.r - shrubTile.r;
          const distance = Math.max(
            Math.abs(deltaQ),
            Math.abs(deltaR),
            Math.abs(deltaQ + deltaR)
          );

          return distance > 1;
        });
      });
      const shrubTile = separatedIndex >= 0
        ? inactiveTiles.splice(separatedIndex, 1)[0]
        : inactiveTiles.shift();

      if (!shrubTile) break;

      shrubTile.landmark = "shrub";
      shrubTile.landmarkVariant = (firstVariant + index) % 4;
      shrubTiles.push(shrubTile);
    }

    const lanternIndex = inactiveTiles.findIndex((tile) => {
      return shrubTiles.every((shrubTile) => {
        const deltaQ = tile.q - shrubTile.q;
        const deltaR = tile.r - shrubTile.r;
        const distance = Math.max(
          Math.abs(deltaQ),
          Math.abs(deltaR),
          Math.abs(deltaQ + deltaR)
        );

        return distance > 1;
      });
    });
    const lanternTile = lanternIndex >= 0
      ? inactiveTiles.splice(lanternIndex, 1)[0]
      : inactiveTiles.shift();

    if (lanternTile) {
      lanternTile.landmark = "lantern";
    }

  }

  static assignLockedTiles(grid, requestedCount, random) {
    const activeTiles = Object.values(grid).filter((tile) => tile.active);

    if (requestedCount <= 0) return [];

    const candidates = shuffled(
      activeTiles.filter((tile) => (
        !tile.source &&
        !tile.sink &&
        tile.degree() === 2
      )),
      random
    );
    const lockedTiles = [];

    for (const tile of candidates) {
      const separated = lockedTiles.every((lockedTile) => {
        const deltaQ = tile.q - lockedTile.q;
        const deltaR = tile.r - lockedTile.r;
        const distance = Math.max(
          Math.abs(deltaQ),
          Math.abs(deltaR),
          Math.abs(deltaQ + deltaR)
        );

        return distance > 1;
      });

      if (!separated && candidates.length > requestedCount) continue;

      tile.setRotation(0, { animate: false });
      tile.locked = true;
      lockedTiles.push(tile);

      if (lockedTiles.length >= requestedCount) break;
    }

    if (lockedTiles.length < requestedCount) {
      candidates
        .filter((tile) => !tile.locked)
        .slice(0, requestedCount - lockedTiles.length)
        .forEach((tile) => {
          tile.setRotation(0, { animate: false });
          tile.locked = true;
          lockedTiles.push(tile);
        });
    }

    return lockedTiles.map((tile) => tileKey(tile.q, tile.r));
  }

  static prepareTutorialTile(grid, level) {
    if (level !== 1) return null;

    const tile = Object.values(grid)
      .filter((candidate) => (
        candidate.active &&
        !candidate.source &&
        !candidate.sink &&
        !candidate.locked
      ))
      .sort((a, b) => a.victoryIndex - b.victoryIndex)[0];

    if (!tile) return null;

    tile.setRotation(5, { animate: false });
    tile.tutorialTarget = true;

    return tileKey(tile.q, tile.r);
  }

  static assertSolvedTopology(grid, options) {
    const status = PuzzleValidator.inspectGrid(grid);

    if (
      !status.completed ||
      status.totalActiveTiles !== options.activeTileCount
    ) {
      throw new Error(
        `Generated puzzle ${options.puzzleId} failed topology validation ` +
        `(connected ${status.connectedKeys.size}/${status.totalActiveTiles}, ` +
        `dangling ${status.danglingExitCount}).`
      );
    }
  }

  static createPuzzleDefinition(grid, options, minimumMoves) {
    const tiles = Object.values(grid)
      .filter((tile) => tile.active)
      .sort((first, second) => first.q - second.q || first.r - second.r)
      .map((tile) => ({
        key: tileKey(tile.q, tile.r),
        q: tile.q,
        r: tile.r,
        exits: tile.exits.map(Boolean),
        rotation: tile.rotation,
        locked: tile.locked,
        source: tile.source,
        sink: tile.sink,
        victoryIndex: tile.victoryIndex
      }));

    return {
      puzzleId: options.puzzleId,
      mode: options.mode,
      generatorVersion: PUZZLE_GENERATOR_VERSION,
      seed: options.seed,
      board: {
        mapRadius: options.mapRadius,
        activeTileCount: options.activeTileCount
      },
      difficulty: {
        extraLoopChance: options.extraLoopChance,
        lockedTileCount: options.lockedTileCount,
        minimumMoves
      },
      tutorial: options.tutorial,
      tiles
    };
  }

  static calculateDefinitionChecksum(definition) {
    const hash = hashStringToSeed(JSON.stringify(definition));
    return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
  }
  static calculateMinimumMoves(grid) {
    return Object.values(grid)
      .filter((tile) => tile.active && !tile.locked)
      .reduce((total, tile) => {
        return total + PuzzleGenerator.getMinimumMovesForTile(tile);
      }, 0);
  }

  static getClosestSolvedRotation(tile) {
    let bestRotation = 0;
    let bestMoves = Number.POSITIVE_INFINITY;

    for (let targetRotation = 0; targetRotation < 6; targetRotation += 1) {
      if (!PuzzleGenerator.hasSameExitShape(tile.exits, targetRotation)) {
        continue;
      }

      const moves = (targetRotation - tile.rotation + 6) % 6;

      if (moves < bestMoves) {
        bestRotation = targetRotation;
        bestMoves = moves;
      }
    }

    return {
      rotation: bestRotation,
      moves: Number.isFinite(bestMoves)
        ? bestMoves
        : (6 - tile.rotation) % 6
    };
  }

  static getMinimumMovesForTile(tile) {
    return PuzzleGenerator.getClosestSolvedRotation(tile).moves;
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

  static shuffleLevelRotations(grid, random) {
    const tiles = Object.values(grid).filter(
      (tile) => tile.active && !tile.locked
    );

    tiles.forEach((tile) => {
      tile.setRotation(Math.floor(random() * 6), { animate: false });
    });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const status = PuzzleValidator.inspectGrid(grid);
      const tooEasy = status.connectedCount > tiles.length * 0.45;
      const allSolved = status.completed;

      if (!tooEasy && !allSolved) {
        return;
      }

      tiles.forEach((tile) => {
        tile.setRotation(Math.floor(random() * 6), { animate: false });
      });
    }

    tiles
      .filter((tile) => tile.q !== 0 || tile.r !== 0)
      .slice(0, 4)
      .forEach((tile) => {
        tile.setRotation(
          (tile.rotation + 1 + Math.floor(random() * 5)) % 6,
          { animate: false }
        );
      });
  }
}
