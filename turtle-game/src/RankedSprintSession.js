import { getRankedProfile, RANKED_SPRINT_LENGTH } from "./RankedSprintConfig.js";

export class RankedSprintSession {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.claimed = false;
    this.active = false;
    this.complete = false;
    this.ranked = true;
    this.valid = true;
    this.invalidReason = null;
    this.attemptId = null;
    this.playDate = null;
    this.seasonId = null;
    this.puzzles = [];
    this.puzzleIndex = 0;
    this.results = [];
    this.moves = 0;
    this.hintsUsed = 0;
    this.minimumMoves = 1;
    this.targetMoves = 1;
    this.elapsedMs = 0;
    this.puzzleElapsedMs = 0;
    this.timerStartedAt = 0;
    this.timerRunning = false;
    this.startedAt = 0;
    this.puzzleStartedAt = 0;
  }

  claim(payload) {
    this.reset();

    const puzzles = Array.isArray(payload?.puzzles) ? payload.puzzles : [];

    if (!payload?.attempt_id || puzzles.length !== RANKED_SPRINT_LENGTH) {
      throw new Error("Dereceli Sprint manifesti eksik.");
    }

    this.claimed = true;
    this.ranked = payload.ranked !== false;
    this.valid = this.ranked;
    this.invalidReason = this.ranked ? null : "training_replay";
    this.attemptId = payload.attempt_id;
    this.playDate = payload.play_date;
    this.seasonId = payload.season_id;
    this.puzzles = puzzles.map((puzzle, index) => Object.freeze({
      ...getRankedProfile(index + 1),
      ...puzzle,
      slot: index + 1
    }));
  }

  activate() {
    if (!this.claimed) {
      throw new Error("Dereceli Sprint once talep edilmelidir.");
    }

    this.active = true;
    this.startedAt = this.now();
    this.puzzleStartedAt = this.startedAt;
    this.timerStartedAt = this.startedAt;
    this.timerRunning = true;
  }

  getCurrentPuzzleRequest() {
    if (!this.claimed || this.complete) {
      throw new Error("Aktif dereceli bulmaca yok.");
    }

    const puzzle = this.puzzles[this.puzzleIndex];

    return {
      mode: "daily",
      puzzleId: puzzle.puzzle_id || puzzle.puzzleId,
      seed: puzzle.seed,
      mapRadius: puzzle.mapRadius,
      activeTileCount: puzzle.activeTileCount,
      extraLoopChance: puzzle.extraLoopChance,
      tutorial: false,
      quality: {
        minimumMoves: puzzle.minimumMoves,
        maxInitialConnectedRatio: 0.25
      }
    };
  }

  beginPuzzle(generated) {
    const profile = this.puzzles[this.puzzleIndex];

    this.moves = 0;
    this.hintsUsed = 0;
    this.minimumMoves = generated.minimumMoves;
    this.targetMoves = generated.minimumMoves + profile.starTolerance;
    this.currentPuzzle = {
      ...profile,
      puzzleId: generated.puzzleId,
      checksum: generated.checksum,
      generatorVersion: generated.generatorVersion
    };
    this.puzzleElapsedMs = 0;
    this.puzzleStartedAt = this.now();

    if (!this.timerRunning) this.startTimer();
  }

  startTimer() {
    if (this.ranked || this.timerRunning || !this.active || this.complete) {
      return;
    }

    this.timerStartedAt = this.now();
    this.timerRunning = true;
  }

  pauseTimer() {
    if (this.ranked || !this.timerRunning) return;

    const delta = Math.max(0, this.now() - this.timerStartedAt);

    this.elapsedMs += delta;
    this.puzzleElapsedMs += delta;
    this.timerStartedAt = 0;
    this.timerRunning = false;
  }

  getActiveTimerDelta() {
    return this.timerRunning
      ? Math.max(0, this.now() - this.timerStartedAt)
      : 0;
  }

  addMove() {
    if (this.active && !this.complete) this.moves += 1;
  }

  addHint() {
    this.hintsUsed += 1;
    if (this.ranked) this.invalidate("hint_used");
  }

  invalidate(reason) {
    if (this.ranked && this.claimed && !this.complete && this.valid) {
      this.valid = false;
      this.invalidReason = String(reason || "invalidated");
    }

    return !this.valid;
  }

  isComplete() {
    return this.complete;
  }

  getElapsedSeconds() {
    return Math.floor(
      (this.elapsedMs + this.getActiveTimerDelta()) / 1000
    );
  }

  calculateStars() {
    if (this.moves <= this.targetMoves) return 3;
    if (
      this.moves <= this.targetMoves + Math.max(
        6,
        Math.ceil(this.minimumMoves * 0.25)
      )
    ) {
      return 2;
    }
    return 1;
  }

  completeCurrentPuzzle() {
    const elapsedMs = this.ranked
      ? Math.max(0, Math.floor(this.now() - this.puzzleStartedAt))
      : Math.max(
          0,
          Math.floor(this.puzzleElapsedMs + this.getActiveTimerDelta())
        );

    this.pauseTimer();

    const result = Object.freeze({
      mode: "ranked",
      ranked: this.ranked,
      attemptId: this.attemptId,
      playDate: this.playDate,
      slot: this.puzzleIndex + 1,
      moves: this.moves,
      hintsUsed: this.hintsUsed,
      stars: this.calculateStars(),
      elapsedMs,
      timeSeconds: Math.floor(elapsedMs / 1000),
      minimumMoves: this.minimumMoves,
      targetMoves: this.targetMoves,
      puzzleId: this.currentPuzzle.puzzleId,
      checksum: this.currentPuzzle.checksum,
      generatorVersion: this.currentPuzzle.generatorVersion,
      difficultyWeight: this.currentPuzzle.difficultyWeight,
      valid: this.valid,
      invalidReason: this.invalidReason,
      provisional: true
    });

    this.results.push(result);
    this.complete = this.results.length === RANKED_SPRINT_LENGTH;

    return {
      ...result,
      sprintComplete: this.complete,
      totalMoves: this.results.reduce((sum, item) => sum + item.moves, 0),
      totalTimeSeconds: this.getElapsedSeconds(),
      results: [...this.results]
    };
  }

  advancePuzzle() {
    if (
      this.complete ||
      this.results.length !== this.puzzleIndex + 1
    ) {
      return false;
    }

    this.puzzleIndex += 1;
    return true;
  }

  getStatus() {
    return {
      active: this.active,
      complete: this.complete,
      ranked: this.ranked,
      valid: this.valid,
      invalidReason: this.invalidReason,
      playDate: this.playDate,
      puzzleIndex: this.puzzleIndex + 1,
      sprintLength: RANKED_SPRINT_LENGTH,
      totalMoves: this.results.reduce(
        (sum, item) => sum + item.moves,
        0
      ),
      totalTimeSeconds: this.getElapsedSeconds()
    };
  }
}