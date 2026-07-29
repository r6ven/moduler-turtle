import {
  createRuntimePuzzleSeed,
  derivePuzzleSeed,
  normalizePuzzleSeed
} from "./PuzzleRandom.js";

export const ENDLESS_SPRINT_LENGTH = 5;

export const ENDLESS_BOARD_PROFILES = Object.freeze({
  compact: Object.freeze({
    id: "compact",
    label: "Küçük",
    description: "Hızlı ve ferah",
    mapRadius: 2,
    activeTileCount: 14
  }),
  classic: Object.freeze({
    id: "classic",
    label: "Orta",
    description: "Dengeli tahta",
    mapRadius: 3,
    activeTileCount: 22
  }),
  dense: Object.freeze({
    id: "dense",
    label: "Yoğun",
    description: "Daha uzun yollar",
    mapRadius: 3,
    activeTileCount: 30
  })
});

export const ENDLESS_DIFFICULTY_PROFILES = Object.freeze({
  calm: Object.freeze({
    id: "calm",
    label: "Sakin",
    description: "Temiz yollar",
    extraLoopChance: 0.03,
    lockedTileCount: 0,
    starTolerance: 3
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "Dengeli",
    description: "Biraz döngü ve kilit",
    extraLoopChance: 0.11,
    lockedTileCount: 1,
    starTolerance: 5
  }),
  expert: Object.freeze({
    id: "expert",
    label: "Usta",
    description: "Karmaşık ve kilitli",
    extraLoopChance: 0.2,
    lockedTileCount: 3,
    starTolerance: 6
  })
});

function resolveProfile(collection, id, fallbackId, label) {
  const profile = collection[id || fallbackId];

  if (!profile) {
    throw new RangeError(`Bilinmeyen ${label}: ${id}`);
  }

  return profile;
}

export class EndlessSprintSession {
  constructor({
    now = () => performance.now(),
    createSeed = createRuntimePuzzleSeed
  } = {}) {
    this.now = now;
    this.createSeed = createSeed;
    this.reset();
  }

  reset() {
    this.active = false;
    this.board = ENDLESS_BOARD_PROFILES.classic;
    this.difficulty = ENDLESS_DIFFICULTY_PROFILES.balanced;
    this.seed = 0;
    this.puzzleIndex = 0;
    this.results = [];

    this.moves = 0;
    this.hintsUsed = 0;
    this.minimumMoves = 1;
    this.targetMoves = 1;
    this.activeTileCount = 0;

    this.elapsedMs = 0;
    this.puzzleElapsedMs = 0;
    this.timerStartedAt = 0;
    this.timerRunning = false;
  }

  start({
    boardId = "classic",
    difficultyId = "balanced",
    seed = null
  } = {}) {
    this.reset();
    this.board = resolveProfile(
      ENDLESS_BOARD_PROFILES,
      boardId,
      "classic",
      "tahta profili"
    );
    this.difficulty = resolveProfile(
      ENDLESS_DIFFICULTY_PROFILES,
      difficultyId,
      "balanced",
      "zorluk profili"
    );
    this.seed = normalizePuzzleSeed(seed ?? this.createSeed());
    this.active = true;

    return this.getStatus();
  }

  getCurrentPuzzleRequest() {
    if (!this.active || this.isComplete()) {
      throw new Error("Aktif bir Sprint bulmacası yok.");
    }

    const puzzleNumber = this.puzzleIndex + 1;
    const scope = [
      "endless-sprint-v1",
      this.board.id,
      this.difficulty.id,
      puzzleNumber
    ].join(":");
    const puzzleSeed = derivePuzzleSeed(this.seed, scope);

    return {
      mode: "endless",
      puzzleId: `endless-v1-${this.seed}-${this.board.id}-${this.difficulty.id}-${puzzleNumber}`,
      seed: puzzleSeed,
      mapRadius: this.board.mapRadius,
      activeTileCount: this.board.activeTileCount,
      extraLoopChance: this.difficulty.extraLoopChance,
      lockedTileCount: this.difficulty.lockedTileCount,
      tutorial: false
    };
  }

  beginPuzzle({ minimumMoves, activeTileCount }) {
    if (!this.active || this.isComplete()) {
      throw new Error("Sprint bulmacası başlatılamıyor.");
    }

    this.moves = 0;
    this.hintsUsed = 0;
    this.minimumMoves = Math.max(1, Math.floor(Number(minimumMoves) || 1));
    this.targetMoves = this.minimumMoves + this.difficulty.starTolerance;
    this.activeTileCount = Math.max(
      0,
      Math.floor(Number(activeTileCount) || 0)
    );
    this.puzzleElapsedMs = 0;
    this.timerStartedAt = 0;
    this.timerRunning = false;
  }

  startTimer() {
    if (!this.active || this.isComplete() || this.timerRunning) return;

    this.timerStartedAt = this.now();
    this.timerRunning = true;
  }

  pauseTimer() {
    if (!this.timerRunning) return;

    const delta = Math.max(0, this.now() - this.timerStartedAt);

    this.elapsedMs += delta;
    this.puzzleElapsedMs += delta;
    this.timerStartedAt = 0;
    this.timerRunning = false;
  }

  getActiveTimerDelta() {
    if (!this.timerRunning) return 0;
    return Math.max(0, this.now() - this.timerStartedAt);
  }

  getElapsedSeconds() {
    return Math.floor((this.elapsedMs + this.getActiveTimerDelta()) / 1000);
  }

  getPuzzleElapsedSeconds() {
    return Math.floor(
      (this.puzzleElapsedMs + this.getActiveTimerDelta()) / 1000
    );
  }

  addMove() {
    if (this.active && !this.isComplete()) this.moves += 1;
  }

  addHint() {
    if (this.active && !this.isComplete()) this.hintsUsed += 1;
  }

  calculateTwoStarTarget() {
    return this.targetMoves + Math.max(
      6,
      Math.ceil(this.minimumMoves * 0.25)
    );
  }

  calculateStars() {
    if (this.moves <= 0) return 1;
    if (this.moves <= this.targetMoves && this.hintsUsed === 0) return 3;
    if (this.moves <= this.calculateTwoStarTarget()) return 2;
    return 1;
  }

  completeCurrentPuzzle() {
    if (!this.active || this.isComplete()) {
      throw new Error("Tamamlanacak aktif bir Sprint bulmacası yok.");
    }

    this.pauseTimer();

    const result = Object.freeze({
      mode: "endless",
      sprintIndex: this.puzzleIndex + 1,
      sprintLength: ENDLESS_SPRINT_LENGTH,
      stars: this.calculateStars(),
      moves: this.moves,
      hintsUsed: this.hintsUsed,
      targetMoves: this.targetMoves,
      minimumMoves: this.minimumMoves,
      twoStarTarget: this.calculateTwoStarTarget(),
      timeSeconds: this.getPuzzleElapsedSeconds(),
      totalMoves: this.getTotalMoves() + this.moves,
      totalHints: this.getTotalHints() + this.hintsUsed,
      totalTimeSeconds: this.getElapsedSeconds(),
      boardId: this.board.id,
      boardLabel: this.board.label,
      difficultyId: this.difficulty.id,
      difficultyLabel: this.difficulty.label
    });

    this.results.push(result);
    return {
      ...result,
      sprintComplete: this.isComplete(),
      results: [...this.results]
    };
  }

  advancePuzzle() {
    if (!this.active) return false;
    if (this.results.length !== this.puzzleIndex + 1) return false;
    if (this.isComplete()) return false;

    this.puzzleIndex += 1;
    return true;
  }

  isComplete() {
    return this.results.length >= ENDLESS_SPRINT_LENGTH;
  }

  getTotalMoves() {
    return this.results.reduce((total, result) => total + result.moves, 0);
  }

  getTotalHints() {
    return this.results.reduce(
      (total, result) => total + result.hintsUsed,
      0
    );
  }

  getStatus() {
    return {
      active: this.active,
      complete: this.isComplete(),
      board: this.board,
      difficulty: this.difficulty,
      seed: this.seed,
      puzzleIndex: this.puzzleIndex + 1,
      sprintLength: ENDLESS_SPRINT_LENGTH,
      completedPuzzles: this.results.length,
      totalMoves: this.getTotalMoves(),
      totalHints: this.getTotalHints(),
      totalTimeSeconds: this.getElapsedSeconds()
    };
  }
}
