export class UIController {
  constructor() {
    this.levelValue = document.getElementById("lvl-val");
    this.moveValue = document.getElementById("move-val");
    this.hintValue = document.getElementById("hint-val");
    this.timeValue = document.getElementById("time-val");

    this.overlay = document.getElementById("completion-overlay");
    this.completeText = document.getElementById("complete-text");
    this.starResult = document.getElementById("star-result");

    this.nextButton = document.getElementById("next-lvl-btn");
    this.hintButton = document.getElementById("hint-btn");
    this.soundToggle = document.getElementById("sound-toggle");
    this.menuButton = document.getElementById("menu-btn");

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
    onOpenMenu
  }) {
    this.nextButton.addEventListener("click", onNextLevel);
    this.hintButton.addEventListener("click", onHint);
    this.soundToggle.addEventListener("click", onToggleSound);
    this.menuButton.addEventListener("click", onOpenMenu);

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

  showMainMenu() {
    this.mainMenuOverlay.classList.add("active");
  }

  hideMainMenu() {
    this.mainMenuOverlay.classList.remove("active");
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

    this.currentUserLabel.innerText = `Oyuncu: ${username}`;
    this.savedLevelLabel.innerText = `Kayıtlı seviye: ${level}`;
    this.completedLevelLabel.innerText = `Tamamlanan bölüm: ${completedCount}`;
    this.continueGameButton.innerText = `Devam Et: Seviye ${level}`;

    this.showMainMenu();
  }

  showLevelSelect(levels) {
    if (!levels.length) {
      this.levelList.innerHTML = `
        <div class="level-empty">
          Henüz tamamlanmış bölüm yok. İlk adayı bitirince burada görünecek.
        </div>
      `;
    } else {
      this.levelList.innerHTML = levels
        .map((item) => {
          const stars = "⭐".repeat(item.stars || 1);
          const bestMoves = item.bestMoves == null ? "-" : item.bestMoves;
          const bestTime = item.bestTimeSeconds == null
            ? "-"
            : this.formatDuration(item.bestTimeSeconds);

          return `
            <button class="level-item" data-level="${item.level}">
              <div class="level-number">Ada ${item.level}</div>
              <div class="level-stars">${stars}</div>
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
    if (!records.length) {
      this.recordsList.innerHTML = `
        <div class="records-empty">
          Henüz rekor yok. İlk bölüm tamamlanınca burada görünecek.
        </div>
      `;
      this.recordsOverlay.classList.add("active");
      return;
    }

    this.recordsList.innerHTML = records
      .map((player) => {
        const bestByLevel = player.best_by_level || player.bestByLevel || {};
        const levels = Object.keys(bestByLevel)
          .map((level) => Number(level))
          .filter((level) => Number.isFinite(level))
          .sort((a, b) => a - b);

        if (!levels.length) {
          return `
            <div class="record-player">
              <div class="record-player-title">${player.username}</div>
              <div class="records-empty">Henüz tamamlanan bölüm yok.</div>
            </div>
          `;
        }

        const rows = levels
          .map((level) => {
            const record = bestByLevel[level] || bestByLevel[String(level)] || {};
            const stars = "⭐".repeat(record.stars || 1);
            const moves = record.bestMoves ?? "-";
            const time = record.bestTimeSeconds == null
              ? "-"
              : this.formatDuration(record.bestTimeSeconds);

            return `
              <div class="record-row">
                <div>Ada ${level}</div>
                <div>${stars}</div>
                <div>${moves} hamle</div>
                <div>${time}</div>
              </div>
            `;
          })
          .join("");

        return `
          <div class="record-player">
            <div class="record-player-title">${player.username}</div>
            <div class="record-row header">
              <div>Bölüm</div>
              <div>Yıldız</div>
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
    this.overlay.classList.remove("active");
  }

  showCompletion(result) {
    const stars = "⭐".repeat(result.stars);
    this.starResult.innerText = stars;

    this.completeText.innerText =
      `Hamle: ${result.moves} · Süre: ${this.formatDuration(result.timeSeconds)} · 3⭐ hedef: ${result.targetMoves} · Minimum: ${result.minimumMoves} · İpucu: ${result.hintsUsed}`;

    this.overlay.classList.add("active");
  }

  formatDuration(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
}