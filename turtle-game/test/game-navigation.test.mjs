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
