import { CONFIG } from "./config.js";

const PENDING_SAVE_KEY = `${CONFIG.saveKey}-pending-v1`;

export class ProgressSystem {
  constructor(authSystem = null) {
    this.authSystem = authSystem;

    this.level = 1;
    this.moves = 0;
    this.hintsUsed = 0;
    this.targetMoves = 0;
    this.minimumMoves = 1;

    this.elapsedMs = 0;
    this.timerStartMs = 0;
    this.timerRunning = false;

    this.bestByLevel = {};
    this.lastLevel = 1;

    this.saveQueue = Promise.resolve({ ok: true });
    this.saveSequence = 0;
    this.restoredPendingRevision = null;
    this.lastSaveError = null;

    this.loadForCurrentUser();
  }

  setAuthSystem(authSystem) {
    this.authSystem = authSystem;
    this.loadForCurrentUser();
  }

  loadForCurrentUser() {
    const saved = this.authSystem?.hasCurrentUser()
      ? this.authSystem.loadProgressForCurrentUser()
      : this.loadLegacy();
    const owner = this.getSaveOwner();
    const pending = this.readPendingSave(owner);
    const hasMatchingPending = pending?.owner === owner;
    const merged = hasMatchingPending
      ? this.mergeProgress(saved, pending.progress)
      : saved;

    this.bestByLevel = merged.bestByLevel || {};
    this.lastLevel = Number(merged.lastLevel) || 1;

    if (
      hasMatchingPending &&
      this.authSystem?.hasCurrentUser() &&
      this.restoredPendingRevision !== pending.revision
    ) {
      this.restoredPendingRevision = pending.revision;
      void this.enqueueSnapshot(
        this.createProgressSnapshot(),
        pending.revision,
        { storePending: false }
      );
    }
  }

  startLevel(level, activeTileCount, minimumMoves = null) {
    this.level = level;
    this.moves = 0;
    this.hintsUsed = 0;

    this.elapsedMs = 0;
    this.timerStartMs = 0;
    this.timerRunning = false;

    this.minimumMoves = Number.isFinite(minimumMoves)
      ? Math.max(1, Math.floor(minimumMoves))
      : CONFIG.difficulty.getTargetMoves(activeTileCount, level);

    this.targetMoves = this.calculateThreeStarTarget(this.minimumMoves, level);
    this.lastLevel = Math.max(Number(this.lastLevel) || 1, level);

    void this.save();
  }

  startTimer() {
    if (this.timerRunning) return;

    this.timerStartMs = performance.now();
    this.timerRunning = true;
  }

  pauseTimer() {
    if (!this.timerRunning) return;

    this.elapsedMs += performance.now() - this.timerStartMs;
    this.timerRunning = false;
    this.timerStartMs = 0;
  }

  getElapsedSeconds() {
    const activeMs = this.timerRunning
      ? performance.now() - this.timerStartMs
      : 0;

    return Math.floor((this.elapsedMs + activeMs) / 1000);
  }

  calculateThreeStarTarget(minimumMoves, level) {
    const tolerance = Math.max(
      3,
      Math.ceil(minimumMoves * 0.12),
      Math.floor(level / 4)
    );

    return minimumMoves + tolerance;
  }

  calculateTwoStarTarget() {
    return this.targetMoves + Math.max(
      6,
      Math.ceil(this.minimumMoves * 0.25)
    );
  }

  getSavedLevel() {
    const level = Number(this.lastLevel);

    if (!Number.isFinite(level) || level < 1) return 1;
    return Math.floor(level);
  }

  getCompletedLevels() {
    return Object.keys(this.bestByLevel)
      .map((level) => Number(level))
      .filter((level) => Number.isFinite(level) && level >= 1)
      .sort((a, b) => a - b)
      .map((level) => {
        const record = this.bestByLevel[level] ||
          this.bestByLevel[String(level)] || {};

        return {
          level,
          stars: record.stars || 0,
          bestMoves: record.bestMoves ?? null,
          bestTimeSeconds: record.bestTimeSeconds ?? null
        };
      });
  }

  hasCompletedLevel(level) {
    return this.getCompletedLevels().some(
      (item) => item.level === Number(level)
    );
  }

  addMove() {
    this.moves += 1;
  }

  addHint() {
    this.hintsUsed += 1;
  }

  calculateStars() {
    if (this.moves <= 0) return 1;

    const threeStarTarget = this.targetMoves;
    const twoStarTarget = this.calculateTwoStarTarget();

    if (this.moves <= threeStarTarget && this.hintsUsed === 0) return 3;
    if (this.moves <= twoStarTarget) return 2;
    return 1;
  }

  completeCurrentLevel() {
    this.pauseTimer();

    const stars = this.calculateStars();
    const timeSeconds = this.getElapsedSeconds();
    const existing = this.bestByLevel[this.level] || {
      stars: 0,
      bestMoves: null,
      bestTimeSeconds: null
    };

    this.bestByLevel[this.level] = {
      stars: Math.max(existing.stars || 0, stars),
      bestMoves: this.minimumNullable(existing.bestMoves, this.moves),
      bestTimeSeconds: this.minimumNullable(
        existing.bestTimeSeconds,
        timeSeconds
      )
    };
    this.lastLevel = Math.max(Number(this.lastLevel) || 1, this.level + 1);

    void this.save();

    return {
      stars,
      moves: this.moves,
      hintsUsed: this.hintsUsed,
      targetMoves: this.targetMoves,
      minimumMoves: this.minimumMoves,
      twoStarTarget: this.calculateTwoStarTarget(),
      timeSeconds
    };
  }

  async resetAll() {
    await this.waitForPendingSaves();

    if (this.authSystem?.hasCurrentUser()) {
      const result = await this.authSystem.clearProgressForCurrentUser();

      if (!result?.ok) return result;
    } else {
      try {
        localStorage.removeItem(CONFIG.saveKey);
      } catch {
        // Storage may be unavailable in restricted browser modes.
      }
    }

    this.bestByLevel = {};
    this.lastLevel = 1;
    this.moves = 0;
    this.hintsUsed = 0;
    this.targetMoves = 0;
    this.minimumMoves = 1;
    this.elapsedMs = 0;
    this.timerStartMs = 0;
    this.timerRunning = false;
    this.clearPendingSave();

    return { ok: true };
  }

  loadLegacy() {
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);

      if (!raw) {
        return { lastLevel: 1, bestByLevel: {} };
      }

      const parsed = JSON.parse(raw);

      if (
        parsed &&
        typeof parsed === "object" &&
        ("bestByLevel" in parsed || "lastLevel" in parsed)
      ) {
        return {
          lastLevel: Number(parsed.lastLevel) || 1,
          bestByLevel: parsed.bestByLevel || {}
        };
      }

      if (parsed && typeof parsed === "object") {
        return { lastLevel: 1, bestByLevel: parsed };
      }
    } catch {
      // Fall through to a clean local state.
    }

    return { lastLevel: 1, bestByLevel: {} };
  }

  save() {
    return this.enqueueSnapshot(this.createProgressSnapshot());
  }

  createProgressSnapshot() {
    return {
      lastLevel: Number(this.lastLevel) || 1,
      bestByLevel: JSON.parse(JSON.stringify(this.bestByLevel || {}))
    };
  }

  nextSaveRevision() {
    const clockRevision = Date.now() * 1000;
    this.saveSequence = (this.saveSequence + 1) % 1000;

    return clockRevision + this.saveSequence;
  }

  enqueueSnapshot(
    progress,
    revision = this.nextSaveRevision(),
    { storePending = true } = {}
  ) {
    const record = {
      version: 1,
      owner: this.getSaveOwner(),
      revision,
      progress: this.mergeProgress(
        { lastLevel: 1, bestByLevel: {} },
        progress
      )
    };

    if (storePending) this.writePendingSave(record);

    this.saveQueue = this.saveQueue
      .catch(() => ({ ok: false }))
      .then(() => this.persistSnapshot(record))
      .catch((error) => ({
        ok: false,
        error: error?.message || "Kayıt isteği tamamlanamadı."
      }))
      .then((result) => {
        if (result?.ok) {
          this.clearPendingSave(record.revision, record.owner);
          this.lastSaveError = null;
        } else {
          this.lastSaveError = result?.error || "Kayıt tamamlanamadı.";
        }

        return result;
      });

    return this.saveQueue;
  }

  async persistSnapshot(record) {
    if (record.owner !== this.getSaveOwner()) {
      return {
        ok: false,
        error: "Kayıt sahibi oturum sırasında değişti."
      };
    }

    if (this.authSystem?.hasCurrentUser()) {
      return this.authSystem.saveProgressForCurrentUser(record.progress);
    }

    try {
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(record.progress));
      return { ok: true, progress: record.progress };
    } catch {
      return {
        ok: false,
        error: "Yerel kayıt yazılamadı."
      };
    }
  }

  waitForPendingSaves() {
    return this.saveQueue.catch(() => ({ ok: false }));
  }

  getSaveOwner() {
    if (this.authSystem?.hasCurrentUser()) {
      return `user:${this.authSystem.getCurrentUsername()}`;
    }

    return "legacy";
  }

  getPendingSaveKey(owner = this.getSaveOwner()) {
    return `${PENDING_SAVE_KEY}:${encodeURIComponent(owner)}`;
  }

  writePendingSave(record) {
    try {
      localStorage.setItem(
        this.getPendingSaveKey(record.owner),
        JSON.stringify(record)
      );
    } catch {
      // Remote saving still proceeds when local storage is unavailable.
    }
  }

  readPendingSave(owner = this.getSaveOwner()) {
    try {
      const raw = localStorage.getItem(this.getPendingSaveKey(owner));
      const record = raw ? JSON.parse(raw) : null;

      if (
        record?.version === 1 &&
        record.owner === owner &&
        Number.isFinite(record.revision) &&
        record.progress &&
        typeof record.progress === "object"
      ) {
        return record;
      }
    } catch {
      // Invalid pending data is ignored.
    }

    return null;
  }

  clearPendingSave(revision = null, owner = this.getSaveOwner()) {
    try {
      if (revision != null) {
        const pending = this.readPendingSave(owner);

        if (pending && pending.revision !== revision) return;
      }

      localStorage.removeItem(this.getPendingSaveKey(owner));
    } catch {
      // Storage may be unavailable in restricted browser modes.
    }
  }

  mergeProgress(base, incoming) {
    const merged = {
      lastLevel: Math.max(
        Number(base?.lastLevel) || 1,
        Number(incoming?.lastLevel) || 1
      ),
      bestByLevel: JSON.parse(JSON.stringify(base?.bestByLevel || {}))
    };

    Object.entries(incoming?.bestByLevel || {}).forEach(([level, record]) => {
      const existing = merged.bestByLevel[level] || {};

      merged.bestByLevel[level] = {
        stars: Math.max(
          Number(existing.stars) || 0,
          Number(record?.stars) || 0
        ),
        bestMoves: this.minimumNullable(
          existing.bestMoves,
          record?.bestMoves
        ),
        bestTimeSeconds: this.minimumNullable(
          existing.bestTimeSeconds,
          record?.bestTimeSeconds
        )
      };
    });

    return merged;
  }

  minimumNullable(first, second) {
    const values = [first, second]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);

    return values.length > 0 ? Math.min(...values) : null;
  }
}
