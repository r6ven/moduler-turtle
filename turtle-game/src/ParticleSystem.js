import { hexToPixel } from "./HexMath.js";

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  clear() {
    this.particles = [];
  }

  createCelebration(canvasWidth, canvasHeight) {
    for (let i = 0; i < 70; i += 1) {
      this.particles.push({
        x: (Math.random() - 0.5) * canvasWidth * 0.45,
        y: (Math.random() - 0.5) * canvasHeight * 0.45,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4 - 2,
        radius: Math.random() * 5 + 3,
        color: `hsl(${Math.random() * 60 + 320}, 90%, 75%)`,
        alpha: 1
      });
    }
  }

  createHint(tile, hexRadius) {
    const pos = hexToPixel(tile.q, tile.r, hexRadius);

    for (let i = 0; i < 12; i += 1) {
      this.particles.push({
        x: pos.x + (Math.random() - 0.5) * hexRadius,
        y: pos.y + (Math.random() - 0.5) * hexRadius,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.5) * 1.6 - 0.5,
        radius: Math.random() * 3 + 2,
        color: "hsl(48, 95%, 70%)",
        alpha: 0.9
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.alpha -= 0.015;

      if (particle.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    this.particles.forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = particle.alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}
