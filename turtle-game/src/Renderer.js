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
    this.flowStreakCache = new Map();
    this.quality = CONFIG.performance.profiles.high;
    this.logicalWidth = canvas.width || 1;
    this.logicalHeight = canvas.height || 1;
    this.pixelRatio = 1;
    this.tileLayoutCache = {
      grid: null,
      radius: 0,
      tiles: []
    };
    this.connectionCache = {
      grid: null,
      dirty: true,
      keys: new Set(),
      depths: new Map(),
      orders: new Map()
    };
  }

  setQuality(profile) {
    this.quality = profile || CONFIG.performance.profiles.high;
  }

  setViewport(width, height, pixelRatio = 1) {
    const nextRatio = Math.max(1, Number(pixelRatio) || 1);
    const ratioChanged = Math.abs(nextRatio - this.pixelRatio) > 0.001;

    this.logicalWidth = Math.max(1, Number(width) || 1);
    this.logicalHeight = Math.max(1, Number(height) || 1);
    this.pixelRatio = nextRatio;

    if (ratioChanged) {
      this.tileSurfaceCache.clear();
    }
  }

  resetClock(timestamp = performance.now()) {
    this.lastFrameTime = timestamp;
  }

  invalidateConnections() {
    this.connectionCache.dirty = true;
  }

  invalidateGrid() {
    this.tileLayoutCache.grid = null;
    this.tileLayoutCache.tiles = [];
    this.connectionCache.grid = null;
    this.connectionCache.dirty = true;
    this.tileSurfaceCache.clear();
    this.flowStreakCache.clear();
  }

  render({ grid, turtle, particleSystem, hexRadius }) {
    const ctx = this.ctx;
    const now = performance.now();
    const deltaMs = Math.min(50, Math.max(4, now - this.lastFrameTime));

    this.lastFrameTime = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.save();
    ctx.scale(this.pixelRatio, this.pixelRatio);
    ctx.translate(this.logicalWidth / 2, this.logicalHeight / 2);

    const flowState = this.getFlowState(grid);
    const tiles = this.getTileLayout(grid, hexRadius);
    const liftedTiles = [];

    tiles.forEach((entry) => {
      entry.tile.updateAnimation(deltaMs);
      entry.liftWave = entry.tile.getLiftWave();

      if (entry.liftWave > 0.001) {
        liftedTiles.push(entry);
        return;
      }

      this.drawHexagon(
        ctx,
        entry.x,
        entry.y,
        hexRadius,
        entry.tile,
        grid,
        flowState
      );
    });

    liftedTiles.sort((a, b) => a.liftWave - b.liftWave);
    liftedTiles.forEach((entry) => {
      this.drawHexagon(
        ctx,
        entry.x,
        entry.y,
        hexRadius,
        entry.tile,
        grid,
        flowState
      );
    });

    this.drawTurtle(ctx, turtle, hexRadius);
    particleSystem.draw(ctx);

    ctx.restore();

    this.waterFlowPhase += deltaMs * 0.0033;
  }

  getTileLayout(grid, hexRadius) {
    if (
      this.tileLayoutCache.grid === grid &&
      this.tileLayoutCache.radius === hexRadius
    ) {
      return this.tileLayoutCache.tiles;
    }

    const tiles = Object.values(grid).map((tile) => {
      const pos = hexToPixel(tile.q, tile.r, hexRadius);

      return {
        tile,
        x: pos.x,
        y: pos.y,
        liftWave: 0
      };
    });

    this.tileLayoutCache = {
      grid,
      radius: hexRadius,
      tiles
    };

    return tiles;
  }

  getFlowState(grid) {
    if (
      this.connectionCache.grid === grid &&
      !this.connectionCache.dirty
    ) {
      return this.connectionCache;
    }

    if (this.connectionCache.grid !== grid) {
      this.tileSurfaceCache.clear();
      this.flowStreakCache.clear();
    }

    const keys = PuzzleValidator.calculateConnectedKeys(grid);
    const depths = this.calculateFlowDepths(grid, keys);
    const orders = new Map(
      Array.from(depths.keys()).map((key, index) => [key, index])
    );

    this.connectionCache = {
      grid,
      dirty: false,
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
      this.drawHexShape(ctx, radius + 3);
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
    const logicalSize = surface.logicalSize || surface.width / this.pixelRatio;

    ctx.drawImage(
      surface,
      -logicalSize / 2,
      -logicalSize / 2,
      logicalSize,
      logicalSize
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
      Math.round(this.pixelRatio * 100),
      tile.decorSeed,
      tile.q,
      tile.r
    ].join(":");

    if (this.tileSurfaceCache.has(cacheKey)) {
      return this.tileSurfaceCache.get(cacheKey);
    }

    const padding = 5;
    const size = Math.ceil((radius + padding) * 2);
    const pixelSize = Math.max(1, Math.ceil(size * this.pixelRatio));
    const surface = document.createElement("canvas");
    const surfaceCtx = surface.getContext("2d");

    surface.width = pixelSize;
    surface.height = pixelSize;
    surface.logicalSize = size;

    surfaceCtx.imageSmoothingEnabled = true;
    surfaceCtx.imageSmoothingQuality = "high";
    surfaceCtx.scale(this.pixelRatio, this.pixelRatio);
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
    const random = this.createSeededRandom(seed ^ 0xa53a9e37);

    ctx.save();

    for (let i = 0; i < 3; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * (0.08 + random() * 0.42);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const patchRadius = radius * (0.16 + random() * 0.1);
      const patch = ctx.createRadialGradient(x, y, 0, x, y, patchRadius);

      patch.addColorStop(0, i % 2 === 0
        ? CONFIG.colors.tileTextureLight
        : CONFIG.colors.tileTextureShade);
      patch.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.fillStyle = patch;
      ctx.beginPath();
      ctx.arc(x, y, patchRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = CONFIG.colors.tileTexture;

    for (let i = 0; i < 18; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * Math.sqrt(random()) * 0.72;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const dotRadius = 0.28 + random() * 0.62;

      ctx.globalAlpha = 0.34 + random() * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = CONFIG.colors.tileTextureShade;
    ctx.lineWidth = 0.45;

    for (let i = 0; i < 4; i += 1) {
      const x = (random() - 0.5) * radius * 0.85;
      const y = (random() - 0.5) * radius * 0.68;

      ctx.beginPath();
      ctx.arc(x, y, 1.8 + random() * 3.2, 0.15, 1.25);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawIslandDecorations(ctx, radius, tile, connected) {
    const seed = this.getTileSeed(tile);
    const random = this.createSeededRandom(seed);
    const stoneRoll = random();
    const sandRoll = random();
    const grassChance = tile.flowerBloomed
      ? 0.82
      : tile.active
        ? 0.3
        : 0.42;
    const stoneClusterCount = stoneRoll < 0.34
      ? 0
      : stoneRoll < 0.82
        ? 1
        : 2;
    const sandPatchCount = sandRoll < 0.22
      ? 0
      : sandRoll < 0.82
        ? 1
        : 2;
    const baseGrassCount = random() < grassChance
      ? random() < 0.72 ? 1 : 2
      : 0;
    const connectedGrassBonus = connected
      ? 1 + (random() < 0.58 ? 1 : 0)
      : 0;
    const grassCount = Math.min(5, baseGrassCount + connectedGrassBonus);
    const flowerRoll = random();
    const requestedFlowerPatchCount = !connected
      ? 0
      : flowerRoll < 0.5
        ? 1
        : flowerRoll < 0.64
          ? 2
          : 0;
    const flowerPatchCount = Math.min(grassCount, requestedFlowerPatchCount);
    const grassPoints = [];

    for (let i = 0; i < sandPatchCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.3, 0.58);
      this.drawSandPatch(ctx, random, point.x, point.y, radius);
    }

    for (let i = 0; i < grassCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.34, 0.57);
      const scale = 0.72 + random() * 0.38;
      const rotation = random() * 0.9 - 0.45;

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

    for (let i = 0; i < flowerPatchCount; i += 1) {
      const point = grassPoints[i];

      this.drawFlowerPatch(
        ctx,
        random,
        point.x,
        point.y,
        0.7 + random() * 0.2
      );
    }

    for (let i = 0; i < stoneClusterCount; i += 1) {
      const point = this.pickDecorPoint(random, radius, 0.38, 0.61);
      this.drawStoneCluster(
        ctx,
        random,
        point.x,
        point.y,
        0.72 + random() * 0.28
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
    const sector = Math.floor(random() * 6);
    const angle =
      sector * Math.PI / 3 +
      Math.PI / 6 +
      (random() - 0.5) * 0.3;
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
    } else if (style === 3) {
      this.drawWarmStone(ctx);
    } else {
      this.drawFlatStone(ctx);
    }

    ctx.restore();
  }

  drawStoneCluster(ctx, random, x, y, scale) {
    const clusterSize = random() < 0.56
      ? 1
      : random() < 0.82
        ? 2
        : 3;

    ctx.save();
    ctx.translate(x, y);

    const shadowWidth = 5.5 + clusterSize * 2.4;
    ctx.fillStyle = "rgba(90, 67, 50, 0.14)";
    ctx.beginPath();
    ctx.ellipse(1.5, 3.5, shadowWidth * scale, 3.2 * scale, -0.12, 0, Math.PI * 2);
    ctx.fill();

    for (let i = clusterSize - 1; i >= 0; i -= 1) {
      const direction = i === 0 ? 0 : i % 2 === 0 ? 1 : -1;
      const offsetX = direction * (4.2 + random() * 1.7);
      const offsetY = i === 0 ? -1.2 : 1.4 + random() * 1.8;
      const stoneScale = scale * (i === 0 ? 1.08 : 0.62 + random() * 0.18);

      this.drawStone(
        ctx,
        offsetX,
        offsetY,
        stoneScale,
        random() * 0.9 - 0.45,
        Math.floor(random() * 4)
      );
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

  drawWarmStone(ctx) {
    const gradient = ctx.createLinearGradient(-4, -4, 4, 4);
    gradient.addColorStop(0, CONFIG.colors.stoneLight);
    gradient.addColorStop(0.5, CONFIG.colors.stoneWarm);
    gradient.addColorStop(1, CONFIG.colors.stoneShade);

    ctx.fillStyle = CONFIG.colors.stoneShade;
    ctx.beginPath();
    ctx.ellipse(1, 1.9, 5.2, 3.7, 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-4.5, 1.8);
    ctx.quadraticCurveTo(-4.1, -2.9, -0.8, -4.1);
    ctx.quadraticCurveTo(3.4, -4, 4.8, -0.7);
    ctx.quadraticCurveTo(4.1, 3.2, 0.4, 3.7);
    ctx.quadraticCurveTo(-3.2, 3.5, -4.5, 1.8);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 249, 229, 0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2.8, -1.3);
    ctx.quadraticCurveTo(-0.4, -3.2, 2.1, -2.1);
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

  drawFlowerPatch(ctx, random, x, y, scale) {
    const blossomCount = 2 + Math.floor(random() * 3);

    ctx.save();
    ctx.translate(x, y);

    for (let i = 0; i < blossomCount; i += 1) {
      const spreadX = (random() - 0.5) * 8;
      const spreadY = (random() - 0.5) * 4;
      const flowerScale = scale * (0.72 + random() * 0.34);

      this.drawWildFlower(
        ctx,
        spreadX,
        spreadY,
        flowerScale,
        Math.floor(random() * 3),
        Math.floor(random() * 4)
      );
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
    const faceDistance = radius * Math.cos(Math.PI / 6);
    const matchedChannelLength = faceDistance + 2.5;
    const closedChannelLength = Math.max(12, faceDistance - 10.5);
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
        length: matched ? matchedChannelLength : closedChannelLength,
        flowSeed: (
          this.getTileSeed(tile) ^ Math.imul(i + 1, 0x9e3779b1)
        ) >>> 0,
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

    const idleChannels = currentConnected ? [] : channels;
    const filledChannels = currentConnected ? channels : [];

    this.drawChannelNetwork(
      ctx,
      idleChannels,
      18,
      CONFIG.colors.channelBedIdle
    );
    this.drawChannelNetwork(
      ctx,
      filledChannels,
      18,
      CONFIG.colors.channelBedShadow
    );

    this.drawChannelNetwork(
      ctx,
      idleChannels,
      12,
      CONFIG.colors.idleWaterDeep
    );
    this.drawChannelNetwork(
      ctx,
      filledChannels,
      12,
      CONFIG.colors.matchedWaterDeep
    );

    this.drawChannelNetwork(
      ctx,
      idleChannels,
      9,
      CONFIG.colors.idleWater
    );
    this.drawChannelNetwork(
      ctx,
      filledChannels,
      9,
      CONFIG.colors.matchedWater
    );

    channels.forEach((channel) => {
      this.drawWaterSurfaceSheen(
        ctx,
        channel.length,
        channel.angle,
        channel.active
      );
    });

    this.drawWaterPortal(ctx, tile, currentConnected);

    channels.forEach((channel) => {
      if (channel.active) {
        this.drawFlowDash(
          ctx,
          channel.length,
          channel.angle,
          channel.direction,
          channel.flowSeed
        );
        this.drawWaterBubbles(
          ctx,
          channel.length,
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

  drawChannelNetwork(ctx, channels, width, color) {
    if (channels.length === 0) return;

    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.beginPath();

    channels.forEach((channel) => {
      ctx.moveTo(0, 0);
      ctx.lineTo(
        channel.length * Math.cos(channel.angle),
        channel.length * Math.sin(channel.angle)
      );
    });

    ctx.stroke();
    ctx.restore();
  }

  drawWaterPortal(ctx, tile, connected) {
    if (!tile.source && !tile.sink) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = connected
      ? CONFIG.colors.channelBedActive
      : CONFIG.colors.channelBedIdle;
    ctx.fill();

    const portalGradient = ctx.createRadialGradient(-2, -2.5, 0.8, 0, 0, 7.2);

    if (tile.source) {
      portalGradient.addColorStop(0, CONFIG.colors.sourceCore);
      portalGradient.addColorStop(
        1,
        connected ? CONFIG.colors.matchedWater : CONFIG.colors.idleWater
      );
    } else {
      portalGradient.addColorStop(0, CONFIG.colors.sinkCore);
      portalGradient.addColorStop(
        0.55,
        connected ? CONFIG.colors.matchedWater : CONFIG.colors.idleWater
      );
      portalGradient.addColorStop(1, CONFIG.colors.channelBedActive);
    }

    ctx.beginPath();
    ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = portalGradient;
    ctx.fill();

    const pulse = (this.waterFlowPhase * 0.72) % 1;

    ctx.beginPath();
    ctx.arc(0, 0, tile.source ? 2.2 + pulse * 4.2 : 6.2 - pulse * 3.5, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = connected ? 0.58 * (1 - pulse) : 0.2;
    ctx.strokeStyle = CONFIG.colors.waterHighlight;
    ctx.stroke();

    if (tile.source) {
      ctx.globalAlpha = connected ? 0.9 : 0.5;
      ctx.beginPath();
      ctx.arc(-2.1, -2.4, 1.45, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colors.waterHighlight;
      ctx.fill();
    } else {
      ctx.globalAlpha = connected ? 0.92 : 0.68;
      ctx.beginPath();
      ctx.arc(0, 0, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colors.sinkCore;
      ctx.fill();
    }

    ctx.restore();
  }

  drawWaterSurfaceSheen(ctx, channelLength, angle, active) {
    ctx.save();
    ctx.globalAlpha = active ? 0.34 : 0.21;
    ctx.lineWidth = active ? 1.35 : 1.05;
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.waterHighlight;

    const normalAngle = angle - Math.PI / 2;
    const offset = active ? 1.8 : 1.35;
    const offsetX = Math.cos(normalAngle) * offset;
    const offsetY = Math.sin(normalAngle) * offset;

    ctx.beginPath();
    ctx.moveTo(
      8 * Math.cos(angle) + offsetX,
      8 * Math.sin(angle) + offsetY
    );
    ctx.lineTo(
      channelLength * 0.88 * Math.cos(angle) + offsetX,
      channelLength * 0.88 * Math.sin(angle) + offsetY
    );
    ctx.stroke();
    ctx.restore();
  }

  getFlowStreaks(seed) {
    if (this.flowStreakCache.has(seed)) {
      return this.flowStreakCache.get(seed);
    }

    const random = this.createSeededRandom(seed);
    const streaks = Array.from({ length: 3 }, () => ({
      lateralOffset: -3.2 + random() * 6.4,
      startRatio: 0.08 + random() * 0.18,
      endRatio: 0.7 + random() * 0.25,
      lineWidth: 0.75 + random() * 0.75,
      dashLength: 2.2 + random() * 3.2,
      dashGap: 9 + random() * 9,
      phaseOffset: random() * 28,
      speed: 27 + random() * 17,
      alpha: 0.3 + random() * 0.28
    }));

    this.flowStreakCache.set(seed, streaks);
    return streaks;
  }

  drawFlowDash(ctx, channelLength, angle, direction, seed) {
    const normalAngle = angle + Math.PI / 2;
    const streaks = this.getFlowStreaks(seed);
    const streakCount = Math.min(
      streaks.length,
      this.quality.flowStreakCount
    );

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.waterHighlight;

    for (let i = 0; i < streakCount; i += 1) {
      const streak = streaks[i];
      const offsetX = Math.cos(normalAngle) * streak.lateralOffset;
      const offsetY = Math.sin(normalAngle) * streak.lateralOffset;
      const startDistance = channelLength * streak.startRatio;
      const endDistance = channelLength * streak.endRatio;

      ctx.globalAlpha = streak.alpha;
      ctx.lineWidth = streak.lineWidth;
      ctx.setLineDash([streak.dashLength, streak.dashGap]);
      ctx.lineDashOffset =
        streak.phaseOffset -
        this.waterFlowPhase * streak.speed * direction;
      ctx.beginPath();
      ctx.moveTo(
        startDistance * Math.cos(angle) + offsetX,
        startDistance * Math.sin(angle) + offsetY
      );
      ctx.lineTo(
        endDistance * Math.cos(angle) + offsetX,
        endDistance * Math.sin(angle) + offsetY
      );
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  drawWaterBubbles(ctx, channelLength, angle, direction) {
    const bubbleCount = this.quality.bubbleCount;

    if (bubbleCount <= 0) return;

    ctx.save();

    for (let i = 0; i < bubbleCount; i += 1) {
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
    if (tile.source || tile.sink || tile.flowerScale <= 0.01) return;

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
    const motion = turtle.motionBlend;
    const celebrating = turtle.isCelebrating();
    const idleWave = Math.sin(turtle.animTime * 2.1);
    const swimWave = Math.sin(turtle.animTime * 9.5);
    const celebrationWave = Math.sin(turtle.animTime * 13.5);
    const bob =
      idleWave * 0.42 * (1 - motion) +
      swimWave * 0.82 * motion +
      (celebrating ? Math.abs(celebrationWave) * 1.55 : 0);
    const sway =
      swimWave * 0.035 * motion +
      (celebrating ? celebrationWave * 0.055 : 0);
    const visualOffsetX = Math.min(16, hexRadius * CONFIG.turtle.offsetXRatio);
    const visualOffsetY = Math.min(10, hexRadius * CONFIG.turtle.offsetYRatio);
    const turtleScale = Math.min(
      CONFIG.turtle.maxScale,
      hexRadius / CONFIG.turtle.scaleReference
    );

    this.drawTurtleWakeTrail(
      ctx,
      turtle,
      visualOffsetX,
      visualOffsetY,
      turtleScale
    );
    this.drawTurtleWater(
      ctx,
      turtle,
      visualOffsetX,
      visualOffsetY,
      turtleScale
    );

    ctx.save();
    ctx.translate(turtle.x + visualOffsetX, turtle.y + visualOffsetY + bob);
    ctx.rotate(turtle.angle + Math.PI / 2 + sway);

    const celebrationScale = celebrating
      ? 1 + Math.max(0, celebrationWave) * 0.035
      : 1;

    ctx.scale(
      turtleScale * celebrationScale,
      turtleScale / celebrationScale
    );
    this.drawGeometricTurtle(ctx, turtle);
    ctx.restore();
  }

  drawTurtleWakeTrail(ctx, turtle, offsetX, offsetY, turtleScale) {
    if (turtle.wakeTrail.length === 0) return;

    ctx.save();
    ctx.strokeStyle = CONFIG.colors.turtleWake;
    ctx.lineWidth = 1.5;

    const wakeTrailStep = Math.max(1, this.quality.wakeTrailStep);

    turtle.wakeTrail.forEach((point, index) => {
      if (index % wakeTrailStep !== 0) return;

      const spread = 1 - point.life;

      ctx.save();
      ctx.translate(point.x + offsetX, point.y + offsetY + 6);
      ctx.rotate(point.angle + Math.PI / 2);
      ctx.scale(turtleScale, turtleScale);
      ctx.globalAlpha = Math.pow(point.life, 1.7) * 0.42;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        8 + spread * 9,
        2.8 + spread * 3.4,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();
  }

  drawTurtleWater(ctx, turtle, offsetX, offsetY, turtleScale) {
    const motion = turtle.motionBlend;
    const celebrating = turtle.isCelebrating();

    ctx.save();
    ctx.translate(turtle.x + offsetX, turtle.y + offsetY + 6);
    ctx.rotate(turtle.angle + Math.PI / 2);
    ctx.scale(turtleScale, turtleScale);

    ctx.globalAlpha = 0.15 + motion * 0.08;
    ctx.fillStyle = CONFIG.colors.turtleWaterShadow;
    ctx.beginPath();
    ctx.ellipse(0, 2.5, 14.5, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = CONFIG.colors.waterHighlight;

    if (motion < 0.12 && !celebrating) {
      const idleRipplePhase = (turtle.animTime * 0.34) % 1;

      ctx.globalAlpha = (1 - motion) * 0.24 * (1 - idleRipplePhase);
      ctx.beginPath();
      ctx.ellipse(
        0,
        2.5,
        13 + idleRipplePhase * 10,
        4.8 + idleRipplePhase * 4,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    if (motion > 0.03) {
      const wakePulse = 0.78 + Math.sin(turtle.animTime * 9.5) * 0.12;

      ctx.globalAlpha = 0.16 + motion * 0.32;

      [18, 25].forEach((y, index) => {
        ctx.beginPath();
        ctx.ellipse(
          0,
          y,
          (10 + index * 5) * wakePulse,
          3.3 + index,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      });
    }

    if (celebrating) {
      const celebrationPhase = (turtle.animTime * 1.7) % 1;

      ctx.globalAlpha = 0.5 * (1 - celebrationPhase);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        0,
        3,
        14 + celebrationPhase * 17,
        6 + celebrationPhase * 7,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  drawGeometricTurtle(ctx, turtle) {
    const motion = turtle.motionBlend;
    const celebrating = turtle.isCelebrating();
    const swimWave = Math.sin(turtle.animTime * 9.5);
    const idleWave = Math.sin(turtle.animTime * 2.1);
    const celebrationWave = Math.sin(turtle.animTime * 13.5);
    const idleFlipperWave = turtle.getIdleFlipperWave();
    const frontWave =
      swimWave * 0.29 * motion +
      idleWave * 0.028 * (1 - motion) +
      (celebrating ? celebrationWave * 0.22 : 0);
    const rearWave =
      -swimWave * 0.16 * motion +
      (celebrating ? -celebrationWave * 0.11 : 0);
    const leftFrontWave = frontWave + idleFlipperWave * 0.25;
    const rightFrontWave = frontWave - idleFlipperWave * 0.08;
    const breathScale = 1 + idleWave * 0.012 * (1 - motion);

    ctx.save();
    ctx.scale(breathScale, 1 / breathScale);

    this.drawTurtleTail(ctx);
    this.drawTurtleFlipper(ctx, -10.7, 10.8, -0.58 + rearWave, 0.78, true);
    this.drawTurtleFlipper(ctx, 10.7, 10.8, 0.58 - rearWave, 0.78, false);
    this.drawTurtleFlipper(ctx, -11.8, -5.2, -0.88 - leftFrontWave, 1, true);
    this.drawTurtleFlipper(ctx, 11.8, -5.2, 0.88 + rightFrontWave, 1, false);
    this.drawTurtleShell(ctx);
    this.drawTurtleHead(ctx, turtle);
    ctx.restore();
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

  drawTurtleHead(ctx, turtle) {
    const motion = turtle.motionBlend;
    const celebrating = turtle.isCelebrating();
    const swimNod = Math.sin(turtle.animTime * 9.5) * 0.55 * motion;
    const idleNod = Math.sin(turtle.animTime * 2.1) * 0.2 * (1 - motion);
    const celebrationNod = celebrating
      ? -Math.abs(Math.sin(turtle.animTime * 13.5)) * 1.1
      : 0;
    const headNod = swimNod + idleNod + celebrationNod;
    const headGradient = ctx.createLinearGradient(-5, -24, 6, -10);
    headGradient.addColorStop(0, CONFIG.colors.turtleSkinLight);
    headGradient.addColorStop(1, CONFIG.colors.turtleSkin);

    ctx.save();
    ctx.translate(0, headNod);
    ctx.fillStyle = headGradient;
    ctx.strokeStyle = CONFIG.colors.turtleOutline;
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.ellipse(0, -15.2, 7.8, 7.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
