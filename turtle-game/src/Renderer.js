import { CONFIG } from "./config.js";
import { DIR_NEIGHBORS, hexToPixel, tileKey } from "./HexMath.js";
import { PuzzleValidator } from "./PuzzleValidator.js";

export class Renderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.waterFlowPhase = 0;
  }

  render({ grid, turtle, particleSystem, hexRadius }) {
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);

    // Merkezden gerçekten su ulaşan taşlar.
    // Böylece puzzle bitmeden de bağlı kollar akabilir.
    const connectedKeys = PuzzleValidator.calculateConnectedKeys(grid);

    const tiles = Object.keys(grid).map((key) => {
      const tile = grid[key];
      const pos = hexToPixel(tile.q, tile.r, hexRadius);

      tile.updateAnimation();

      return {
        key,
        tile,
        x: pos.x,
        y: pos.y,
        liftWave: tile.getLiftWave()
      };
    });

    // Yükselen taşlar üstte çizilsin.
    tiles.sort((a, b) => a.liftWave - b.liftWave);

    tiles.forEach(({ tile, x, y }) => {
      this.drawHexagon(ctx, x, y, hexRadius, tile, grid, connectedKeys);
    });

    this.drawTurtle(ctx, turtle);
    particleSystem.draw(ctx);

    ctx.restore();

    this.waterFlowPhase += 0.055;
  }

  drawHexagon(ctx, x, y, radius, tile, grid, connectedKeys) {
    const liftWave = tile.getLiftWave();
    const lift = tile.active ? liftWave * 11 : 0;
    const pressScale = tile.active ? 1 + liftWave * 0.035 : 1;
    const pulse = Math.sin(tile.pulsePhase) * 1.0;
    const glowRadius = radius + pulse + tile.hintGlow * 12;

    if (tile.active && lift > 0.2) {
      ctx.save();
      ctx.translate(x + lift * 0.18, y + lift * 0.62);
      ctx.scale(1 + liftWave * 0.05, 1 + liftWave * 0.03);
      this.drawHexShape(ctx, radius - 3);
      ctx.fillStyle = `rgba(60, 80, 50, ${0.08 + liftWave * 0.12})`;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y - lift);
    ctx.scale(pressScale, pressScale);

    if (tile.hintGlow > 0) {
      this.drawHexShape(ctx, glowRadius);
      ctx.fillStyle = `rgba(255, 213, 79, ${tile.hintGlow * 0.18})`;
      ctx.fill();
    }

    this.drawHexShape(ctx, radius + pulse - 2);

    if (!tile.active) {
      ctx.fillStyle = CONFIG.colors.inactiveTile;
      ctx.strokeStyle = CONFIG.colors.inactiveStroke;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.fillStyle = tile.flowerBloomed
      ? CONFIG.colors.activeSolvedTile
      : CONFIG.colors.activeTile;

    ctx.fill();

    ctx.strokeStyle = tile.flowerBloomed
      ? CONFIG.colors.solvedStroke
      : CONFIG.colors.idleStroke;

    ctx.lineWidth = 3;
    ctx.stroke();

    if (liftWave > 0.01) {
      this.drawTopShine(ctx, radius, liftWave);
    }

    this.drawWaterChannels(ctx, radius, tile, grid, connectedKeys);
    this.drawFlower(ctx, tile);

    ctx.restore();
  }

  drawHexShape(ctx, radius) {
    ctx.beginPath();

    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hX = radius * Math.cos(angle);
      const hY = radius * Math.sin(angle);

      if (i === 0) ctx.moveTo(hX, hY);
      else ctx.lineTo(hX, hY);
    }

    ctx.closePath();
  }

  drawTopShine(ctx, radius, liftWave) {
    ctx.save();
    ctx.globalAlpha = 0.18 * liftWave;
    ctx.beginPath();
    ctx.ellipse(
      -radius * 0.16,
      -radius * 0.24,
      radius * 0.34,
      radius * 0.12,
      -0.35,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.restore();
  }

  drawWaterChannels(ctx, radius, tile, grid, connectedKeys) {
    const channelLength = radius * Math.cos(Math.PI / 6) + 2;

    ctx.lineWidth = 12;
    ctx.lineCap = "round";

    const currentKey = tileKey(tile.q, tile.r);
    const currentConnected = connectedKeys.has(currentKey);

    for (let i = 0; i < 6; i += 1) {
      if (!tile.exits[i]) continue;

      const finalDir = (i + tile.rotation) % 6;
      const matched = PuzzleValidator.isExitMatched(tile, finalDir, grid);

      const dir = DIR_NEIGHBORS[finalDir];
      const neighborKey = tileKey(tile.q + dir.q, tile.r + dir.r);
      const neighborConnected = connectedKeys.has(neighborKey);

      // Yeni akış mantığı:
      // Puzzle komple bitmese bile merkezden ulaşılabilen ve eşleşen bağlantı aksın.
      const isActiveFlow = currentConnected && neighborConnected && matched;

      const visualAngle =
        (i - 1) * Math.PI / 3 + tile.visualRotation * Math.PI / 3;

      ctx.strokeStyle = isActiveFlow
        ? CONFIG.colors.matchedWater
        : CONFIG.colors.idleWater;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        channelLength * Math.cos(visualAngle),
        channelLength * Math.sin(visualAngle)
      );
      ctx.stroke();

      if (isActiveFlow) {
        this.drawFlowDash(ctx, channelLength, visualAngle);
        this.drawWaterBubbles(ctx, channelLength, visualAngle);
      }
    }
  }

  drawFlowDash(ctx, channelLength, angle) {
    ctx.save();

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.setLineDash([8, 13]);
    ctx.lineDashOffset = -this.waterFlowPhase * 42;

    ctx.beginPath();
    ctx.moveTo(3 * Math.cos(angle), 3 * Math.sin(angle));
    ctx.lineTo(
      channelLength * Math.cos(angle),
      channelLength * Math.sin(angle)
    );
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  drawWaterBubbles(ctx, channelLength, angle) {
    ctx.save();

    for (let i = 0; i < 3; i += 1) {
      const phase = (this.waterFlowPhase * 0.55 + i * 0.33) % 1;
      const distance = channelLength * (0.18 + phase * 0.72);
      const wobble = Math.sin(this.waterFlowPhase * 4 + i * 1.7) * 1.4;
      const normalAngle = angle + Math.PI / 2;

      const x =
        distance * Math.cos(angle) +
        wobble * Math.cos(normalAngle);

      const y =
        distance * Math.sin(angle) +
        wobble * Math.sin(normalAngle);

      ctx.globalAlpha = 0.42 * (1 - phase * 0.25);
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(x, y, 1.7 + i * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawFlower(ctx, tile) {
    if (tile.flowerScale <= 0.01) return;

    const flowerPulse = 1 + Math.sin(tile.pulsePhase * 2) * 0.04;

    ctx.save();

    ctx.rotate(tile.visualRotation * Math.PI / 3);
    ctx.scale(tile.flowerScale * flowerPulse, tile.flowerScale * flowerPulse);

    ctx.fillStyle = CONFIG.colors.flowerPetal;

    for (let j = 0; j < 5; j += 1) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -6, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, tile.endpoint ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = tile.endpoint
      ? CONFIG.colors.endpointCenter
      : CONFIG.colors.flowerCenter;

    ctx.fill();

    ctx.restore();
  }

  drawTurtle(ctx, turtle) {
    const legWiggle = Math.sin(turtle.animFrame) * 3;
    const bob = Math.sin(turtle.animFrame) * 1.2;

    ctx.save();
    ctx.translate(turtle.x, turtle.y + bob);
    ctx.rotate(turtle.angle + Math.PI / 2);

    ctx.fillStyle = "#81c784";

    ctx.save();
    ctx.translate(-14, -10);
    ctx.rotate(-0.3 + legWiggle * 0.05);
    ctx.fillRect(-4, -12, 7, 14);
    ctx.restore();

    ctx.save();
    ctx.translate(14, -10);
    ctx.rotate(0.3 - legWiggle * 0.05);
    ctx.fillRect(-3, -12, 7, 14);
    ctx.restore();

    ctx.fillRect(-10, 10, 5, 8);
    ctx.fillRect(5, 10, 5, 8);

    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#4caf50";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2e7d32";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -20, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#a5d6a7";
    ctx.fill();

    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(-2, -22, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(2, -22, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}