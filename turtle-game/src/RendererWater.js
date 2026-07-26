import { CONFIG } from "./config.js";
import { DIR_NEIGHBORS, tileKey } from "./HexMath.js";
import { PuzzleValidator } from "./PuzzleValidator.js";

export class RendererWaterMethods {
  // Bir kanalın "active" (tam akıyor) mu yoksa "emergence" (hizalanmaya
  // yaklaşıyor, henüz akmıyor) durumunda mı olduğunu belirleyen saf
  // mantık. Canvas'a ihtiyaç duymadan doğrudan test edilebilir.
  //
  // Kritik kural: emergence yalnızca görsel açı GERÇEKTEN bu finalDir'e
  // yaklaşırken (visualConnection.dir === finalDir) hesaplanır. Aksi
  // halde karo dönerken görsel açı geçici olarak başka -ama o an güçlü
  // hizalı- bir komşuya yaklaştığında, strength=1 değeri yanlış kenarda
  // tam parlaklıkla görünürdü (ör. finalDir=2 iken visualDir=0 için
  // strength=1 üretilmesi).
  getChannelActivationState(finalDir, logicallyReady, visualConnection) {
    const approachingFinalDir =
      logicallyReady && visualConnection.dir === finalDir;
    const active = approachingFinalDir && visualConnection.matched;
    const emergence = !active && approachingFinalDir
      ? visualConnection.strength
      : 0;

    return { active, emergence };
  }

  drawWaterChannels(ctx, radius, tile, grid, flowState) {
    const faceDistance = radius * Math.cos(Math.PI / 6);
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
      const visualConnection = this.getVisualConnection(tile, i, grid);
      const logicallyReady = currentConnected && neighborConnected && matched;
      const { active, emergence } = this.getChannelActivationState(
        finalDir,
        logicallyReady,
        visualConnection
      );

      channels.push({
        angle: (i - 1) * Math.PI / 3 + tile.visualRotation * Math.PI / 3,
        active,
        emergence,
        length: faceDistance,
        // Yerel kanal dokusu: yalnızca bu fiziksel çıkışa (karo + yerel
        // index) bağlı, tile.rotation'dan etkilenmez. tile.rotation
        // tıklama anında ANINDA değişirken visualRotation animasyonla
        // yavaşça takip eder; seed buna bağlı olsaydı yüzey dokusu
        // (parıltı noktaları) animasyon başlamadan aniden sıçrardı.
        flowSeed: (
          this.getTileSeed(tile) ^ Math.imul(i + 1, 0x9e3779b1)
        ) >>> 0,
        // Paylaşılan kenar seed'i: yalnızca TAM AKTİF akış çizgisi (flow
        // dash) çiziminde kullanılır — o noktada tile.rotation zaten
        // ayarlanmış/sabit olur (bir sonraki tıklamaya kadar değişmez),
        // bu yüzden ani sıçrama riski taşımadan hex sınırında aynı fazı
        // paylaşabilir.
        edgeFlowSeed: this.getChannelFlowSeed(tile, finalDir),
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

    this.drawChannelBody(
      ctx,
      channels,
      currentConnected,
      tile.source || tile.sink
    );

    if (channels.length === 2) {
      const curveSeed = (channels[0].flowSeed ^ channels[1].flowSeed) >>> 0;

      this.drawCurvedWaterTexture(
        ctx,
        channels[0],
        channels[1],
        currentConnected,
        curveSeed
      );

      if (channels[0].active && channels[1].active) {
        const edgeCurveSeed =
          (channels[0].edgeFlowSeed ^ channels[1].edgeFlowSeed) >>> 0;

        this.drawCurvedFlowDash(
          ctx,
          channels[0],
          channels[1],
          channels[0].direction < 0 ? 1 : -1,
          edgeCurveSeed
        );
      }

      channels.forEach((channel) => this.drawChannelEmergenceGlow(ctx, channel));
      return;
    }

    channels.forEach((channel) => {
      this.drawWaterSurfaceTexture(
        ctx,
        channel.length,
        channel.angle,
        currentConnected,
        channel.flowSeed
      );

      if (channel.active) {
        this.drawFlowDash(
          ctx,
          channel.length,
          channel.angle,
          channel.direction,
          channel.edgeFlowSeed
        );
        this.drawWaterBubbles(
          ctx,
          channel.length,
          channel.angle,
          channel.direction
        );
      } else {
        this.drawChannelEmergenceGlow(ctx, channel);
      }
    });

  }

  // Paylaşılan bir hex kenarının iki tarafı için de aynı seed'i üretir:
  // hangi karodan bakıldığından bağımsız olarak (q,r) çiftini kanonik
  // sıraya koyup karıştırır. Bu, iki komşu hexin bağımsız çizdiği aynı
  // fiziksel su bağlantısının akış deseninin (kesik çizgi vb.) sınırda
  // aynı fazda buluşmasını sağlar.
  getChannelFlowSeed(tile, finalDir) {
    const offset = DIR_NEIGHBORS[finalDir];
    const neighborQ = tile.q + offset.q;
    const neighborR = tile.r + offset.r;
    const ordered =
      tile.q < neighborQ || (tile.q === neighborQ && tile.r <= neighborR);
    const [aq, ar, bq, br] = ordered
      ? [tile.q, tile.r, neighborQ, neighborR]
      : [neighborQ, neighborR, tile.q, tile.r];

    return (
      (Math.imul(aq + 4327, 0x9e3779b1) ^
        Math.imul(ar + 977, 0x85ebca6b) ^
        Math.imul(bq + 5011, 0xc2b2ae35) ^
        Math.imul(br + 613, 0x27d4eb2f)) >>>
      0
    );
  }

  // Bir kanal henüz tam aktif değilse ama mantıksal olarak doğru komşuya
  // rotasyonla yaklaşıyorsa (emergence > 0), ucunda yumuşak bir ışık
  // patlaması belirir ve hizalanma arttıkça büyür/parlaklaşır. Karo tam
  // oturduğunda normal akan-su efekti (drawFlowDash/drawWaterBubbles)
  // devralır.
  drawChannelEmergenceGlow(ctx, channel) {
    if (channel.emergence <= 0.02) return;

    const tipDistance = channel.length * 0.88;
    const x = tipDistance * Math.cos(channel.angle);
    const y = tipDistance * Math.sin(channel.angle);
    const glowRadius = 3 + channel.emergence * 5.5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);

    glow.addColorStop(0, CONFIG.colors.waterHighlight);
    glow.addColorStop(1, "rgba(255, 253, 232, 0)");

    ctx.save();
    ctx.globalAlpha = channel.emergence * 0.75;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawWaterPortals(ctx, entries, radius, flowState) {
    entries.forEach((entry) => {
      const state = this.getHexRenderState(entry, radius);
      const tile = state.tile;

      if (!tile.active || (!tile.source && !tile.sink)) return;

      ctx.save();
      ctx.translate(state.x, state.y - state.lift);
      ctx.scale(state.actionScale, state.actionScale);
      this.drawWaterPortal(
        ctx,
        tile,
        flowState.keys.has(tileKey(tile.q, tile.r))
      );
      ctx.restore();
    });
  }

  getVisualConnection(tile, exitIndex, grid) {
    const emergenceTolerance = 0.24;
    const fullAlignmentTolerance = 0.055;
    const visualStep = exitIndex + tile.visualRotation;
    const nearestStep = Math.round(visualStep);
    const alignmentError = Math.abs(visualStep - nearestStep);
    const dir = ((nearestStep % 6) + 6) % 6;

    if (alignmentError > emergenceTolerance) {
      return {
        matched: false,
        strength: 0,
        dir,
        neighborExitIndex: null
      };
    }

    const offset = DIR_NEIGHBORS[dir];
    const neighbor = grid[tileKey(tile.q + offset.q, tile.r + offset.r)];

    if (!neighbor?.active) {
      return {
        matched: false,
        strength: 0,
        dir,
        neighborExitIndex: null
      };
    }

    const oppositeDir = (dir + 3) % 6;
    let matchedNeighborExitIndex = null;
    let matchedNeighborError = Number.POSITIVE_INFINITY;

    neighbor.exits.forEach((hasExit, neighborExitIndex) => {
      if (!hasExit) return false;

      const neighborVisualStep = neighborExitIndex + neighbor.visualRotation;
      const neighborNearestStep = Math.round(neighborVisualStep);
      const neighborError = Math.abs(neighborVisualStep - neighborNearestStep);
      const neighborDir = ((neighborNearestStep % 6) + 6) % 6;

      const candidate =
        neighborError <= emergenceTolerance && neighborDir === oppositeDir;

      if (candidate && neighborError < matchedNeighborError) {
        matchedNeighborExitIndex = neighborExitIndex;
        matchedNeighborError = neighborError;
      }
    });

    if (matchedNeighborExitIndex == null) {
      return {
        matched: false,
        strength: 0,
        dir,
        neighborExitIndex: null
      };
    }

    const maxError = Math.max(alignmentError, matchedNeighborError);
    const linearStrength = Math.max(
      0,
      Math.min(
        1,
        (emergenceTolerance - maxError) /
          (emergenceTolerance - fullAlignmentTolerance)
      )
    );
    const strength =
      linearStrength * linearStrength * (3 - 2 * linearStrength);

    return {
      matched: maxError <= fullAlignmentTolerance,
      strength,
      dir,
      neighborExitIndex: matchedNeighborExitIndex
    };
  }

  getFlowDirection(
    currentKey,
    neighborKey,
    currentDepth,
    neighborDepth,
    currentOrder = null,
    neighborOrder = null
  ) {
    if (
      Number.isFinite(currentOrder) &&
      Number.isFinite(neighborOrder) &&
      currentOrder !== neighborOrder
    ) {
      return neighborOrder > currentOrder ? 1 : -1;
    }

    if (neighborDepth > currentDepth) return 1;
    if (neighborDepth < currentDepth) return -1;

    return currentKey.localeCompare(neighborKey) < 0 ? 1 : -1;
  }

  getWaterLayers(wet) {
    if (!this.waterLayerSets) {
      const buildLayers = (isWet) => [
        { width: 19, color: CONFIG.colors.channelBank },
        {
          width: 15.5,
          color: isWet
            ? CONFIG.colors.channelBedShadow
            : CONFIG.colors.channelBedIdle
        },
        {
          width: 11.5,
          color: isWet
            ? CONFIG.colors.matchedWaterDeep
            : CONFIG.colors.idleWaterDeep
        },
        {
          width: 8.5,
          color: isWet ? CONFIG.colors.matchedWater : CONFIG.colors.idleWater
        }
      ];

      // Renkler CONFIG'den geldiği ve çalışma zamanında değişmediği için
      // bu iki sabit dizi bir kez kurulup tekrar kullanılır; önceden her
      // çağrıda (her hex, her katman, her karede) 4 yeni obje + dizi
      // ayrılıyordu.
      this.waterLayerSets = {
        wet: buildLayers(true),
        dry: buildLayers(false)
      };
    }

    return wet ? this.waterLayerSets.wet : this.waterLayerSets.dry;
  }

  drawChannelBody(ctx, channels, wet, portalCentered = false) {
    if (channels.length === 0) return;

    this.getWaterLayers(wet).forEach((layer) => {
      this.drawCompoundChannelLayer(
        ctx,
        channels,
        layer.width,
        layer.color,
        portalCentered
      );
    });
  }

  drawCompoundChannelLayer(
    ctx,
    channels,
    width,
    color,
    portalCentered = false
  ) {
    const centerOverlap = portalCentered ? 0 : width * 0.42;

    ctx.save();
    ctx.beginPath();

    if (channels.length === 2) {
      this.appendCurvedChannelTurn(ctx, channels[0], channels[1], width);
    } else {
      channels.forEach((channel) => {
        this.appendWaterSegment(
          ctx,
          0,
          0,
          channel.length * Math.cos(channel.angle),
          channel.length * Math.sin(channel.angle),
          width,
          centerOverlap,
          0.8
        );
      });

      this.appendRoundedChannelJunction(ctx, channels, width);
    }

    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  appendCurvedChannelTurn(ctx, firstChannel, secondChannel, width) {
    const geometry = this.getCurvedChannelGeometry(
      firstChannel,
      secondChannel
    );
    const halfWidth = width * 0.5;
    const leftPoints = [];
    const rightPoints = [];
    const segmentCount = 18;

    for (let index = 0; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const point = this.getCubicChannelSample(geometry, t);
      const normalX = -point.tangentY;
      const normalY = point.tangentX;

      leftPoints.push({
        x: point.x + normalX * halfWidth,
        y: point.y + normalY * halfWidth
      });
      rightPoints.push({
        x: point.x - normalX * halfWidth,
        y: point.y - normalY * halfWidth
      });
    }

    ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
    leftPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    rightPoints.reverse().forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
  }

  getCurvedChannelGeometry(firstChannel, secondChannel) {
    // Extend past the clipping edge and force radial endpoint tangents.
    // Neighboring hexes therefore expose identical rectangular mouths.
    const boundaryOverlap = 1.4;
    const firstLength = firstChannel.length + boundaryOverlap;
    const secondLength = secondChannel.length + boundaryOverlap;
    const firstAxis = {
      x: Math.cos(firstChannel.angle),
      y: Math.sin(firstChannel.angle)
    };
    const secondAxis = {
      x: Math.cos(secondChannel.angle),
      y: Math.sin(secondChannel.angle)
    };
    const handleLength =
      Math.min(firstChannel.length, secondChannel.length) * 0.82;
    const start = {
      x: firstAxis.x * firstLength,
      y: firstAxis.y * firstLength
    };
    const end = {
      x: secondAxis.x * secondLength,
      y: secondAxis.y * secondLength
    };

    return {
      start,
      end,
      firstControl: {
        x: start.x - firstAxis.x * handleLength,
        y: start.y - firstAxis.y * handleLength
      },
      secondControl: {
        x: end.x - secondAxis.x * handleLength,
        y: end.y - secondAxis.y * handleLength
      }
    };
  }

  getCubicChannelSample(geometry, t) {
    const inverse = 1 - t;
    const inverseSquared = inverse * inverse;
    const tSquared = t * t;
    const { start, end, firstControl, secondControl } = geometry;
    const x =
      inverseSquared * inverse * start.x +
      3 * inverseSquared * t * firstControl.x +
      3 * inverse * tSquared * secondControl.x +
      tSquared * t * end.x;
    const y =
      inverseSquared * inverse * start.y +
      3 * inverseSquared * t * firstControl.y +
      3 * inverse * tSquared * secondControl.y +
      tSquared * t * end.y;
    const tangentX =
      3 * inverseSquared * (firstControl.x - start.x) +
      6 * inverse * t * (secondControl.x - firstControl.x) +
      3 * tSquared * (end.x - secondControl.x);
    const tangentY =
      3 * inverseSquared * (firstControl.y - start.y) +
      6 * inverse * t * (secondControl.y - firstControl.y) +
      3 * tSquared * (end.y - secondControl.y);
    const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY));

    return {
      x,
      y,
      tangentX: tangentX / tangentLength,
      tangentY: tangentY / tangentLength
    };
  }

  getCurvedChannelPoint(firstChannel, secondChannel, t, lateralOffset = 0) {
    const geometry = this.getCurvedChannelGeometry(
      firstChannel,
      secondChannel
    );
    const point = this.getCubicChannelSample(geometry, t);

    return {
      x: point.x - point.tangentY * lateralOffset,
      y: point.y + point.tangentX * lateralOffset,
      angle: Math.atan2(point.tangentY, point.tangentX)
    };
  }
  traceCurvedChannel(
    ctx,
    firstChannel,
    secondChannel,
    lateralOffset = 0,
    startRatio = 0,
    endRatio = 1
  ) {
    const segmentCount = 18;

    for (let index = 0; index <= segmentCount; index += 1) {
      const ratio = startRatio + (endRatio - startRatio) * (index / segmentCount);
      const point = this.getCurvedChannelPoint(
        firstChannel,
        secondChannel,
        ratio,
        lateralOffset
      );

      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
  }

  // Aynı seed için her zaman aynı 7 işaret üretilir (ratio/lateral/uzunluk/
  // jitter/renk); bu değerler karo dönmediği sürece frame'den frame'e
  // değişmez, bu yüzden bir kere hesaplanıp önbelleğe alınır. Eskiden
  // her çare her karede (60fps) baştan üretiliyordu.
  getCurvedTextureMarks(seed) {
    if (this.curvedTextureCache.has(seed)) {
      return this.curvedTextureCache.get(seed);
    }

    const random = this.createSeededRandom(seed ^ 0x2d187a6f);
    const marks = Array.from({ length: 7 }, () => ({
      ratio: 0.16 + random() * 0.68,
      lateral: (random() - 0.5) * 5,
      markLength: 1.6 + random() * 3.2,
      alphaJitter: random() * 0.14,
      lineWidthJitter: random() * 0.54
    })).map((mark, index) => ({ ...mark, shaded: index % 3 === 0 }));

    this.curvedTextureCache.set(seed, marks);
    return marks;
  }

  drawCurvedWaterTexture(ctx, firstChannel, secondChannel, wet, seed) {
    const marks = this.getCurvedTextureMarks(seed);
    const count = wet ? 7 : 5;

    ctx.save();
    ctx.lineCap = "round";

    for (let index = 0; index < count; index += 1) {
      const mark = marks[index];
      const point = this.getCurvedChannelPoint(
        firstChannel,
        secondChannel,
        mark.ratio,
        mark.lateral
      );

      ctx.beginPath();
      ctx.moveTo(
        point.x - Math.cos(point.angle) * mark.markLength * 0.5,
        point.y - Math.sin(point.angle) * mark.markLength * 0.5
      );
      ctx.lineTo(
        point.x + Math.cos(point.angle) * mark.markLength * 0.5,
        point.y + Math.sin(point.angle) * mark.markLength * 0.5
      );
      ctx.globalAlpha = (wet ? 0.3 : 0.17) + mark.alphaJitter;
      ctx.lineWidth = 0.58 + mark.lineWidthJitter;
      ctx.strokeStyle = mark.shaded
        ? CONFIG.colors.waterShade
        : CONFIG.colors.waterRefraction;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCurvedFlowDash(ctx, firstChannel, secondChannel, direction, seed) {
    const streaks = this.getFlowStreaks(seed);
    const streakCount = Math.min(streaks.length, this.quality.flowStreakCount);

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = CONFIG.colors.waterHighlight;

    for (let index = 0; index < streakCount; index += 1) {
      const streak = streaks[index];

      ctx.beginPath();
      this.traceCurvedChannel(
        ctx,
        firstChannel,
        secondChannel,
        streak.lateralOffset,
        streak.startRatio,
        streak.endRatio
      );
      ctx.globalAlpha = streak.alpha;
      ctx.lineWidth = streak.lineWidth;
      ctx.setLineDash([streak.dashLength, streak.dashGap]);
      ctx.lineDashOffset =
        streak.phaseOffset - this.waterFlowPhase * streak.speed * direction;
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  appendRoundedChannelJunction(ctx, channels, width) {
    if (channels.length === 0) return;

    let rotation = channels[0].angle;

    if (channels.length === 2) {
      const vectorX = Math.cos(channels[0].angle) + Math.cos(channels[1].angle);
      const vectorY = Math.sin(channels[0].angle) + Math.sin(channels[1].angle);

      if (Math.hypot(vectorX, vectorY) > 0.001) {
        rotation = Math.atan2(vectorY, vectorX);
      }
    }

    const majorRadius = width * (channels.length === 2 ? 0.56 : 0.53);
    const minorRadius = width * 0.5;

    ctx.moveTo(
      Math.cos(rotation) * majorRadius,
      Math.sin(rotation) * majorRadius
    );
    ctx.ellipse(
      0,
      0,
      majorRadius,
      minorRadius,
      rotation,
      0,
      Math.PI * 2
    );
    ctx.closePath();
  }

  appendWaterSegment(
    ctx,
    startX,
    startY,
    endX,
    endY,
    width,
    startExtension = 0,
    endExtension = 0
  ) {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const length = Math.hypot(deltaX, deltaY);

    if (length < 0.001) return;

    const axisX = deltaX / length;
    const axisY = deltaY / length;
    const normalX = -axisY;
    const normalY = axisX;
    const halfWidth = width * 0.5;
    const extendedStartX = startX - axisX * startExtension;
    const extendedStartY = startY - axisY * startExtension;
    const extendedEndX = endX + axisX * endExtension;
    const extendedEndY = endY + axisY * endExtension;

    ctx.moveTo(
      extendedStartX + normalX * halfWidth,
      extendedStartY + normalY * halfWidth
    );
    ctx.lineTo(
      extendedEndX + normalX * halfWidth,
      extendedEndY + normalY * halfWidth
    );
    ctx.lineTo(
      extendedEndX - normalX * halfWidth,
      extendedEndY - normalY * halfWidth
    );
    ctx.lineTo(
      extendedStartX - normalX * halfWidth,
      extendedStartY - normalY * halfWidth
    );
    ctx.closePath();
  }

  // getCurvedTextureMarks ile aynı mantık: sadece "drift" animasyonlu
  // terimi frame'e bağlı, geri kalan her şey seed'e bağlı olduğundan bir
  // kere üretilip saklanır.
  getSurfaceTextureMarks(seed) {
    if (this.surfaceTextureCache.has(seed)) {
      return this.surfaceTextureCache.get(seed);
    }

    const random = this.createSeededRandom(seed ^ 0x6c8e9cf5);
    const marks = Array.from({ length: 7 }, () => ({
      ratio: 0.2 + random() * 0.62,
      lateral: (random() - 0.5) * 5.2,
      markLength: 1.8 + random() * 3.5,
      alphaJitter: random() * 0.14,
      lineWidthJitter: random() * 0.54
    })).map((mark, index) => ({ ...mark, shaded: index % 3 === 0 }));

    this.surfaceTextureCache.set(seed, marks);
    return marks;
  }

  drawWaterSurfaceTexture(
    ctx,
    channelLength,
    angle,
    wet,
    seed,
    originOffset = 0
  ) {
    const marks = this.getSurfaceTextureMarks(seed);
    const normalAngle = angle + Math.PI / 2;
    const count = wet ? 7 : 5;

    ctx.save();
    ctx.lineCap = "round";

    for (let index = 0; index < count; index += 1) {
      const mark = marks[index];
      const drift = wet
        ? Math.sin(this.waterFlowPhase * 0.64 + index * 1.9) * 0.018
        : 0;
      const distance = originOffset + channelLength * (mark.ratio + drift);
      const x =
        distance * Math.cos(angle) + mark.lateral * Math.cos(normalAngle);
      const y =
        distance * Math.sin(angle) + mark.lateral * Math.sin(normalAngle);

      ctx.globalAlpha = (wet ? 0.3 : 0.17) + mark.alphaJitter;
      ctx.strokeStyle = mark.shaded
        ? CONFIG.colors.waterShade
        : CONFIG.colors.waterRefraction;
      ctx.lineWidth = 0.62 + mark.lineWidthJitter;
      ctx.beginPath();
      ctx.moveTo(
        x - Math.cos(angle) * mark.markLength * 0.5,
        y - Math.sin(angle) * mark.markLength * 0.5
      );
      ctx.quadraticCurveTo(
        x + Math.cos(normalAngle) * 0.7,
        y + Math.sin(normalAngle) * 0.7,
        x + Math.cos(angle) * mark.markLength * 0.5,
        y + Math.sin(angle) * mark.markLength * 0.5
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  drawWaterPortal(ctx, tile, connected) {
    if (!tile.source && !tile.sink) return;

    ctx.save();
    this.drawWaterPortalThroat(ctx, tile, connected);
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.colors.channelBank;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
    ctx.fillStyle = connected
      ? CONFIG.colors.channelBedShadow
      : CONFIG.colors.channelBedIdle;
    ctx.fill();

    const portalGradient = ctx.createRadialGradient(-2, -2.4, 0.6, 0, 0, 6.3);

    if (tile.source) {
      portalGradient.addColorStop(0, CONFIG.colors.sourceCore);
      portalGradient.addColorStop(0.38, CONFIG.colors.matchedWaterLight);
      portalGradient.addColorStop(1, connected
        ? CONFIG.colors.matchedWaterDeep
        : CONFIG.colors.idleWaterDeep);
    } else {
      portalGradient.addColorStop(0, CONFIG.colors.sinkCore);
      portalGradient.addColorStop(0.58, connected
        ? CONFIG.colors.matchedWaterDeep
        : CONFIG.colors.idleWaterDeep);
      portalGradient.addColorStop(1, CONFIG.colors.channelBedShadow);
    }

    ctx.beginPath();
    ctx.arc(0, 0, 6.3, 0, Math.PI * 2);
    ctx.fillStyle = portalGradient;
    ctx.fill();

    const pulse = (this.waterFlowPhase * 0.72) % 1;

    ctx.beginPath();
    ctx.arc(0, 0, tile.source ? 1.8 + pulse * 3.8 : 5.4 - pulse * 3, 0, Math.PI * 2);
    ctx.lineWidth = 1.45;
    ctx.globalAlpha = connected ? 0.68 * (1 - pulse) : 0.24;
    ctx.strokeStyle = CONFIG.colors.waterHighlight;
    ctx.stroke();

    if (tile.source) {
      ctx.globalAlpha = connected ? 0.9 : 0.5;
      ctx.beginPath();
      ctx.arc(-1.8, -2.1, 1.15, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colors.waterHighlight;
      ctx.fill();
    } else {
      ctx.globalAlpha = connected ? 0.92 : 0.68;
      ctx.beginPath();
      ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colors.sinkCore;
      ctx.fill();
    }

    ctx.restore();
  }

  drawWaterPortalThroat(ctx, tile, connected) {
    const exitIndex = tile.exits.findIndex(Boolean);

    if (exitIndex < 0) return;

    const angle =
      (exitIndex - 1) * Math.PI / 3 + tile.visualRotation * Math.PI / 3;
    const throatLength = 15;

    this.getWaterLayers(connected).forEach((layer) => {
      ctx.beginPath();
      this.appendWaterSegment(
        ctx,
        0,
        0,
        Math.cos(angle) * throatLength,
        Math.sin(angle) * throatLength,
        layer.width,
        0,
        1.2
      );
      ctx.fillStyle = layer.color;
      ctx.fill();
    });
  }

  getFlowStreaks(seed) {
    if (this.flowStreakCache.has(seed)) {
      return this.flowStreakCache.get(seed);
    }

    const random = this.createSeededRandom(seed);
    const streaks = Array.from({ length: 6 }, () => ({
      lateralOffset: -2.9 + random() * 5.8,
      startRatio: 0.13 + random() * 0.12,
      endRatio: 0.72 + random() * 0.14,
      lineWidth: 0.65 + random() * 0.72,
      dashLength: 1.8 + random() * 3.1,
      dashGap: 5.4 + random() * 6.2,
      phaseOffset: random() * 28,
      speed: 22 + random() * 14,
      alpha: 0.4 + random() * 0.3
    }));

    this.flowStreakCache.set(seed, streaks);
    return streaks;
  }

  drawFlowDash(
    ctx,
    channelLength,
    angle,
    direction,
    seed,
    originOffset = 0
  ) {
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
      const startDistance = originOffset + channelLength * streak.startRatio;
      const endDistance = originOffset + channelLength * streak.endRatio;

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
    const bubbleCount = Math.min(1, this.quality.bubbleCount);

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

      ctx.globalAlpha = 0.32 * (1 - travelPhase * 0.25);
      ctx.fillStyle = CONFIG.colors.waterHighlight;
      ctx.beginPath();
      ctx.arc(x, y, 1.15 + i * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
