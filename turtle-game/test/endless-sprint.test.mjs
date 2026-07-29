import assert from "node:assert/strict";
import test from "node:test";

import { Game } from "../src/Game.js";
import {
  ENDLESS_SPRINT_LENGTH,
  EndlessSprintSession
} from "../src/EndlessSprintSession.js";
import { ModeRecordStore } from "../src/ModeRecordStore.js";
import { PuzzleGenerator } from "../src/PuzzleGenerator.js";
import { PuzzleValidator } from "../src/PuzzleValidator.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test("a Sprint creates five deterministic puzzles from one run seed", () => {
  let now = 1000;
  const session = new EndlessSprintSession({
    now: () => now,
    createSeed: () => 987654
  });

  session.start({
    boardId: "classic",
    difficultyId: "balanced"
  });

  const firstRequest = session.getCurrentPuzzleRequest();
  const replay = new EndlessSprintSession({
    now: () => now,
    createSeed: () => 987654
  });

  replay.start({
    boardId: "classic",
    difficultyId: "balanced"
  });
  assert.deepEqual(replay.getCurrentPuzzleRequest(), firstRequest);

  for (let index = 0; index < ENDLESS_SPRINT_LENGTH; index += 1) {
    const request = session.getCurrentPuzzleRequest();
    const generated = PuzzleGenerator.generate(request);

    Object.values(generated.grid).forEach((tile) => {
      if (tile.active) tile.setRotation(0, { animate: false });
    });

    const status = PuzzleValidator.inspectGrid(generated.grid);

    assert.equal(generated.mode, "endless");
    assert.equal(generated.activeTileCount, 22);
    assert.equal(status.completed, true);

    session.beginPuzzle({
      minimumMoves: generated.minimumMoves,
      activeTileCount: generated.activeTileCount
    });
    session.startTimer();
    session.addMove();
    now += 1500;

    const result = session.completeCurrentPuzzle();

    assert.equal(result.sprintIndex, index + 1);
    assert.equal(
      result.sprintComplete,
      index === ENDLESS_SPRINT_LENGTH - 1
    );

    if (index < ENDLESS_SPRINT_LENGTH - 1) {
      assert.equal(session.advancePuzzle(), true);
    }
  }

  assert.equal(session.isComplete(), true);
  assert.equal(session.getStatus().completedPuzzles, ENDLESS_SPRINT_LENGTH);
  assert.equal(session.getStatus().totalMoves, ENDLESS_SPRINT_LENGTH);
  assert.throws(
    () => session.getCurrentPuzzleRequest(),
    /Aktif bir Sprint bulmacası yok/
  );
});

test("generating an endless puzzle never starts or saves story progress", () => {
  const session = new EndlessSprintSession({ createSeed: () => 91 });
  let configuredTutorial = "unset";

  session.start({ boardId: "compact", difficultyId: "calm" });

  const game = {
    gameMode: "story",
    endlessSprint: session,
    levelCompleted: false,
    lastTimerSecond: -1,
    victoryTour: {
      active: false,
      path: [],
      index: 0,
      nextAt: 0,
      result: null,
      revealAt: 0
    },
    particles: { clear() {} },
    ui: {
      hideCompletion() {},
      updateSprintHeader() {},
      updateStats() {},
      updateTimer() {}
    },
    mapRadius: 3,
    grid: {},
    renderer: { invalidateGrid() {} },
    turtle: {
      reset() {},
      speed: 0
    },
    progress: {
      startLevel() {
        throw new Error("story progress must stay untouched");
      }
    },
    resetPerformanceSamples() {},
    resizeCanvas() {},
    configureTutorial(value) {
      configuredTutorial = value;
    },
    checkConnections() {}
  };

  Game.prototype.generateEndlessPuzzle.call(game);

  assert.equal(game.gameMode, "endless");
  assert.equal(configuredTutorial, null);
  assert.equal(session.activeTileCount, 14);
  assert.equal(Object.values(game.grid).filter((tile) => tile.active).length, 14);
});

test("Sprint timing excludes menu pauses", () => {
  let now = 0;
  const session = new EndlessSprintSession({
    now: () => now,
    createSeed: () => 42
  });

  session.start({ boardId: "compact", difficultyId: "calm" });
  session.beginPuzzle({ minimumMoves: 4, activeTileCount: 14 });
  session.startTimer();
  now = 2400;
  session.pauseTimer();
  now = 12400;

  assert.equal(session.getElapsedSeconds(), 2);
  assert.equal(session.getPuzzleElapsedSeconds(), 2);

  session.startTimer();
  now = 14000;

  assert.equal(session.getElapsedSeconds(), 4);
});

test("endless records retain only the best player result per category", () => {
  const store = new ModeRecordStore(new MemoryStorage());
  const base = {
    sprintComplete: true,
    boardId: "classic",
    boardLabel: "Orta",
    difficultyId: "balanced",
    difficultyLabel: "Dengeli",
    totalHints: 0
  };

  assert.equal(store.saveEndlessSprint("Ada", {
    ...base,
    totalMoves: 70,
    totalTimeSeconds: 300
  }), true);
  assert.equal(store.saveEndlessSprint("Ada", {
    ...base,
    totalMoves: 75,
    totalTimeSeconds: 200
  }), false);
  assert.equal(store.saveEndlessSprint("Mira", {
    ...base,
    totalMoves: 68,
    totalTimeSeconds: 340
  }), true);

  const winners = store.getEndlessWinners();

  assert.equal(winners.length, 1);
  assert.equal(winners[0].username, "Mira");
  assert.equal(winners[0].totalMoves, 68);
});
