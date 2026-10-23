import type { BirthdayPlayback } from '../../types/game';
import { PausableTimer } from '../core/PausableTimer';

export const BIRTHDAY_RULES = { giftMs: 2800, showerMs: 4800, reducedMs: 650 } as const;

export class BirthdayDirector {
  private timer = new PausableTimer();
  private playback: BirthdayPlayback | null = null;
  private completed: (() => void) | null = null;
  private waiting: (() => void) | null = null;

  constructor(private readonly update: (playback: BirthdayPlayback | null) => void) {}

  start(id: number, phase: BirthdayPlayback['phase'], reduced: boolean, completed?: () => void) {
    this.stop();
    this.playback = { id, phase, reduced };
    this.completed = completed ?? null;
    this.timer.schedule(() => this.finish(), reduced ? BIRTHDAY_RULES.reducedMs : phase === 'gifting' ? Math.max(BIRTHDAY_RULES.giftMs, BIRTHDAY_RULES.showerMs) : BIRTHDAY_RULES.showerMs);
    this.update(this.playback);
  }

  private finish() {
    const completed = this.completed;
    const waiting = this.waiting;
    this.stop();
    completed?.();
    waiting?.();
  }

  wait(id: number, completed: () => void) {
    if (this.playback?.id !== id) return false;
    this.waiting = completed;
    return true;
  }

  reduce() {
    if (!this.playback || this.playback.reduced) return;
    this.playback = { ...this.playback, reduced: true };
    this.timer.schedule(() => this.finish(), BIRTHDAY_RULES.reducedMs);
    this.update(this.playback);
  }

  setPaused(paused: boolean) { this.timer.setPaused(paused); }
  stop() { this.timer.clear(); this.playback = null; this.completed = null; this.waiting = null; this.update(null); }
}
