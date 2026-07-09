import { CONFIG } from "./config.js";

export class ProgressSystem {
  constructor(authSystem = null) {
    this.authSystem = authSystem;

    this.level = 1;
    this.moves = 0;
    this.hintsUsed = 0;
    this.targetMoves = 0;

    this.bestByLevel = {};
    this.lastLevel = 1;

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

    this.bestByLevel = saved.bestByLevel || {};
    this.lastLevel = Number(saved.lastLevel) || 1;
  }

  startLevel(level, activeTileCount) {
    this.level = level;
    this.moves = 0;
    this.hintsUsed = 0;
    this.targetMoves = CONFIG.difficulty.getTargetMoves(activeTileCount, level);

    this.lastLevel = Math.max(Number(this.lastLevel) || 1, level);

    void this.save();
  }

  getSavedLevel() {
    const level = Number(this.lastLevel);

    if (!Number.isFinite(level) || level < 1) {
      return 1;
    }

    return Math.floor(level);
  }

  getCompletedLevels() {
    return Object.keys(this.bestByLevel)
      .map((level) => Number(level))
      .filter((level) => Number.isFinite(level) && level >= 1)
      .sort((a, b) => a - b)
      .map((level) => ({
        level,
        stars: this.bestByLevel[level]?.stars || this.bestByLevel[String(level)]?.stars || 0,
        bestMoves: this.bestByLevel[level]?.bestMoves ?? this.bestByLevel[String(level)]?.bestMoves ?? null
      }));
  }

  hasCompletedLevel(level) {
    return this.getCompletedLevels().some((item) => item.level === Number(level));
  }

  addMove() {
    this.moves += 1;
  }

  addHint() {
    this.hintsUsed += 1;
  }

  calculateStars() {
    if (this.moves <= 0) return 1;

    let stars = 1;

    if (this.moves <= this.targetMoves) {
      stars = 2;
    }

    if (this.moves <= this.targetMoves && this.hintsUsed === 0) {
      stars = 3;
    }

    return stars;
  }

  completeCurrentLevel() {
    const stars = this.calculateStars();

    const existing = this.bestByLevel[this.level] || {
      stars: 0,
      bestMoves: null
    };

    this.bestByLevel[this.level] = {
      stars: Math.max(existing.stars || 0, stars),
      bestMoves:
        existing.bestMoves == null
          ? this.moves
          : Math.min(existing.bestMoves, this.moves)
    };

    this.lastLevel = Math.max(Number(this.lastLevel) || 1, this.level + 1);

    void this.save();

    return {
      stars,
      moves: this.moves,
      hintsUsed: this.hintsUsed,
      targetMoves: this.targetMoves
    };
  }

  async resetAll() {
    this.bestByLevel = {};
    this.lastLevel = 1;
    this.moves = 0;
    this.hintsUsed = 0;
    this.targetMoves = 0;

    if (this.authSystem?.hasCurrentUser()) {
      await this.authSystem.clearProgressForCurrentUser();
      return;
    }

    try {
      localStorage.removeItem(CONFIG.saveKey);
    } catch {
      // Kayıt silinemezse oyunu bozmuyoruz.
    }
  }

  loadLegacy() {
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);

      if (!raw) {
        return {
          lastLevel: 1,
          bestByLevel: {}
        };
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
        return {
          lastLevel: 1,
          bestByLevel: parsed
        };
      }

      return {
        lastLevel: 1,
        bestByLevel: {}
      };
    } catch {
      return {
        lastLevel: 1,
        bestByLevel: {}
      };
    }
  }

  async save() {
    const progress = {
      lastLevel: this.lastLevel,
      bestByLevel: this.bestByLevel
    };

    if (this.authSystem?.hasCurrentUser()) {
      await this.authSystem.saveProgressForCurrentUser(progress);
      return;
    }

    try {
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(progress));
    } catch {
      // Kayıt başarısız olursa oyunu bozmuyoruz.
    }
  }
}