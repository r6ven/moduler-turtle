import { RendererTurtleMethods } from "./RendererTurtle.js";

const MAX_PIXEL_RATIO = 2;

export class LoadingTurtleAnimator {
  constructor(root) {
    this.canvases = root?.querySelectorAll
      ? Array.from(root.querySelectorAll("[data-loading-turtle]"))
      : [];
    this.renderer = new RendererTurtleMethods();
    this.frameId = null;
    this.startedAt = 0;
    this.reducedMotion = Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
    this.turtle = {
      animTime: 0,
      motionBlend: this.reducedMotion ? 0 : 0.82,
      isCelebrating: () => false,
      getIdleFlipperWave: () => 0
    };
    this.drawFrame = this.drawFrame.bind(this);

    this.start();
  }

  start() {
    if (!this.canvases.length || this.frameId != null) return;
    if (typeof window.requestAnimationFrame !== "function") return;

    this.startedAt = performance.now();

    if (this.reducedMotion) {
      this.drawFrame(this.startedAt, false);
      return;
    }

    this.frameId = window.requestAnimationFrame(this.drawFrame);
  }

  stop() {
    if (this.frameId == null) return;

    window.cancelAnimationFrame?.(this.frameId);
    this.frameId = null;
  }

  drawFrame(timestamp, scheduleNext = true) {
    this.frameId = null;
    this.turtle.animTime = Math.max(0, timestamp - this.startedAt) / 1000;

    this.canvases.forEach((canvas) => this.drawCanvas(canvas));

    if (scheduleNext) {
      this.frameId = window.requestAnimationFrame(this.drawFrame);
    }
  }

  drawCanvas(canvas) {
    const ctx = canvas.getContext?.("2d");

    if (!ctx) return;

    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, canvas.clientWidth || bounds.width);
    const height = Math.max(1, canvas.clientHeight || bounds.height);
    const pixelRatio = Math.min(
      MAX_PIXEL_RATIO,
      Math.max(1, Number(window.devicePixelRatio) || 1)
    );
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2 + height * 0.035);

    const turtleScale = Math.min(width / 54, height / 58);

    ctx.scale(turtleScale, turtleScale);
    this.renderer.drawGeometricTurtle(ctx, this.turtle);
    ctx.restore();
  }
}
