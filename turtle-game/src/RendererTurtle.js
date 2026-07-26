import { CONFIG } from "./config.js";
import { pixelToHex, tileKey } from "./HexMath.js";

export class RendererTurtleMethods {
  // turtle.q/r, Turtle.moveTo() içinde hareket BAŞLAMADAN hedefe atlıyor;
  // x/y ise oraya doğru animasyonla ilerliyor. Bu yüzden gerçek
  // "altındaki" hex, mevcut x/y konumundan pixelToHex ile hesaplanır —
  // yoksa yüzerken efekt kaplumbağanın fiziksel konumuna değil, henüz
  // varmadığı hedefe göre değişirdi. flowState verilmediyse (ör. ileride
  // başka bir çağrı noktası) güvenli varsayılan olarak "evet" kabul
  // edilir, mevcut davranış hiç bozulmaz.
  getTurtleFlowStatus(turtle, hexRadius, flowState) {
    if (!flowState) return true;

    const currentHex = pixelToHex(turtle.x, turtle.y, hexRadius);
    return flowState.keys.has(tileKey(currentHex.q, currentHex.r));
  }

  drawTurtle(ctx, turtle, hexRadius, flowState = null) {
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
    // Kaplumbağa şu an gerçekten akan/bağlı bir hex üzerinde mi? Ayrı bir
    // metotta tutulması, canvas'a hiç ihtiyaç duymadan doğrudan test
    // edilebilmesini sağlar.
    const onFlowingWater = this.getTurtleFlowStatus(turtle, hexRadius, flowState);

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
      turtleScale,
      onFlowingWater
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

  drawTurtleWater(ctx, turtle, offsetX, offsetY, turtleScale, onFlowingWater = true) {
    const motion = turtle.motionBlend;
    const celebrating = turtle.isCelebrating();
    // Kaplumbağa çözülmemiş/kopuk bir hücrenin üzerindeyken etraf suyu
    // (gölge, dalgacık, iz pulsu) daha soluk görünür; gerçekten akan bir
    // yola girince tam yoğunluğa döner. Kutlama efekti buna dahil değil,
    // o zaten yalnızca bulmaca çözüldüğünde (dolayısıyla akan suda) tetiklenir.
    const ambientIntensity = onFlowingWater ? 1 : 0.45;

    ctx.save();
    ctx.translate(turtle.x + offsetX, turtle.y + offsetY + 6);
    ctx.rotate(turtle.angle + Math.PI / 2);
    ctx.scale(turtleScale, turtleScale);

    ctx.globalAlpha = (0.15 + motion * 0.08) * ambientIntensity;
    ctx.fillStyle = CONFIG.colors.turtleWaterShadow;
    ctx.beginPath();
    ctx.ellipse(0, 2.5, 14.5, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = CONFIG.colors.waterHighlight;

    if (motion < 0.12 && !celebrating) {
      const idleRipplePhase = (turtle.animTime * 0.34) % 1;

      ctx.globalAlpha =
        (1 - motion) * 0.24 * (1 - idleRipplePhase) * ambientIntensity;
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

      ctx.globalAlpha = (0.16 + motion * 0.32) * ambientIntensity;

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
