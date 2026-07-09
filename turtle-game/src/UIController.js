export class UIController {
  constructor() {
    this.levelValue = document.getElementById("lvl-val");
    this.moveValue = document.getElementById("move-val");
    this.hintValue = document.getElementById("hint-val");

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
    this.startGameButton = document.getElementById("start-game-btn");
    this.continueGameButton = document.getElementById("continue-game-btn");
    this.restartGameButton = document.getElementById("restart-game-btn");
    this.logoutButton = document.getElementById("logout-btn");

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
    this.restartGameButton.addEventListener("click", onRequestReset);
    this.logoutButton.addEventListener("click", onLogout);

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
    this.showMainMenu();
    this.setAuthMessage(message);
    this.usernameInput.focus();
  }

  showGameMenu(username, level) {
    this.authCard.classList.add("hidden");
    this.gameMenuCard.classList.remove("hidden");
    this.currentUserLabel.innerText = `Oyuncu: ${username}`;
    this.savedLevelLabel.innerText = `Kayıtlı seviye: ${level}`;
    this.continueGameButton.innerText = `Devam Et: Seviye ${level}`;
    this.showMainMenu();
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
      `Hamle: ${result.moves} / Hedef: ${result.targetMoves} · İpucu: ${result.hintsUsed}`;
    this.overlay.classList.add("active");
  }
}