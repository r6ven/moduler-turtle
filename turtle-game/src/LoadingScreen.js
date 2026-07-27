const LOADER_VARIANTS = new Set([
  "shell",
  "ripple",
  "sprout",
  "channel"
]);

const wait = (duration) => new Promise((resolve) => {
  window.setTimeout(resolve, duration);
});

export class LoadingScreen {
  constructor(root, message) {
    this.root = root;
    this.message = message;
    this.sequence = 0;
    this.shownAt = performance.now();
    this.previewVariant = this.getPreviewVariant();
  }

  getPreviewVariant() {
    try {
      const requested = new URLSearchParams(window.location?.search || "")
        .get("loaderPreview");

      return LOADER_VARIANTS.has(requested) ? requested : null;
    } catch {
      return null;
    }
  }

  show({ variant = "shell", message = "Ada hazırlanıyor" } = {}) {
    if (!this.root) return;

    this.sequence += 1;
    this.shownAt = performance.now();
    const selectedVariant = this.previewVariant || variant;

    this.root.dataset.loaderVariant = LOADER_VARIANTS.has(selectedVariant)
      ? selectedVariant
      : "shell";
    this.root.classList.remove("leaving");
    this.root.classList.add("active");
    this.root.setAttribute("aria-busy", "true");

    if (this.message) {
      this.message.innerText = message;
    }
  }

  async hide({ minimumMs = 650, transitionMs = 280 } = {}) {
    if (this.previewVariant) return;
    if (!this.root?.classList.contains("active")) return;

    const sequence = this.sequence;
    const elapsed = performance.now() - this.shownAt;

    await wait(Math.max(0, minimumMs - elapsed));

    if (sequence !== this.sequence) return;

    this.root.classList.add("leaving");
    await wait(transitionMs);

    if (sequence !== this.sequence) return;

    this.root.classList.remove("active", "leaving");
    this.root.setAttribute("aria-busy", "false");
  }
}
