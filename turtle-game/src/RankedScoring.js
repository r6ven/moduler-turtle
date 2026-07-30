import { RANKED_DIFFICULTY_WEIGHTS } from "./RankedSprintConfig.js";

export function compareRankedPuzzleResults(first, second) {
  return first.elapsedMs - second.elapsedMs || first.moves - second.moves;
}

export function calculatePercentileScore(rank, participantCount) {
  const safeCount = Math.max(1, Math.floor(Number(participantCount) || 1));
  const safeRank = Math.max(1, Math.min(safeCount, Math.floor(Number(rank) || 1)));
  return Math.max(1, 10 - Math.floor(((safeRank - 1) * 10) / safeCount));
}

export function finalizePuzzleScores(results) {
  const sorted = [...results].sort(compareRankedPuzzleResults);
  const participantCount = sorted.length;
  let previous = null;
  let rank = 0;

  return sorted.map((result, index) => {
    if (!previous || compareRankedPuzzleResults(result, previous) !== 0) {
      rank = index + 1;
    }
    previous = result;
    const rawScore = calculatePercentileScore(rank, participantCount);
    const weight = Number(result.difficultyWeight) || 1;
    return { ...result, rank, participantCount, rawScore, weightedScore: rawScore * weight, provisional: false };
  });
}

export function summarizeMonthlyResults(results) {
  return results.reduce((summary, result) => ({
    weightedPoints: summary.weightedPoints + (Number(result.weightedScore) || 0),
    elapsedMs: summary.elapsedMs + (Number(result.elapsedMs) || 0),
    moves: summary.moves + (Number(result.moves) || 0),
    stars: summary.stars + (Number(result.stars) || 0)
  }), { weightedPoints: 0, elapsedMs: 0, moves: 0, stars: 0 });
}

export function getMaximumDailyScore() {
  return RANKED_DIFFICULTY_WEIGHTS.reduce((sum, weight) => sum + weight * 10, 0);
}
