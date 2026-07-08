import { CONFIG } from "./config.js";

export class ProgressSystem {
  constructor() {
    this.level = 1;
    this.moves = 0;
    this.hintsUsed = 0;
    this.targetMoves = 0;
    this.bestByLevel = this.load();
  }

  startLevel(level, activeTileCount) {
    this.level = level;
    this.moves = 0;
    this.hintsUsed = 0;
    this.targetMoves = CONFIG.difficulty.getTargetMoves(activeTileCount, level);
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
    const existing = this.bestByLevel[this.level] || { stars: 0, bestMoves: null };

    this.bestByLevel[this.level] = {
      stars: Math.max(existing.stars || 0, stars),
      bestMoves: existing.bestMoves == null ? this.moves : Math.min(existing.bestMoves, this.moves)
    };

    this.save();

    return {
      stars,
      moves: this.moves,
      hintsUsed: this.hintsUsed,
      targetMoves: this.targetMoves
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  save() {
    try {
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(this.bestByLevel));
    } catch {
      // Kayıt başarısız olursa oyunu bozmuyoruz.
    }
  }
}
