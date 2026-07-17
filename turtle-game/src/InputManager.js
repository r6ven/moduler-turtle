import { pixelToHex } from "./HexMath.js";

export class InputManager {
  constructor(canvas, getHexRadius, onTilePointer) {
    this.canvas = canvas;
    this.getHexRadius = getHexRadius;
    this.onTilePointer = onTilePointer;
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
    const mouseX = (clientX - rect.left) - rect.width / 2;
    const mouseY = (clientY - rect.top) - rect.height / 2;

    return pixelToHex(mouseX, mouseY, this.getHexRadius());
  }
}
