import { CONFIG } from "./config.js";

export class RendererSceneryMethods {
  drawLanternVictoryGlow(ctx, layout, radius) {
    const wave = 0.5 + Math.sin(this.waterFlowPhase * 5.4) * 0.5;
    const flicker = 0.82 + Math.sin(this.waterFlowPhase * 13.7) * 0.18;
    const intensity = (0.18 + wave * 0.48) * flicker;
    const glowX = layout.x;
    const glowY = layout.y - layout.size * 0.46;
    const glowRadius = radius * (0.22 + wave * 0.12);
    const glow = ctx.createRadialGradient(
      glowX,
      glowY,
      0,
      glowX,
      glowY,
      glowRadius
    );

    glow.addColorStop(0, `rgba(255, 226, 120, ${intensity})`);
    glow.addColorStop(0.42, `rgba(255, 169, 62, ${intensity * 0.48})`);
    glow.addColorStop(1, "rgba(255, 142, 39, 0)");

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(glowX, glowY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  getLandmarkLayout(tile, radius) {
    const seed = this.getTileSeed(tile) ^ 0x92d68ca2;
    const random = this.createSeededRandom(seed);
    const slots = [
      [-0.43, 0.2],
      [0.43, 0.2],
      [-0.38, -0.08],
      [0.38, -0.08],
      [-0.22, 0.34],
      [0.22, 0.34]
    ];
    const slot = slots[Math.floor(random() * slots.length)];
    const jitterX = (random() - 0.5) * radius * 0.07;
    const jitterY = (random() - 0.5) * radius * 0.05;

    return {
      x: radius * slot[0] + jitterX,
      y: radius * slot[1] + jitterY,
      size: radius * 0.82,
      anchorRatio: 0.96,
      imageName: "lantern"
    };
  }

  getShrubLayout(tile, radius) {
    const random = this.createSeededRandom(
      this.getTileSeed(tile) ^ 0x4f1bbcdc
    );
    const slots = [
      [-0.34, -0.2],
      [0.34, -0.2],
      [-0.38, 0.16],
      [0.38, 0.16],
      [-0.12, 0.32],
      [0.14, 0.3]
    ];
    const slot = slots[Math.floor(random() * slots.length)];

    return {
      x: radius * slot[0] + (random() - 0.5) * radius * 0.06,
      y: radius * slot[1] + (random() - 0.5) * radius * 0.06,
      scale: 0.82 + random() * 0.16,
      rotation: random() * Math.PI * 2
    };
  }

  drawShrub(ctx, tile, radius) {
    const layout = this.getShrubLayout(tile, radius);
    const random = this.createSeededRandom(
      this.getTileSeed(tile) ^ 0x71e4a95b
    );
    const variant = Number.isInteger(tile.landmarkVariant)
      ? ((tile.landmarkVariant % 4) + 4) % 4
      : this.getTileSeed(tile) % 4;
    const branchCount = variant === 2 ? 9 : 7;
    const leafCount = variant === 0
      ? 20
      : variant === 1
        ? 10
        : variant === 2
          ? 2
          : 17;
    const flowering = variant === 3;
    const size = radius * 0.36 * layout.scale;
    const branchTips = [];

    ctx.save();
    ctx.translate(layout.x, layout.y);
    ctx.rotate(layout.rotation);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let index = 0; index < branchCount; index += 1) {
      const angle = (index / branchCount) * Math.PI * 2 + (random() - 0.5) * 0.36;
      const length = size * (0.62 + random() * 0.38);
      const bend = (random() - 0.5) * size * 0.28;
      const tip = {
        x: Math.cos(angle) * length,
        y: Math.sin(angle) * length
      };

      branchTips.push(tip);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        Math.cos(angle) * length * 0.48 - Math.sin(angle) * bend,
        Math.sin(angle) * length * 0.48 + Math.cos(angle) * bend,
        tip.x,
        tip.y
      );
      ctx.lineWidth = variant === 2 ? 1.35 : 1.05;
      ctx.strokeStyle = index % 2 === 0 ? "#65523b" : "#7b6243";
      ctx.stroke();

      if (variant === 2 && index % 2 === 0) {
        const twigAngle = angle + (index % 4 < 2 ? 0.48 : -0.48);
        ctx.beginPath();
        ctx.moveTo(tip.x * 0.68, tip.y * 0.68);
        ctx.lineTo(
          tip.x * 0.68 + Math.cos(twigAngle) * size * 0.28,
          tip.y * 0.68 + Math.sin(twigAngle) * size * 0.28
        );
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    const leafColors = variant === 1
      ? ["#71843a", "#899b49", "#596f32"]
      : ["#66843b", "#7f9b43", "#9aaa4f", "#4d6f36"];

    for (let index = 0; index < leafCount; index += 1) {
      const tip = branchTips[index % branchTips.length];
      const spread = size * (variant === 1 ? 0.34 : 0.42);
      const x = tip.x * (0.48 + random() * 0.5) + (random() - 0.5) * spread;
      const y = tip.y * (0.48 + random() * 0.5) + (random() - 0.5) * spread;
      const leafAngle = Math.atan2(y, x) + (random() - 0.5) * 0.7;
      const leafLength = size * (0.2 + random() * 0.1);
      const leafWidth = leafLength * (0.42 + random() * 0.18);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(leafAngle);
      ctx.beginPath();
      ctx.ellipse(0, 0, leafLength, leafWidth, 0, 0, Math.PI * 2);
      ctx.fillStyle = leafColors[index % leafColors.length];
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-leafLength * 0.55, 0);
      ctx.lineTo(leafLength * 0.58, 0);
      ctx.lineWidth = 0.38;
      ctx.globalAlpha = 0.46;
      ctx.strokeStyle = "#d1d276";
      ctx.stroke();
      ctx.restore();
    }

    if (flowering) {
      const flowerColors = ["#f4eee1", "#d98992", "#e0ad45"];

      for (let index = 0; index < 6; index += 1) {
        const tip = branchTips[(index * 2) % branchTips.length];
        const x = tip.x * (0.72 + random() * 0.2);
        const y = tip.y * (0.72 + random() * 0.2);

        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = flowerColors[index % flowerColors.length];
        for (let petal = 0; petal < 4; petal += 1) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, -1.8, 1, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 0.75, 0, Math.PI * 2);
        ctx.fillStyle = "#8c6235";
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(0, 0, variant === 2 ? 1.9 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "#66503a";
    ctx.fill();
    ctx.restore();
  }

  drawLandmarkSprite(
    ctx,
    name,
    size,
    offsetX = 0,
    offsetY = 0,
    anchorRatio = 0.5
  ) {
    const image = this.landmarkImages[name];

    if (!image?.complete || image.naturalWidth <= 0) return;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = "saturate(1.08) contrast(1.045)";
    ctx.drawImage(image, -size / 2, -size * anchorRatio, size, size);
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
      tile.landmark || "none",
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
    ctx.lineWidth = tile.active ? 1.55 : 1.25;
    ctx.strokeStyle = !tile.active
      ? CONFIG.colors.inactiveStroke
      : tile.flowerBloomed
        ? CONFIG.colors.solvedStroke
        : CONFIG.colors.idleStroke;
    ctx.stroke();
  }

  getTileSeed(tile) {
    return tile.decorSeed ?? Math.abs(tile.q * 37 + tile.r * 61 + 17);
  }

  drawTileTexture(ctx, radius, tile) {
    const seed = this.getTileSeed(tile);
    const random = this.createSeededRandom(seed ^ 0xa53a9e37);

    ctx.save();

    for (let i = 0; i < 4; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * (0.08 + random() * 0.42);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const patchRadius = radius * (0.1 + random() * 0.09);
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

    for (let i = 0; i < 30; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * Math.sqrt(random()) * 0.72;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const dotRadius = 0.2 + random() * 0.52;

      ctx.globalAlpha = 0.26 + random() * 0.48;
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
    const groundLandmark = tile.landmark === "shrub" || tile.landmark === "lantern";
    const landmarkLayout = groundLandmark
      ? tile.landmark === "shrub"
        ? this.getShrubLayout(tile, radius)
        : this.getLandmarkLayout(tile, radius)
      : null;

    if (groundLandmark) {
      this.drawLandmarkGroundDecorations(
        ctx,
        radius,
        tile,
        random,
        landmarkLayout
      );
      return;
    }

    for (let i = 0; i < 8; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * Math.sqrt(random()) * 0.64;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const width = 1.4 + random() * 2.8;
      const height = 0.55 + random() * 1.15;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(random() * Math.PI);
      ctx.globalAlpha = 0.16 + random() * 0.16;
      ctx.fillStyle = i % 2 === 0
        ? CONFIG.colors.tileTextureLight
        : CONFIG.colors.tileTextureShade;
      ctx.beginPath();
      ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

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

  drawLandmarkGroundDecorations(ctx, radius, tile, random, layout) {
    const isShrub = tile.landmark === "shrub";
    const centerDirection = layout.x > 0 ? -1 : 1;
    const clampX = (value) => Math.max(-radius * 0.56, Math.min(radius * 0.56, value));
    const clampY = (value) => Math.max(-radius * 0.38, Math.min(radius * 0.48, value));
    const companionCount = isShrub
      ? 2 + (random() < 0.55 ? 1 : 0)
      : 1 + (random() < 0.62 ? 1 : 0);
    const companionPoints = [];

    this.drawSandPatch(
      ctx,
      random,
      clampX(layout.x + (random() - 0.5) * radius * 0.1),
      clampY(layout.y + radius * 0.02),
      radius
    );

    for (let i = 0; i < companionCount; i += 1) {
      const side = i % 2 === 0 ? centerDirection : -centerDirection;
      const distance = radius * (0.14 + random() * 0.1);
      const point = {
        x: clampX(layout.x + side * distance),
        y: clampY(layout.y + radius * (0.01 + random() * 0.12))
      };

      companionPoints.push(point);
      this.drawGrassTuft(
        ctx,
        point.x,
        point.y,
        0.58 + random() * 0.2,
        random() * 0.7 - 0.35,
        Math.floor(random() * 3)
      );
    }

    const flowerCount = isShrub
      ? 1 + (random() < 0.32 ? 1 : 0)
      : random() < 0.58 ? 1 : 0;

    for (let i = 0; i < flowerCount; i += 1) {
      const point = companionPoints[i % companionPoints.length];

      this.drawFlowerPatch(
        ctx,
        random,
        point.x + (random() - 0.5) * radius * 0.05,
        point.y + radius * 0.025,
        0.58 + random() * 0.16
      );
    }

    if (random() < (isShrub ? 0.48 : 0.68)) {
      const stoneSide = centerDirection * (isShrub ? -1 : 1);

      this.drawStoneCluster(
        ctx,
        random,
        clampX(layout.x + stoneSide * radius * (0.2 + random() * 0.07)),
        clampY(layout.y + radius * (0.08 + random() * 0.08)),
        0.54 + random() * 0.16
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
}
