const STORAGE_KEY = "zen-kaplumbaga-mode-records-v1";
const MAX_RECORDS = 200;

function asSafeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.floor(number))
    : fallback;
}

function compareSprintRecords(first, second) {
  return (
    first.totalTimeSeconds - second.totalTimeSeconds ||
    first.totalHints - second.totalHints ||
    first.totalMoves - second.totalMoves ||
    first.username.localeCompare(second.username, "tr")
  );
}

export class ModeRecordStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  read() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(STORAGE_KEY) || "{}");
      const endless = Array.isArray(parsed?.endless) ? parsed.endless : [];
      const daily = Array.isArray(parsed?.daily) ? parsed.daily : [];

      return {
        endless: endless.slice(0, MAX_RECORDS),
        daily: daily.slice(0, MAX_RECORDS)
      };
    } catch {
      return { endless: [], daily: [] };
    }
  }

  write(records) {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch {
      return false;
    }
  }

  saveEndlessSprint(username, result) {
    if (!result?.sprintComplete) return false;

    const safeUsername = String(username || "Oyuncu").trim().slice(0, 48);
    const record = {
      username: safeUsername || "Oyuncu",
      boardId: String(result.boardId || "classic"),
      boardLabel: String(result.boardLabel || "Orta").slice(0, 24),
      difficultyId: String(result.difficultyId || "balanced"),
      difficultyLabel: String(result.difficultyLabel || "Dengeli").slice(0, 24),
      totalMoves: asSafeInteger(result.totalMoves),
      totalHints: asSafeInteger(result.totalHints),
      totalTimeSeconds: asSafeInteger(result.totalTimeSeconds),
      runSeed: asSafeInteger(result.runSeed),
      generatorVersion: asSafeInteger(result.generatorVersion),
      puzzleIds: Array.isArray(result.puzzleIds) ? result.puzzleIds.slice(0, 5) : [],
      puzzleChecksums: Array.isArray(result.puzzleChecksums) ? result.puzzleChecksums.slice(0, 5) : [],
      completedAt: new Date().toISOString()
    };
    const records = this.read();
    const sameCategoryAndPlayer = (candidate) => (
      candidate.username.toLocaleLowerCase("tr") ===
        record.username.toLocaleLowerCase("tr") &&
      candidate.boardId === record.boardId &&
      candidate.difficultyId === record.difficultyId &&
      asSafeInteger(candidate.generatorVersion) === record.generatorVersion
    );
    const existing = records.endless.find(sameCategoryAndPlayer);

    if (existing && compareSprintRecords(existing, record) <= 0) {
      return false;
    }

    records.endless = records.endless
      .filter((candidate) => !sameCategoryAndPlayer(candidate))
      .concat(record)
      .sort(compareSprintRecords)
      .slice(0, MAX_RECORDS);

    return this.write(records);
  }

  getEndlessWinners() {
    const winners = new Map();

    this.read().endless.forEach((record) => {
      const category = `${record.boardId}:${record.difficultyId}:v${asSafeInteger(record.generatorVersion)}`;
      const current = winners.get(category);

      if (!current || compareSprintRecords(record, current) < 0) {
        winners.set(category, record);
      }
    });

    return Array.from(winners.values()).sort((first, second) => (
      first.boardLabel.localeCompare(second.boardLabel, "tr") ||
      first.difficultyLabel.localeCompare(second.difficultyLabel, "tr")
    ));
  }

  getDailyWinners() {
    return this.read().daily;
  }
}
