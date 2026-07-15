import { hexToPixel } from "./HexMath.js";

const FRAME_MS = 1000 / 60;

export class Turtle {
  constructor() {
    this.q = 0;
    this.r = 0;

    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;

    this.angle = 0;
    this.targetAngle = 0;
    this.speed = 0.08;

    this.animFrame = 0;
    this.animTime = 0;
    this.motionBlend = 0;
    this.celebrationRemainingMs = 0;
    this.idleGestureOffset = Math.random() * 5.5;
    this.lastUpdateAt = performance.now();
  }

  reset(q, r, hexRadius) {
    this.q = q;
    this.r = r;
    this.angle = 0;
    this.targetAngle = 0;
    this.speed = 0.08;
    this.animFrame = 0;
    this.animTime = 0;
    this.motionBlend = 0;
    this.celebrationRemainingMs = 0;
    this.idleGestureOffset = Math.random() * 5.5;
    this.lastUpdateAt = performance.now();
    this.syncToTile(hexRadius, true);
  }

  syncToTile(hexRadius, instant = false) {
    const pos = hexToPixel(this.q, this.r, hexRadius);

    this.targetX = pos.x;
    this.targetY = pos.y;

    if (instant) {
      this.x = pos.x;
      this.y = pos.y;
    }
  }

  moveTo(q, r, hexRadius) {
    this.q = q;
    this.r = r;

    const targetPos = hexToPixel(q, r, hexRadius);

    this.targetX = targetPos.x;
    this.targetY = targetPos.y;

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;

    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      this.targetAngle = Math.atan2(dy, dx);
    }
  }

  distanceToTarget() {
    return Math.hypot(this.targetX - this.x, this.targetY - this.y);
  }

  isMoving() {
    return this.distanceToTarget() > 0.8 || this.motionBlend > 0.08;
  }

  celebrate(durationMs = 720) {
    this.celebrationRemainingMs = Math.max(
      this.celebrationRemainingMs,
      durationMs
    );
  }

  isCelebrating() {
    return this.celebrationRemainingMs > 0;
  }

  getIdleFlipperWave() {
    if (this.motionBlend > 0.08 || this.isCelebrating()) return 0;

    const cycleDuration = 5.6;
    const gestureDuration = 0.9;
    const cycle = (this.animTime + this.idleGestureOffset) % cycleDuration;

    if (cycle >= gestureDuration) return 0;

    const progress = cycle / gestureDuration;
    const envelope = Math.sin(progress * Math.PI);

    return Math.sin(progress * Math.PI * 4) * envelope;
  }

  update() {
    const now = performance.now();
    const deltaMs = Math.min(50, Math.max(4, now - this.lastUpdateAt));
    const frameScale = deltaMs / FRAME_MS;
    const positionBlend = 1 - Math.pow(1 - this.speed, frameScale);
    const angleBlend = 1 - Math.pow(0.88, frameScale);

    this.lastUpdateAt = now;
    this.x += (this.targetX - this.x) * positionBlend;
    this.y += (this.targetY - this.y) * positionBlend;

    if (this.distanceToTarget() < 0.15) {
      this.x = this.targetX;
      this.y = this.targetY;
    }

    let angleDiff = this.targetAngle - this.angle;

    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    this.angle += angleDiff * angleBlend;
    this.animTime += deltaMs / 1000;
    this.animFrame += 0.05 * frameScale;

    const targetMotion = this.distanceToTarget() > 0.8 ? 1 : 0;
    const motionBlendSpeed = targetMotion > this.motionBlend ? 0.18 : 0.11;

    this.motionBlend += (targetMotion - this.motionBlend) * (
      1 - Math.pow(1 - motionBlendSpeed, frameScale)
    );

    this.celebrationRemainingMs = Math.max(
      0,
      this.celebrationRemainingMs - deltaMs
    );
  }
}
