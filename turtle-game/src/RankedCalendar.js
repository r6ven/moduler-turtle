import { derivePuzzleSeed, normalizePuzzleSeed } from "./PuzzleRandom.js";
import { RANKED_GENERATOR_VERSION, RANKED_PUZZLE_PROFILES } from "./RankedSprintConfig.js";

export const RANKED_MONTH_SLOT_COUNT = 31 * 5;

export function getUtcSeasonId(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getDaysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function createRankedSeasonManifest({ seasonId, secretSeed }) {
  if (!/^\d{4}-\d{2}$/.test(seasonId)) throw new TypeError("seasonId must use YYYY-MM.");
  const [year, month] = seasonId.split("-").map(Number);
  const daysInMonth = getDaysInUtcMonth(year, month);
  const baseSeed = normalizePuzzleSeed(secretSeed);
  const slots = [];

  for (let day = 1; day <= 31; day += 1) {
    for (const profile of RANKED_PUZZLE_PROFILES) {
      const slotSeed = derivePuzzleSeed(baseSeed, `${seasonId}:${day}:${profile.slot}`);
      const playDate = `${seasonId}-${String(day).padStart(2, "0")}`;
      slots.push(Object.freeze({
        seasonId,
        playDate,
        published: day <= daysInMonth,
        slot: profile.slot,
        profileId: profile.id,
        difficultyWeight: profile.difficultyWeight,
        seed: slotSeed,
        puzzleId: `ranked-v${RANKED_GENERATOR_VERSION}-${seasonId}-${String(day).padStart(2, "0")}-${profile.slot}`
      }));
    }
  }

  return Object.freeze({ seasonId, generatorVersion: RANKED_GENERATOR_VERSION, daysInMonth, slots });
}
