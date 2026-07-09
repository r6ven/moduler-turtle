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
import { UserAuthSystem } from "./UserAuthSystem.js";

export class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.auth = new UserAuthSystem();
    this.progress = new ProgressSystem(this.auth);

    this.level = this.auth.hasCurrentUser() ? this.progress.getSavedLevel() : 1;
    this.hexRadius = CONFIG.desktopHexRadius;
    this.grid = {};
    this.levelCompleted = false;
    this.menuOpen = true;

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
      onRequestReset: () => this.requestReset(),
      onConfirmReset: () => this.confirmReset(),
      onLogout: () => this.logout(),
      onOpenMenu: () => this.openMenu()
    });

    this.input.bind();
    window.addEventListener("resize", () => this.resizeCanvas());

    this.resizeCanvas();
    this.generateLevel();

    if (this.auth.hasCurrentUser()) {
      this.ui.showGameMenu(this.auth.getCurrentUsername(), this.level);
    } else {
      this.ui.showAuthMenu();
    }

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
    this.ui.showGameMenu(this.auth.getCurrentUsername(), this.level);
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
      this.ui.showGameMenu(this.auth.getCurrentUsername(), this.level);
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
    this.ui.hideMainMenu();
  }

  requestReset() {
    if (!this.auth.hasCurrentUser()) return;
    this.ui.showResetConfirm();
  }

  confirmReset() {
    this.audio.init();
    this.progress.resetAll();
    this.level = 1;
    this.generateLevel();
    this.ui.hideResetConfirm();
    this.ui.showGameMenu(this.auth.getCurrentUsername(), this.level);
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

    window.setTimeout(() => {
      this.ui.showCompletion(result);
    }, CONFIG.completionDelayMs);
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