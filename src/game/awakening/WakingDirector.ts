import type { WakingPlayback } from '../../types/game';
import { PausableTimer } from '../core/PausableTimer';
import { WAKING_REDUCED_MS, WAKING_SEQUENCE } from './choreography';

export class WakingDirector {
  private timer = new PausableTimer();
  private playback: WakingPlayback | null = null;
  private step = 0;

  constructor(private readonly update: (playback: WakingPlayback) => void, private readonly completed: () => void) {}

  start(id: number, reduced: boolean) {
    this.stop();
    this.playback = { id, ...WAKING_SEQUENCE[0], reduced };
    if (reduced) this.reduce(); else this.next();
  }

  private next() {
    if (!this.playback) return;
    const step = WAKING_SEQUENCE[this.step++];
    if (!step) { this.playback = null; this.completed(); return; }
    this.playback = { ...this.playback, ...step };
    this.timer.schedule(() => this.next(), step.durationMs);
    this.update(this.playback);
  }

  reduce() {
    if (!this.playback || this.playback.reduced && this.playback.phase === 'final-opening') return;
    this.playback = { ...this.playback, phase: 'final-opening', durationMs: WAKING_REDUCED_MS, reduced: true };
    this.timer.schedule(() => { this.playback = null; this.completed(); }, WAKING_REDUCED_MS);
    this.update(this.playback);
  }

  setPaused(paused: boolean) { this.timer.setPaused(paused); }
  stop() { this.timer.clear(); this.playback = null; this.step = 0; }
}
