export const RANKED_SPRINT_LENGTH = 5;
export const RANKED_GENERATOR_VERSION = 2;
export const RANKED_DIFFICULTY_WEIGHTS = Object.freeze([1, 2, 2, 3, 5]);

export const RANKED_PUZZLE_PROFILES = Object.freeze([
  Object.freeze({
    slot: 1,
    id: "compact-calm",
    boardId: "compact",
    difficultyId: "calm",
    label: "Küçük - Sakin",
    mapRadius: 2,
    activeTileCount: 14,
    extraLoopChance: 0.03,
    minimumMoves: 14,
    starTolerance: 3,
    difficultyWeight: 1
  }),
  Object.freeze({
    slot: 2,
    id: "classic-calm",
    boardId: "classic",
    difficultyId: "calm",
    label: "Orta - Sakin",
    mapRadius: 3,
    activeTileCount: 22,
    extraLoopChance: 0.03,
    minimumMoves: 25,
    starTolerance: 3,
    difficultyWeight: 2
  }),
  Object.freeze({
    slot: 3,
    id: "classic-balanced",
    boardId: "classic",
    difficultyId: "balanced",
    label: "Orta - Dengeli",
    mapRadius: 3,
    activeTileCount: 22,
    extraLoopChance: 0.11,
    minimumMoves: 27,
    starTolerance: 5,
    difficultyWeight: 2
  }),
  Object.freeze({
    slot: 4,
    id: "dense-balanced",
    boardId: "dense",
    difficultyId: "balanced",
    label: "Yoğun - Dengeli",
    mapRadius: 3,
    activeTileCount: 30,
    extraLoopChance: 0.11,
    minimumMoves: 39,
    starTolerance: 5,
    difficultyWeight: 3
  }),
  Object.freeze({
    slot: 5,
    id: "dense-expert",
    boardId: "dense",
    difficultyId: "expert",
    label: "Yoğun - Usta",
    mapRadius: 3,
    activeTileCount: 30,
    extraLoopChance: 0.2,
    minimumMoves: 45,
    starTolerance: 6,
    difficultyWeight: 5
  })
]);

export function getRankedProfile(slot) {
  const profile = RANKED_PUZZLE_PROFILES[Number(slot) - 1];

  if (!profile) {
    throw new RangeError(`Invalid ranked puzzle slot: ${slot}`);
  }

  return profile;
}