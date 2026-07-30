import { LoadingScreen } from "./LoadingScreen.js";

export class UIController {
  constructor() {
    this.loadingScreen = new LoadingScreen(
      document.getElementById("loading-overlay"),
      document.getElementById("loading-message")
    );
    this.levelLabel = document.getElementById("level-label");
    this.levelValue = document.getElementById("lvl-val");
    this.moveValue = document.getElementById("move-val");
    this.hintValue = document.getElementById("hint-val");
    this.timeValue = document.getElementById("time-val");

    this.overlay = document.getElementById("completion-overlay");
    this.completeTitleText = document.getElementById("completion-title-text");
    this.completeText = document.getElementById("complete-text");
    this.completeGoal = document.getElementById("complete-goal");
    this.starResult = document.getElementById("star-result");
    this.starSlots = Array.from(
      this.starResult.querySelectorAll("[data-star-slot]")
    );
    this.completionBeach = this.overlay.querySelector(".completion-beach");
    this.waveNoise = this.overlay.querySelector("[data-wave-noise]");
    this.completionReadyTimer = null;

    this.nextButton = document.getElementById("next-lvl-btn");
    this.hintButton = document.getElementById("hint-btn");
    this.soundToggle = document.getElementById("sound-toggle");
    this.menuButton = document.getElementById("menu-btn");
    this.fullscreenButton = document.getElementById("fullscreen-btn");
    this.tutorialCallout = document.getElementById("tutorial-callout");
    this.rankedScoreCallout = document.getElementById("ranked-score-callout");
    this.mainMenuOverlay = document.getElementById("main-menu-overlay");
    this.authCard = document.getElementById("auth-card");
    this.gameMenuCard = document.getElementById("game-menu-card");
    this.menuModeTabs = Array.from(
      document.querySelectorAll("[data-menu-mode]")
    );
    this.menuModePanels = Array.from(
      document.querySelectorAll("[data-mode-panel]")
    );
    this.footerDivider = this.gameMenuCard.querySelector(
      ".storybook-footer-divider"
    );

    this.usernameInput = document.getElementById("username-input");
    this.passwordInput = document.getElementById("password-input");
    this.loginButton = document.getElementById("login-btn");
    this.registerButton = document.getElementById("register-btn");
    this.authMessage = document.getElementById("auth-message");

    this.currentUserLabel = document.getElementById("current-user-label");
    this.savedLevelLabel = document.getElementById("saved-level-label");
    this.completedLevelLabel = document.getElementById("completed-level-label");

    this.continueGameButton = document.getElementById("continue-game-btn");
    this.levelsButton = document.getElementById("levels-btn");
    this.recordsButton = document.getElementById("records-btn");
    this.restartGameButton = document.getElementById("restart-game-btn");
    this.logoutButton = document.getElementById("logout-btn");
    this.endlessModePanel = document.getElementById("endless-mode-panel");
    this.startEndlessButton = document.getElementById("start-endless-btn");
    this.endlessSprintStatus = document.getElementById("endless-sprint-status");
    this.sprintKindButtons = Array.from(document.querySelectorAll("[data-sprint-kind]"));
    this.trainingSprintPanel = document.getElementById("training-sprint-panel");
    this.rankedSprintPanel = document.getElementById("ranked-sprint-panel");
    this.startRankedButton = document.getElementById("start-ranked-btn");
    this.rankedSprintStatus = document.getElementById("ranked-sprint-status");
    this.rankedMessage = document.getElementById("ranked-message");
    this.rankedRulesOverlay = document.getElementById("ranked-rules-overlay");
    this.confirmRankedButton = document.getElementById("confirm-ranked-btn");
    this.cancelRankedButton = document.getElementById("cancel-ranked-btn");

    this.levelSelectOverlay = document.getElementById("level-select-overlay");
    this.levelList = document.getElementById("level-list");
    this.levelSelectBackButton = document.getElementById("level-select-back-btn");

    this.recordsOverlay = document.getElementById("records-overlay");
    this.recordsList = document.getElementById("records-list");
    this.recordsDescription = document.getElementById("records-description");
    this.recordModeTabs = Array.from(
      document.querySelectorAll("[data-record-mode]")
    );
    this.activeRecordMode = "story";
    this.recordData = {
      storyRecords: [],
      endlessRecords: [],
      rankedDailyRecords: [],
      rankedMonthlyRecords: [],
      rankedProvisional: true,
      dailyRecords: [],
      storyMessage: ""
    };
    this.recordsBackButton = document.getElementById("records-back-btn");

    this.resetConfirmOverlay = document.getElementById("reset-confirm-overlay");
    this.confirmResetButton = document.getElementById("confirm-reset-btn");
    this.cancelResetButton = document.getElementById("cancel-reset-btn");
  }

  bind({
    onNextLevel,
    onHint,
    onToggleSound,
    onLogin,
    onRegister,
    onContinueGame,
    onStartEndless,
    onRequestRanked,
    onConfirmRanked,
    onOpenLevels,
    onOpenRecords,
    onSelectLevel,
    onRequestReset,
    onConfirmReset,
    onLogout,
    onOpenMenu,
    onToggleFullscreen
  }) {
    this.nextButton.addEventListener("click", onNextLevel);
    this.hintButton.addEventListener("click", onHint);
    this.soundToggle.addEventListener("click", onToggleSound);
    this.menuButton.addEventListener("click", onOpenMenu);
    this.fullscreenButton.addEventListener("click", onToggleFullscreen);
    this.loginButton.addEventListener("click", onLogin);
    this.registerButton.addEventListener("click", onRegister);

    this.menuModeTabs.forEach((button) => {
      button.addEventListener("click", () => {
        this.showMenuMode(button.dataset.menuMode);
      });
    });

    this.usernameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.passwordInput.focus();
    });

    this.passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") onLogin();
    });

    this.continueGameButton.addEventListener("click", onContinueGame);
    this.startEndlessButton.addEventListener("click", () => {
      onStartEndless(this.getEndlessSettings());
    });
    this.startRankedButton.addEventListener("click", onRequestRanked);
    this.confirmRankedButton.addEventListener("click", onConfirmRanked);
    this.cancelRankedButton.addEventListener("click", () => this.hideRankedRules());
    this.sprintKindButtons.forEach((button) => {
      button.addEventListener("click", () => this.showSprintKind(button.dataset.sprintKind));
    });
    this.levelsButton.addEventListener("click", onOpenLevels);
    this.recordsButton.addEventListener("click", onOpenRecords);
    this.restartGameButton.addEventListener("click", onRequestReset);
    this.logoutButton.addEventListener("click", onLogout);

    this.levelSelectBackButton.addEventListener("click", () => this.hideLevelSelect());
    this.recordsBackButton.addEventListener("click", () => this.hideRecords());
    this.recordModeTabs.forEach((button) => {
      button.addEventListener("click", () => {
        this.showRecordMode(button.dataset.recordMode);
      });
    });

    this.levelList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-level]");

      if (!button) return;

      onSelectLevel(Number(button.dataset.level));
    });

    this.confirmResetButton.addEventListener("click", onConfirmReset);
    this.cancelResetButton.addEventListener("click", () => this.hideResetConfirm());
  }

  getAuthCredentials() {
    return {
      username: this.usernameInput.value,
      password: this.passwordInput.value
    };
  }


  showSprintKind(kind = "training") {
    const ranked = kind === "ranked";
    this.sprintKindButtons.forEach((button) => {
      const active = button.dataset.sprintKind === (ranked ? "ranked" : "training");
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    this.trainingSprintPanel.classList.toggle("hidden", ranked);
    this.rankedSprintPanel.classList.toggle("hidden", !ranked);
  }

  showRankedRules() {
    this.rankedRulesOverlay.classList.add("active");
  }

  hideRankedRules() {
    this.rankedRulesOverlay.classList.remove("active");
  }

  setRankedMessage(message = "", type = "info") {
    this.rankedMessage.innerText = String(message || "");
    this.rankedMessage.classList.toggle("error", type === "error");
  }

  updateRankedSprintStatus(status = {}) {
    if (!status.active && !status.complete) return;
    this.startRankedButton.innerText = status.active && !status.complete
      ? "SER\u0130YE D\u00d6N"
      : "DERECEL\u0130 KURALLARI";
    const validity = status.valid ? "Dereceli" : "Derecesiz";
    const slotNote = status.valid && status.scoreEligible === false
      ? " - Bu puzzle puan d\u0131\u015f\u0131"
      : status.invalidReason
        ? ` - ${status.invalidReason}`
        : "";
    this.rankedSprintStatus.innerHTML = `
      <strong>${validity} - Puzzle ${status.puzzleIndex}/${status.sprintLength}</strong>
      <span>${status.totalMoves || 0} hamle - ${this.formatDuration(status.totalTimeSeconds || 0)}${slotNote}</span>
    `;
  }

  updateRankedPuzzleEligibility(status = {}) {
    if (!this.rankedScoreCallout) return;
    const visible = Boolean(
      status.active &&
      status.ranked &&
      !status.complete &&
      status.scoreEligible === false
    );
    this.rankedScoreCallout.classList.toggle("active", visible);
    this.rankedScoreCallout.setAttribute("aria-hidden", String(!visible));
  }

  setHintEnabled(enabled, reason = "") {
    this.hintButton.disabled = !enabled;
    this.hintButton.title = enabled ? "" : reason;
    this.hintButton.setAttribute("aria-disabled", String(!enabled));
  }

  getEndlessSettings() {
    const board = this.endlessModePanel.querySelector(
      'input[name="endless-board"]:checked'
    );
    const difficulty = this.endlessModePanel.querySelector(
      'input[name="endless-difficulty"]:checked'
    );

    return {
      boardId: board?.value || "classic",
      difficultyId: difficulty?.value || "balanced"
    };
  }

  updateEndlessSprintMenu(status = {}) {
    const running = Boolean(status.active && !status.complete);

    this.endlessModePanel.classList.toggle("is-running", running);
    this.startEndlessButton.innerText = running
      ? "SPRINT’E DÖN"
      : "SPRINT’İ BAŞLAT";

    if (running) {
      this.endlessSprintStatus.innerHTML = `
        <strong>Puzzle ${status.puzzleIndex}/${status.sprintLength}</strong>
        <span>${status.board.label} · ${status.difficulty.label} · ${status.totalMoves} hamle · ${this.formatDuration(status.totalTimeSeconds)}</span>
      `;
      return;
    }

    if (status.active && status.complete) {
      this.startEndlessButton.innerText = "YENİ SPRINT";
      this.endlessSprintStatus.innerHTML = `
        <strong>Sprint tamamlandı</strong>
        <span>${status.board.label} · ${status.difficulty.label} · ${status.totalMoves} hamle · ${this.formatDuration(status.totalTimeSeconds)}</span>
      `;
      return;
    }

    this.endlessSprintStatus.innerHTML = `
      <strong>5 Puzzle Sprint</strong>
      <span>Toplam süre ve hamle tek seride ölçülür.</span>
    `;
  }

  clearPassword() {
    this.passwordInput.value = "";
  }

  showLoading(options = {}) {
    this.loadingScreen.show(options);
  }

  hideLoading(options = {}) {
    return this.loadingScreen.hide(options);
  }

  setAuthMessage(message, type = "info") {
    this.authMessage.innerText = message;
    this.authMessage.classList.toggle("error", type === "error");
  }

  updateLevel(level) {
    this.levelLabel.innerText = "🐢 Ada Seviyesi:";
    this.levelValue.innerText = String(level);
  }

  updateSprintHeader(index, total) {
    this.levelLabel.innerText = "∞ Sprint:";
    this.levelValue.innerText = `${index}/${total}`;
  }

  updateStats({ moves, hintsUsed }) {
    this.moveValue.innerText = String(moves);
    this.hintValue.innerText = String(hintsUsed);
  }

  updateTimer(seconds) {
    this.timeValue.innerText = this.formatDuration(seconds);
  }

  updateSound(enabled) {
    this.soundToggle.innerText = enabled ? "🎵 Ses: Açık" : "🔇 Ses: Kapalı";
  }

  updateFullscreen(isFullscreen) {
    this.fullscreenButton.classList.toggle("active", isFullscreen);
    this.fullscreenButton.innerText = isFullscreen ? "⇲" : "⛶";
    this.fullscreenButton.setAttribute(
      "aria-label",
      isFullscreen ? "Tam ekrandan çık" : "Tam ekran"
    );
  }

  showTutorial() {
    this.tutorialCallout.classList.add("active");
  }

  hideTutorial() {
    this.tutorialCallout.classList.remove("active", "nudge");
  }

  pulseTutorial() {
    this.showTutorial();
    this.tutorialCallout.classList.remove("nudge");

    window.requestAnimationFrame(() => {
      if (this.tutorialCallout.classList.contains("active")) {
        this.tutorialCallout.classList.add("nudge");
      }
    });
  }

  showMainMenu() {
    this.mainMenuOverlay.classList.add("active");
    document.body.classList.add("menu-open");
  }

  hideMainMenu() {
    this.mainMenuOverlay.classList.remove("active");
    document.body.classList.remove("menu-open");
  }

  showAuthMenu(message = "") {
    this.authCard.classList.remove("hidden");
    this.gameMenuCard.classList.add("hidden");
    this.hideLevelSelect();
    this.hideRecords();
    this.showMainMenu();
    this.setAuthMessage(message);
    this.usernameInput.focus();
  }

  showMenuMode(mode = "story") {
    const supportedModes = new Set(["story", "endless", "daily"]);
    const activeMode = supportedModes.has(mode) ? mode : "story";
    const storyActive = activeMode === "story";

    this.menuModeTabs.forEach((button) => {
      const active = button.dataset.menuMode === activeMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    this.menuModePanels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.modePanel !== activeMode);
    });

    this.gameMenuCard.dataset.activeMode = activeMode;
    this.gameMenuCard.classList.toggle("future-mode-active", !storyActive);
    this.restartGameButton.classList.toggle("hidden", !storyActive);
    this.footerDivider.classList.toggle("hidden", !storyActive);
  }
  showGameMenu(username, level, completedCount = 0) {
    this.authCard.classList.add("hidden");
    this.gameMenuCard.classList.remove("hidden");

    this.currentUserLabel.innerText = String(username || "Oyuncu").toUpperCase();
    this.savedLevelLabel.innerText = `ADA ${level}`;
    this.completedLevelLabel.innerText = `${completedCount} bölüm tamamlandı`;
    this.continueGameButton.innerText = "DEVAM ET";
    this.continueGameButton.setAttribute(
      "aria-label",
      `Devam et, Ada ${level}`
    );

    this.showMenuMode("story");
    this.showSprintKind("training");
    this.setHintEnabled(true);

    this.showMainMenu();
  }

  showLevelSelect(levels) {
    const safeLevels = Array.isArray(levels)
      ? levels
          .filter((item) => {
            const level = Number(item?.level);
            return Number.isInteger(level) && level >= 1 && level <= 10000;
          })
          .slice(0, 200)
      : [];

    if (!safeLevels.length) {
      this.levelList.innerHTML = `
        <div class="level-empty">
          Henüz tamamlanmış bölüm yok. İlk adayı bitirince burada görünecek.
        </div>
      `;
    } else {
      this.levelList.innerHTML = safeLevels
        .map((item) => {
          const level = Number(item.level);
          const starfish = this.renderStarfishRating(item.stars || 1);
          const bestMoves = this.formatRecordInteger(item.bestMoves);
          const bestTime = item.bestTimeSeconds == null
            ? "-"
            : this.formatDuration(item.bestTimeSeconds);

          return `
            <button class="level-item" data-level="${level}">
              <div class="level-number">Ada ${level}</div>
              <div class="level-stars">${starfish}</div>
              <div class="level-moves">Hamle: ${bestMoves}</div>
              <div class="level-moves">Süre: ${bestTime}</div>
            </button>
          `;
        })
        .join("");
    }

    this.levelSelectOverlay.classList.add("active");
  }

  hideLevelSelect() {
    this.levelSelectOverlay.classList.remove("active");
  }

  showRecords({
    storyRecords = [],
    endlessRecords = [],
    rankedDailyRecords = [],
    rankedMonthlyRecords = [],
    rankedProvisional = true,
    dailyRecords = [],
    storyMessage = ""
  } = {}) {
    this.recordData = {
      storyRecords: Array.isArray(storyRecords) ? storyRecords : [],
      endlessRecords: Array.isArray(endlessRecords) ? endlessRecords : [],
      rankedDailyRecords: Array.isArray(rankedDailyRecords) ? rankedDailyRecords : [],
      rankedMonthlyRecords: Array.isArray(rankedMonthlyRecords) ? rankedMonthlyRecords : [],
      rankedProvisional: Boolean(rankedProvisional),
      dailyRecords: Array.isArray(dailyRecords) ? dailyRecords : [],
      storyMessage: String(storyMessage || "")
    };

    const nextMode = this.recordsOverlay.classList.contains("active")
      ? this.activeRecordMode
      : "story";

    this.showRecordMode(nextMode);
    this.recordsOverlay.classList.add("active");
  }

  showRecordMode(mode = "story") {
    const supportedModes = new Set(["story", "endless", "daily"]);
    const activeMode = supportedModes.has(mode) ? mode : "story";

    this.activeRecordMode = activeMode;

    this.recordModeTabs.forEach((button) => {
      const active = button.dataset.recordMode === activeMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    if (activeMode === "story") {
      this.recordsDescription.innerText =
        "Hikâye sonuçları casual ve istemci bildirimlidir; her bölümün en iyi sonucu gösterilir.";
      this.renderStoryRecordWinners();
      return;
    }

    if (activeMode === "endless") {
      this.recordsDescription.innerText =
        "Her tahta ve zorluk serisinin en iyi beşli Sprint sonucu.";
      this.renderEndlessRecordWinners();
      return;
    }

    this.recordsDescription.innerText =
      "Günün ortak serisindeki en iyi sonuçlar.";
    this.renderDailyRecordWinners();
  }

  renderStoryRecordWinners() {
    if (this.recordData.storyMessage) {
      this.recordsList.innerHTML = `
        <div class="records-empty">${this.escapeHtml(this.recordData.storyMessage)}</div>
      `;
      return;
    }

    const winners = new Map();

    this.recordData.storyRecords.forEach((player) => {
      if (Number.isInteger(Number(player?.level))) {
        const candidate = {
          level: Number(player.level),
          username: String(player.username || "Oyuncu").slice(0, 48),
          stars: Math.max(0, Math.min(3, Number(player.stars) || 0)),
          moves: Math.max(0, Number(player.moves) || 0),
          timeSeconds: Math.max(0, Number(player.time_seconds ?? player.timeSeconds) || 0)
        };
        const current = winners.get(candidate.level);
        if (!current || this.compareStoryRecords(candidate, current) < 0) winners.set(candidate.level, candidate);
        return;
      }

      const progressCandidate =
        player?.best_by_level || player?.bestByLevel || {};
      const bestByLevel = progressCandidate &&
        typeof progressCandidate === "object" &&
        !Array.isArray(progressCandidate)
          ? progressCandidate
          : {};
      const username = String(player?.username || "Oyuncu").slice(0, 48);

      Object.entries(bestByLevel).forEach(([rawLevel, rawRecord]) => {
        const level = Number(rawLevel);

        if (!Number.isInteger(level) || level < 1 || level > 10000) return;

        const record = rawRecord && typeof rawRecord === "object"
          ? rawRecord
          : {};
        const candidate = {
          level,
          username,
          stars: Math.max(0, Math.min(3, Number(record.stars) || 0)),
          moves: record.bestMoves != null && Number.isFinite(Number(record.bestMoves))
            ? Math.max(0, Math.floor(Number(record.bestMoves)))
            : Number.POSITIVE_INFINITY,
          timeSeconds: record.bestTimeSeconds != null && Number.isFinite(Number(record.bestTimeSeconds))
            ? Math.max(0, Math.floor(Number(record.bestTimeSeconds)))
            : Number.POSITIVE_INFINITY
        };
        const current = winners.get(level);

        if (!current || this.compareStoryRecords(candidate, current) < 0) {
          winners.set(level, candidate);
        }
      });
    });

    const rows = Array.from(winners.values())
      .sort((first, second) => first.level - second.level);

    if (!rows.length) {
      this.recordsList.innerHTML = `
        <div class="records-empty">Henüz tamamlanan hikâye bölümü yok.</div>
      `;
      return;
    }

    this.recordsList.innerHTML = `
      <div class="record-winner-row header">
        <div>Bölüm</div><div>Oyuncu</div><div>Yıldız</div><div>Hamle</div><div>Süre</div>
      </div>
      ${rows.map((record) => `
        <div class="record-winner-row">
          <div>Ada ${record.level}</div>
          <div>${this.escapeHtml(record.username)}</div>
          <div>${this.renderStarfishRating(record.stars)}</div>
          <div>${this.formatRecordInteger(record.moves)}</div>
          <div>${Number.isFinite(record.timeSeconds) ? this.formatDuration(record.timeSeconds) : "-"}</div>
        </div>
      `).join("")}
    `;
  }

  compareStoryRecords(first, second) {
    return (
      second.stars - first.stars ||
      first.moves - second.moves ||
      first.timeSeconds - second.timeSeconds ||
      first.username.localeCompare(second.username, "tr")
    );
  }

  renderEndlessRecordWinners() {
    const training = this.recordData.endlessRecords;
    const daily = this.recordData.rankedDailyRecords;
    const monthly = this.recordData.rankedMonthlyRecords;
    const trainingRows = training.length ? training.map((record) => `
      <div class="record-sprint-row"><div><strong>${this.escapeHtml(record.boardLabel)}</strong><small>${this.escapeHtml(record.difficultyLabel)} - v${this.formatRecordInteger(record.generatorVersion)}</small></div><div>${this.escapeHtml(record.username)}</div><div>${this.formatRecordInteger(record.totalMoves)}</div><div>${this.formatDuration(record.totalTimeSeconds)}</div></div>
    `).join("") : '<div class="records-empty">Hen\u00fcz Antrenman Sprint kayd\u0131 yok.</div>';
    const rankedRows = daily.length ? daily.map((record) => `
      <div class="record-sprint-row"><div><strong>Bugun${record.provisional ? " *" : ""}</strong><small>${this.formatRecordInteger(record.weighted_points)} puan - ${this.formatRecordInteger(record.stars)} yildiz</small></div><div>${this.escapeHtml(record.username)}</div><div>${this.formatRecordInteger(record.moves)}</div><div>${this.formatDuration(Math.floor((record.elapsed_ms || 0) / 1000))}</div></div>
    `).join("") : '<div class="records-empty">Bug\u00fcn tamamlanm\u0131\u015f dereceli ko\u015fu yok.</div>';
    const monthlyRows = monthly.length ? monthly.map((record) => `
      <div class="record-sprint-row"><div><strong>${this.formatRecordInteger(record.weighted_points)} puan</strong><small>${this.formatRecordInteger(record.completed_days)} g\u00fcn - ${this.formatRecordInteger(record.stars)} yildiz</small></div><div>${this.escapeHtml(record.username)}</div><div>${this.formatRecordInteger(record.moves)}</div><div>${this.formatDuration(Math.floor((record.elapsed_ms || 0) / 1000))}</div></div>
    `).join("") : '<div class="records-empty">Bu ay kesinle\u015fmi\u015f dereceli sonu\u00e7 yok.</div>';

    this.recordsList.innerHTML = `
      <h3>Dereceli - G\u00fcnl\u00fck ${this.recordData.rankedProvisional ? "(ge\u00e7ici)" : ""}</h3>
      <div class="record-sprint-row header"><div>Seri</div><div>Oyuncu</div><div>Hamle</div><div>S\u00fcre</div></div>${rankedRows}
      <h3>Dereceli - Ayl\u0131k</h3>${monthlyRows}
      <h3>Antrenman - Ki\u015fisel</h3>${trainingRows}
    `;
  }

  renderDailyRecordWinners() {
    const records = this.recordData.dailyRecords;

    if (!records.length) {
      this.recordsList.innerHTML = `
        <div class="records-empty">Günlük Puzzle açıldığında günlük rekorlar burada görünecek.</div>
      `;
      return;
    }

    this.recordsList.innerHTML = records.map((record) => `
      <div class="record-sprint-row">
        <div>${this.escapeHtml(record.dateLabel || record.date || "Günlük")}</div>
        <div>${this.escapeHtml(record.username || "Oyuncu")}</div>
        <div>${this.formatRecordInteger(record.totalMoves)}</div>
        <div>${this.formatDuration(record.totalTimeSeconds)}</div>
      </div>
    `).join("");
  }
  hideRecords() {
    this.recordsOverlay.classList.remove("active");
  }

  showResetConfirm() {
    this.resetConfirmOverlay.classList.add("active");
  }

  hideResetConfirm() {
    this.resetConfirmOverlay.classList.remove("active");
  }

  hideCompletion() {
    if (this.completionReadyTimer) {
      window.clearTimeout(this.completionReadyTimer);
      this.completionReadyTimer = null;
    }

    this.overlay.classList.remove("is-ready");
    this.overlay.classList.remove("minimum-clear");
    this.overlay.classList.remove("active");
    this.nextButton.disabled = false;

    this.starSlots.forEach((slot) => {
      slot.classList.remove("earned");
    });
  }

  showCompletion(result) {
    const earnedStars = Math.max(0, Math.min(3, Number(result.stars) || 0));
    const minimumClear = Number(result.moves) === Number(result.minimumMoves);

    if (this.completionReadyTimer) {
      window.clearTimeout(this.completionReadyTimer);
    }

    this.starSlots.forEach((slot, index) => {
      slot.classList.toggle("earned", index < earnedStars);
    });

    this.configureCompletionWave();
    this.overlay.classList.toggle("minimum-clear", minimumClear);

    if (result.mode === "endless") {
      this.completeTitleText.innerText = result.sprintComplete
        ? "Sprint tamamlandı!"
        : `Sprint ${result.sprintIndex}/${result.sprintLength}`;
      this.completeText.innerText = result.sprintComplete
        ? `${result.totalMoves} toplam hamle · ${this.formatDuration(result.totalTimeSeconds)} · ${result.totalHints} ipucu`
        : `${result.moves} hamle · ${this.formatDuration(result.timeSeconds)} · ${result.hintsUsed} ipucu`;
      this.completeGoal.innerText = result.sprintComplete
        ? `${result.boardLabel} tahta · ${result.difficultyLabel} zorluk · 5 puzzle`
        : `Seri toplamı ${result.totalMoves} hamle · ${this.formatDuration(result.totalTimeSeconds)}`;
      this.nextButton.innerText = result.sprintComplete
        ? "SPRINT SONUCUNA DÖN"
        : "SONRAKİ PUZZLE";
    } else if (result.mode === "ranked") {
      if (result.validationPending) {
        this.completeTitleText.innerText = "Doğrulama bekliyor";
        this.completeText.innerText =
          `${result.moves} hamlelik replay henüz sunucuya ulaşmadı.`;
        this.completeGoal.innerText =
          "Aynı gönderim kimliğiyle tekrar denendiğinde günlük hakkın ve süren korunur.";
        this.nextButton.innerText = "DOĞRULAMAYI TEKRARLA";
      } else {
        const rankedLabel = result.ranked ? "Dereceli" : "Antrenman tekrarı";
        this.completeTitleText.innerText = result.sprintComplete
          ? `${rankedLabel} seri tamamlandı`
          : `${rankedLabel} ${result.slot}/5`;
        this.completeText.innerText =
          `${result.moves} hamle - ${this.formatDuration(result.timeSeconds)} - ${earnedStars} yıldız`;
        this.completeGoal.innerText = result.ranked
          ? result.scoreEligible === false
            ? "Bu puzzle puan d\u0131\u015f\u0131 kald\u0131. Sonraki puzzle dereceli ve puanl\u0131 devam edecek."
            : result.valid === false
              ? "Ko\u015fu do\u011frulama kurallar\u0131 nedeniyle derecesiz kald\u0131."
              : "Puan ge\u00e7icidir; UTC g\u00fcn\u00fc kapand\u0131\u011f\u0131nda y\u00fczdelik dilim kesinle\u015fir."
          : "Bu tekrar dereceli tabloya g\u00f6nderilmez.";
        this.nextButton.innerText = result.sprintComplete
          ? "SONUÇLARA DÖN"
          : "SONRAKİ PUZZLE";
      }
    } else {
      if (minimumClear && earnedStars === 3) {
        this.completeTitleText.innerText = "Harika bir uyum!";
      } else if (earnedStars === 3) {
        this.completeTitleText.innerText = "Profesyonel!";
      } else {
        this.completeTitleText.innerText = "Tebrikler!";
      }

      this.completeText.innerText =
        `${result.moves} hamle · ${this.formatDuration(result.timeSeconds)} · ${result.hintsUsed} ipucu`;
      this.completeGoal.innerText =
        `En kısa çözüm ${result.minimumMoves} · 3 deniz yıldızı hedefi ${result.targetMoves} hamle`;
      this.nextButton.innerText = "Sonraki Adaya Yüz";
    }

    this.starResult.setAttribute(
      "aria-label",
      `${earnedStars} deniz yıldızı kazanıldı`
    );

    this.nextButton.disabled = true;
    this.overlay.classList.remove("active", "is-ready");
    void this.overlay.offsetWidth;
    this.overlay.classList.add("active");

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches;
    const readyDelay = reducedMotion ? 120 : 4480;

    this.completionReadyTimer = window.setTimeout(() => {
      this.nextButton.disabled = false;
      this.overlay.classList.add("is-ready");
      this.completionReadyTimer = null;
    }, readyDelay);
  }

  configureCompletionWave() {
    const randomBetween = (min, max) => min + Math.random() * (max - min);
    const waveTilt = randomBetween(-1.05, 0.9);
    const foamDrift = randomBetween(-18, 18);
    const runoffSkew = randomBetween(-2.2, 2.2);

    this.completionBeach.style.setProperty(
      "--wave-surge",
      `${randomBetween(56, 63).toFixed(2)}%`
    );
    this.completionBeach.style.setProperty(
      "--wave-tilt",
      `${waveTilt.toFixed(2)}deg`
    );
    this.completionBeach.style.setProperty(
      "--wave-counter-tilt",
      `${(-waveTilt * 0.45).toFixed(2)}deg`
    );
    this.completionBeach.style.setProperty(
      "--foam-drift",
      `${foamDrift.toFixed(1)}px`
    );
    this.completionBeach.style.setProperty(
      "--foam-drift-reverse",
      `${(-foamDrift * 0.4).toFixed(1)}px`
    );
    this.completionBeach.style.setProperty(
      "--runoff-skew",
      `${runoffSkew.toFixed(2)}deg`
    );
    this.completionBeach.style.setProperty(
      "--runoff-counter-skew",
      `${(-runoffSkew * 0.4).toFixed(2)}deg`
    );

    if (this.waveNoise) {
      this.waveNoise.setAttribute(
        "seed",
        String(Math.floor(randomBetween(2, 97)))
      );
    }
  }

  renderStarfishRating(count) {
    const safeCount = Math.max(0, Math.min(3, Number(count) || 0));
    const starfish = Array.from(
      { length: safeCount },
      () => '<i class="starfish" aria-hidden="true"></i>'
    ).join("");

    return `
      <span class="starfish-rating" aria-label="${safeCount} deniz yıldızı">
        ${starfish}
      </span>
    `;
  }

  escapeHtml(value) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) => entities[character]
    );
  }

  formatRecordInteger(value) {
    if (value == null) return "-";

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) return "-";

    return String(Math.min(999999, Math.floor(number)));
  }

  formatDuration(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
}
