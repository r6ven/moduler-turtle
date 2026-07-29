const UINT32_RANGE = 0x100000000;

export function hashStringToSeed(value) {
  const text = String(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function normalizePuzzleSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.floor(seed) >>> 0;
  }

  if (typeof seed === "bigint") {
    return Number(seed & 0xffffffffn) >>> 0;
  }

  if (typeof seed === "string" && seed.length > 0) {
    return hashStringToSeed(seed);
  }

  throw new TypeError("Puzzle seed must be a finite number, bigint or string.");
}

export function derivePuzzleSeed(seed, scope) {
  const normalizedSeed = normalizePuzzleSeed(seed);
  return hashStringToSeed(`${normalizedSeed}:${scope}`);
}

export function createSeededRandom(seed) {
  let state = normalizePuzzleSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

export function createPuzzleRandomStreams(seed) {
  const normalizedSeed = normalizePuzzleSeed(seed);
  const cache = new Map();

  return {
    seed: normalizedSeed,
    get(scope) {
      if (!cache.has(scope)) {
        cache.set(
          scope,
          createSeededRandom(derivePuzzleSeed(normalizedSeed, scope))
        );
      }

      return cache.get(scope);
    }
  };
}

export function createRuntimePuzzleSeed() {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] >>> 0;
  }

  return hashStringToSeed(
    `${Date.now()}:${Math.random()}:${globalThis.performance?.now?.() ?? 0}`
  );
}
