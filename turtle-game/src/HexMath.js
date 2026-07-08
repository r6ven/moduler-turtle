export const SQRT_3 = Math.sqrt(3);

// Axial direction order:
// 0: NE, 1: E, 2: SE, 3: SW, 4: W, 5: NW
export const DIR_NEIGHBORS = [
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 }
];

export const DIR_ANGLES = [
  -Math.PI / 3,
  0,
  Math.PI / 3,
  2 * Math.PI / 3,
  Math.PI,
  -2 * Math.PI / 3
];

export function hexToPixel(q, r, hexRadius) {
  return {
    x: hexRadius * (SQRT_3 * q + (SQRT_3 / 2) * r),
    y: hexRadius * (3 / 2) * r
  };
}

export function pixelToHex(x, y, hexRadius) {
  const q = ((SQRT_3 / 3) * x - (1 / 3) * y) / hexRadius;
  const r = ((2 / 3) * y) / hexRadius;

  return hexRound(q, r);
}

export function hexRound(q, r) {
  const s = -q - r;

  let qi = Math.round(q);
  let ri = Math.round(r);
  let si = Math.round(s);

  const qDiff = Math.abs(qi - q);
  const rDiff = Math.abs(ri - r);
  const sDiff = Math.abs(si - s);

  if (qDiff > rDiff && qDiff > sDiff) {
    qi = -ri - si;
  } else if (rDiff > sDiff) {
    ri = -qi - si;
  }

  return { q: qi, r: ri };
}

export function tileKey(q, r) {
  return `${q},${r}`;
}

export function oppositeDir(dirIndex) {
  return (dirIndex + 3) % 6;
}

export function shuffled(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

export function buildHexCoordinateList(mapRadius) {
  const coords = [];

  for (let q = -mapRadius; q <= mapRadius; q += 1) {
    const r1 = Math.max(-mapRadius, -q - mapRadius);
    const r2 = Math.min(mapRadius, -q + mapRadius);

    for (let r = r1; r <= r2; r += 1) {
      coords.push({ q, r });
    }
  }

  return coords;
}

export function getDirectionIndex(from, to) {
  for (let i = 0; i < DIR_NEIGHBORS.length; i += 1) {
    const dir = DIR_NEIGHBORS[i];

    if (from.q + dir.q === to.q && from.r + dir.r === to.r) {
      return i;
    }
  }

  return -1;
}
