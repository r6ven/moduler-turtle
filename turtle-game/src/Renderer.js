import { CONFIG } from "./config.js";
import { DIR_NEIGHBORS, hexToPixel, tileKey } from "./HexMath.js";
import { PuzzleValidator } from "./PuzzleValidator.js";
import { RendererSceneryMethods } from "./RendererScenery.js";
import { RendererTurtleMethods } from "./RendererTurtle.js";
import { RendererWaterMethods } from "./RendererWater.js";
import { applyRendererMixins } from "./RendererMixin.js";

export class Renderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.waterFlowPhase = 0;
    this.lastFrameTime = performance.now();
    this.tileSurfaceCache = new Map();
    this.flowStreakCache = new Map();
    this.surfaceTextureCache = new Map();
    this.curvedTextureCache = new Map();
    this.waterLayerSets = null;
    this.landmarkImages = this.createLandmarkImages();
    this.quality = CONFIG.performance.profiles.high;
    this.logicalWidth = canvas.width || 1;
    this.logicalHeight = canvas.height || 1;
    this.pixelRatio = 1;
    this.boardOffsetY = 0;
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

  createLandmarkImages() {
    if (typeof Image === "undefined") return {};

    const sources = {
      lantern: "/images/hex-ancient-lantern.webp"
    };

    return Object.fromEntries(
      Object.entries(sources).map(([name, source]) => {
        const image = new Image();
        image.decoding = "async";
        image.src = source;
        return [name, image];
      })
    );
  }

  setViewport(width, height, pixelRatio = 1, boardOffsetY = 0) {
    const nextRatio = Math.max(1, Number(pixelRatio) || 1);
    const ratioChanged = Math.abs(nextRatio - this.pixelRatio) > 0.001;

    this.logicalWidth = Math.max(1, Number(width) || 1);
    this.logicalHeight = Math.max(1, Number(height) || 1);
    this.pixelRatio = nextRatio;
    this.boardOffsetY = Number(boardOffsetY) || 0;

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
    this.surfaceTextureCache.clear();
    this.curvedTextureCache.clear();
  }

  render({
    grid,
    turtle,
    particleSystem,
    hexRadius,
    victoryTourActive = false
  }) {
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
    ctx.translate(
      this.logicalWidth / 2,
      this.logicalHeight / 2 + this.boardOffsetY
    );

    const flowState = this.getFlowState(grid);
    const tiles = this.getTileLayout(grid, hexRadius);
    const stableTiles = [];
    const liftedTiles = [];

    tiles.forEach((entry) => {
      entry.tile.updateAnimation(deltaMs);
      entry.liftWave = entry.tile.getLiftWave();

      if (entry.liftWave > 0.001) {
        liftedTiles.push(entry);
        return;
      }

      stableTiles.push(entry);
    });

    liftedTiles.sort((a, b) => a.liftWave - b.liftWave);

    stableTiles.forEach((entry) => {
      this.drawHexSurfaceLayer(ctx, entry, hexRadius, flowState);
    });
    stableTiles.forEach((entry) => {
      this.drawHexWaterLayer(ctx, entry, hexRadius, grid, flowState);
    });

    liftedTiles.forEach((entry) => {
      this.drawHexSurfaceLayer(ctx, entry, hexRadius, flowState);
    });
    liftedTiles.forEach((entry) => {
      this.drawHexWaterLayer(ctx, entry, hexRadius, grid, flowState);
    });

    this.drawWaterPortals(
      ctx,
      [...stableTiles, ...liftedTiles],
      hexRadius,
      flowState
    );

    const detailEntries = [...stableTiles, ...liftedTiles];

    detailEntries
      .filter((entry) => !entry.tile.landmark)
      .forEach((entry) => {
        this.drawHexDetailLayer(ctx, entry, hexRadius, victoryTourActive);
      });

    detailEntries
      .filter((entry) => entry.tile.landmark)
      .sort((a, b) => a.y - b.y)
      .forEach((entry) => {
        this.drawHexDetailLayer(ctx, entry, hexRadius, victoryTourActive);
      });

    this.drawTurtle(ctx, turtle, hexRadius, flowState);
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
      this.surfaceTextureCache.clear();
      this.curvedTextureCache.clear();
    }

    const keys = PuzzleValidator.calculateConnectedKeys(grid);
    const depths = this.calculateFlowDepths(grid, keys);
    const traversalOrders = new Map(
      Array.from(depths.keys()).map((key, index) => [key, index])
    );
    const orders = new Map(
      Array.from(keys).map((key) => {
        const victoryIndex = Number(grid[key]?.victoryIndex);
        const order = Number.isFinite(victoryIndex) && victoryIndex >= 0
          ? victoryIndex
          : traversalOrders.get(key);

        return [key, order];
      })
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

  getHexRenderState(entry, radius) {
    const { tile, x, y } = entry;
    const liftWave = tile.getLiftWave();
    const lift = tile.active ? liftWave * 10 : 0;
    const actionScale = tile.active ? 1 + liftWave * 0.032 : 1;
    // A sub-pixel overlap prevents canvas anti-aliasing from opening bright
    // seams between mathematically adjacent hexes.
    const surfaceRadius = radius + 0.45;
    const glowRadius = radius + tile.hintGlow * 12;

    return {
      tile,
      x,
      y,
      liftWave,
      lift,
      actionScale,
      surfaceRadius,
      glowRadius
    };
  }

  drawHexSurfaceLayer(ctx, entry, radius, flowState) {
    const state = this.getHexRenderState(entry, radius);
    const currentConnected = flowState.keys.has(
      tileKey(state.tile.q, state.tile.r)
    );

    ctx.save();
    ctx.translate(state.x, state.y - state.lift);
    ctx.scale(state.actionScale, state.actionScale);

    if (state.tile.hintGlow > 0) {
      this.drawHexShape(ctx, state.glowRadius);
      ctx.fillStyle = `rgba(255, 213, 79, ${state.tile.hintGlow * 0.18})`;
      ctx.fill();
    }

    this.drawTileSurface(
      ctx,
      state.surfaceRadius,
      state.tile,
      currentConnected
    );
    ctx.restore();
  }

  drawHexWaterLayer(ctx, entry, radius, grid, flowState) {
    const state = this.getHexRenderState(entry, radius);

    if (!state.tile.active) return;

    ctx.save();
    ctx.translate(state.x, state.y - state.lift);
    ctx.scale(state.actionScale, state.actionScale);

    ctx.save();
    this.drawHexShape(ctx, state.surfaceRadius);
    ctx.clip();
    this.drawWaterChannels(
      ctx,
      state.surfaceRadius,
      state.tile,
      grid,
      flowState
    );
    ctx.restore();
    ctx.restore();
  }

  drawHexDetailLayer(ctx, entry, radius, victoryTourActive = false) {
    const state = this.getHexRenderState(entry, radius);

    if (!state.tile.active && !state.tile.landmark) return;

    ctx.save();
    ctx.translate(state.x, state.y - state.lift);
    ctx.scale(state.actionScale, state.actionScale);

    if (state.tile.landmark === "shrub") {
      this.drawShrub(ctx, state.tile, radius);
    } else if (state.tile.landmark === "lantern") {
      const layout = this.getLandmarkLayout(state.tile, radius);

      if (victoryTourActive) {
        this.drawLanternVictoryGlow(ctx, layout, radius);
      }

      this.drawLandmarkSprite(
        ctx,
        "lantern",
        layout.size,
        layout.x,
        layout.y,
        layout.anchorRatio
      );
    } else if (state.tile.active) {
      this.drawFlower(ctx, state.tile);
    }

    if (state.tile.active) {
      this.drawSettleGlow(ctx, radius, state.tile);
    }


    ctx.restore();
  }


  drawHexShape(ctx, radius) {
    ctx.beginPath();
    this.appendHexShape(ctx, radius);
  }

  appendHexShape(ctx, radius, offsetX = 0, offsetY = 0) {
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hX = offsetX + radius * Math.cos(angle);
      const hY = offsetY + radius * Math.sin(angle);

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


}

applyRendererMixins(
  Renderer,
  RendererSceneryMethods,
  RendererWaterMethods,
  RendererTurtleMethods
);
