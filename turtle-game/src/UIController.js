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
  }

  bind({ onNextLevel, onHint, onToggleSound }) {
    this.nextButton.addEventListener("click", onNextLevel);
    this.hintButton.addEventListener("click", onHint);
    this.soundToggle.addEventListener("click", onToggleSound);
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
