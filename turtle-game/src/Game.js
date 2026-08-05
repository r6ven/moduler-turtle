import { CONFIG } from "./config.js";
import { tileKey } from "./HexMath.js";
import { AudioSystem } from "./AudioSystem.js";
import { EndlessSprintSession } from "./EndlessSprintSession.js";
import { InputManager } from "./InputManager.js";
import { ModeRecordStore } from "./ModeRecordStore.js";
import { ParticleSystem } from "./ParticleSystem.js";
import { ProgressSystem } from "./ProgressSystem.js";
import {
  RANKED_CLIENT_COMPATIBILITY,
  RankedSprintSession
} from "./RankedSprintSession.js";
import { hydratePuzzleDefinition } from "./PuzzleDefinition.js";
import { PuzzleGenerator } from "./PuzzleGenerator.js";
import { PuzzleValidator } from "./PuzzleValidator.js";
import { Renderer } from "./Renderer.js";
import { Turtle } from "./Turtle.js";
import { UIController } from "./UIController.js";
import { UserAuthSystem } from "./UserAuthSystem.js";

const PERMANENT_RANKED_SUBMISSION_CODES = new Set([
  "invalid_replay",
  "unsolved",
  "inactive_or_unknown_tile",
  "invalid_move_key",
  "replay_length_out_of_range",
  "invalid_definition",
  "unsupported_definition_schema",
  "unsupported_rules_version",
  "server_definition_mismatch"
]);

function isPermanentRankedSubmissionFailure(result = {}) {
  return PERMANENT_RANKED_SUBMISSION_CODES.has(
    String(result.code || "")
  );
}

function formatRankedFailureReference(result = {}) {
  const parts = [];

  if (result.code) parts.push(String(result.code));
  if (Number(result.httpStatus) > 0) {
    parts.push(`HTTP ${Number(result.httpStatus)}`);
  }
  if (result.requestId) {
    parts.push(`İstek ${String(result.requestId)}`);
  }

  return parts.length ? ` (${parts.join(" · ")})` : "";
}

export function getRankedStartErrorMessage(result = {}) {
  const messages = {
    client_update_required:
      "Dereceli Sprint i\u00e7in oyunu g\u00fcncellemen gerekiyor. G\u00fcnl\u00fck hakk\u0131n kullan\u0131lmad\u0131.",
    series_unavailable:
      "Bug\u00fcn\u00fcn dereceli serisi hen\u00fcz yay\u0131mlanmad\u0131. L\u00fctfen biraz sonra tekrar dene.",
    slot_unavailable:
      "Bug\u00fcn\u00fcn dereceli bulmacas\u0131 haz\u0131rlanamad\u0131. L\u00fctfen biraz sonra tekrar dene.",
    invalid_session:
      "Oturum s\u00fcren dolmu\u015f. Dereceli Sprint i\u00e7in tekrar giri\u015f yap."
  };

  return messages[result.code] ||
    result.error ||
    "Bug\u00fcnk\u00fc dereceli seri ba\u015flat\u0131lamad\u0131.";
}

export class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.auth = new UserAuthSystem();
    this.progress = new ProgressSystem(this.auth);
    this.modeRecords = new ModeRecordStore();
    this.endlessSprint = new EndlessSprintSession();
    this.rankedSprint = new RankedSprintSession();
    this.rankedForfeitPromise = null;
    this.rankedForfeitSlot = null;
    this.currentPuzzle = null;
    this.gameMode = "story";

    this.level = 1;
    this.mapRadius = CONFIG.difficulty.getMapRadius(this.level);
    this.hexRadius = CONFIG.desktopHexRadius;
    this.boardOffsetY = 0;
    this.boardLayout = null;
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
    this.tutorial = {
      active: false,
      targetKey: null
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
      (hex) => this.handleTilePress(hex),
      () => ({ x: 0, y: this.boardOffsetY })
    );
  }

  start() {
    const hasRememberedSession = this.auth.hasRememberedDeviceSession();

    this.ui.showLoading({
      variant: hasRememberedSession ? "channel" : "shell",
      message: hasRememberedSession
        ? "Su yolları yeniden bağlanıyor"
        : "Ada hazırlanıyor"
    });
    this.ui.bind({
      onNextLevel: () => this.nextLevel(),
      onHint: () => this.useHint(),
      onToggleSound: () => this.toggleSound(),
      onLogin: () => this.login(),
      onRegister: () => this.register(),
      onContinueGame: () => this.continueGame(),
      onStartEndless: (settings) => this.startEndlessSprint(settings),
      onRequestRanked: () => this.requestRankedSprint(),
      onConfirmRanked: () => void this.startRankedSprint(),
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

    window.addEventListener("pagehide", () => {
      if (
        this.gameMode === "ranked" &&
        this.rankedSprint.active &&
        this.rankedSprint.ranked &&
        !this.levelCompleted
      ) {
        this.forfeitCurrentRankedPuzzle("page_unloaded");
      }
    });

    this.resizeCanvas();
    this.generateLevel();
    this.ui.updateFullscreen(Boolean(document.fullscreenElement));
    this.ui.showAuthMenu();

    if (!this.debugPerformanceMode) {
      void this.finishStartupLoading();
    }

    if (this.debugPerformanceMode) {
      this.menuOpen = false;
      this.ui.hideMainMenu();
      this.progress.startTimer();
      this.resumeAnimationClock();
      this.showTutorialIfNeeded();
      void this.ui.hideLoading({ minimumMs: 180 });
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

  async finishStartupLoading() {
    try {
      await this.restoreDeviceSession();
    } catch (error) {
      console.error("Session restore failed", error);
      this.ui.setAuthMessage("Oturum kontrolü tamamlanamadı.", "error");
    } finally {
      await this.ui.hideLoading({ minimumMs: 780 });
    }
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
      mapRadius: this.mapRadius,
      hexRadius: Number(this.hexRadius.toFixed(3)),
      boardOffsetY: Number(this.boardOffsetY.toFixed(3)),
      boardLayout: this.boardLayout,
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

  getActiveProgress() {
    if (this.gameMode === "ranked" && this.rankedSprint.active) {
      return this.rankedSprint;
    }

    return this.gameMode === "endless" && this.endlessSprint.active
      ? this.endlessSprint
      : this.progress;
  }

  pauseActiveTimer() {
    this.getActiveProgress().pauseTimer();
  }

  startActiveTimer() {
    this.getActiveProgress().startTimer();
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
      if (
        this.gameMode === "ranked" &&
        this.rankedSprint.active &&
        this.rankedSprint.ranked &&
        !this.levelCompleted
      ) {
        this.forfeitCurrentRankedPuzzle("page_hidden");
      } else {
        this.pauseActiveTimer();
      }
      return;
    }

    if (
      !this.menuOpen &&
      !this.levelCompleted &&
      this.hasPlayableSession()
    ) {
      this.startActiveTimer();
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
    const hudInsets = this.measureBoardHudInsets();
    const boardLayout = this.calculateBoardLayout(
      this.mapRadius,
      displaySize,
      baseHexRadius,
      hudInsets
    );

    this.hexRadius = boardLayout.hexRadius;
    this.boardOffsetY = boardLayout.offsetY;
    this.boardLayout = boardLayout;
    this.canvas.dataset.mapRadius = String(boardLayout.mapRadius);
    this.canvas.dataset.hexRadius = boardLayout.hexRadius.toFixed(3);
    this.canvas.dataset.boardOffsetY = boardLayout.offsetY.toFixed(3);
    this.canvas.dataset.minimumTapTarget = boardLayout.meetsMinimumTapTarget
      ? "met"
      : "below";
    this.canvas.dataset.tutorialOverlay = boardLayout.tutorialOverlaysBoard
      ? "allowed"
      : "clear";

    if (previousHexRadius > 0 && previousHexRadius !== this.hexRadius) {
      const coordinateScale = this.hexRadius / previousHexRadius;

      this.turtle.scaleCoordinates(coordinateScale);
      this.particles.scaleCoordinates(coordinateScale);
    }

    this.turtle.syncToTile(this.hexRadius, false);
    this.renderer.setViewport(
      displaySize,
      displaySize,
      pixelRatio,
      this.boardOffsetY
    );
    this.renderer.invalidateGrid();
    this.renderer.resetClock();
  }

  measureBoardHudInsets() {
    const canvasRect = this.canvas.getBoundingClientRect();
    const hudGap = CONFIG.boardLayout.hudGap;
    const topRect = document.querySelector(".top-cluster")
      ?.getBoundingClientRect();
    const tutorialRect = this.ui?.tutorialCallout?.classList.contains("active")
      ? this.ui.tutorialCallout.getBoundingClientRect()
      : null;
    const bottomRect = document.querySelector(".bottom-bar")
      ?.getBoundingClientRect();
    const overlapsCanvas = (rect) => (
      rect &&
      rect.right > canvasRect.left &&
      rect.left < canvasRect.right &&
      rect.bottom > canvasRect.top &&
      rect.top < canvasRect.bottom
    );
    const topInsetFor = (rect) => overlapsCanvas(rect)
      ? Math.max(0, rect.bottom - canvasRect.top + hudGap)
      : 0;
    const stableTopInset = topInsetFor(topRect);
    const tutorialTopInset = topInsetFor(tutorialRect);
    const bottomInset = overlapsCanvas(bottomRect)
      ? Math.max(0, canvasRect.bottom - bottomRect.top + hudGap)
      : 0;

    return {
      top: Math.min(
        canvasRect.height / 2,
        Math.max(stableTopInset, tutorialTopInset)
      ),
      stableTop: Math.min(canvasRect.height / 2, stableTopInset),
      tutorialTop: Math.min(canvasRect.height / 2, tutorialTopInset),
      bottom: Math.min(canvasRect.height / 2, bottomInset)
    };
  }

  calculateBoardLayout(
    mapRadius,
    displaySize,
    baseHexRadius,
    hudInsets = { top: 0, bottom: 0 }
  ) {
    // mapRadius identifies the generated puzzle and its leaderboard entry.
    // Never reduce it for a viewport; fit only the visual hex radius.
    const safeMapRadius = Math.max(1, Math.floor(Number(mapRadius) || 1));
    const edgePadding = CONFIG.boardLayout.edgePadding;
    const requestedTopInset = Math.max(0, Number(hudInsets.top) || 0);
    const stableTopInset = Math.max(
      0,
      Number(hudInsets.stableTop) || 0
    );
    const bottomInset = Math.max(0, Number(hudInsets.bottom) || 0);
    const availableWidth = Math.max(1, displaySize - edgePadding * 2);
    const fitWidth = availableWidth / (
      Math.sqrt(3) * (safeMapRadius * 2 + 1)
    );
    const fitForTopInset = (topInset) => {
      const availableHeight = Math.max(
        1,
        displaySize - topInset - bottomInset - edgePadding * 2
      );
      const fitHeight = availableHeight / (safeMapRadius * 3 + 2);
      const hexRadius = Math.max(
        1,
        Math.min(baseHexRadius, fitWidth, fitHeight)
      );

      return { availableHeight, fitHeight, hexRadius };
    };
    let topInset = requestedTopInset;
    let verticalFit = fitForTopInset(topInset);
    let tutorialOverlaysBoard = false;

    if (
      topInset > stableTopInset &&
      verticalFit.hexRadius < CONFIG.boardLayout.minTapRadius
    ) {
      topInset = stableTopInset;
      verticalFit = fitForTopInset(topInset);
      tutorialOverlaysBoard = true;
    }

    return {
      mapRadius: safeMapRadius,
      hexRadius: verticalFit.hexRadius,
      fitWidth,
      fitHeight: verticalFit.fitHeight,
      availableWidth,
      availableHeight: verticalFit.availableHeight,
      topInset,
      bottomInset,
      offsetY: (topInset - bottomInset) / 2,
      meetsMinimumTapTarget:
        verticalFit.hexRadius >= CONFIG.boardLayout.minTapRadius,
      tutorialOverlaysBoard
    };
  }

  generateLevel() {
    this.gameMode = "story";
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
    this.ui.updateRankedPuzzleEligibility?.({});
    this.ui.updateLevel(this.level);
    this.ui.setHintEnabled?.(true);

    const generated = PuzzleGenerator.generate({
      mode: "story",
      level: this.level,
      seed: `story:v2:${this.level}`,
      puzzleId: `story-v2-${this.level}`
    });
    this.currentPuzzle = generated;
    const mapRadiusChanged = this.mapRadius !== generated.mapRadius;

    this.mapRadius = generated.mapRadius;
    this.grid = generated.grid;

    if (mapRadiusChanged) {
      this.resizeCanvas();
    }

    this.renderer.invalidateGrid();

    this.progress.startLevel(
      this.level,
      generated.activeTileCount,
      generated.minimumMoves
    );
    this.configureTutorial(generated.tutorialKey);

    this.ui.updateStats(this.progress);
    this.ui.updateTimer(0);

    this.turtle.reset(0, 0, this.hexRadius);
    this.turtle.speed = 0.08;

    this.checkConnections({ allowCompletion: false });
  }

  generateEndlessPuzzle() {
    const status = this.endlessSprint.getStatus();

    this.gameMode = "endless";
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
    this.ui.updateRankedPuzzleEligibility?.({});
    this.ui.updateSprintHeader(status.puzzleIndex, status.sprintLength);
    this.ui.setHintEnabled?.(true);

    const generated = PuzzleGenerator.generate(
      this.endlessSprint.getCurrentPuzzleRequest()
    );
    const mapRadiusChanged = this.mapRadius !== generated.mapRadius;

    this.mapRadius = generated.mapRadius;
    this.grid = generated.grid;

    if (mapRadiusChanged) {
      this.resizeCanvas();
    }

    this.renderer.invalidateGrid();
    this.currentPuzzle = generated;
    this.endlessSprint.beginPuzzle({
      minimumMoves: generated.minimumMoves,
      activeTileCount: generated.activeTileCount,
      puzzle: generated
    });
    this.configureTutorial(null);

    this.ui.updateStats(this.endlessSprint);
    this.ui.updateTimer(this.endlessSprint.getElapsedSeconds());

    this.turtle.reset(0, 0, this.hexRadius);
    this.turtle.speed = 0.08;

    this.checkConnections({ allowCompletion: false });
  }

  generateRankedPuzzle() {
    const status = this.rankedSprint.getStatus();
    const payload = this.rankedSprint.getCurrentPuzzlePayload();
    const generated = hydratePuzzleDefinition(
      payload.definition,
      payload.presentationDefinition,
      {
        supportedSchemas:
          RANKED_CLIENT_COMPATIBILITY.supportedDefinitionSchemas,
        supportedRules:
          RANKED_CLIENT_COMPATIBILITY.supportedGameRules
      }
    );

    if (
      payload.gameplayChecksum &&
      generated.gameplayChecksum !== payload.gameplayChecksum
    ) {
      const error = new Error("Dereceli puzzle verisi doğrulanamadı.");
      error.code = "gameplay_checksum_mismatch";
      throw error;
    }

    if (
      payload.presentationChecksum &&
      generated.presentationChecksum !== payload.presentationChecksum
    ) {
      const error = new Error("Dereceli puzzle sunum verisi do\u011frulanamad\u0131.");
      error.code = "presentation_checksum_mismatch";
      throw error;
    }

    this.gameMode = "ranked";
    this.levelCompleted = false;
    this.lastTimerSecond = -1;
    this.resetPerformanceSamples();
    this.victoryTour.active = false;
    this.particles.clear();
    this.ui.hideCompletion();
    this.ui.updateRankedSprintStatus(status);
    this.ui.updateRankedPuzzleEligibility?.(status);
    this.ui.updateSprintHeader(status.puzzleIndex, status.sprintLength);

    const mapRadiusChanged = this.mapRadius !== generated.mapRadius;
    this.mapRadius = generated.mapRadius;
    this.grid = generated.grid;
    this.currentPuzzle = generated;

    if (mapRadiusChanged) this.resizeCanvas();
    this.renderer.invalidateGrid();
    this.rankedSprint.beginPuzzle(generated);
    this.ui.updateRankedPuzzleEligibility?.(
      this.rankedSprint.getStatus()
    );
    this.configureTutorial(null);
    this.ui.updateStats(this.rankedSprint);
    this.ui.updateTimer(this.rankedSprint.getElapsedSeconds());
    this.ui.setHintEnabled?.(
      !this.rankedSprint.ranked,
      "Dereceli Sprintte ipucu kullanılamaz."
    );
    this.turtle.reset(0, 0, this.hexRadius);
    this.turtle.speed = 0.08;
    this.checkConnections({ allowCompletion: false });
  }

  requestRankedSprint() {
    if (
      this.rankedSprint.active &&
      !this.rankedSprint.isComplete()
    ) {
      if (
        this.gameMode !== "ranked" ||
        !this.rankedSprint.hasPlayablePuzzle()
      ) {
        this.generateRankedPuzzle();
      }

      this.gameMode = "ranked";
      this.ui.setHintEnabled?.(
        !this.rankedSprint.ranked,
        "Dereceli Sprintte ipucu kullan\u0131lamaz."
      );
      this.ui.updateRankedSprintStatus(this.rankedSprint.getStatus());
      this.ui.updateRankedPuzzleEligibility?.(
        this.rankedSprint.getStatus()
      );
      this.closeMenu();
      return;
    }

    this.ui.showRankedRules();
  }

  async startRankedSprint() {
    if (!this.auth.hasCurrentUser()) return;

    this.ui.hideRankedRules();
    this.ui.setRankedMessage("", "info");
    this.ui.showLoading({
      variant: "channel",
      message: "G\u00fcn\u00fcn ortak serisi haz\u0131rlan\u0131yor"
    });

    let failureMessage = "";

    try {
      const started = await this.auth.startRankedSprint(
        RANKED_CLIENT_COMPATIBILITY
      );

      if (!started.ok) {
        failureMessage = getRankedStartErrorMessage(started);
        return;
      }

      this.rankedSprint.start(started);
      this.rankedForfeitPromise = null;
      this.rankedForfeitSlot = null;
      this.generateRankedPuzzle();
      this.ui.updateRankedSprintStatus(this.rankedSprint.getStatus());
      this.closeMenu();
    } catch (error) {
      // Client hydration/start failures must not consume the daily attempt.
      // The same server slot can be requested again after the client recovers.
      this.rankedSprint.reset();
      failureMessage =
        error.message || "Dereceli Sprint ba\u015flat\u0131lamad\u0131.";
    } finally {
      await this.ui.hideLoading({ minimumMs: 320 });

      if (failureMessage) {
        this.ui.showMenuMode?.("endless");
        this.ui.showSprintKind?.("ranked");
        this.ui.setRankedMessage(failureMessage, "error");
      }
    }
  }

  invalidateRankedSprint(reason) {
    if (
      !this.rankedSprint.ranked ||
      !this.rankedSprint.claimed ||
      this.rankedSprint.complete
    ) {
      return;
    }

    this.rankedSprint.invalidate(reason);
    this.ui.updateRankedSprintStatus(this.rankedSprint.getStatus());
    void this.auth.invalidateRankedSprint(
      this.rankedSprint.attemptId,
      reason
    );
  }

  forfeitCurrentRankedPuzzle(reason) {
    const changed = this.rankedSprint.forfeitCurrentPuzzle(reason);

    if (!changed) return this.rankedForfeitPromise;

    const slot = this.rankedSprint.getStatus().puzzleIndex;
    this.rankedForfeitSlot = slot;
    this.ui.updateRankedSprintStatus(this.rankedSprint.getStatus());
    this.ui.updateRankedPuzzleEligibility?.(
      this.rankedSprint.getStatus()
    );

    const request = this.auth.forfeitRankedPuzzle(
      this.rankedSprint.attemptId,
      slot,
      reason
    );
    this.rankedForfeitPromise = Promise.resolve(request)
      .then((result) => {
        if (!result?.ok) {
          const error = new Error(
            result?.error ||
            "Puzzle puan durumu sunucuya iletilemedi."
          );
          error.code = result?.code || "forfeit_failed";
          throw error;
        }
        return result;
      })
      .finally(() => {
        if (this.rankedForfeitSlot === slot) {
          this.rankedForfeitPromise = null;
        }
      });
    this.rankedForfeitPromise.catch(() => {});
    return this.rankedForfeitPromise;
  }

  async ensureCurrentRankedForfeit() {
    const status = this.rankedSprint.getStatus();
    if (status.scoreEligible !== false) return;

    if (!this.rankedForfeitPromise) {
      const slot = status.puzzleIndex;
      this.rankedForfeitSlot = slot;
      this.rankedForfeitPromise = this.auth.forfeitRankedPuzzle(
        this.rankedSprint.attemptId,
        slot,
        status.forfeitReason || "client_interrupted"
      ).then((result) => {
        if (!result?.ok) {
          const error = new Error(
            result?.error ||
            "Puzzle puan durumu sunucuya iletilemedi."
          );
          error.code = result?.code || "forfeit_failed";
          throw error;
        }
        return result;
      }).finally(() => {
        if (this.rankedForfeitSlot === slot) {
          this.rankedForfeitPromise = null;
        }
      });
    }

    await this.rankedForfeitPromise;
  }

  async login() {
    const { username, password } = this.ui.getAuthCredentials();

    this.ui.showLoading({
      variant: "ripple",
      message: "Dalgalar seni adaya taşıyor"
    });

    try {
      const result = await this.auth.login(username, password);

      if (!result.ok) {
        this.ui.setAuthMessage(result.error, "error");
        return;
      }

      this.afterAuthSuccess("Giriş başarılı.");
    } catch (error) {
      console.error("Login failed", error);
      this.ui.setAuthMessage("Giriş sırasında bağlantı kurulamadı.", "error");
    } finally {
      await this.ui.hideLoading({ minimumMs: 680 });
    }
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

    this.ui.showLoading({
      variant: "sprout",
      message: "Yeni bir ada filizleniyor"
    });

    try {
      const result = await this.auth.register(username, password);

      if (!result.ok) {
        this.ui.setAuthMessage(result.error, "error");
        return;
      }

      this.afterAuthSuccess("Kayıt oluşturuldu.");
    } catch (error) {
      console.error("Registration failed", error);
      this.ui.setAuthMessage("Kayıt sırasında bağlantı kurulamadı.", "error");
    } finally {
      await this.ui.hideLoading({ minimumMs: 720 });
    }
  }

  afterAuthSuccess(message) {
    this.audio.init();

    this.ui.clearPassword();
    this.ui.setAuthMessage(message);

    this.progress.loadForCurrentUser();
    this.endlessSprint.reset();
    this.rankedSprint.reset();
    this.level = this.progress.getSavedLevel();

    this.generateLevel();

    this.menuOpen = true;
    this.ui.showGameMenu(
      this.auth.getCurrentUsername(),
      this.progress.getSavedLevel(),
      this.progress.getCompletedLevels().length
    );
  }

  async logout() {
    this.pauseActiveTimer();
    if (
      this.gameMode === "ranked" &&
      this.rankedSprint.active &&
      this.rankedSprint.ranked &&
      !this.levelCompleted
    ) {
      try {
        await this.forfeitCurrentRankedPuzzle("left_for_logout");
      } catch {
        // A reload can retry the slot-scoped forfeit with the same session.
      }
    }
    this.endlessSprint.reset();
    this.rankedSprint.reset();
    this.rankedForfeitPromise = null;
    this.rankedForfeitSlot = null;
    this.auth.logout();
    this.progress.loadForCurrentUser();

    this.level = 1;
    this.generateLevel();

    this.menuOpen = true;
    this.ui.showAuthMenu("Çıkış yapıldı.");
  }

  openMenu() {
    this.menuOpen = true;
    if (
      this.gameMode === "ranked" &&
      this.rankedSprint.active &&
      this.rankedSprint.ranked &&
      !this.levelCompleted
    ) {
      this.forfeitCurrentRankedPuzzle("menu_opened");
    } else {
      this.pauseActiveTimer();
    }
    this.resetPerformanceSamples();
    this.ui.hideTutorial();

    if (this.auth.hasCurrentUser()) {
      this.ui.showGameMenu(
        this.auth.getCurrentUsername(),
        this.progress.getSavedLevel(),
        this.progress.getCompletedLevels().length
      );
      this.ui.updateEndlessSprintMenu(this.endlessSprint.getStatus());

      if (this.gameMode === "endless" && this.endlessSprint.active) {
        this.ui.showMenuMode("endless");
      } else if (this.gameMode === "ranked" && this.rankedSprint.claimed) {
        this.ui.showMenuMode("endless");
        this.ui.showSprintKind("ranked");
        this.ui.updateRankedSprintStatus(this.rankedSprint.getStatus());
      }
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
    this.startActiveTimer();
    this.resumeAnimationClock();
    this.showTutorialIfNeeded();
  }

  continueGame() {
    if (!this.auth.hasCurrentUser()) {
      this.closeMenu();
      return;
    }

    const savedLevel = this.progress.getSavedLevel();

    if (
      this.gameMode === "endless" &&
      this.endlessSprint.active &&
      !this.endlessSprint.isComplete()
    ) {
      this.endlessSprint.reset();
    }
    if (
      this.gameMode === "ranked" &&
      this.rankedSprint.claimed &&
      !this.levelCompleted
    ) {
      this.forfeitCurrentRankedPuzzle("left_for_story");
    }

    if (
      this.gameMode !== "story" ||
      this.level !== savedLevel ||
      this.levelCompleted
    ) {
      this.level = savedLevel;
      this.generateLevel();
    }

    this.closeMenu();
  }

  startEndlessSprint(settings = {}) {
    if (!this.auth.hasCurrentUser()) {
      this.closeMenu();
      return;
    }

    if (this.endlessSprint.active && !this.endlessSprint.isComplete()) {
      this.gameMode = "endless";
      this.closeMenu();
      return;
    }

    if (this.rankedSprint.claimed && !this.rankedSprint.isComplete()) {
      this.forfeitCurrentRankedPuzzle("left_for_training");
    }

    this.audio.init();
    this.endlessSprint.start(settings);
    this.generateEndlessPuzzle();
    this.closeMenu();
  }

  openLevels() {
    if (!this.auth.hasCurrentUser()) return;

    const completedLevels = this.progress.getCompletedLevels();
    this.ui.showLevelSelect(completedLevels);
  }

  async openRecords() {
    if (!this.auth.hasCurrentUser()) return;
    const modeRecords = this.modeRecords.read();
    const local = this.modeRecords.getEndlessWinners();
    this.ui.showRecords({
      storyMessage: "Hik\u00e2ye rekorlar\u0131 y\u00fckleniyor...",
      endlessRecords: local,
      dailyRecords: modeRecords.daily
    });

    const [storyV2, ranked] = await Promise.all([
      this.auth.getStoryV2Leaderboard(),
      this.auth.getRankedLeaderboards()
    ]);
    const legacy = storyV2.ok ? null : await this.auth.getLeaderboard();
    this.ui.showRecords({
      storyRecords: storyV2.ok
        ? storyV2.records
        : legacy?.ok
          ? legacy.records
          : [],
      storyMessage: storyV2.ok || legacy?.ok
        ? ""
        : `Rekorlar al\u0131namad\u0131: ${storyV2.error || legacy?.error}`,
      endlessRecords: local,
      rankedDailyRecords: ranked.daily,
      rankedMonthlyRecords: ranked.monthly,
      rankedProvisional: ranked.provisional,
      dailyRecords: modeRecords.daily
    });
  }

  selectLevel(level) {
    if (!this.auth.hasCurrentUser()) return;

    if (!this.progress.hasCompletedLevel(level)) {
      return;
    }

    this.audio.init();

    if (this.endlessSprint.active && !this.endlessSprint.isComplete()) {
      this.endlessSprint.reset();
    }
    if (this.rankedSprint.claimed && !this.rankedSprint.isComplete()) {
      this.forfeitCurrentRankedPuzzle("left_for_story");
    }

    this.level = level;
    this.generateLevel();

    this.ui.hideLevelSelect();
    this.menuOpen = false;
    this.ui.hideMainMenu();
    this.progress.startTimer();
    this.resumeAnimationClock();
    this.showTutorialIfNeeded();
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

  configureTutorial(targetKey) {
    this.ui.hideTutorial();

    const eligible =
      this.level === 1 &&
      Boolean(targetKey) &&
      Boolean(this.grid[targetKey]);

    this.tutorial.active = eligible;
    this.tutorial.targetKey = eligible ? targetKey : null;
  }

  showTutorialIfNeeded() {
    if (!this.tutorial.active || this.menuOpen) return;

    const tile = this.grid[this.tutorial.targetKey];

    if (!tile) {
      this.completeTutorial();
      return;
    }

    tile.hintGlow = 1;
    this.ui.showTutorial();
    this.resizeCanvas();
  }

  reinforceTutorial() {
    if (!this.tutorial.active) return;

    const tile = this.grid[this.tutorial.targetKey];

    if (tile) tile.hintGlow = 1;
    this.ui.pulseTutorial();
  }

  updateTutorialHighlight() {
    if (!this.tutorial.active || this.menuOpen) return;

    const tile = this.grid[this.tutorial.targetKey];

    if (tile) tile.hintGlow = Math.max(tile.hintGlow, 0.96);
  }

  completeTutorial() {
    const wasActive = this.tutorial.active;
    const tile = this.grid[this.tutorial.targetKey];

    if (tile) tile.tutorialTarget = false;

    this.tutorial.active = false;
    this.tutorial.targetKey = null;
    this.ui.hideTutorial();

    if (wasActive && !this.menuOpen) {
      this.resizeCanvas();
    }
  }

  handleTilePress(hex) {
    if (
      this.menuOpen ||
      this.levelCompleted ||
      !this.hasPlayableSession()
    ) {
      return;
    }

    this.audio.init();

    const key = tileKey(hex.q, hex.r);

    if (this.tutorial.active && key !== this.tutorial.targetKey) {
      this.reinforceTutorial();
      return;
    }

    const tile = this.grid[key];

    if (!tile || !tile.active) return;

    const rotated = tile.rotate();

    if (!rotated) return;

    this.renderer.invalidateConnections();

    this.audio.play("click");

    const activeProgress = this.getActiveProgress();

    activeProgress.addMove(key);
    this.ui.updateStats(activeProgress);

    if (this.tutorial.active && key === this.tutorial.targetKey) {
      this.completeTutorial();
    }

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
    this.completeTutorial();
    this.levelCompleted = true;

    this.audio.play("success");
    this.particles.createCelebration(
      this.displaySize,
      this.displaySize
    );

    if (this.gameMode === "ranked") {
      void this.completeRankedLevel().catch((error) => {
        this.handleRankedCompletionFailure(error);
      });
      return;
    }

    const result = this.gameMode === "endless"
      ? this.endlessSprint.completeCurrentPuzzle()
      : this.progress.completeCurrentLevel();

    if (result.mode === "story") {
      void this.auth.saveStoryV2Result(this.level, result);
    }

    if (result.mode === "endless" && result.sprintComplete) {
      this.modeRecords.saveEndlessSprint(
        this.auth.getCurrentUsername(),
        result
      );
    }

    this.ui.updateTimer(
      this.gameMode === "story"
        ? result.timeSeconds
        : result.totalTimeSeconds
    );

    this.startVictoryTour(result);
  }

  async completeRankedLevel() {
    if (!this.rankedSprint.hasPlayablePuzzle()) {
      const error = new Error(
        "Dereceli puzzle tamamlanma durumu haz\u0131r de\u011fil."
      );
      error.code = "ranked_puzzle_not_ready";
      throw error;
    }

    const pending = this.rankedSprint.completeCurrentPuzzle();

    if (!pending.ranked) {
      this.ui.updateRankedSprintStatus(
        this.rankedSprint.getStatus()
      );
      this.ui.updateTimer(pending.totalTimeSeconds);
      this.startVictoryTour(pending);
      return;
    }

    await this.submitPendingRankedResult();
  }

  handleRankedCompletionFailure(error) {
    const code = String(
      error?.code || "ranked_completion_failed"
    );
    const message = String(
      error?.message || "Beklenmeyen dereceli doğrulama hatası."
    );
    const pending = this.rankedSprint.pendingResult;

    console.error("Ranked completion failed", {
      code,
      message,
      stack: error?.stack || null,
      attemptId: this.rankedSprint.attemptId,
      slot: this.rankedSprint.getStatus().puzzleIndex,
      hasPendingSubmission: Boolean(pending)
    });

    this.ui.hideCompletion();
    this.ui.updateRankedSprintStatus(
      this.rankedSprint.getStatus()
    );
    this.ui.setRankedMessage(
      `Dereceli doğrulama tamamlanamadı (${code}). ` +
      "Sonuç korunuyor; tekrar doğrula.",
      "error"
    );

    if (pending) {
      this.levelCompleted = true;
      this.menuOpen = false;
      this.ui.showCompletion({
        ...pending,
        validationPending: true
      });
      return;
    }

    // Sonuç nesnesi oluşmadan hata olduysa server denemesi geçersiz
    // sayılmaz. Kullanıcı aynı slotu yeniden açıp çözebilir.
    this.levelCompleted = false;
    this.menuOpen = true;
    this.ui.showGameMenu(
      this.auth.getCurrentUsername(),
      this.progress.getSavedLevel(),
      this.progress.getCompletedLevels().length
    );
    this.ui.showMenuMode("endless");
    this.ui.showSprintKind("ranked");
    this.ui.updateRankedSprintStatus(
      this.rankedSprint.getStatus()
    );
  }

  async submitPendingRankedResult() {
    const pending = this.rankedSprint.completeCurrentPuzzle();

    this.ui.hideCompletion();
    this.ui.showLoading({
      variant: "channel",
      message: "Çözüm sunucuda doğrulanıyor"
    });

    try {
      try {
        await this.ensureCurrentRankedForfeit();
      } catch (error) {
        console.error("Ranked forfeit sync failed", {
          code: error?.code || "forfeit_failed",
          message: error?.message || String(error),
          attemptId: pending.attemptId,
          slot: pending.slot,
          submissionId: pending.submissionId
        });

        this.ui.setRankedMessage(
          "Puan dışı durumu sunucuya ulaşmadı. " +
          "Hakkın korunuyor; tekrar dene.",
          "error"
        );
        this.ui.showCompletion({
          ...pending,
          validationPending: true
        });
        return;
      }

      const submission = await this.auth.submitRankedReplay(pending);

      if (!submission.ok) {
        const reference = formatRankedFailureReference(submission);

        if (!isPermanentRankedSubmissionFailure(submission)) {
          console.error("Ranked replay will remain pending", {
            code: submission.code || "unknown_error",
            httpStatus: submission.httpStatus || 0,
            requestId: submission.requestId || null,
            error: submission.error || null,
            attemptId: pending.attemptId,
            slot: pending.slot,
            submissionId: pending.submissionId
          });

          this.ui.setRankedMessage(
            `${submission.error || "Doğrulama servisine ulaşılamadı."}` +
            `${reference} Günlük hakkın ve çözümün korunuyor.`,
            "error"
          );
          this.ui.showCompletion({
            ...pending,
            validationPending: true
          });
          return;
        }

        this.rankedSprint.invalidate(
          submission.code || "submission_rejected"
        );
        const rejected = this.rankedSprint.rejectSubmission(
          submission.code || "submission_rejected"
        );
        this.ui.updateRankedSprintStatus(
          this.rankedSprint.getStatus()
        );
        this.ui.setRankedMessage(
          `${submission.error || "Dereceli çözüm reddedildi."}` +
          reference,
          "error"
        );
        this.startVictoryTour(rejected);
        return;
      }

      const accepted = this.rankedSprint.acceptSubmission(submission);
      this.rankedForfeitPromise = null;
      this.rankedForfeitSlot = null;
      this.ui.updateRankedSprintStatus(
        this.rankedSprint.getStatus()
      );
      this.ui.updateRankedPuzzleEligibility?.(
        this.rankedSprint.getStatus()
      );
      this.ui.setRankedMessage("", "info");
      this.ui.updateTimer(accepted.totalTimeSeconds);
      this.startVictoryTour(accepted);
    } finally {
      await this.ui.hideLoading({ minimumMs: 240 });
    }
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
    if (
      this.menuOpen ||
      this.levelCompleted ||
      !this.hasPlayableSession()
    ) {
      return;
    }
    if (this.gameMode === "ranked" && this.rankedSprint.ranked) return;

    if (this.tutorial.active) {
      this.reinforceTutorial();
      return;
    }

    this.audio.init();

    const candidates = Object.values(this.grid)
      .filter((tile) => (
        tile.active &&
        !tile.isSolvedOrientation()
      ));

    if (candidates.length === 0) {
      const status = this.checkConnections();

      if (status.completed) {
        this.completeLevel();
      }

      return;
    }

    let bestChoice = null;

    candidates.forEach((tile) => {
      const target = PuzzleGenerator.getClosestSolvedRotation(tile);
      const oldRotation = tile.rotation;
      const oldVisualRotation = tile.visualRotation;
      const oldTargetVisualRotation = tile.targetVisualRotation;

      tile.rotation = target.rotation;

      const status = PuzzleValidator.inspectGrid(this.grid);
      const score =
        status.connectedCount * 10 -
        status.danglingExitCount;

      tile.rotation = oldRotation;
      tile.visualRotation = oldVisualRotation;
      tile.targetVisualRotation = oldTargetVisualRotation;

      if (
        !bestChoice ||
        score > bestChoice.score ||
        (
          score === bestChoice.score &&
          target.moves < bestChoice.moves
        )
      ) {
        bestChoice = {
          tile,
          rotation: target.rotation,
          moves: target.moves,
          score
        };
      }
    });

    if (!bestChoice) return;

    const bestTile = bestChoice.tile;

    bestTile.setRotation(bestChoice.rotation, { animate: true });
    bestTile.hintGlow = 1;
    this.renderer.invalidateConnections();

    const activeProgress = this.getActiveProgress();

    activeProgress.addHint();
    this.ui.updateStats(activeProgress);

    this.audio.play("hint");
    this.particles.createHint(bestTile, this.hexRadius);

    const status = this.checkConnections();

    if (bestTile.flowerBloomed) {
      this.turtle.moveTo(
        bestTile.q,
        bestTile.r,
        this.hexRadius
      );
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

  async nextLevel() {
    if (this.gameMode === "ranked") {
      if (this.rankedSprint.hasPendingSubmission()) {
        await this.submitPendingRankedResult();
        return;
      }

      if (this.rankedSprint.isComplete()) {
        this.ui.hideCompletion();
        this.menuOpen = true;
        this.ui.showGameMenu(
          this.auth.getCurrentUsername(),
          this.progress.getSavedLevel(),
          this.progress.getCompletedLevels().length
        );
        this.ui.showMenuMode("endless");
        this.ui.updateRankedSprintStatus(
          this.rankedSprint.getStatus()
        );
        return;
      }

      if (!this.rankedSprint.ranked) {
        if (this.rankedSprint.advanceTrainingPuzzle()) {
          this.generateRankedPuzzle();
        }
        return;
      }

      this.ui.showLoading({
        variant: "channel",
        message: "Sıradaki puzzle yayımlanıyor"
      });

      try {
        const nextSlot =
          this.rankedSprint.getStatus().puzzleIndex + 1;
        const released = await this.auth.releaseRankedPuzzle(
          this.rankedSprint.attemptId,
          nextSlot
        );

        if (!released.ok) {
          this.ui.setRankedMessage(
            released.error ||
            "Sıradaki puzzle yayımlanamadı; tekrar dene.",
            "error"
          );
          return;
        }

        this.rankedSprint.acceptReleasedPuzzle(released.puzzle);
        this.rankedForfeitPromise = null;
        this.rankedForfeitSlot = null;
        this.generateRankedPuzzle();
      } finally {
        await this.ui.hideLoading({ minimumMs: 240 });
      }
      return;
    }

    if (this.gameMode === "endless") {
      if (this.endlessSprint.isComplete()) {
        this.ui.hideCompletion();
        this.menuOpen = true;
        this.ui.showGameMenu(
          this.auth.getCurrentUsername(),
          this.progress.getSavedLevel(),
          this.progress.getCompletedLevels().length
        );
        this.ui.updateEndlessSprintMenu(
          this.endlessSprint.getStatus()
        );
        this.ui.showMenuMode("endless");
        return;
      }

      if (this.endlessSprint.advancePuzzle()) {
        this.generateEndlessPuzzle();
        this.endlessSprint.startTimer();
      }
      return;
    }

    this.level += 1;
    this.generateLevel();
    this.progress.startTimer();
  }

  loop(timestamp = performance.now()) {
    if (this.pageHidden) {
      requestAnimationFrame(
        (nextTimestamp) => this.loop(nextTimestamp)
      );
      return;
    }

    this.recordPerformanceFrame(timestamp);

    const profile = this.getQualityProfile();
    const menuFrameInterval = 1000 / profile.menuFps;

    if (
      this.menuOpen &&
      timestamp - this.lastRenderAt < menuFrameInterval
    ) {
      requestAnimationFrame(
        (nextTimestamp) => this.loop(nextTimestamp)
      );
      return;
    }

    const deltaMs = Math.min(
      50,
      Math.max(4, timestamp - this.lastLoopTimestamp)
    );

    this.lastLoopTimestamp = timestamp;
    this.lastRenderAt = timestamp;
    this.updateVictoryTour(timestamp);

    if (
      !this.menuOpen &&
      !this.levelCompleted &&
      this.hasPlayableSession()
    ) {
      const elapsedSeconds =
        this.getActiveProgress().getElapsedSeconds();

      if (elapsedSeconds !== this.lastTimerSecond) {
        this.lastTimerSecond = elapsedSeconds;
        this.ui.updateTimer(elapsedSeconds);
      }
    }

    this.turtle.update();
    this.particles.update(deltaMs);
    this.updateTutorialHighlight();

    this.renderer.render({
      grid: this.grid,
      turtle: this.turtle,
      particleSystem: this.particles,
      hexRadius: this.hexRadius,
      victoryTourActive: this.victoryTour.active
    });

    requestAnimationFrame(
      (nextTimestamp) => this.loop(nextTimestamp)
    );
  }
}
