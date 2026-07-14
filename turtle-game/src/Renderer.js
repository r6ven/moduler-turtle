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

    const connectedKeys = PuzzleValidator.calculateConnectedKeys(grid);
    const tiles = Object.keys(grid).map((key) => {
      const tile = grid[key];
      const pos = hexToPixel(tile.q, tile.r, hexRadius);

      tile.updateAnimation();

      return {
        tile,
        x: pos.x,
        y: pos.y,
        liftWave: tile.getLiftWave()
      };
    });

    // Lifted tiles render last so they visibly rise above their neighbours.
    tiles.sort((a, b) => a.liftWave - b.liftWave);

    tiles.forEach(({ tile, x, y }) => {
      this.drawHexagon(ctx, x, y, hexRadius, tile, grid, connectedKeys);
    });

    this.drawTurtle(ctx, turtle, hexRadius);
    particleSystem.draw(ctx);

    ctx.restore();

    this.waterFlowPhase += 0.055;
  }

  drawHexagon(ctx, x, y, radius, tile, grid, connectedKeys) {
    const liftWave = tile.getLiftWave();
    const lift = tile.active ? liftWave * 10 : 0;
    const actionScale = tile.active ? 1 + liftWave * 0.032 : 1;
    const pulse = Math.sin(tile.pulsePhase) * 0.7;
    const surfaceRadius = radius + pulse - 2;
    const glowRadius = radius + pulse + tile.hintGlow * 12;

    this.drawTileShadow(ctx, x, y, radius, tile, liftWave);
    this.drawTileSide(ctx, x, y - lift, surfaceRadius, tile, liftWave);

    ctx.save();
    ctx.translate(x, y - lift);
    ctx.scale(actionScale, actionScale);

    if (tile.hintGlow > 0) {
      this.drawHexShape(ctx, glowRadius);
      ctx.fillStyle = `rgba(255, 213, 79, ${tile.hintGlow * 0.18})`;
      ctx.fill();
    }

    this.drawTileSurface(ctx, surfaceRadius, tile);

    if (tile.active) {
      this.drawWaterChannels(ctx, radius, tile, grid, connectedKeys);
      this.drawFlower(ctx, tile);
      this.drawSettleGlow(ctx, radius, tile);
    }

    ctx.restore();
  }

  drawTileShadow(ctx, x, y, radius, tile, liftWave) {
    const shadowOffset = tile.active ? 4 + liftWave * 6 : 3;
    const shadowScale = 1 + liftWave * 0.045;

    ctx.save();
    ctx.translate(x + 2, y + shadowOffset);
    ctx.scale(shadowScale, 1 + liftWave * 0.025);
    this.drawHexShape(ctx, radius - 2);
    ctx.fillStyle = tile.active
      ? CONFIG.colors.tileShadow
      : "rgba(48, 78, 54, 0.07)";
    ctx.fill();
    ctx.restore();
  }

  drawTileSide(ctx, x, y, radius, tile, liftWave) {
    const sideDepth = tile.active ? 4 + liftWave * 1.5 : 2;

    ctx.save();
    ctx.translate(x, y + sideDepth);
    ctx.scale(1 + liftWave * 0.032, 1 + liftWave * 0.032);
    this.drawHexShape(ctx, radius);

    if (!tile.active) {
      ctx.fillStyle = CONFIG.colors.inactiveTileBottom;
    } else if (tile.flowerBloomed) {
      ctx.fillStyle = CONFIG.colors.solvedTileSide;
    } else {
      ctx.fillStyle = CONFIG.colors.tileSide;
    }

    ctx.fill();
    ctx.restore();
  }

  drawTileSurface(ctx, radius, tile) {
    const surfaceGradient = ctx.createLinearGradient(0, -radius, 0, radius);

    if (!tile.active) {
      surfaceGradient.addColorStop(0, CONFIG.colors.inactiveTileTop);
      surfaceGradient.addColorStop(1, CONFIG.colors.inactiveTileBottom);
    } else if (tile.flowerBloomed) {
      surfaceGradient.addColorStop(0, CONFIG.colors.solvedTileTop);
      surfaceGradient.addColorStop(0.56, CONFIG.colors.activeSolvedTile);
      surfaceGradient.addColorStop(1, CONFIG.colors.solvedTileBottom);
    } else {
      surfaceGradient.addColorStop(0, CONFIG.colors.activeTileTop);
      surfaceGradient.addColorStop(0.58, CONFIG.colors.activeTile);
      surfaceGradient.addColorStop(1, CONFIG.colors.activeTileBottom);
    }

    this.drawHexShape(ctx, radius);
    ctx.fillStyle = surfaceGradient;
    ctx.fill();

    ctx.save();
    this.drawHexShape(ctx, radius - 1);
    ctx.clip();
    this.drawTileTexture(ctx, radius, tile);
    ctx.restore();

    this.drawHexShape(ctx, radius);
    ctx.lineWidth = tile.active ? 2.6 : 1.7;
    ctx.strokeStyle = !tile.active
      ? CONFIG.colors.inactiveStroke
      : tile.flowerBloomed
        ? CONFIG.colors.solvedStroke
        : CONFIG.colors.idleStroke;
    ctx.stroke();

    const edgeGradient = ctx.createLinearGradient(0, -radius, 0, radius * 0.3);
    edgeGradient.addColorStop(0, CONFIG.colors.tileHighlight);
    edgeGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    this.drawHexShape(ctx, radius - 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = edgeGradient;
    ctx.stroke();
  }

  drawTileTexture(ctx, radius, tile) {
    const seed = Math.abs(tile.q * 37 + tile.r * 61 + 17);

    ctx.fillStyle = CONFIG.colors.tileTexture;

    for (let i = 0; i < 5; i += 1) {
      const angle = (seed * 0.19 + i * 1.37) % (Math.PI * 2);
      const distance = radius * (0.27 + ((seed + i * 11) % 18) / 100);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const dotRadius = 0.7 + ((seed + i * 7) % 5) * 0.13;

      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawHexShape(ctx, radius) {
    ctx.beginPath();

    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hX = radius * Math.cos(angle);
      const hY = radius * Math.sin(angle);

      if (i === 0) {
        ctx.moveTo(hX, hY);
      } else {
        ctx.lineTo(hX, hY);
      }
    }

    ctx.closePath();
  }

  drawSettleGlow(ctx, radius, tile) {
    if (tile.settleGlow <= 0.01) return;

    const spread = (1 - tile.settleGlow) * 7;

    ctx.save();
    this.drawHexShape(ctx, radius + 1 + spread);
    ctx.lineWidth = 2 + tile.settleGlow * 1.4;
    ctx.strokeStyle = tile.flowerBloomed
      ? CONFIG.colors.connectionGlow
      : `rgba(255, 205, 86, ${tile.settleGlow * 0.34})`;
    ctx.globalAlpha = tile.flowerBloomed
      ? tile.settleGlow
      : Math.min(1, tile.settleGlow * 0.75);
    ctx.stroke();
    ctx.restore();
  }

  drawWaterChannels(ctx, radius, tile, grid, connectedKeys) {
    const channelLength = radius * Math.cos(Math.PI / 6) + 2;
    const currentKey = tileKey(tile.q, tile.r);
    const currentConnected = connectedKeys.has(currentKey);
    const channels = [];

    for (let i = 0; i < 6; i += 1) {
      if (!tile.exits[i]) continue;

      const finalDir = (i + tile.rotation) % 6;
      const matched = PuzzleValidator.isExitMatched(tile, finalDir, grid);
      const dir = DIR_NEIGHBORS[finalDir];
      const neighborKey = tileKey(tile.q + dir.q, tile.r + dir.r);
      const neighborConnected = connectedKeys.has(neighborKey);

      channels.push({
        angle: (i - 1) * Math.PI / 3 + tile.visualRotation * Math.PI / 3,
        active: currentConnected && neighborConnected && matched
      });
    }

    channels.forEach((channel) => {
      this.drawChannelLine(
        ctx,
        channelLength,
        channel.angle,
        18,
        channel.active
          ? CONFIG.colors.channelBedActive
          : CONFIG.colors.channelBedIdle
      );
    });

    channels.forEach((channel) => {
      this.drawChannelLine(
        ctx,
        channelLength,
        channel.angle,
        12,
        channel.active
          ? CONFIG.colors.matchedWater
          : CONFIG.colors.idleWater
      );
    });

    this.drawCenterPool(ctx, currentConnected, channels.length > 0);

    channels.forEach((channel) => {
      if (channel.active) {
        this.drawFlowDash(ctx, channelLength, channel.angle);
        this.drawWaterBubbles(ctx, channelLength, channel.angle);
      } else {
        this.drawIdleWaterGlint(ctx, channelLength, channel.angle);
      }
    });
  }

  drawChannelLine(ctx, channelLength, angle, width, color) {
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      channelLength * Math.cos(angle),
      channelLength * Math.sin(angle)
    );
    ctx.stroke();
    ctx.restore();
  }

  drawCenterPool(ctx, connected, hasChannels) {
    if (!hasChannels) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = connected
      ? CONFIG.colors.channelBedActive
      : CONFIG.colors.channelBedIdle;
    ctx.fill();

    const poolGradient = ctx.createRadialGradient(-2.5, -3, 1, 0, 0, 7);
    poolGradient.addColorStop(0, connected ? "#8ee8ff" : "#e4f5f5");
    poolGradient.addColorStop(
      1,
      connected ? CONFIG.colors.matchedWater : CONFIG.colors.idleWater
    );

    ctx.beginPath();
    ctx.arc(0, 0, 6.7, 0, Math.PI * 2);
    ctx.fillStyle = poolGradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-2.3, -2.5, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.colors.waterHighlight;
    ctx.fill();
    ctx.restore();
  }

  drawIdleWaterGlint(ctx, channelLength, angle) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.waterHighlight;
    ctx.beginPath();
    ctx.moveTo(5 * Math.cos(angle), 5 * Math.sin(angle));
    ctx.lineTo(
      channelLength * 0.82 * Math.cos(angle),
      channelLength * 0.82 * Math.sin(angle)
    );
    ctx.stroke();
    ctx.restore();
  }

  drawFlowDash(ctx, channelLength, angle) {
    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.waterHighlight;
    ctx.setLineDash([7, 12]);
    ctx.lineDashOffset = -this.waterFlowPhase * 42;
    ctx.beginPath();
    ctx.moveTo(4 * Math.cos(angle), 4 * Math.sin(angle));
    ctx.lineTo(
      channelLength * Math.cos(angle),
      channelLength * Math.sin(angle)
    );
    ctx.stroke();
    ctx.restore();
  }

  drawWaterBubbles(ctx, channelLength, angle) {
    ctx.save();

    for (let i = 0; i < 2; i += 1) {
      const phase = (this.waterFlowPhase * 0.55 + i * 0.48) % 1;
      const distance = channelLength * (0.2 + phase * 0.68);
      const wobble = Math.sin(this.waterFlowPhase * 4 + i * 1.9) * 1.25;
      const normalAngle = angle + Math.PI / 2;
      const x = distance * Math.cos(angle) + wobble * Math.cos(normalAngle);
      const y = distance * Math.sin(angle) + wobble * Math.sin(normalAngle);

      ctx.globalAlpha = 0.5 * (1 - phase * 0.25);
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + i * 0.2, 0, Math.PI * 2);
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

  drawTurtle(ctx, turtle, hexRadius) {
    const legWiggle = Math.sin(turtle.animFrame) * 3;
    const bob = Math.sin(turtle.animFrame) * 1.2;
    const visualOffsetX = Math.min(18, hexRadius * 0.42);
    const visualOffsetY = Math.min(12, hexRadius * 0.30);
    const turtleScale = 0.82;

    ctx.save();
    ctx.translate(turtle.x + visualOffsetX, turtle.y + visualOffsetY + bob);
    ctx.scale(turtleScale, turtleScale);
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
