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
