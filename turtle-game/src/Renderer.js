import { CONFIG } from "./config.js";
import { DIR_NEIGHBORS, hexToPixel, tileKey } from "./HexMath.js";
import { PuzzleValidator } from "./PuzzleValidator.js";

export class Renderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.waterFlowPhase = 0;
    this.lastFrameTime = performance.now();
    this.tileSurfaceCache = new Map();
    this.connectionCache = {
      grid: null,
      signature: "",
      keys: new Set(),
      depths: new Map(),
      orders: new Map()
    };
  }

  render({ grid, turtle, particleSystem, hexRadius }) {
    const ctx = this.ctx;
    const now = performance.now();
    const deltaMs = Math.min(50, Math.max(4, now - this.lastFrameTime));

    this.lastFrameTime = now;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);

    const flowState = this.getFlowState(grid);
    const tiles = Object.keys(grid).map((key) => {
      const tile = grid[key];
      const pos = hexToPixel(tile.q, tile.r, hexRadius);

      tile.updateAnimation(deltaMs);

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
      this.drawHexagon(ctx, x, y, hexRadius, tile, grid, flowState);
    });

    this.drawTurtle(ctx, turtle, hexRadius);
    particleSystem.draw(ctx);

    ctx.restore();

    this.waterFlowPhase += deltaMs * 0.0033;
  }

  getFlowState(grid) {
    const signature = Object.keys(grid)
      .filter((key) => grid[key].active)
      .map((key) => `${key}:${grid[key].rotation}`)
      .join("|");

    if (
      this.connectionCache.grid === grid &&
      this.connectionCache.signature === signature
    ) {
      return this.connectionCache;
    }

    if (this.connectionCache.grid !== grid) {
      this.tileSurfaceCache.clear();
    }

    const keys = PuzzleValidator.calculateConnectedKeys(grid);
    const depths = this.calculateFlowDepths(grid, keys);
    const orders = new Map(
      Array.from(depths.keys()).map((key, index) => [key, index])
    );

    this.connectionCache = {
      grid,
      signature,
      keys,
      depths,
      orders
    };

    return this.connectionCache;
  }

  calculateFlowDepths(grid, connectedKeys) {
    const sourceKey = tileKey(0, 0);
    const depths = new Map();

    if (!connectedKeys.has(sourceKey) || !grid[sourceKey]?.active) {
      return depths;
    }

    const queue = [sourceKey];
    let queueIndex = 0;

    depths.set(sourceKey, 0);

    while (queueIndex < queue.length) {
      const currentKey = queue[queueIndex];
      const tile = grid[currentKey];
      const currentDepth = depths.get(currentKey);
      const exits = tile.getActualExits();

      queueIndex += 1;

      for (let dirIndex = 0; dirIndex < 6; dirIndex += 1) {
        if (!exits[dirIndex]) continue;
        if (!PuzzleValidator.isExitMatched(tile, dirIndex, grid)) continue;

        const dir = DIR_NEIGHBORS[dirIndex];
        const neighborKey = tileKey(tile.q + dir.q, tile.r + dir.r);

        if (!connectedKeys.has(neighborKey) || depths.has(neighborKey)) {
          continue;
        }

        depths.set(neighborKey, currentDepth + 1);
        queue.push(neighborKey);
      }
    }

    return depths;
  }

  drawHexagon(ctx, x, y, radius, tile, grid, flowState) {
    const liftWave = tile.getLiftWave();
    const lift = tile.active ? liftWave * 10 : 0;
    const actionScale = tile.active ? 1 + liftWave * 0.032 : 1;
    const surfaceRadius = radius - 2;
    const glowRadius = radius + tile.hintGlow * 12;

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
      ctx.save();
      this.drawHexShape(ctx, surfaceRadius - 0.5);
      ctx.clip();
      this.drawWaterChannels(ctx, radius, tile, grid, flowState);
      ctx.restore();

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
    const surface = this.getTileSurface(radius, tile);

    ctx.drawImage(
      surface,
      -surface.width / 2,
      -surface.height / 2
    );
  }

  getTileSurface(radius, tile) {
    const state = !tile.active
      ? "inactive"
      : tile.flowerBloomed
        ? "solved"
        : "active";
    const cacheKey = [
      Math.round(radius * 10),
      state,
      tile.decorSeed,
      tile.q,
      tile.r
    ].join(":");

    if (this.tileSurfaceCache.has(cacheKey)) {
      return this.tileSurfaceCache.get(cacheKey);
    }

    const padding = 5;
    const size = Math.ceil((radius + padding) * 2);
    const surface = document.createElement("canvas");
    const surfaceCtx = surface.getContext("2d");

    surface.width = size;
    surface.height = size;

    surfaceCtx.translate(size / 2, size / 2);
    this.paintTileSurface(surfaceCtx, radius, tile);
    this.tileSurfaceCache.set(cacheKey, surface);

    return surface;
  }

  paintTileSurface(ctx, radius, tile) {
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
    this.drawIslandDecorations(ctx, radius, tile);
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

  getTileSeed(tile) {
    return tile.decorSeed ?? Math.abs(tile.q * 37 + tile.r * 61 + 17);
  }

  drawTileTexture(ctx, radius, tile) {
    const seed = this.getTileSeed(tile);

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

  drawIslandDecorations(ctx, radius, tile) {
    const seed = this.getTileSeed(tile);
    const random = this.createSeededRandom(seed);
    const stoneRoll = random();
    const sandRoll = random();
    const grassChance = tile.flowerBloomed
      ? 0.72
      : tile.active
        ? 0.26
        : 0.46;
    const stoneCount = stoneRoll < 0.42
      ? 0
      : stoneRoll < 0.8
        ? 1
        : stoneRoll < 0.96
          ? 2
          : 3;
    const sandPatchCount = sandRoll < 0.22
      ? 0
      : sandRoll < 0.82
        ? 1
        : 2;
    const grassCount = random() < grassChance
      ? random() < 0.82 ? 1 : 2
      : 0;

    for (let i = 0; i < sandPatchCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.3, 0.58);
      this.drawSandPatch(ctx, random, point.x, point.y, radius);
    }

    for (let i = 0; i < grassCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.34, 0.57);
      this.drawGrassTuft(
        ctx,
        point.x,
        point.y,
        0.72 + random() * 0.24,
        random() * 0.8 - 0.4
      );
    }

    for (let i = 0; i < stoneCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.34, 0.59);
      this.drawStone(
        ctx,
        point.x,
        point.y,
        0.68 + random() * 0.34,
        random() * 0.9 - 0.45
      );
    }
  }

  createSeededRandom(seed) {
    let state = seed >>> 0;

    return () => {
      state = (state + 0x6d2b79f5) >>> 0;

      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  pickDecorPoint(random, radius, minDistance, maxDistance) {
    const angle = random() * Math.PI * 2;
    const distance = radius * (
      minDistance + random() * (maxDistance - minDistance)
    );

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance
    };
  }

  drawSandPatch(ctx, random, centerX, centerY, radius) {
    const grainCount = 5 + Math.floor(random() * 5);

    ctx.save();
    ctx.fillStyle = CONFIG.colors.sandSpeck;

    for (let i = 0; i < grainCount; i += 1) {
      const angle = random() * Math.PI * 2;
      const spread = radius * (0.045 + random() * 0.085);
      const x = centerX + Math.cos(angle) * spread;
      const y = centerY + Math.sin(angle) * spread * 0.65;

      ctx.beginPath();
      ctx.arc(x, y, 0.55 + random() * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawStone(ctx, x, y, scale, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    ctx.fillStyle = CONFIG.colors.stoneShade;
    ctx.beginPath();
    ctx.ellipse(0.9, 1.8, 5.3, 3.1, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.colors.stoneTop;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.8, 3, -0.16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
    ctx.beginPath();
    ctx.ellipse(-1.4, -0.9, 1.8, 0.7, -0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawGrassTuft(ctx, x, y, scale, rotation) {
    ctx.save();
    ctx.translate(x, y + 2);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineWidth = 1.7;

    const blades = [
      { endX: -4, endY: -7, color: CONFIG.colors.grassDark },
      { endX: 0, endY: -9, color: CONFIG.colors.grassLight },
      { endX: 4, endY: -6, color: CONFIG.colors.grassDark }
    ];

    blades.forEach((blade) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(blade.endX * 0.35, blade.endY * 0.55, blade.endX, blade.endY);
      ctx.strokeStyle = blade.color;
      ctx.stroke();
    });

    ctx.restore();
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

  drawWaterChannels(ctx, radius, tile, grid, flowState) {
    const channelLength = radius * Math.cos(Math.PI / 6) + 2;
    const currentKey = tileKey(tile.q, tile.r);
    const currentConnected = flowState.keys.has(currentKey);
    const currentDepth = flowState.depths.get(currentKey);
    const currentOrder = flowState.orders.get(currentKey);
    const channels = [];

    for (let i = 0; i < 6; i += 1) {
      if (!tile.exits[i]) continue;

      const finalDir = (i + tile.rotation) % 6;
      const matched = PuzzleValidator.isExitMatched(tile, finalDir, grid);
      const dir = DIR_NEIGHBORS[finalDir];
      const neighborKey = tileKey(tile.q + dir.q, tile.r + dir.r);
      const neighborConnected = flowState.keys.has(neighborKey);
      const neighborDepth = flowState.depths.get(neighborKey);
      const neighborOrder = flowState.orders.get(neighborKey);
      const active = currentConnected && neighborConnected && matched;

      channels.push({
        angle: (i - 1) * Math.PI / 3 + tile.visualRotation * Math.PI / 3,
        active,
        direction: active
          ? this.getFlowDirection(
              currentKey,
              neighborKey,
              currentDepth,
              neighborDepth,
              currentOrder,
              neighborOrder
            )
          : 0
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

    channels.forEach((channel) => {
      this.drawWaterSurfaceSheen(
        ctx,
        channelLength,
        channel.angle,
        channel.active
      );
    });

    this.drawCenterPool(ctx, currentConnected, channels.length > 0);

    channels.forEach((channel) => {
      if (channel.active) {
        this.drawFlowDash(
          ctx,
          channelLength,
          channel.angle,
          channel.direction
        );
        this.drawWaterBubbles(
          ctx,
          channelLength,
          channel.angle,
          channel.direction
        );
      }
    });
  }

  getFlowDirection(
    currentKey,
    neighborKey,
    currentDepth,
    neighborDepth,
    currentOrder = 0,
    neighborOrder = 0
  ) {
    if (neighborDepth > currentDepth) return 1;
    if (neighborDepth < currentDepth) return -1;

    if (neighborOrder > currentOrder) return 1;
    if (neighborOrder < currentOrder) return -1;

    return currentKey.localeCompare(neighborKey) < 0 ? 1 : -1;
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

  drawWaterSurfaceSheen(ctx, channelLength, angle, active) {
    ctx.save();
    ctx.globalAlpha = active ? 0.3 : 0.2;
    ctx.lineWidth = active ? 2.4 : 1.8;
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.waterHighlight;

    const normalAngle = angle - Math.PI / 2;
    const offset = active ? 1.6 : 1.2;
    const offsetX = Math.cos(normalAngle) * offset;
    const offsetY = Math.sin(normalAngle) * offset;

    ctx.beginPath();
    ctx.moveTo(
      5 * Math.cos(angle) + offsetX,
      5 * Math.sin(angle) + offsetY
    );
    ctx.lineTo(
      channelLength * 0.88 * Math.cos(angle) + offsetX,
      channelLength * 0.88 * Math.sin(angle) + offsetY
    );
    ctx.stroke();
    ctx.restore();
  }

  drawFlowDash(ctx, channelLength, angle, direction) {
    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.waterHighlight;
    ctx.setLineDash([7, 12]);
    ctx.lineDashOffset = -this.waterFlowPhase * 42 * direction;
    ctx.beginPath();
    ctx.moveTo(4 * Math.cos(angle), 4 * Math.sin(angle));
    ctx.lineTo(
      channelLength * Math.cos(angle),
      channelLength * Math.sin(angle)
    );
    ctx.stroke();
    ctx.restore();
  }

  drawWaterBubbles(ctx, channelLength, angle, direction) {
    ctx.save();

    for (let i = 0; i < 2; i += 1) {
      const phase = (this.waterFlowPhase * 0.55 + i * 0.48) % 1;
      const travelPhase = direction > 0 ? phase : 1 - phase;
      const distance = channelLength * (0.2 + travelPhase * 0.68);
      const wobble = Math.sin(this.waterFlowPhase * 4 + i * 1.9) * 1.25;
      const normalAngle = angle + Math.PI / 2;
      const x = distance * Math.cos(angle) + wobble * Math.cos(normalAngle);
      const y = distance * Math.sin(angle) + wobble * Math.sin(normalAngle);

      ctx.globalAlpha = 0.5 * (1 - travelPhase * 0.25);
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
