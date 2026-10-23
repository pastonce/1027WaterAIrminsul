export class PausableTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callback: (() => void) | null = null;
  private remaining = 0;
  private startedAt = 0;
  private paused = false;

  schedule(callback: () => void, milliseconds: number) {
    this.clear();
    this.callback = callback;
    this.remaining = milliseconds;
    if (!this.paused) this.arm();
  }

  private arm() {
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      const callback = this.callback;
      this.timer = null;
      this.callback = null;
      callback?.();
    }, this.remaining);
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused && this.timer !== null) {
      this.remaining = Math.max(0, this.remaining - Math.max(0, Date.now() - this.startedAt));
      clearTimeout(this.timer);
      this.timer = null;
    } else if (!paused && this.callback) this.arm();
  }

  clear() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.callback = null;
  }
}
