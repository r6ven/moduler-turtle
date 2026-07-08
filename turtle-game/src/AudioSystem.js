export class AudioSystem {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
  }

  init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;

    if (this.enabled) {
      this.play("hint");
    }

    return this.enabled;
  }

  play(type) {
    if (!this.enabled) return;

    this.init();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    if (type === "click") {
      this.playSweep(now, 300, 600, 0.12, "sine", 0.15);
    }

    if (type === "hint") {
      this.playSweep(now, 523.25, 659.25, 0.28, "triangle", 0.10);
    }

    if (type === "success") {
      const freqs = [329.63, 392.00, 440.00, 523.25, 587.33];

      freqs.forEach((frequency, index) => {
        this.playTone(now + index * 0.06, frequency, 0.6, "triangle", 0.1);
      });
    }
  }

  playSweep(startTime, fromFrequency, toFrequency, duration, type, volume) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(fromFrequency, startTime);
    osc.frequency.exponentialRampToValueAtTime(toFrequency, startTime + duration * 0.8);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playTone(startTime, frequency, duration, type, volume) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}
