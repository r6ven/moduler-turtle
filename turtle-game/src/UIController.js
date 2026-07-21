export class UIController {
  constructor() {
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
    this.mainMenuOverlay = document.getElementById("main-menu-overlay");
    this.authCard = document.getElementById("auth-card");
    this.gameMenuCard = document.getElementById("game-menu-card");

    this.usernameInput = document.getElementById("username-input");
    this.passwordInput = document.getElementById("password-input");
    this.loginButton = document.getElementById("login-btn");
    this.registerButton = document.getElementById("register-btn");
    this.authMessage = document.getElementById("auth-message");

    this.currentUserLabel = document.getElementById("current-user-label");
    this.savedLevelLabel = document.getElementById("saved-level-label");
    this.completedLevelLabel = document.getElementById("completed-level-label");

    this.startGameButton = document.getElementById("start-game-btn");
    this.continueGameButton = document.getElementById("continue-game-btn");
    this.levelsButton = document.getElementById("levels-btn");
    this.recordsButton = document.getElementById("records-btn");
    this.restartGameButton = document.getElementById("restart-game-btn");
    this.logoutButton = document.getElementById("logout-btn");

    this.levelSelectOverlay = document.getElementById("level-select-overlay");
    this.levelList = document.getElementById("level-list");
    this.levelSelectBackButton = document.getElementById("level-select-back-btn");

    this.recordsOverlay = document.getElementById("records-overlay");
    this.recordsList = document.getElementById("records-list");
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
    onStartGame,
    onContinueGame,
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

    this.usernameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.passwordInput.focus();
    });

    this.passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") onLogin();
    });

    this.startGameButton.addEventListener("click", onStartGame);
    this.continueGameButton.addEventListener("click", onContinueGame);
    this.levelsButton.addEventListener("click", onOpenLevels);
    this.recordsButton.addEventListener("click", onOpenRecords);
    this.restartGameButton.addEventListener("click", onRequestReset);
    this.logoutButton.addEventListener("click", onLogout);

    this.levelSelectBackButton.addEventListener("click", () => this.hideLevelSelect());
    this.recordsBackButton.addEventListener("click", () => this.hideRecords());

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

  clearPassword() {
    this.passwordInput.value = "";
  }

  setAuthMessage(message, type = "info") {
    this.authMessage.innerText = message;
    this.authMessage.classList.toggle("error", type === "error");
  }

  updateLevel(level) {
    this.levelValue.innerText = String(level);
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

  showGameMenu(username, level, completedCount = 0) {
    this.authCard.classList.add("hidden");
    this.gameMenuCard.classList.remove("hidden");

    this.currentUserLabel.innerText = `Oyuncu · ${username}`;
    this.savedLevelLabel.innerText = `Ada ${level}`;
    this.completedLevelLabel.innerText = `${completedCount} tamamlandı`;
    this.continueGameButton.innerText = `Devam Et · Ada ${level}`;

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

  showRecords(records) {
    const safeRecords = Array.isArray(records) ? records.slice(0, 200) : [];

    if (!safeRecords.length) {
      this.recordsList.innerHTML = `
        <div class="records-empty">
          Henüz rekor yok. İlk bölüm tamamlanınca burada görünecek.
        </div>
      `;
      this.recordsOverlay.classList.add("active");
      return;
    }

    this.recordsList.innerHTML = safeRecords
      .map((player) => {
        const progressCandidate =
          player?.best_by_level || player?.bestByLevel || {};
        const bestByLevel =
          progressCandidate &&
          typeof progressCandidate === "object" &&
          !Array.isArray(progressCandidate)
            ? progressCandidate
            : {};
        const username = this.escapeHtml(
          String(player?.username || "Oyuncu").slice(0, 48)
        );
        const levels = Object.keys(bestByLevel)
          .map((level) => Number(level))
          .filter(
            (level) =>
              Number.isInteger(level) && level >= 1 && level <= 10000
          )
          .sort((a, b) => a - b)
          .slice(0, 200);

        if (!levels.length) {
          return `
            <div class="record-player">
              <div class="record-player-title">${username}</div>
              <div class="records-empty">Henüz tamamlanan bölüm yok.</div>
            </div>
          `;
        }

        const rows = levels
          .map((level) => {
            const record = bestByLevel[level] || bestByLevel[String(level)] || {};
            const starfish = this.renderStarfishRating(record.stars || 1);
            const moves = this.formatRecordInteger(record.bestMoves);
            const time = record.bestTimeSeconds == null
              ? "-"
              : this.formatDuration(record.bestTimeSeconds);

            return `
              <div class="record-row">
                <div>Ada ${level}</div>
                <div>${starfish}</div>
                <div>${moves} hamle</div>
                <div>${time}</div>
              </div>
            `;
          })
          .join("");

        return `
          <div class="record-player">
            <div class="record-player-title">${username}</div>
            <div class="record-row header">
              <div>Bölüm</div>
              <div>Deniz yıldızı</div>
              <div>Hamle</div>
              <div>Süre</div>
            </div>
            ${rows}
          </div>
        `;
      })
      .join("");

    this.recordsOverlay.classList.add("active");
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

    if (minimumClear && earnedStars === 3) {
      this.completeTitleText.innerText = "Harika bir uyum!";
    } else if (earnedStars === 3) {
      this.completeTitleText.innerText = "Profesyonel!";
    } else {
      this.completeTitleText.innerText = "Tebrikler!";
    }

    this.starResult.setAttribute(
      "aria-label",
      `${earnedStars} deniz yıldızı kazanıldı`
    );

    this.completeText.innerText =
      `${result.moves} hamle · ${this.formatDuration(result.timeSeconds)} · ${result.hintsUsed} ipucu`;

    this.completeGoal.innerText =
      `En kısa çözüm ${result.minimumMoves} · 3 deniz yıldızı hedefi ${result.targetMoves} hamle`;

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
