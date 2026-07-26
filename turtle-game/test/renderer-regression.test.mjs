import assert from "node:assert/strict";
import test from "node:test";

class MockGradient {
  addColorStop() {}
}

class MockContext {
  save() {}
  restore() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  arc() {}
  ellipse() {}
  fill() {}
  stroke() {}
  clip() {}
  translate() {}
  rotate() {}
  scale() {}
  setTransform() {}
  clearRect() {}
  drawImage() {}
  setLineDash() {}
  createRadialGradient() { return new MockGradient(); }
  createLinearGradient() { return new MockGradient(); }
}

function makeCanvas() {
  return {
    width: 800,
    height: 600,
    getContext: () => new MockContext()
  };
}

globalThis.document = {
  createElement: (tag) => (tag === "canvas" ? makeCanvas() : {})
};

const { CONFIG } = await import("../src/config.js");
const { ParticleSystem } = await import("../src/ParticleSystem.js");
const { PuzzleGenerator } = await import("../src/PuzzleGenerator.js");
const { Renderer } = await import("../src/Renderer.js");
const { Turtle } = await import("../src/Turtle.js");

test("cubic channel geometry stays finite and reversible", () => {
  const renderer = new Renderer({ width: 1, height: 1 }, {});

  for (const radius of [34, 46]) {
    const length = radius * Math.cos(Math.PI / 6);

    for (const gap of [1, 2, 3]) {
      const first = { angle: 0, length };
      const second = { angle: gap * Math.PI / 3, length };
      const geometry = renderer.getCurvedChannelGeometry(first, second);
      const reverse = renderer.getCurvedChannelGeometry(second, first);

      for (let index = 0; index <= 18; index += 1) {
        const t = index / 18;
        const point = renderer.getCubicChannelSample(geometry, t);
        const mirrored = renderer.getCubicChannelSample(reverse, 1 - t);

        assert.ok(Object.values(point).every(Number.isFinite));
        assert.ok(Math.hypot(
          point.x - mirrored.x,
          point.y - mirrored.y
        ) < 1e-9);
        assert.ok(
          Math.abs(Math.hypot(point.tangentX, point.tangentY) - 1) < 1e-9
        );
      }
    }
  }
});

test("portal channels never extend behind the well center", () => {
  const renderer = new Renderer({ width: 1, height: 1 }, {});
  const ctx = new MockContext();
  const channel = { angle: 0, length: 40 };
  const extensions = [];

  renderer.appendWaterSegment = (...args) => extensions.push(args[6]);
  renderer.appendRoundedChannelJunction = () => {};

  renderer.drawCompoundChannelLayer(ctx, [channel], 19, "#000", true);
  assert.equal(extensions[0], 0);

  extensions.length = 0;
  renderer.drawCompoundChannelLayer(ctx, [channel], 19, "#000", false);
  assert.equal(extensions[0], 19 * 0.42);

  extensions.length = 0;
  renderer.drawWaterPortalThroat(
    ctx,
    { exits: [false, true], visualRotation: 0 },
    true
  );
  assert.equal(extensions.length, 4);
  assert.ok(extensions.every((value) => value === 0));
});

test("flow follows the generated source-to-sink path across shortcuts", () => {
  const renderer = new Renderer({ width: 1, height: 1 }, {});

  assert.equal(
    renderer.getFlowDirection("later", "earlier", 1, 2, 9, 8),
    -1
  );
  assert.equal(
    renderer.getFlowDirection("earlier", "later", 4, 1, 8, 9),
    1
  );
  assert.equal(
    renderer.getFlowDirection("near", "far", 2, 3),
    1
  );
});

test("all representative levels render without throwing", () => {
  const canvas = makeCanvas();
  const renderer = new Renderer(canvas, canvas.getContext("2d"));
  const particleSystem = new ParticleSystem();
  const turtle = new Turtle();
  const hexRadius = CONFIG.desktopHexRadius;

  renderer.setViewport(canvas.width, canvas.height, 1);

  for (const level of [1, 6, 12, 18, 24, 40]) {
    const generated = PuzzleGenerator.generate(level);

    turtle.reset(0, 0, hexRadius);
    renderer.invalidateGrid();

    assert.doesNotThrow(() => {
      for (let frame = 0; frame < 4; frame += 1) {
        turtle.update();
        renderer.render({
          grid: generated.grid,
          turtle,
          particleSystem,
          hexRadius,
          victoryTourActive: false
        });
      }
    });
  }
});
