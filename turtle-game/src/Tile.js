let decorSequence = 0;

export class Tile {
  constructor(q, r, exits, active = false) {
    this.q = q;
    this.r = r;
    this.exits = exits;
    this.active = active;

    this.endpoint = false;
    this.source = false;
    this.sink = false;
    this.victoryIndex = -1;
    this.locked = false;
    this.landmark = null;

    decorSequence = (decorSequence + 0x9e3779b9) >>> 0;
    this.decorSeed = (
      (Date.now() >>> 0) ^
      Math.imul(q + 127, 73856093) ^
      Math.imul(r + 127, 19349663) ^
      decorSequence
    ) >>> 0;

    this.rotation = 0;
    this.visualRotation = 0;
    this.targetVisualRotation = 0;

    // 0 → animasyon başladı, 1 → yerine oturdu
    this.actionProgress = 1;
    this.settleGlow = 0;

    this.flowerBloomed = false;
    this.flowerScale = 0;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.hintGlow = 0;
  }

  getActualExits() {
    const actual = new Array(6).fill(false);

    if (!this.active) {
      return actual;
    }

    for (let i = 0; i < 6; i += 1) {
      actual[(i + this.rotation) % 6] = this.exits[i];
    }

    return actual;
  }

  rotate() {
    if (!this.active || this.locked || this.isAnimating()) {
      return false;
    }

    this.rotation = (this.rotation + 1) % 6;
    this.targetVisualRotation += 1;

    // Taş basılınca yükselme-dönme-oturma animasyonu başlar.
    this.actionProgress = 0;
    this.settleGlow = 0;

    return true;
  }

  setRotation(rotation, { animate = true } = {}) {
    const normalizedRotation = ((rotation % 6) + 6) % 6;
    this.rotation = normalizedRotation;

    if (!animate) {
      this.visualRotation = normalizedRotation;
      this.targetVisualRotation = normalizedRotation;
      this.actionProgress = 1;
      this.settleGlow = 0;
      return;
    }

    const current = this.visualRotation;
    const baseCycle = Math.round(current / 6) * 6;

    const candidates = [
      baseCycle + normalizedRotation - 6,
      baseCycle + normalizedRotation,
      baseCycle + normalizedRotation + 6
    ];

    this.targetVisualRotation = candidates.reduce((best, candidate) => {
      return Math.abs(candidate - current) < Math.abs(best - current)
        ? candidate
        : best;
    }, candidates[0]);

    this.actionProgress = 0;
    this.settleGlow = 0;
  }

  isSolvedOrientation() {
    return !this.active || this.rotation === 0;
  }

  degree() {
    return this.exits.filter(Boolean).length;
  }

  isAnimating() {
    const rotationDiff = Math.abs(
      this.targetVisualRotation - this.visualRotation
    );

    return this.actionProgress < 1 || rotationDiff > 0.015;
  }

  updateAnimation(deltaMs = 1000 / 60) {
    const frameScale = Math.min(3, Math.max(0.25, deltaMs / (1000 / 60)));

    this.pulsePhase += 0.02 * frameScale;

    if (this.hintGlow > 0) {
      this.hintGlow = Math.max(0, this.hintGlow - 0.04 * frameScale);
    }

    if (this.settleGlow > 0) {
      this.settleGlow = Math.max(0, this.settleGlow - 0.085 * frameScale);
    }

    if (this.actionProgress < 1) {
      const previousProgress = this.actionProgress;
      this.actionProgress = Math.min(
        1,
        this.actionProgress + 0.095 * frameScale
      );

      if (previousProgress < 1 && this.actionProgress === 1) {
        this.settleGlow = 1;
      }
    }

    if (this.flowerBloomed) {
      this.flowerScale = Math.min(1, this.flowerScale + 0.07 * frameScale);
    } else {
      this.flowerScale = Math.max(0, this.flowerScale - 0.07 * frameScale);
    }

    const rotationDiff = this.targetVisualRotation - this.visualRotation;

    if (Math.abs(rotationDiff) < 0.004) {
      this.visualRotation = this.targetVisualRotation;
    } else {
      const rotationBlend = 1 - Math.pow(1 - 0.32, frameScale);
      this.visualRotation += rotationDiff * rotationBlend;
    }
  }

  getLiftWave() {
    if (this.actionProgress >= 1) {
      return 0;
    }

    // 0 → yükselir, 0.5 → en yukarıda, 1 → yerine oturur
    return Math.sin(this.actionProgress * Math.PI);
  }
}
