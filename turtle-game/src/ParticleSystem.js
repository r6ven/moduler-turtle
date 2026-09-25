import { hexToPixel } from "./HexMath.js";

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.particleScale = 1;
  }

  setQuality(profile) {
    this.particleScale = profile?.particleScale ?? 1;
  }

  scaleCoordinates(scale) {
    if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return;

    this.particles.forEach((particle) => {
      particle.x *= scale;
      particle.y *= scale;
      particle.vx *= scale;
      particle.vy *= scale;
      particle.radius *= scale;
    });
  }

  clear() {
    this.particles = [];
  }

  createCelebration(canvasWidth, canvasHeight) {
    const count = Math.max(20, Math.round(52 * this.particleScale));

    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: (Math.random() - 0.5) * canvasWidth * 0.45,
        y: (Math.random() - 0.5) * canvasHeight * 0.45,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4 - 2,
        radius: Math.random() * 3.5 + 2.5,
        shape: i % 3 === 0 ? "petal" : "drop",
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.075,
        color: i % 3 === 0 ? "#f1bd71" : i % 2 === 0 ? "#55c6bd" : "#a1ddca",
        alpha: 1
      });
    }
  }

  createHint(tile, hexRadius) {
    const pos = hexToPixel(tile.q, tile.r, hexRadius);
    const count = Math.max(5, Math.round(12 * this.particleScale));

    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: pos.x + (Math.random() - 0.5) * hexRadius,
        y: pos.y + (Math.random() - 0.5) * hexRadius,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.5) * 1.6 - 0.5,
        radius: Math.random() * 3 + 2,
        color: "#edc373",
        alpha: 0.9
      });
    }
  }

  update(deltaMs = 1000 / 60) {
    const frameScale = Math.min(3, Math.max(0.25, deltaMs / (1000 / 60)));

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];

      particle.x += particle.vx * frameScale;
      particle.y += particle.vy * frameScale;
      particle.alpha -= 0.015 * frameScale;
      particle.angle = (particle.angle || 0) + (particle.spin || 0) * frameScale;

      if (particle.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    ctx.save();

    this.particles.forEach((particle) => {
      ctx.globalAlpha = particle.alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      if (particle.shape) {
        ctx.ellipse(particle.x, particle.y, particle.radius * 0.65,
          particle.radius * 1.55, particle.angle, 0, Math.PI * 2);
      } else {
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      }
      ctx.fill();
    });

    ctx.restore();
  }
}
