import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../src/Game.js";
import { describeStoryResult } from "../src/UIController.js";
import { Tile } from "../src/Tile.js";
import { ProgressSystem } from "../src/ProgressSystem.js";
import { InputManager } from "../src/InputManager.js";
import { hexToPixel } from "../src/HexMath.js";

test("tutorial rejects other tiles, advances on a valid turn and leaves board geometry unchanged", () => {
  const target = new Tile(1, 0, [true, false, true, false, false, false], true);
  target.tutorialTarget = true;
  const other = new Tile(0, 0, [true, false, false, false, false, false], true);
  const steps = [];
  const game = {
    menuOpen: false, levelCompleted: false,
    tutorial: { active: true, step: 1, targetKey: "1,0" },
    grid: { "1,0": target, "0,0": other },
    hexRadius: 42, boardOffsetY: 8,
    hasPlayableSession: () => true,
    audio: { init() {}, play() {} },
    renderer: { invalidateConnections() {} },
    ui: { showTutorial: (step) => steps.push(step), hideTutorial() {}, updateStats() {} },
    getActiveProgress: () => ({ addMove: () => { game.moves += 1; } }),
    moves: 0, nudges: 0,
    reinforceTutorial: () => { game.nudges += 1; },
    checkConnections: () => ({ completed: false }),
    advanceTutorial: Game.prototype.advanceTutorial,
    completeTutorial: Game.prototype.completeTutorial,
    resizeCanvas: () => { throw new Error("Tutorial must not reposition the board"); }
  };
  Game.prototype.handleTilePress.call(game, { q: 0, r: 0 });
  assert.equal(game.nudges, 1);
  assert.equal(other.rotation, 0);
  assert.equal(game.moves, 0);
  Game.prototype.handleTilePress.call(game, { q: 1, r: 0 });
  assert.equal(game.moves, 1);
  assert.equal(game.tutorial.step, 2);
  assert.equal(target.tutorialTarget, false);
  game.advanceTutorial();
  game.advanceTutorial();
  assert.deepEqual(steps, [2, 3]);
  assert.equal(game.tutorial.active, false);
  assert.equal(game.hexRadius, 42);
  assert.equal(game.boardOffsetY, 8);
});

test("result explanation matches existing star rules for manual, hinted and zero-move runs", () => {
  for (const [moves, hintsUsed, expectedStars, expectedText] of [
    [5, 5, 2, /manuel hamleye dahil değil.*en fazla 2 yıldız/],
    [0, 10, 1, /Manuel hamle yapılmadığı için 1 yıldız/],
    [25, 0, 3, /İpucusuz.*3 yıldız/],
    [30, 0, 2, /3 yıldızın hamle sınırı aşıldı/],
    [60, 2, 1, /2 yıldızın hamle sınırı aşıldı/]
  ]) {
    const progress = { moves, hintsUsed, targetMoves: 28, minimumMoves: 25,
      calculateTwoStarTarget: ProgressSystem.prototype.calculateTwoStarTarget };
    const stars = ProgressSystem.prototype.calculateStars.call(progress);
    assert.equal(stars, expectedStars);
    assert.match(describeStoryResult({ ...progress, stars }), expectedText);
  }
});

test("a dense phone board fits between the HUD and bottom controls without changing its puzzle", () => {
  const layout = Game.prototype.calculateBoardLayout.call({}, 3, 360, 44,
    { top: 17, stableTop: 17, bottom: 17 });
  assert.equal(layout.mapRadius, 3);
  assert.ok(layout.hexRadius >= 26);
  assert.ok(layout.hexRadius * 11 <= layout.availableHeight);
});

test("HUD centering is stable and pointer mapping follows the moved canvas on portrait and landscape", () => {
  const previousDocument = globalThis.document;
  try {
    for (const [width, height, size, canvasLeft, topRect, bottomRect] of [
      [360, 640, 360, 0, { left: 12, right: 348, bottom: 234 }, { left: 12, right: 348, top: 584 }],
      [390, 844, 390, 0, { left: 12, right: 378, bottom: 234 }, { left: 12, right: 378, top: 788 }],
      [1440, 900, 900, 270, { left: 330, right: 1110, bottom: 232 }, { left: 330, right: 1110, top: 844 }],
      [844, 390, 390, 347, { left: 12, right: 228, bottom: 280 }, { left: 12, right: 228, top: 312 }]
    ]) {
      const baseTop = (height - size) / 2;
      const canvas = {
        style: { top: "0px" },
        parentElement: { getBoundingClientRect: () => ({ top: 0, bottom: height }) },
        getBoundingClientRect() {
          const top = baseTop + parseFloat(this.style.top);
          return { left: canvasLeft, right: canvasLeft + size, top, bottom: top + size, width: size, height: size };
        }
      };
      globalThis.document = {
        querySelector: (selector) => ({ getBoundingClientRect: () => ({ top: 0, bottom: height,
          ...(selector === ".top-cluster" ? topRect : bottomRect) }) })
      };
      const game = { canvas, ui: null };
      Game.prototype.positionCanvasBetweenHud.call(game);
      const firstTop = canvas.style.top;
      Game.prototype.positionCanvasBetweenHud.call(game);
      assert.equal(canvas.style.top, firstTop, `${width}x${height} recentering drifted`);
      const insets = Game.prototype.measureBoardHudInsets.call(game);
      const layout = Game.prototype.calculateBoardLayout.call(game, 3, size, 80, insets);
      const rect = canvas.getBoundingClientRect();
      const centerY = rect.top + size / 2 + layout.offsetY;
      const boardHalfHeight = layout.hexRadius * 11 / 2;
      assert.ok(centerY - boardHalfHeight >= 0);
      assert.ok(centerY + boardHalfHeight <= height);
      if (canvasLeft < topRect.right) {
        assert.ok(centerY - boardHalfHeight > topRect.bottom);
        assert.ok(centerY + boardHalfHeight < bottomRect.top);
      }
      const input = new InputManager(canvas, () => layout.hexRadius, () => {}, () => ({ y: layout.offsetY }));
      const point = hexToPixel(1, -1, layout.hexRadius);
      assert.deepEqual(input.clientToHex(rect.left + size / 2 + point.x, centerY + point.y), { q: 1, r: -1 });
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
