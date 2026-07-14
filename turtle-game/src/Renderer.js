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
    const currentConnected = flowState.keys.has(tileKey(tile.q, tile.r));

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

    this.drawTileSurface(ctx, surfaceRadius, tile, currentConnected);

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

  drawTileSurface(ctx, radius, tile, connected) {
    const surface = this.getTileSurface(radius, tile, connected);

    ctx.drawImage(
      surface,
      -surface.width / 2,
      -surface.height / 2
    );
  }

  getTileSurface(radius, tile, connected) {
    const state = !tile.active
      ? "inactive"
      : tile.flowerBloomed
        ? "solved"
        : connected
          ? "connected"
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
    this.paintTileSurface(surfaceCtx, radius, tile, connected);
    this.tileSurfaceCache.set(cacheKey, surface);

    return surface;
  }

  paintTileSurface(ctx, radius, tile, connected) {
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
    this.drawIslandDecorations(ctx, radius, tile, connected);
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

  drawIslandDecorations(ctx, radius, tile, connected) {
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
    const baseGrassCount = random() < grassChance
      ? random() < 0.82 ? 1 : 2
      : 0;
    const connectedGrassBonus = connected
      ? 1 + (random() < 0.38 ? 1 : 0)
      : 0;
    const grassCount = Math.min(4, baseGrassCount + connectedGrassBonus);
    const flowerRoll = random();
    const requestedFlowerCount = !connected
      ? 0
      : flowerRoll < 0.44
        ? 1
        : flowerRoll < 0.58
          ? 2
          : 0;
    const flowerCount = Math.min(grassCount, requestedFlowerCount);
    const grassPoints = [];

    for (let i = 0; i < sandPatchCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.3, 0.58);
      this.drawSandPatch(ctx, random, point.x, point.y, radius);
    }

    for (let i = 0; i < grassCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.34, 0.57);
      const scale = 0.68 + random() * 0.28;
      const rotation = random() * 0.8 - 0.4;

      grassPoints.push({
        ...point,
        scale,
        rotation
      });

      this.drawGrassTuft(
        ctx,
        point.x,
        point.y,
        scale,
        rotation,
        Math.floor(random() * 3)
      );
    }

    for (let i = 0; i < flowerCount; i += 1) {
      const point = grassPoints[i];

      this.drawWildFlower(
        ctx,
        point.x,
        point.y,
        0.72 + random() * 0.24,
        Math.floor(random() * 3),
        Math.floor(random() * 4)
      );
    }

    for (let i = 0; i < stoneCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.34, 0.59);
      this.drawStone(
        ctx,
        point.x,
        point.y,
        0.68 + random() * 0.34,
        random() * 0.9 - 0.45,
        Math.floor(random() * 3)
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

  drawStone(ctx, x, y, scale, rotation, style = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    if (style === 1) {
      this.drawRoundStone(ctx);
    } else if (style === 2) {
      this.drawAngularStone(ctx);
    } else {
      this.drawFlatStone(ctx);
    }

    ctx.restore();
  }

  drawFlatStone(ctx) {
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
  }

  drawRoundStone(ctx) {
    ctx.fillStyle = CONFIG.colors.stoneShade;
    ctx.beginPath();
    ctx.arc(0.8, 1.4, 4.7, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(-1.5, -1.8, 0.5, 0, 0, 4.3);
    gradient.addColorStop(0, "#d4ddd7");
    gradient.addColorStop(1, CONFIG.colors.stoneTop);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 4.1, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAngularStone(ctx) {
    ctx.fillStyle = CONFIG.colors.stoneShade;
    this.drawAngularStonePath(ctx);
    ctx.fill();

    ctx.save();
    ctx.translate(-0.5, -1);
    ctx.scale(0.84, 0.76);
    ctx.fillStyle = CONFIG.colors.stoneTop;
    this.drawAngularStonePath(ctx);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2.2, -2.1);
    ctx.lineTo(1.8, -2.8);
    ctx.stroke();
  }

  drawAngularStonePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-4.4, 2.3);
    ctx.lineTo(-2.7, -3.4);
    ctx.lineTo(2.3, -4.1);
    ctx.lineTo(5.1, -0.2);
    ctx.lineTo(3.1, 3.6);
    ctx.lineTo(-1.7, 4.2);
    ctx.closePath();
  }

  drawGrassTuft(ctx, x, y, scale, rotation, style = 0) {
    ctx.save();
    ctx.translate(x, y + 2);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";

    if (style === 1) {
      this.drawReedGrass(ctx);
    } else if (style === 2) {
      this.drawCloverGrass(ctx);
    } else {
      this.drawFanGrass(ctx);
    }

    ctx.restore();
  }

  drawFanGrass(ctx) {
    ctx.lineWidth = 1.7;

    const blades = [
      { endX: -4, endY: -7, color: CONFIG.colors.grassDark },
      { endX: 0, endY: -9, color: CONFIG.colors.grassLight },
      { endX: 4, endY: -6, color: CONFIG.colors.grassDark }
    ];

    blades.forEach((blade) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        blade.endX * 0.35,
        blade.endY * 0.55,
        blade.endX,
        blade.endY
      );
      ctx.strokeStyle = blade.color;
      ctx.stroke();
    });
  }

  drawReedGrass(ctx) {
    ctx.lineWidth = 1.35;

    [-4, -1.5, 1.5, 4].forEach((offset, index) => {
      ctx.beginPath();
      ctx.moveTo(offset * 0.25, 0);
      ctx.quadraticCurveTo(offset * 0.45, -5, offset, -8 - (index % 2) * 2);
      ctx.strokeStyle = index % 2
        ? CONFIG.colors.grassLight
        : CONFIG.colors.grassDark;
      ctx.stroke();
    });
  }

  drawCloverGrass(ctx) {
    ctx.strokeStyle = CONFIG.colors.grassDark;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(0, -5);
    ctx.stroke();

    ctx.fillStyle = CONFIG.colors.grassLight;

    [-1, 1].forEach((direction) => {
      ctx.beginPath();
      ctx.ellipse(direction * 2.2, -5.1, 2.5, 1.5, direction * 0.45, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.beginPath();
    ctx.ellipse(0, -7.1, 2.3, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawWildFlower(ctx, x, y, scale, style, colorIndex) {
    const colors = [
      CONFIG.colors.wildflowerPink,
      CONFIG.colors.wildflowerYellow,
      CONFIG.colors.wildflowerLavender,
      CONFIG.colors.wildflowerWhite
    ];
    const blossomColor = colors[colorIndex % colors.length];

    ctx.save();
    ctx.translate(x, y + 1);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.wildflowerStem;
    ctx.lineWidth = 1.35;

    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.quadraticCurveTo(-0.8, -4, 0, -9);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-0.3, -3.8);
    ctx.quadraticCurveTo(-3.3, -4.1, -3.8, -1.9);
    ctx.stroke();

    if (style === 1) {
      this.drawBellBlossom(ctx, blossomColor);
    } else if (style === 2) {
      this.drawStarBlossom(ctx, blossomColor);
    } else {
      this.drawDaisyBlossom(ctx, blossomColor);
    }

    ctx.restore();
  }

  drawDaisyBlossom(ctx, color) {
    ctx.save();
    ctx.translate(0, -9.5);
    ctx.fillStyle = color;

    for (let i = 0; i < 5; i += 1) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -2.3, 1.35, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 1.35, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.colors.flowerCenter;
    ctx.fill();
    ctx.restore();
  }

  drawBellBlossom(ctx, color) {
    ctx.save();
    ctx.translate(0, -9);
    ctx.strokeStyle = CONFIG.colors.wildflowerStem;
    ctx.lineWidth = 1;

    [-2.4, 0, 2.4].forEach((offset, index) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(offset * 0.7, 1, offset, 2.2 + (index % 2));
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(offset, 3.2 + (index % 2), 1.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  drawStarBlossom(ctx, color) {
    ctx.save();
    ctx.translate(0, -9.5);
    ctx.fillStyle = color;
    ctx.beginPath();

    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 3.4 : 1.45;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.colors.flowerCenter;
    ctx.fill();
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
    const variant = this.getTileSeed(tile) % 3;

    ctx.save();
    ctx.rotate(tile.visualRotation * Math.PI / 3);
    ctx.scale(tile.flowerScale * flowerPulse, tile.flowerScale * flowerPulse);

    if (variant === 1) {
      this.drawCenterLotus(ctx, tile);
    } else if (variant === 2) {
      this.drawCenterStarFlower(ctx, tile);
    } else {
      this.drawCenterDaisy(ctx, tile);
    }

    ctx.restore();
  }

  drawCenterDaisy(ctx, tile) {
    ctx.fillStyle = CONFIG.colors.flowerPetal;

    for (let i = 0; i < 5; i += 1) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -6, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this.drawFlowerCenter(ctx, tile, tile.endpoint ? 5 : 4);
  }

  drawCenterLotus(ctx, tile) {
    ctx.fillStyle = CONFIG.colors.wildflowerLavender;

    for (let i = 0; i < 6; i += 1) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 6);
      ctx.beginPath();
      ctx.ellipse(0, -5.4, 3.2, 7.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.42)";

    for (let i = 0; i < 3; i += 1) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 3 + Math.PI / 6);
      ctx.beginPath();
      ctx.ellipse(0, -3.7, 2.2, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this.drawFlowerCenter(ctx, tile, tile.endpoint ? 4.7 : 3.7);
  }

  drawCenterStarFlower(ctx, tile) {
    const pointCount = 8;

    ctx.fillStyle = CONFIG.colors.wildflowerPink;
    ctx.beginPath();

    for (let i = 0; i < pointCount * 2; i += 1) {
      const radius = i % 2 === 0 ? 8.2 : 3.6;
      const angle = -Math.PI / 2 + (i * Math.PI) / pointCount;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    this.drawFlowerCenter(ctx, tile, tile.endpoint ? 4.6 : 3.6);
  }

  drawFlowerCenter(ctx, tile, radius) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = tile.endpoint
      ? CONFIG.colors.endpointCenter
      : CONFIG.colors.flowerCenter;
    ctx.fill();
  }

  drawTurtle(ctx, turtle, hexRadius) {
    const moving = turtle.distanceToTarget() > 1.5;
    const bobAmount = moving ? 0.75 : 0.45;
    const bob = Math.sin(turtle.animFrame) * bobAmount;
    const visualOffsetX = Math.min(16, hexRadius * CONFIG.turtle.offsetXRatio);
    const visualOffsetY = Math.min(10, hexRadius * CONFIG.turtle.offsetYRatio);
    const turtleScale = Math.min(
      CONFIG.turtle.maxScale,
      hexRadius / CONFIG.turtle.scaleReference
    );

    ctx.save();
    ctx.translate(turtle.x + visualOffsetX, turtle.y + visualOffsetY + bob);
    ctx.rotate(turtle.angle + Math.PI / 2);
    ctx.scale(turtleScale, turtleScale);
    this.drawGeometricTurtle(ctx, turtle, moving);
    ctx.restore();
  }

  drawGeometricTurtle(ctx, turtle, moving) {
    const swimWave = Math.sin(turtle.animFrame * 1.65);
    const frontWave = moving ? swimWave * 0.18 : swimWave * 0.035;
    const rearWave = moving ? -swimWave * 0.1 : 0;

    this.drawTurtleTail(ctx);
    this.drawTurtleFlipper(ctx, -10.7, 10.8, -0.58 + rearWave, 0.78, true);
    this.drawTurtleFlipper(ctx, 10.7, 10.8, 0.58 - rearWave, 0.78, false);
    this.drawTurtleFlipper(ctx, -11.8, -5.2, -0.88 - frontWave, 1, true);
    this.drawTurtleFlipper(ctx, 11.8, -5.2, 0.88 + frontWave, 1, false);
    this.drawTurtleShell(ctx);
    this.drawTurtleHead(ctx);
  }

  drawTurtleTail(ctx) {
    ctx.save();
    ctx.translate(0, 17.7);
    ctx.fillStyle = CONFIG.colors.turtleSkin;
    ctx.strokeStyle = CONFIG.colors.turtleOutline;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(-2.3, -0.7);
    ctx.quadraticCurveTo(0, 5.4, 2.3, -0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawTurtleFlipper(ctx, x, y, rotation, scale, mirror) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(mirror ? -scale : scale, scale);

    const gradient = ctx.createLinearGradient(0, -4, 11, 5);
    gradient.addColorStop(0, CONFIG.colors.turtleSkinLight);
    gradient.addColorStop(1, CONFIG.colors.turtleSkin);

    ctx.fillStyle = gradient;
    ctx.strokeStyle = CONFIG.colors.turtleOutline;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-1.2, -3.2);
    ctx.quadraticCurveTo(7.7, -5.8, 11.7, 0.2);
    ctx.quadraticCurveTo(8.2, 6.2, -1.7, 3.4);
    ctx.quadraticCurveTo(1.1, 0, -1.2, -3.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = CONFIG.colors.turtleSkinSpot;
    ctx.beginPath();
    ctx.arc(6.5, -0.8, 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8.5, 1.6, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawTurtleShell(ctx) {
    const shellGradient = ctx.createLinearGradient(-11, -13, 11, 17);
    shellGradient.addColorStop(0, CONFIG.colors.turtleShellLight);
    shellGradient.addColorStop(0.52, CONFIG.colors.turtleShell);
    shellGradient.addColorStop(1, CONFIG.colors.turtleShellDark);

    ctx.fillStyle = shellGradient;
    ctx.strokeStyle = CONFIG.colors.turtleOutline;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 2, 14.2, 16.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = CONFIG.colors.turtleShellSeam;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.ellipse(0, 2, 11.9, 14.2, 0, 0, Math.PI * 2);
    ctx.stroke();

    this.drawTurtleShellPanels(ctx);

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.ellipse(-2.1, -0.2, 8.8, 10.7, -0.18, Math.PI * 1.02, Math.PI * 1.68);
    ctx.stroke();
    ctx.restore();
  }

  drawTurtleShellPanels(ctx) {
    const centerY = 2;
    const innerRadius = 5.7;

    ctx.fillStyle = "rgba(92, 142, 72, 0.68)";
    ctx.strokeStyle = CONFIG.colors.turtleShellSeam;
    ctx.lineWidth = 1.55;
    ctx.beginPath();

    for (let i = 0; i < 6; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      const x = Math.cos(angle) * innerRadius;
      const y = centerY + Math.sin(angle) * innerRadius * 1.08;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = CONFIG.colors.turtleShellSeam;
    ctx.lineWidth = 1.35;

    for (let i = 0; i < 6; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      const startX = Math.cos(angle) * innerRadius;
      const startY = centerY + Math.sin(angle) * innerRadius * 1.08;
      const endX = Math.cos(angle) * 11.8;
      const endY = centerY + Math.sin(angle) * 14.1;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }

  drawTurtleHead(ctx) {
    const headGradient = ctx.createLinearGradient(-5, -24, 6, -10);
    headGradient.addColorStop(0, CONFIG.colors.turtleSkinLight);
    headGradient.addColorStop(1, CONFIG.colors.turtleSkin);

    ctx.fillStyle = headGradient;
    ctx.strokeStyle = CONFIG.colors.turtleOutline;
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.ellipse(0, -15.2, 7.8, 7.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    this.drawTurtleEye(ctx, -2.8, -17.3);
    this.drawTurtleEye(ctx, 2.8, -17.3);

    ctx.fillStyle = CONFIG.colors.turtleSkinSpot;
    ctx.beginPath();
    ctx.arc(-1.2, -14.4, 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1.2, -14.4, 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = CONFIG.colors.turtleOutline;
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-2.3, -12.7);
    ctx.quadraticCurveTo(0, -11.1, 2.6, -12.8);
    ctx.stroke();
  }

  drawTurtleEye(ctx, x, y) {
    ctx.fillStyle = "#fffdf0";
    ctx.strokeStyle = CONFIG.colors.turtleOutline;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.85, 2.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = CONFIG.colors.turtleEye;
    ctx.beginPath();
    ctx.arc(x, y + 0.28, 1.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x - 0.38, y - 0.42, 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}
