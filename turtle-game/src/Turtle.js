import { hexToPixel } from "./HexMath.js";

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
    this.animFrame = 0;
  }

  reset(q, r, hexRadius) {
    this.q = q;
    this.r = r;
    this.angle = 0;
    this.targetAngle = 0;
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
    this.targetAngle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
  }

  update() {
    this.x += (this.targetX - this.x) * 0.08;
    this.y += (this.targetY - this.y) * 0.08;

    let angleDiff = this.targetAngle - this.angle;

    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    this.angle += angleDiff * 0.1;
    this.animFrame += 0.05;
  }
}
