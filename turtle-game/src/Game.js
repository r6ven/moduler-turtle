import { CONFIG } from "./config.js";
import { tileKey } from "./HexMath.js";
import { AudioSystem } from "./AudioSystem.js";
import { InputManager } from "./InputManager.js";
import { ParticleSystem } from "./ParticleSystem.js";
import { ProgressSystem } from "./ProgressSystem.js";
import { PuzzleGenerator } from "./PuzzleGenerator.js";
import { PuzzleValidator } from "./PuzzleValidator.js";
import { Renderer } from "./Renderer.js";
import { Turtle } from "./Turtle.js";
import { UIController } from "./UIController.js";

export class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.level = 1;
    this.hexRadius = CONFIG.desktopHexRadius;
    this.grid = {};
    this.levelCompleted = false;
    this.menuOpen = true;

    this.audio = new AudioSystem();
    this.particles = new ParticleSystem();
    this.progress = new ProgressSystem();
    this.renderer = new Renderer(this.canvas, this.ctx);
    this.turtle = new Turtle();
    this.ui = new UIController();

    this.input = new InputManager(
      this.canvas,
      () => this.hexRadius,
      (hex) => this.handleTilePress(hex)
    );
  }

  start() {
    this.ui.bind({
  onNextLevel: () => this.nextLevel(),
  onHint: () => this.useHint(),
  onToggleSound: () => this.toggleSound(),
  onStartGame: () => this.startGameFromMenu(),
  onContinueGame: () => this.closeMenu(),
  onRestartGame: () => this.restartFromLevelOne(),
  onOpenMenu: () => this.openMenu()
});

    this.input.bind();

    window.addEventListener("resize", () => this.resizeCanvas());

    this.resizeCanvas();
    this.generateLevel();
    this.ui.showMainMenu();
    this.loop();
  }

  resizeCanvas() {
    const size = Math.min(window.innerWidth, window.innerHeight, CONFIG.canvasMaxSize);

    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    this.hexRadius = window.innerWidth < CONFIG.mobileBreakpoint
      ? CONFIG.mobileHexRadius
      : CONFIG.desktopHexRadius;

    this.turtle.syncToTile(this.hexRadius, true);
  }

  generateLevel() {
    this.levelCompleted = false;
    this.particles.clear();
    this.ui.hideCompletion();
    this.ui.updateLevel(this.level);

    const generated = PuzzleGenerator.generate(this.level);

    this.grid = generated.grid;
    this.progress.startLevel(this.level, generated.activeTileCount);
    this.ui.updateStats(this.progress);

    this.turtle.reset(0, 0, this.hexRadius);

    this.checkConnections({ allowCompletion: false });
  }
  startGameFromMenu() {
  this.audio.init();
  this.closeMenu();
}

openMenu() {
  this.menuOpen = true;
  this.ui.showMainMenu();
}

closeMenu() {
  this.menuOpen = false;
  this.ui.hideMainMenu();
}

restartFromLevelOne() {
  this.audio.init();
  this.progress.resetAll();
  this.level = 1;
  this.generateLevel();
  this.closeMenu();
}
  

  handleTilePress(hex) {
    if (this.menuOpen || this.levelCompleted) return;

    this.audio.init();

    const key = tileKey(hex.q, hex.r);
    const tile = this.grid[key];

    if (!tile || !tile.active) return;

    const rotated = tile.rotate();

    if (!rotated) return;

    this.audio.play("click");
    this.progress.addMove();
    this.ui.updateStats(this.progress);

    const status = this.checkConnections();

    if (tile.flowerBloomed) {
      this.turtle.moveTo(hex.q, hex.r, this.hexRadius);
    }

    if (status.completed) {
      this.completeLevel();
    }
  }

  checkConnections({ allowCompletion = true } = {}) {
    const status = PuzzleValidator.inspectGrid(this.grid);
    PuzzleValidator.applyBloomState(this.grid, status);

    if (allowCompletion && status.completed && !this.levelCompleted) {
      return status;
    }

    return status;
  }

  completeLevel() {
    this.levelCompleted = true;

    this.audio.play("success");
    this.particles.createCelebration(this.canvas.width, this.canvas.height);

    const result = this.progress.completeCurrentLevel();

    window.setTimeout(() => {
      this.ui.showCompletion(result);
    }, CONFIG.completionDelayMs);
  }

  useHint() {
    if (this.menuOpen || this.levelCompleted) return;

    this.audio.init();

    const candidates = Object.values(this.grid)
      .filter((tile) => tile.active && !tile.isSolvedOrientation());

    if (candidates.length === 0) {
      const status = this.checkConnections();

      if (status.completed) {
        this.completeLevel();
      }

      return;
    }

    let bestTile = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((tile) => {
      const oldRotation = tile.rotation;

      tile.rotation = 0;

      const status = PuzzleValidator.inspectGrid(this.grid);
      const score = status.connectedCount * 10 - status.danglingExitCount;

      tile.rotation = oldRotation;

      if (score > bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    });

    bestTile.rotation = 0;
    bestTile.hintGlow = 1;

    this.progress.addHint();
    this.ui.updateStats(this.progress);

    this.audio.play("hint");
    this.particles.createHint(bestTile, this.hexRadius);

    const status = this.checkConnections();

    if (bestTile.flowerBloomed) {
      this.turtle.moveTo(bestTile.q, bestTile.r, this.hexRadius);
    }

    if (status.completed) {
      this.completeLevel();
    }
  }

  toggleSound() {
    const enabled = this.audio.toggle();
    this.ui.updateSound(enabled);
  }

  nextLevel() {
    this.level += 1;
    this.generateLevel();
  }

  loop() {
    this.turtle.update();
    this.particles.update();

    this.renderer.render({
      grid: this.grid,
      turtle: this.turtle,
      particleSystem: this.particles,
      hexRadius: this.hexRadius
    });

    requestAnimationFrame(() => this.loop());
  }
}
