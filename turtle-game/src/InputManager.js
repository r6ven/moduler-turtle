import { pixelToHex } from "./HexMath.js";

export class InputManager {
  constructor(canvas, getHexRadius, onTilePointer, getBoardOffset = null) {
    this.canvas = canvas;
    this.getHexRadius = getHexRadius;
    this.onTilePointer = onTilePointer;
    this.getBoardOffset = getBoardOffset || (() => ({ x: 0, y: 0 }));
  }

  bind() {
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      const hex = this.clientToHex(event.clientX, event.clientY);
      this.onTilePointer(hex);
    }, { passive: false });
  }

  clientToHex(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const offset = this.getBoardOffset() || {};
    const offsetX = Number(offset.x) || 0;
    const offsetY = Number(offset.y) || 0;
    const mouseX = (clientX - rect.left) - rect.width / 2 - offsetX;
    const mouseY = (clientY - rect.top) - rect.height / 2 - offsetY;

    return pixelToHex(mouseX, mouseY, this.getHexRadius());
  }
}
