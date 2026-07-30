import { buildHexCoordinateList, tileKey } from "./HexMath.js";
import { Tile } from "./Tile.js";
import { hashStringToSeed } from "./PuzzleRandom.js";

export const PUZZLE_DEFINITION_SCHEMA_VERSION = 1;
export const RANKED_RULES_VERSION = "ranked-v2";
export const DEFAULT_RULES_VERSION = "rotation-v1";

export function calculateObjectChecksum(value) {
  const hash = hashStringToSeed(JSON.stringify(value));
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}

export function assertSupportedPuzzleDefinition(definition, {
  supportedSchemas = [PUZZLE_DEFINITION_SCHEMA_VERSION],
  supportedRules = [RANKED_RULES_VERSION, DEFAULT_RULES_VERSION]
} = {}) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError("Puzzle definition must be an object.");
  }

  if (!supportedSchemas.includes(Number(definition.schemaVersion))) {
    const error = new Error("Unsupported puzzle definition schema.");
    error.code = "UNSUPPORTED_DEFINITION_SCHEMA";
    throw error;
  }

  if (!supportedRules.includes(String(definition.rulesVersion || ""))) {
    const error = new Error("Unsupported puzzle rules version.");
    error.code = "UNSUPPORTED_RULES_VERSION";
    throw error;
  }

  const mapRadius = Number(definition.board?.mapRadius);
  const activeTileCount = Number(definition.board?.activeTileCount);

  if (!Number.isInteger(mapRadius) || mapRadius < 1 || mapRadius > 6) {
    throw new RangeError("Puzzle definition map radius is invalid.");
  }

  const coordinateKeys = new Set(
    buildHexCoordinateList(mapRadius).map(({ q, r }) => tileKey(q, r))
  );
  if (
    !Number.isInteger(activeTileCount) || activeTileCount < 2 ||
    activeTileCount > coordinateKeys.size ||
    !Array.isArray(definition.tiles) ||
    definition.tiles.length !== activeTileCount
  ) {
    throw new RangeError("Puzzle definition active tile count is invalid.");
  }

  if (
    typeof definition.puzzleId !== "string" ||
    definition.puzzleId.length < 1 || definition.puzzleId.length > 160
  ) {
    throw new RangeError("Puzzle definition identity is invalid.");
  }

  const seenKeys = new Set();
  for (const tile of definition.tiles) {
    const key = String(tile?.key || "");
    const q = Number(tile?.q);
    const r = Number(tile?.r);
    if (
      !Number.isInteger(q) || !Number.isInteger(r) ||
      key !== tileKey(q, r) || !coordinateKeys.has(key) || seenKeys.has(key)
    ) {
      throw new RangeError("Puzzle definition contains an invalid tile key.");
    }
    if (
      !Array.isArray(tile.exits) || tile.exits.length !== 6 ||
      tile.exits.some((exit) => typeof exit !== "boolean")
    ) {
      throw new RangeError(`Puzzle tile ${key} must contain six boolean exits.`);
    }
    if (!Number.isInteger(tile.rotation) || tile.rotation < 0 || tile.rotation > 5) {
      throw new RangeError(`Puzzle tile ${key} rotation is invalid.`);
    }
    if (typeof tile.source !== "boolean" || typeof tile.sink !== "boolean") {
      throw new RangeError(`Puzzle tile ${key} endpoint flags are invalid.`);
    }
    seenKeys.add(key);
  }

  return definition;
}

export function hydratePuzzleDefinition(
  definition,
  presentationDefinition = null,
  compatibility = {}
) {
  assertSupportedPuzzleDefinition(definition, compatibility);

  if (presentationDefinition) {
    if (
      typeof presentationDefinition !== "object" ||
      Number(presentationDefinition.schemaVersion) !==
        Number(definition.schemaVersion) ||
      presentationDefinition.puzzleId !== definition.puzzleId ||
      !Array.isArray(presentationDefinition.tiles)
    ) {
      throw new RangeError("Puzzle presentation definition is invalid.");
    }
  }

  const mapRadius = Number(definition.board.mapRadius);
  const gameplayTiles = new Map(
    definition.tiles.map((tile) => [String(tile.key), tile])
  );
  const presentationTiles = new Map(
    Array.isArray(presentationDefinition?.tiles)
      ? presentationDefinition.tiles.map((tile) => [String(tile.key), tile])
      : []
  );
  const grid = {};
  let tutorialKey = null;

  buildHexCoordinateList(mapRadius).forEach(({ q, r }) => {
    const key = tileKey(q, r);
    const gameplay = gameplayTiles.get(key);
    const presentation = presentationTiles.get(key);
    const active = Boolean(gameplay);
    const exits = active && Array.isArray(gameplay.exits)
      ? gameplay.exits.map(Boolean)
      : new Array(6).fill(false);

    if (exits.length !== 6) {
      throw new RangeError(`Puzzle tile ${key} must contain six exits.`);
    }

    const tile = new Tile(q, r, exits, active);

    if (gameplay) {
      if (Number(gameplay.q) !== q || Number(gameplay.r) !== r) {
        throw new RangeError(`Puzzle tile ${key} coordinates do not match its key.`);
      }

      tile.setRotation(Number(gameplay.rotation) || 0, { animate: false });
      tile.source = gameplay.source === true;
      tile.sink = gameplay.sink === true;
      tile.endpoint = tile.source || tile.sink;
      tile.victoryIndex = Number.isInteger(gameplay.victoryIndex)
        ? gameplay.victoryIndex
        : -1;
      tile.tutorialTarget = gameplay.tutorialTarget === true;
      if (tile.tutorialTarget) tutorialKey = key;
    }

    if (presentation) {
      tile.decorSeed = Number(presentation.decorSeed) >>> 0;
      tile.pulsePhase = Number(presentation.pulsePhase) || 0;
      tile.landmark = typeof presentation.landmark === "string"
        ? presentation.landmark
        : null;
      tile.landmarkVariant = Number.isInteger(presentation.landmarkVariant)
        ? presentation.landmarkVariant
        : null;
    }

    grid[key] = tile;
  });

  const sourceCount = Object.values(grid).filter((tile) => tile.source).length;
  const sinkCount = Object.values(grid).filter((tile) => tile.sink).length;

  if (sourceCount !== 1 || sinkCount !== 1) {
    throw new RangeError("Puzzle definition must contain one source and one sink.");
  }

  const checksum = calculateObjectChecksum(definition);

  return {
    grid,
    mapRadius,
    activeTileCount: definition.tiles.length,
    minimumMoves: Number(definition.difficulty?.minimumMoves) || 1,
    tutorialKey,
    puzzleId: definition.puzzleId,
    mode: definition.mode,
    seed: definition.seed,
    baseSeed: definition.baseSeed,
    qualityAttempt: Number(definition.qualityAttempt) || 0,
    generatorVersion: Number(definition.generatorVersion) || 0,
    schemaVersion: Number(definition.schemaVersion),
    rulesVersion: definition.rulesVersion,
    checksum,
    gameplayChecksum: checksum,
    presentationChecksum: presentationDefinition
      ? calculateObjectChecksum(presentationDefinition)
      : null,
    definition,
    presentationDefinition
  };
}
