export class Tile {
  constructor(q, r, exits, active = false) {
    this.q = q;
    this.r = r;
    this.exits = exits;
    this.active = active;

    this.endpoint = false;
    this.locked = false;

    this.rotation = 0;

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
    if (!this.active || this.locked) {
      return false;
    }

    this.rotation = (this.rotation + 1) % 6;
    return true;
  }

  isSolvedOrientation() {
    return !this.active || this.rotation === 0;
  }

  degree() {
    return this.exits.filter(Boolean).length;
  }

  updateAnimation() {
    this.pulsePhase += 0.02;

    if (this.hintGlow > 0) {
      this.hintGlow = Math.max(0, this.hintGlow - 0.025);
    }

    if (this.flowerBloomed) {
      this.flowerScale = Math.min(1, this.flowerScale + 0.05);
    } else {
      this.flowerScale = Math.max(0, this.flowerScale - 0.05);
    }
  }
}
