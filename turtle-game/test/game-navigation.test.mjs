import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { Game } = await import("../src/Game.js");

test("continue opens the saved frontier instead of a replayed level", () => {
  const generatedLevels = [];
  const game = {
    auth: {
      hasCurrentUser: () => true
    },
    progress: {
      getSavedLevel: () => 91
    },
    level: 23,
    levelCompleted: false,
    generateLevel() {
      generatedLevels.push(this.level);
    },
    closeMenu() {
      this.menuClosed = true;
    }
  };

  Game.prototype.continueGame.call(game);

  assert.equal(game.level, 91);
  assert.deepEqual(generatedLevels, [91]);
  assert.equal(game.menuClosed, true);
});

test("main menu hides the game canvas", async () => {
  const css = await readFile(
    new URL("../src/style.css", import.meta.url),
    "utf8"
  );

  assert.match(
    css,
    /body\.menu-open\s+#gameCanvas\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/s
  );
});

test("menu turtle uses independent image layers without the head sprout", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/style.css", import.meta.url), "utf8")
  ]);
  const layerSources = Array.from(
    html.matchAll(/src="\/photos\/menu\/turtle-layers\/([^"]+)"/g),
    (match) => match[1]
  );
  const expectedLayers = [
    "menu-turtle-body.webp",
    "menu-turtle-front-left.webp",
    "menu-turtle-front-right.webp",
    "menu-turtle-head.webp",
    "menu-turtle-rear-left.webp",
    "menu-turtle-rear-right.webp",
    "menu-turtle-tail.webp"
  ];
  const layerStyles = css.slice(
    css.indexOf(".turtle-core {"),
    css.indexOf("@keyframes menu-turtle-hover")
  );

  assert.deepEqual([...new Set(layerSources)].sort(), expectedLayers);
  assert.equal(layerSources.length, expectedLayers.length * 2);
  assert.equal(
    (html.match(/class="menu-turtle-layer turtle-core"[^>]*hidden/g) || []).length,
    2
  );
  assert.doesNotMatch(html, /storybook-sprout/);
  assert.doesNotMatch(layerStyles, /clip-path/);
});
test("level 1 tutorial is restored when the level is replayed", () => {
  const targetKey = "0,1";
  const game = {
    level: 1,
    grid: {
      [targetKey]: { active: true }
    },
    tutorial: {
      active: false,
      targetKey: null
    },
    progress: {
      hasCompletedLevel() {
        throw new Error("tutorial eligibility must not depend on progress");
      }
    },
    ui: {
      hideTutorial() {}
    }
  };

  Game.prototype.configureTutorial.call(game, targetKey);

  assert.equal(game.tutorial.active, true);
  assert.equal(game.tutorial.targetKey, targetKey);
});
