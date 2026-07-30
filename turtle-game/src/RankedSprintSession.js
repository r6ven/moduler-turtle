import {
  PUZZLE_DEFINITION_SCHEMA_VERSION,
  RANKED_RULES_VERSION
} from "./PuzzleDefinition.js";
import { getRankedProfile, RANKED_SPRINT_LENGTH } from "./RankedSprintConfig.js";

export const RANKED_CLIENT_COMPATIBILITY = Object.freeze({
  supportedDefinitionSchemas: Object.freeze([PUZZLE_DEFINITION_SCHEMA_VERSION]),
  supportedGameRules: Object.freeze([RANKED_RULES_VERSION])
});

function createSubmissionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const randomHex = () => Math.floor(Math.random() * 16).toString(16);
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Number.parseInt(randomHex(), 16);
    return token === "x"
      ? value.toString(16)
      : ((value & 0x3) | 0x8).toString(16);
  });
}

function normalizeCompletedResult(raw) {
  const elapsedMs = Number(raw.elapsed_ms ?? raw.elapsedMs);
  return Object.freeze({
    mode: "ranked",
    ranked: true,
    slot: Number(raw.slot),
    moves: Number(raw.moves ?? raw.move_count),
    elapsedMs,
    timeSeconds: Math.floor(elapsedMs / 1000),
    stars: Number(raw.stars),
    puzzleId: raw.puzzle_id || raw.puzzleId,
    finalStateHash: raw.final_state_hash || raw.finalStateHash || null,
    reviewStatus: raw.review_status || raw.reviewStatus || "clear",
    riskSignals: raw.risk_signals || raw.riskSignals || [],
    provisional: raw.provisional !== false,
    valid: true
  });
}

function normalizePuzzlePayload(raw, fallbackSlot) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Dereceli puzzle tanımı eksik.");
  }

  const slot = Number(raw.slot ?? fallbackSlot);
  const definition = raw.gameplay_definition || raw.gameplayDefinition;
  const presentationDefinition =
    raw.presentation_definition || raw.presentationDefinition || null;

  if (!Number.isInteger(slot) || slot < 1 || slot > RANKED_SPRINT_LENGTH) {
    throw new Error("Dereceli puzzle slotu geçersiz.");
  }

  if (!definition || typeof definition !== "object") {
    throw new Error("Dereceli gameplay definition eksik.");
  }

  return Object.freeze({
    ...getRankedProfile(slot),
    ...raw,
    slot,
    puzzleId: raw.puzzle_id || raw.puzzleId || definition.puzzleId,
    generatorVersion: Number(
      raw.generator_version ?? raw.generatorVersion ?? definition.generatorVersion
    ),
    schemaVersion: Number(
      raw.schema_version ?? raw.schemaVersion ?? definition.schemaVersion
    ),
    rulesVersion: raw.rules_version || raw.rulesVersion || definition.rulesVersion,
    gameplayChecksum:
      raw.gameplay_checksum || raw.gameplayChecksum || raw.checksum,
    presentationChecksum:
      raw.presentation_checksum || raw.presentationChecksum || null,
    definition,
    presentationDefinition,
    releasedAt: raw.released_at || raw.releasedAt || null,
    minimumMoves: Number(
      raw.minimum_moves ?? raw.minimumMoves ?? definition.difficulty?.minimumMoves
    ),
    starTolerance: Number(raw.star_tolerance ?? raw.starTolerance ?? getRankedProfile(slot).starTolerance),
    difficultyWeight: Number(raw.difficulty_weight ?? raw.difficultyWeight ?? getRankedProfile(slot).difficultyWeight)
  });
}

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
    this.trainingPuzzles = [];
    this.currentPuzzlePayload = null;
    this.currentPuzzle = null;
    this.puzzleIndex = 0;
    this.results = [];
    this.pendingResult = null;
    this.moves = 0;
    this.replay = [];
    this.hintsUsed = 0;
    this.minimumMoves = 1;
    this.targetMoves = 1;
    this.elapsedMs = 0;
    this.puzzleElapsedMs = 0;
    this.timerStartedAt = 0;
    this.timerRunning = false;
  }

  start(payload) {
    this.reset();

    if (!payload?.attempt_id) {
      throw new Error("Dereceli Sprint başlangıç cevabı eksik.");
    }

    this.claimed = true;
    this.active = true;
    this.ranked = payload.ranked !== false;
    this.valid = this.ranked;
    this.invalidReason = this.ranked ? null : "training_replay";
    this.attemptId = payload.attempt_id;
    this.playDate = payload.play_date;
    this.seasonId = payload.season_id;

    if (this.ranked) {
      this.currentPuzzlePayload = normalizePuzzlePayload(payload.puzzle, 1);
      this.puzzleIndex = this.currentPuzzlePayload.slot - 1;
      const completedResults = Array.isArray(payload.completed_results)
        ? payload.completed_results.map(normalizeCompletedResult)
        : [];
      if (
        completedResults.length !== this.puzzleIndex ||
        completedResults.some((result, index) => result.slot !== index + 1)
      ) {
        throw new Error("Dereceli Sprint devam verisi eksik.");
      }
      this.results = completedResults;
    } else {
      const puzzles = Array.isArray(payload.puzzles) ? payload.puzzles : [];
      if (puzzles.length !== RANKED_SPRINT_LENGTH) {
        throw new Error("Antrenman tekrar serisi eksik.");
      }
      this.trainingPuzzles = puzzles.map((puzzle, index) => (
        normalizePuzzlePayload(puzzle, index + 1)
      ));
      this.currentPuzzlePayload = this.trainingPuzzles[0];
    }

    this.startLocalTimer();
  }

  getCurrentPuzzlePayload() {
    if (!this.active || this.complete || !this.currentPuzzlePayload) {
      throw new Error("Aktif dereceli puzzle yok.");
    }
    return this.currentPuzzlePayload;
  }

  beginPuzzle(hydrated) {
    const profile = this.currentPuzzlePayload;

    this.moves = 0;
    this.replay = [];
    this.hintsUsed = 0;
    this.pendingResult = null;
    this.minimumMoves = hydrated.minimumMoves;
    this.targetMoves = hydrated.minimumMoves + profile.starTolerance;
    this.currentPuzzle = {
      ...profile,
      puzzleId: hydrated.puzzleId,
      gameplayChecksum: hydrated.gameplayChecksum,
      presentationChecksum: hydrated.presentationChecksum,
      generatorVersion: hydrated.generatorVersion,
      schemaVersion: hydrated.schemaVersion,
      rulesVersion: hydrated.rulesVersion
    };
    this.puzzleElapsedMs = 0;
    this.timerStartedAt = this.now();
    this.timerRunning = true;
  }

  startLocalTimer() {
    if (this.timerRunning || !this.active || this.complete) return;
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

  addMove(key) {
    if (!this.active || this.complete || this.pendingResult) return;
    this.moves += 1;
    if (this.ranked) this.replay.push(String(key));
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

  hasPendingSubmission() {
    return Boolean(this.pendingResult);
  }

  getElapsedSeconds() {
    return Math.floor((this.elapsedMs + this.getActiveTimerDelta()) / 1000);
  }

  calculateStars() {
    if (this.moves <= this.targetMoves) return 3;
    if (this.moves <= this.targetMoves + Math.max(6, Math.ceil(this.minimumMoves * 0.25))) return 2;
    return 1;
  }

  completeCurrentPuzzle() {
    if (this.pendingResult) return this.pendingResult;

    const elapsedMs = Math.max(
      0,
      Math.floor(this.puzzleElapsedMs + this.getActiveTimerDelta())
    );
    const result = {
      mode: "ranked",
      ranked: this.ranked,
      attemptId: this.attemptId,
      playDate: this.playDate,
      slot: this.puzzleIndex + 1,
      submissionId: createSubmissionId(this.attemptId, this.puzzleIndex + 1),
      replay: this.ranked ? [...this.replay] : [],
      moves: this.moves,
      hintsUsed: this.hintsUsed,
      stars: this.calculateStars(),
      elapsedMs,
      timeSeconds: Math.floor(elapsedMs / 1000),
      minimumMoves: this.minimumMoves,
      targetMoves: this.targetMoves,
      puzzleId: this.currentPuzzle.puzzleId,
      gameplayChecksum: this.currentPuzzle.gameplayChecksum,
      generatorVersion: this.currentPuzzle.generatorVersion,
      difficultyWeight: this.currentPuzzle.difficultyWeight,
      valid: this.valid,
      invalidReason: this.invalidReason,
      provisional: true
    };

    if (this.ranked) {
      this.pendingResult = Object.freeze(result);
      return this.withTotals(this.pendingResult);
    }

    this.pauseTimer();
    const frozen = Object.freeze(result);
    this.results.push(frozen);
    this.complete = this.results.length === RANKED_SPRINT_LENGTH;
    return this.withTotals(frozen);
  }

  acceptSubmission(serverResult) {
    if (!this.pendingResult) {
      throw new Error("Bekleyen dereceli sonuç yok.");
    }

    const elapsedMs = Number(serverResult.elapsed_ms ?? serverResult.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new Error("Server returned an invalid ranked duration.");
    }
    const accepted = Object.freeze({
      ...this.pendingResult,
      moves: Number(serverResult.move_count ?? this.pendingResult.moves),
      elapsedMs,
      timeSeconds: Math.floor(elapsedMs / 1000),
      stars: Number(serverResult.stars ?? this.pendingResult.stars),
      finalStateHash: serverResult.final_state_hash || null,
      reviewStatus: serverResult.review_status || "clear",
      riskSignals: serverResult.risk_signals || [],
      provisional: serverResult.provisional !== false
    });

    this.results.push(accepted);
    this.pendingResult = null;
    this.complete = accepted.slot === RANKED_SPRINT_LENGTH;
    this.timerRunning = false;
    return this.withTotals(accepted);
  }

  rejectSubmission(reason) {
    if (!this.pendingResult) return null;
    this.valid = false;
    this.invalidReason = String(reason || "submission_rejected");
    const rejected = Object.freeze({
      ...this.pendingResult,
      valid: false,
      invalidReason: this.invalidReason,
      provisional: false
    });
    this.results.push(rejected);
    this.pendingResult = null;
    this.complete = true;
    this.active = false;
    this.timerRunning = false;
    return this.withTotals(rejected);
  }

  withTotals(result) {
    const included = this.pendingResult && !this.results.includes(result)
      ? [...this.results, result]
      : this.results;
    return {
      ...result,
      sprintComplete: this.complete,
      totalMoves: included.reduce((sum, item) => sum + item.moves, 0),
      totalTimeSeconds: Math.floor(
        included.reduce((sum, item) => sum + item.elapsedMs, 0) / 1000
      ),
      results: [...included]
    };
  }

  acceptReleasedPuzzle(payload) {
    if (this.ranked) {
      const expectedSlot = this.currentPuzzlePayload.slot + 1;
      const normalized = normalizePuzzlePayload(payload, expectedSlot);
      if (normalized.slot !== expectedSlot) {
        throw new Error("Sunucu beklenmeyen dereceli slot döndürdü.");
      }
      this.puzzleIndex += 1;
      this.currentPuzzlePayload = normalized;
      return true;
    }

    return this.advanceTrainingPuzzle();
  }

  advanceTrainingPuzzle() {
    if (this.ranked || this.complete || this.results.length !== this.puzzleIndex + 1) {
      return false;
    }
    this.puzzleIndex += 1;
    this.currentPuzzlePayload = this.trainingPuzzles[this.puzzleIndex];
    return Boolean(this.currentPuzzlePayload);
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
      pendingSubmission: this.hasPendingSubmission(),
      totalMoves: this.results.reduce((sum, item) => sum + item.moves, 0),
      totalTimeSeconds: Math.floor(
        this.results.reduce((sum, item) => sum + item.elapsedMs, 0) / 1000
      )
    };
  }
}
