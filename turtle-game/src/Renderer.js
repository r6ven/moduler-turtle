import { CONFIG } from "./config.js";
import { DIR_ANGLES, hexToPixel } from "./HexMath.js";
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

    Object.keys(grid).forEach((key) => {
      const tile = grid[key];
      const pos = hexToPixel(tile.q, tile.r, hexRadius);

      tile.updateAnimation();
      this.drawHexagon(ctx, pos.x, pos.y, hexRadius, tile, grid);
    });

    this.drawTurtle(ctx, turtle);
    particleSystem.draw(ctx);

    ctx.restore();

    this.waterFlowPhase += 0.035;
  }

  drawHexagon(ctx, x, y, radius, tile, grid) {
    ctx.save();
    ctx.translate(x, y);

    const pulse = Math.sin(tile.pulsePhase) * 1.0;
    const glowRadius = radius + pulse + tile.hintGlow * 12;

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

    ctx.fillStyle = tile.flowerBloomed ? CONFIG.colors.activeSolvedTile : CONFIG.colors.activeTile;
    ctx.fill();

    ctx.strokeStyle = tile.flowerBloomed ? CONFIG.colors.solvedStroke : CONFIG.colors.idleStroke;
    ctx.lineWidth = 3;
    ctx.stroke();

    this.drawWaterChannels(ctx, radius, tile, grid);
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

  drawWaterChannels(ctx, radius, tile, grid) {
    const actualExits = tile.getActualExits();
    const channelLength = radius * Math.cos(Math.PI / 6) + 2;

    ctx.lineWidth = 12;
    ctx.lineCap = "round";

    for (let i = 0; i < 6; i += 1) {
      if (!actualExits[i]) continue;

      const matched = PuzzleValidator.isExitMatched(tile, i, grid);
      ctx.strokeStyle = tile.flowerBloomed && matched
        ? CONFIG.colors.matchedWater
        : CONFIG.colors.idleWater;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        channelLength * Math.cos(DIR_ANGLES[i]),
        channelLength * Math.sin(DIR_ANGLES[i])
      );
      ctx.stroke();

      if (tile.flowerBloomed && matched) {
        this.drawWaterSpark(ctx, channelLength, DIR_ANGLES[i]);
      }
    }
  }

  drawWaterSpark(ctx, channelLength, angle) {
    const t = (Math.sin(this.waterFlowPhase) + 1) / 2;
    const distance = channelLength * (0.25 + t * 0.55);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(
      distance * Math.cos(angle),
      distance * Math.sin(angle),
      2.2,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  drawFlower(ctx, tile) {
    if (tile.flowerScale <= 0.01) return;

    ctx.save();
    ctx.scale(tile.flowerScale, tile.flowerScale);

    ctx.fillStyle = CONFIG.colors.flowerPetal;

    for (let j = 0; j < 5; j += 1) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -6, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, tile.endpoint ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = tile.endpoint ? CONFIG.colors.endpointCenter : CONFIG.colors.flowerCenter;
    ctx.fill();

    ctx.restore();
  }

  drawTurtle(ctx, turtle) {
    const legWiggle = Math.sin(turtle.animFrame) * 3;

    ctx.save();
    ctx.translate(turtle.x, turtle.y + Math.sin(turtle.animFrame) * 1.2);
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
