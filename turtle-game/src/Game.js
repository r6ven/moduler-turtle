import { CONFIG } from "./config.js";
import { DIR_NEIGHBORS, tileKey } from "./HexMath.js";
import { AudioSystem } from "./AudioSystem.js";
import { InputManager } from "./InputManager.js";
import { ParticleSystem } from "./ParticleSystem.js";
import { ProgressSystem } from "./ProgressSystem.js";
import { PuzzleGenerator } from "./PuzzleGenerator.js";
import { PuzzleValidator } from "./PuzzleValidator.js";
import { Renderer } from "./Renderer.js";
import { Turtle } from "./Turtle.js";
import { UIController } from "./UIController.js";
import { UserAuthSystem } from "./UserAuthSystem.js";

export class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.auth = new UserAuthSystem();
    this.progress = new ProgressSystem(this.auth);

    this.level = 1;
    this.hexRadius = CONFIG.desktopHexRadius;
    this.grid = {};
    this.levelCompleted = false;
    this.menuOpen = true;

    this.victoryTour = {
      active: false,
      path: [],
      index: 0,
      nextAt: 0
    };

    this.audio = new AudioSystem();
    this.particles = new ParticleSystem();
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
      onLogin: () => this.login(),
      onRegister: () => this.register(),
      onStartGame: () => this.closeMenu(),
      onContinueGame: () => this.closeMenu(),
      onOpenLevels: () => this.openLevels(),
      onSelectLevel: (level) => this.selectLevel(level),
      onRequestReset: () => this.requestReset(),
      onConfirmReset: () => this.confirmReset(),
      onLogout: () => this.logout(),
      onOpenMenu: () => this.openMenu()
    });

    this.input.bind();

    window.addEventListener("resize", () => this.resizeCanvas());

    this.resizeCanvas();
    this.generateLevel();
    this.ui.showAuthMenu();
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
    this.victoryTour.active = false;
    this.victoryTour.path = [];
    this.victoryTour.index = 0;

    this.particles.clear();
    this.ui.hideCompletion();
    this.ui.updateLevel(this.level);

    const generated = PuzzleGenerator.generate(this.level);

    this.grid = generated.grid;
    this.progress.startLevel(
  this.level,
  generated.activeTileCount,
  generated.minimumMoves
);
    this.ui.updateStats(this.progress);

    this.turtle.reset(0, 0, this.hexRadius);
    this.turtle.speed = 0.08;
    this.checkConnections({ allowCompletion: false });
  }

  async login() {
    const { username, password } = this.ui.getAuthCredentials();
    const result = await this.auth.login(username, password);

    if (!result.ok) {
      this.ui.setAuthMessage(result.error, "error");
      return;
    }

    this.afterAuthSuccess("Giriş başarılı.");
  }

  async register() {
    const { username, password } = this.ui.getAuthCredentials();
    const result = await this.auth.register(username, password);

    if (!result.ok) {
      this.ui.setAuthMessage(result.error, "error");
      return;
    }

    this.afterAuthSuccess("Kayıt oluşturuldu.");
  }

  afterAuthSuccess(message) {
    this.audio.init();

    this.ui.clearPassword();
    this.ui.setAuthMessage(message);

    this.progress.loadForCurrentUser();
    this.level = this.progress.getSavedLevel();

    this.generateLevel();

    this.menuOpen = true;
    this.ui.showGameMenu(
      this.auth.getCurrentUsername(),
      this.progress.getSavedLevel(),
      this.progress.getCompletedLevels().length
    );
  }

  logout() {
    this.auth.logout();
    this.progress.loadForCurrentUser();

    this.level = 1;
    this.generateLevel();

    this.menuOpen = true;
    this.ui.showAuthMenu("Çıkış yapıldı.");
  }

  openMenu() {
    this.menuOpen = true;

    if (this.auth.hasCurrentUser()) {
      this.ui.showGameMenu(
        this.auth.getCurrentUsername(),
        this.progress.getSavedLevel(),
        this.progress.getCompletedLevels().length
      );
    } else {
      this.ui.showAuthMenu();
    }
  }

  closeMenu() {
    if (!this.auth.hasCurrentUser()) {
      this.ui.showAuthMenu("Önce giriş yap ya da kayıt oluştur.");
      return;
    }

    this.audio.init();
    this.menuOpen = false;
    this.ui.hideLevelSelect();
    this.ui.hideMainMenu();
  }

  openLevels() {
    if (!this.auth.hasCurrentUser()) return;

    const completedLevels = this.progress.getCompletedLevels();
    this.ui.showLevelSelect(completedLevels);
  }

  selectLevel(level) {
    if (!this.auth.hasCurrentUser()) return;

    if (!this.progress.hasCompletedLevel(level)) {
      return;
    }

    this.audio.init();

    this.level = level;
    this.generateLevel();

    this.ui.hideLevelSelect();
    this.menuOpen = false;
    this.ui.hideMainMenu();
  }

  requestReset() {
    if (!this.auth.hasCurrentUser()) return;
    this.ui.showResetConfirm();
  }

  async confirmReset() {
    this.audio.init();

    await this.progress.resetAll();

    this.level = 1;
    this.generateLevel();

    this.ui.hideResetConfirm();

    this.menuOpen = true;
    this.ui.showGameMenu(
      this.auth.getCurrentUsername(),
      this.progress.getSavedLevel(),
      this.progress.getCompletedLevels().length
    );
  }

  handleTilePress(hex) {
    if (this.menuOpen || this.levelCompleted || !this.auth.hasCurrentUser()) return;

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

    this.startVictoryTour();

    const victoryDelay = Math.min(
      2300,
      Math.max(CONFIG.completionDelayMs, this.victoryTour.path.length * 150)
    );

    window.setTimeout(() => {
      this.ui.showCompletion(result);
    }, victoryDelay);
  }

  startVictoryTour() {
  const path = this.buildVictoryPath();

  if (path.length === 0) return;

  this.victoryTour.active = true;
  this.victoryTour.path = path;
  this.victoryTour.index = 0;
  this.victoryTour.nextAt = performance.now() + 120;

  // Zafer turunda biraz daha hızlı yüzsün.
  this.turtle.speed = 0.18;
}

  buildVictoryPath() {
  const activeKeys = Object.keys(this.grid).filter((key) => {
    const tile = this.grid[key];
    return tile.active && tile.flowerBloomed;
  });

  if (activeKeys.length === 0) return [];

  const endpointKey = activeKeys.find((key) => this.grid[key].degree() === 1);
  const startKey = endpointKey || "0,0";

  const visited = new Set();
  const route = [];

  const dfs = (key) => {
    const tile = this.grid[key];

    if (!tile || visited.has(key)) return;

    visited.add(key);
    route.push({ q: tile.q, r: tile.r });

    const exits = tile.getActualExits();

    for (let i = 0; i < 6; i += 1) {
      if (!exits[i]) continue;
      if (!PuzzleValidator.isExitMatched(tile, i, this.grid)) continue;

      const dir = DIR_NEIGHBORS[i];
      const neighborKey = tileKey(tile.q + dir.q, tile.r + dir.r);

      if (!visited.has(neighborKey)) {
        dfs(neighborKey);

        // Önemli kısım:
        // Daldan geri dönerken mevcut taşı tekrar rotaya ekliyoruz.
        // Böylece kaplumbağa bir daldan başka dala düz kesmiyor.
        route.push({ q: tile.q, r: tile.r });
      }
    }
  };

  dfs(startKey);

  return route;
}

  updateVictoryTour(timestamp) {
  if (!this.victoryTour.active) return;
  if (timestamp < this.victoryTour.nextAt) return;

  const reachedTarget = this.turtle.distanceToTarget() < 5;

  if (!reachedTarget && this.victoryTour.index > 0) {
    return;
  }

  const point = this.victoryTour.path[this.victoryTour.index];

  if (!point) {
    this.victoryTour.active = false;
    this.turtle.speed = 0.08;
    return;
  }

  this.turtle.moveTo(point.q, point.r, this.hexRadius);

  this.victoryTour.index += 1;
  this.victoryTour.nextAt = timestamp + 80;
}

  useHint() {
    if (this.menuOpen || this.levelCompleted || !this.auth.hasCurrentUser()) return;

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
      const oldVisualRotation = tile.visualRotation;
      const oldTargetVisualRotation = tile.targetVisualRotation;

      tile.rotation = 0;

      const status = PuzzleValidator.inspectGrid(this.grid);
      const score = status.connectedCount * 10 - status.danglingExitCount;

      tile.rotation = oldRotation;
      tile.visualRotation = oldVisualRotation;
      tile.targetVisualRotation = oldTargetVisualRotation;

      if (score > bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    });

    bestTile.setRotation(0, { animate: true });
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

  loop(timestamp = performance.now()) {
  this.updateVictoryTour(timestamp);

  this.turtle.update();
  this.particles.update();

  this.renderer.render({
    grid: this.grid,
    turtle: this.turtle,
    particleSystem: this.particles,
    hexRadius: this.hexRadius
  });

  requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }
}