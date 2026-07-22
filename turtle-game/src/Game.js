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

    this.level = 1;
    this.hexRadius = CONFIG.desktopHexRadius;
    this.displaySize = 1;
    this.pixelRatio = 1;
    this.grid = {};
    this.levelCompleted = false;
    this.menuOpen = true;
    this.debugPerformanceMode = import.meta.env.DEV &&
      new URLSearchParams(window.location.search).has("debugPerf");
    this.pageHidden = document.hidden;
    this.lastLoopTimestamp = performance.now();
    this.lastRenderAt = 0;
    this.lastTimerSecond = -1;
    this.performanceState = {
      qualityName: "high",
      frameTimes: [],
      averageFps: 60,
      averageFrameMs: 1000 / 60,
      lastSampleAt: 0,
      lastEvaluationAt: 0,
      downgradeWindows: 0,
      upgradeWindows: 0,
      manualOverride: false
    };

    this.victoryTour = {
      active: false,
      path: [],
      index: 0,
      nextAt: 0,
      result: null,
      revealAt: 0
    };

    this.audio = new AudioSystem();
    this.particles = new ParticleSystem();
    this.renderer = new Renderer(this.canvas, this.ctx);
    this.turtle = new Turtle();
    this.ui = new UIController();

    this.applyQualityProfile(this.getInitialQuality(), { resize: false });

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
      onOpenRecords: () => this.openRecords(),
      onSelectLevel: (level) => this.selectLevel(level),
      onRequestReset: () => this.requestReset(),
      onConfirmReset: () => this.confirmReset(),
      onLogout: () => this.logout(),
      onOpenMenu: () => this.openMenu(),
      onToggleFullscreen: () => this.toggleFullscreen()
    });

    this.input.bind();

    window.addEventListener("resize", () => this.resizeCanvas());

    document.addEventListener("fullscreenchange", () => {
      this.ui.updateFullscreen(Boolean(document.fullscreenElement));
      this.resizeCanvas();
    });

    document.addEventListener("visibilitychange", () => {
      this.handleVisibilityChange();
    });

    this.resizeCanvas();
    this.generateLevel();
    this.ui.updateFullscreen(Boolean(document.fullscreenElement));
    this.ui.showAuthMenu();

    if (!this.debugPerformanceMode) {
      void this.restoreDeviceSession();
    }

    if (this.debugPerformanceMode) {
      this.menuOpen = false;
      this.ui.hideMainMenu();
      this.progress.startTimer();
      this.resumeAnimationClock();
    }

    if (this.debugPerformanceMode) {
      window.__ZEN_PERF__ = {
        snapshot: () => this.getPerformanceSnapshot(),
        setQuality: (qualityName) => {
          this.performanceState.manualOverride = true;
          this.applyQualityProfile(qualityName);
          return this.getPerformanceSnapshot();
        },
        useAutomaticQuality: () => {
          this.performanceState.manualOverride = false;
          this.resetPerformanceSamples();
          return this.getPerformanceSnapshot();
        }
      };
    }

    this.loop();
  }

  getInitialQuality() {
    const requestedQuality = new URLSearchParams(window.location.search)
      .get("quality");

    if (CONFIG.performance.profiles[requestedQuality]) {
      this.performanceState.manualOverride = true;
      return requestedQuality;
    }

    const memory = Number(navigator.deviceMemory) || 0;
    const cores = Number(navigator.hardwareConcurrency) || 0;

    if ((memory > 0 && memory <= 2) || (cores > 0 && cores <= 2)) {
      return "low";
    }

    if ((memory > 0 && memory <= 4) || (cores > 0 && cores <= 4)) {
      return "medium";
    }

    return "high";
  }

  getQualityProfile() {
    return CONFIG.performance.profiles[this.performanceState.qualityName]
      || CONFIG.performance.profiles.high;
  }

  applyQualityProfile(qualityName, { resize = true } = {}) {
    if (!CONFIG.performance.profiles[qualityName]) return false;

    const changed = this.performanceState.qualityName !== qualityName;

    this.performanceState.qualityName = qualityName;
    this.performanceState.downgradeWindows = 0;
    this.performanceState.upgradeWindows = 0;
    this.renderer.setQuality(this.getQualityProfile());
    this.particles.setQuality(this.getQualityProfile());
    this.updatePerformanceDiagnostics();

    if (changed && resize) {
      this.resizeCanvas();
    }

    return changed;
  }

  resetPerformanceSamples(timestamp = performance.now()) {
    this.performanceState.frameTimes = [];
    this.performanceState.lastSampleAt = timestamp;
    this.performanceState.lastEvaluationAt = timestamp;
    this.performanceState.downgradeWindows = 0;
    this.performanceState.upgradeWindows = 0;
  }

  recordPerformanceFrame(timestamp) {
    if (
      this.pageHidden ||
      this.menuOpen ||
      this.levelCompleted ||
      this.performanceState.manualOverride
    ) {
      this.performanceState.lastSampleAt = timestamp;
      return;
    }

    const previous = this.performanceState.lastSampleAt;
    this.performanceState.lastSampleAt = timestamp;

    if (previous <= 0) return;

    const frameMs = timestamp - previous;

    if (frameMs < 4 || frameMs > 100) return;

    const samples = this.performanceState.frameTimes;
    samples.push(frameMs);

    if (samples.length > CONFIG.performance.sampleSize) {
      samples.splice(0, samples.length - CONFIG.performance.sampleSize);
    }

    if (
      timestamp - this.performanceState.lastEvaluationAt <
      CONFIG.performance.evaluationIntervalMs
    ) {
      return;
    }

    if (samples.length < 45) return;

    const averageFrameMs = samples.reduce((sum, value) => sum + value, 0)
      / samples.length;

    this.performanceState.averageFrameMs = averageFrameMs;
    this.performanceState.averageFps = Math.min(60, 1000 / averageFrameMs);
    this.performanceState.lastEvaluationAt = timestamp;
    this.updatePerformanceDiagnostics();

    this.evaluateQuality();
  }

  evaluateQuality() {
    const state = this.performanceState;
    const thresholds = CONFIG.performance.thresholds;
    const qualityName = state.qualityName;
    const fps = state.averageFps;
    let downgrade = false;
    let upgrade = false;

    if (qualityName === "high") {
      downgrade = fps < thresholds.highToMedium;
    } else if (qualityName === "medium") {
      downgrade = fps < thresholds.mediumToLow;
      upgrade = fps > thresholds.mediumToHigh;
    } else {
      upgrade = fps > thresholds.lowToMedium;
    }

    state.downgradeWindows = downgrade ? state.downgradeWindows + 1 : 0;
    state.upgradeWindows = upgrade ? state.upgradeWindows + 1 : 0;

    if (state.downgradeWindows >= CONFIG.performance.downgradeWindows) {
      const nextQuality = qualityName === "high" ? "medium" : "low";
      this.applyQualityProfile(nextQuality);
      this.resetPerformanceSamples();
      return;
    }

    if (state.upgradeWindows >= CONFIG.performance.upgradeWindows) {
      const nextQuality = qualityName === "low" ? "medium" : "high";
      this.applyQualityProfile(nextQuality);
      this.resetPerformanceSamples();
    }
  }

  getPerformanceSnapshot() {
    return {
      quality: this.performanceState.qualityName,
      averageFps: Number(this.performanceState.averageFps.toFixed(1)),
      averageFrameMs: Number(this.performanceState.averageFrameMs.toFixed(2)),
      sampleCount: this.performanceState.frameTimes.length,
      renderScale: this.getQualityProfile().renderScale,
      pixelRatio: this.pixelRatio,
      devicePixelRatio: Number((window.devicePixelRatio || 1).toFixed(2)),
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      cssWidth: this.canvas.getBoundingClientRect().width,
      pageHidden: this.pageHidden,
      menuOpen: this.menuOpen
    };
  }

  updatePerformanceDiagnostics() {
    this.canvas.dataset.quality = this.performanceState.qualityName;
    this.canvas.dataset.averageFps = this.performanceState.averageFps.toFixed(1);
    this.canvas.dataset.renderScale = String(this.getQualityProfile().renderScale);
    this.canvas.dataset.pixelRatio = this.pixelRatio.toFixed(2);
  }

  hasPlayableSession() {
    return this.debugPerformanceMode || this.auth.hasCurrentUser();
  }

  resumeAnimationClock(timestamp = performance.now()) {
    this.lastLoopTimestamp = timestamp;
    this.lastRenderAt = 0;
    this.renderer.resetClock(timestamp);
    this.turtle.resetClock(timestamp);
    this.resetPerformanceSamples(timestamp);
  }

  handleVisibilityChange() {
    this.pageHidden = document.hidden;
    const now = performance.now();

    this.resumeAnimationClock(now);

    if (this.pageHidden) {
      this.progress.pauseTimer();
      return;
    }

    if (
      !this.menuOpen &&
      !this.levelCompleted &&
      this.hasPlayableSession()
    ) {
      this.progress.startTimer();
    }
  }

  resizeCanvas() {
    const displaySize = Math.min(
      window.innerWidth,
      window.innerHeight,
      CONFIG.canvasMaxSize
    );
    const profile = this.getQualityProfile();
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const pixelRatio = Math.max(
      profile.minPixelRatio || 1,
      Math.min(
        profile.maxPixelRatio || 2,
        devicePixelRatio * profile.renderScale
      )
    );
    const previousHexRadius = this.hexRadius;
    const size = Math.max(1, Math.round(displaySize * pixelRatio));

    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.style.width = `${displaySize}px`;
    this.canvas.style.height = `${displaySize}px`;
    this.displaySize = displaySize;
    this.pixelRatio = pixelRatio;

    const baseHexRadius = window.innerWidth < CONFIG.mobileBreakpoint
      ? CONFIG.mobileHexRadius
      : CONFIG.desktopHexRadius;

    this.hexRadius = baseHexRadius;

    if (previousHexRadius > 0 && previousHexRadius !== this.hexRadius) {
      const coordinateScale = this.hexRadius / previousHexRadius;

      this.turtle.scaleCoordinates(coordinateScale);
      this.particles.scaleCoordinates(coordinateScale);
    }

    this.turtle.syncToTile(this.hexRadius, false);
    this.renderer.setViewport(displaySize, displaySize, pixelRatio);
    this.renderer.invalidateGrid();
    this.renderer.resetClock();
  }

  generateLevel() {
    this.levelCompleted = false;
    this.lastTimerSecond = -1;
    this.resetPerformanceSamples();
    this.victoryTour.active = false;
    this.victoryTour.path = [];
    this.victoryTour.index = 0;
    this.victoryTour.nextAt = 0;
    this.victoryTour.result = null;
    this.victoryTour.revealAt = 0;

    this.particles.clear();
    this.ui.hideCompletion();
    this.ui.updateLevel(this.level);

    const generated = PuzzleGenerator.generate(this.level);

    this.grid = generated.grid;
    this.renderer.invalidateGrid();

    this.progress.startLevel(
      this.level,
      generated.activeTileCount,
      generated.minimumMoves
    );

    this.ui.updateStats(this.progress);
    this.ui.updateTimer(0);

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

  async restoreDeviceSession() {
    this.ui.setAuthMessage("Oturum kontrol ediliyor...");
    const result = await this.auth.restoreDeviceSession();

    if (!result.ok) {
      this.ui.setAuthMessage("");
      return;
    }

    this.afterAuthSuccess("Tekrar hoş geldin.");
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
    this.progress.pauseTimer();
    this.auth.logout();
    this.progress.loadForCurrentUser();

    this.level = 1;
    this.generateLevel();

    this.menuOpen = true;
    this.ui.showAuthMenu("Çıkış yapıldı.");
  }

  openMenu() {
    this.menuOpen = true;
    this.progress.pauseTimer();
    this.resetPerformanceSamples();

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
    this.ui.hideRecords();
    this.ui.hideMainMenu();
    this.progress.startTimer();
    this.resumeAnimationClock();
  }

  openLevels() {
    if (!this.auth.hasCurrentUser()) return;

    const completedLevels = this.progress.getCompletedLevels();
    this.ui.showLevelSelect(completedLevels);
  }

  async openRecords() {
    if (!this.auth.hasCurrentUser()) return;

    this.ui.showRecords([
      {
        username: "Yükleniyor...",
        best_by_level: {}
      }
    ]);

    const result = await this.auth.getLeaderboard();

    if (!result.ok) {
      this.ui.showRecords([
        {
          username: `Rekorlar alınamadı: ${result.error}`,
          best_by_level: {}
        }
      ]);
      return;
    }

    this.ui.showRecords(result.records);
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
    this.progress.startTimer();
    this.resumeAnimationClock();
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
    if (this.menuOpen || this.levelCompleted || !this.hasPlayableSession()) return;

    this.audio.init();

    const key = tileKey(hex.q, hex.r);
    const tile = this.grid[key];

    if (!tile || !tile.active) return;

    const rotated = tile.rotate();

    if (!rotated) return;

    this.renderer.invalidateConnections();

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
    this.particles.createCelebration(this.displaySize, this.displaySize);

    const result = this.progress.completeCurrentLevel();

    this.ui.updateTimer(result.timeSeconds);

    this.startVictoryTour(result);
  }

  startVictoryTour(result) {
    const path = this.buildVictoryPath();

    this.victoryTour.result = result;
    this.victoryTour.revealAt = 0;

    if (path.length <= 1) {
      this.finishVictoryTour(performance.now());
      return;
    }

    this.turtle.reset(path[0].q, path[0].r, this.hexRadius);
    this.victoryTour.active = true;
    this.victoryTour.path = path;
    this.victoryTour.index = 1;
    this.victoryTour.nextAt = performance.now() + 80;

    this.turtle.speed = 0.24;
  }

  buildVictoryPath() {
    return Object.values(this.grid)
      .filter((tile) => (
        tile.active &&
        tile.flowerBloomed &&
        tile.victoryIndex >= 0
      ))
      .sort((a, b) => a.victoryIndex - b.victoryIndex)
      .map((tile) => ({ q: tile.q, r: tile.r }));
  }

  updateVictoryTour(timestamp) {
    if (!this.victoryTour.active) {
      if (
        this.victoryTour.result &&
        this.victoryTour.revealAt > 0 &&
        timestamp >= this.victoryTour.revealAt
      ) {
        this.ui.showCompletion(this.victoryTour.result);
        this.victoryTour.result = null;
        this.victoryTour.revealAt = 0;
      }

      return;
    }

    if (timestamp < this.victoryTour.nextAt) return;

    const reachedTarget = this.turtle.distanceToTarget() < 3.5;

    if (!reachedTarget && this.victoryTour.index > 0) {
      return;
    }

    const point = this.victoryTour.path[this.victoryTour.index];

    if (!point) {
      this.finishVictoryTour(timestamp);
      return;
    }

    this.turtle.moveTo(point.q, point.r, this.hexRadius);

    this.victoryTour.index += 1;
    this.victoryTour.nextAt = timestamp + 55;
  }

  finishVictoryTour(timestamp) {
    this.victoryTour.active = false;
    this.victoryTour.revealAt = timestamp + 720;
    this.turtle.speed = 0.08;
    this.turtle.celebrate(720);
  }

  useHint() {
    if (this.menuOpen || this.levelCompleted || !this.hasPlayableSession()) return;

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
    this.renderer.invalidateConnections();

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

  async toggleFullscreen() {
    const root = document.documentElement;

    try {
      if (!document.fullscreenElement) {
        if (root.requestFullscreen) {
          await root.requestFullscreen();
        }
        this.ui.updateFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        this.ui.updateFullscreen(false);
      }
    } catch {
      this.ui.updateFullscreen(Boolean(document.fullscreenElement));
    }
  }

  toggleSound() {
    const enabled = this.audio.toggle();
    this.ui.updateSound(enabled);
  }

  nextLevel() {
    this.level += 1;
    this.generateLevel();
    this.progress.startTimer();
  }

  loop(timestamp = performance.now()) {
    if (this.pageHidden) {
      requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
      return;
    }

    this.recordPerformanceFrame(timestamp);

    const profile = this.getQualityProfile();
    const menuFrameInterval = 1000 / profile.menuFps;

    if (
      this.menuOpen &&
      timestamp - this.lastRenderAt < menuFrameInterval
    ) {
      requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
      return;
    }

    const deltaMs = Math.min(
      50,
      Math.max(4, timestamp - this.lastLoopTimestamp)
    );

    this.lastLoopTimestamp = timestamp;
    this.lastRenderAt = timestamp;
    this.updateVictoryTour(timestamp);

    if (!this.menuOpen && !this.levelCompleted && this.hasPlayableSession()) {
      const elapsedSeconds = this.progress.getElapsedSeconds();

      if (elapsedSeconds !== this.lastTimerSecond) {
        this.lastTimerSecond = elapsedSeconds;
        this.ui.updateTimer(elapsedSeconds);
      }
    }

    this.turtle.update();
    this.particles.update(deltaMs);

    this.renderer.render({
      grid: this.grid,
      turtle: this.turtle,
      particleSystem: this.particles,
      hexRadius: this.hexRadius,
      victoryTourActive: this.victoryTour.active
    });

    requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }
} 
