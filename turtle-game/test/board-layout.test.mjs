import assert from "node:assert/strict";
import test from "node:test";

const { CONFIG } = await import("../src/config.js");
const { Game } = await import("../src/Game.js");

const portraitCases = [
  { width: 320, expectedHexRadius: 24.413669, meetsMinimum: false },
  { width: 360, expectedHexRadius: 27.712813, meetsMinimum: true },
  { width: 375, expectedHexRadius: 28.949992, meetsMinimum: true },
  { width: 390, expectedHexRadius: 30.187171, meetsMinimum: true },
  { width: 412, expectedHexRadius: 32.001701, meetsMinimum: true }
];

function calculateLayout(displaySize, hudInsets = { top: 0, bottom: 0 }) {
  return Game.prototype.calculateBoardLayout.call(
    {},
    3,
    displaySize,
    CONFIG.mobileHexRadius,
    hudInsets
  );
}

test("radius-3 progression keeps identical geometry across phone widths", () => {
  portraitCases.forEach(({ width, expectedHexRadius, meetsMinimum }) => {
    const layout = calculateLayout(width);
    const boardWidth =
      Math.sqrt(3) * layout.hexRadius * (layout.mapRadius * 2 + 1);
    const boardHeight =
      layout.hexRadius * (layout.mapRadius * 3 + 2);

    assert.equal(layout.mapRadius, 3, `${width}px changed the level radius`);
    assert.ok(
      Math.abs(layout.hexRadius - expectedHexRadius) < 1e-6,
      `${width}px produced an unexpected hex radius`
    );
    assert.equal(layout.meetsMinimumTapTarget, meetsMinimum);
    assert.ok(boardWidth <= layout.availableWidth + 1e-9);
    assert.ok(boardHeight <= layout.availableHeight + 1e-9);
  });
});

test("an undersized viewport reports the tap limitation without shrinking the level", () => {
  const layout = calculateLayout(320, {
    top: 110,
    stableTop: 0,
    tutorialTop: 110,
    bottom: 0
  });

  assert.equal(layout.mapRadius, 3);
  assert.equal(layout.meetsMinimumTapTarget, false);
  assert.equal(layout.tutorialOverlaysBoard, true);
  assert.equal(layout.topInset, 0);
});
