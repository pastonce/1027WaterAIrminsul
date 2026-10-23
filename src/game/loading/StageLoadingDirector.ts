import { STAGE_LOADING_RULES } from '../../data/stageLoading';
import type { StageLoading } from '../../types/game';
import { PausableTimer } from '../core/PausableTimer';

const PULSES = [
  { delay: 100, gain: 0.12 }, { delay: 650, gain: 0.29 }, { delay: 820, gain: 0.025 },
  { delay: 120, gain: 0.345 }, { delay: 560, gain: 0.12 },
];

export class StageLoadingDirector {
  private cover = new PausableTimer();
  private pulse = new PausableTimer();
  private settle = new PausableTimer();
  private minimum = new PausableTimer();
  private lastPause = new PausableTimer();
  private finish = new PausableTimer();
  private running = false;
  private ready = false;
  private settled = false;
  private reduced = false;
  private minimumElapsed = false;
  private lastPaused = false;
  private finishing = false;
  private progress = 0;
  private step = 0;

  constructor(private readonly update: (patch: Pick<StageLoading, 'phase' | 'progress'>) => void, private readonly covered: () => void, private readonly completed: () => void, private readonly random = Math.random) {}

  start(reduced: boolean) {
    this.stop(); this.running = true; this.reduced = reduced;
    this.cover.schedule(() => {
      this.update({ phase: 'loading', progress: 0 });
      if (!this.running) return;
      this.minimum.schedule(() => { this.minimumElapsed = true; this.tryFinish(); }, reduced ? 400 : STAGE_LOADING_RULES.minimumMs);
      this.covered();
      if (this.running) this.nextPulse();
    }, reduced ? 0 : STAGE_LOADING_RULES.coverMs);
  }

  sceneReady() {
    if (!this.running || this.ready) return;
    this.ready = true;
    this.settle.schedule(() => { this.settled = true; this.tryFinish(); }, STAGE_LOADING_RULES.settleMs);
  }

  private nextPulse() {
    const pulse = PULSES[Math.min(this.step++, PULSES.length - 1)];
    const delay = Math.round(pulse.delay * (0.8 + this.random() * 0.4));
    this.pulse.schedule(() => {
      if (!this.running) return;
      const next = this.progress + pulse.gain * (0.8 + this.random() * 0.4);
      const last = next >= 6 / 7;
      this.progress = last ? STAGE_LOADING_RULES.lastMidpoint : next;
      this.update({ phase: 'loading', progress: this.progress });
      if (!this.running) return;
      if (last) this.lastPause.schedule(() => { this.lastPaused = true; this.tryFinish(); }, STAGE_LOADING_RULES.lastPauseMs);
      else this.nextPulse();
    }, delay);
  }

  private tryFinish() {
    if (!this.running || this.finishing || !this.settled || !this.minimumElapsed || !this.lastPaused) return;
    this.finishing = true;
    this.update({ phase: 'loading', progress: 1 });
    if (!this.running) return;
    this.finish.schedule(() => {
      if (!this.running) return;
      this.update({ phase: 'revealing', progress: 1 });
      if (this.running) this.finish.schedule(() => { this.running = false; this.completed(); }, this.reduced ? 0 : STAGE_LOADING_RULES.revealMs);
    }, this.reduced ? 0 : STAGE_LOADING_RULES.fullMs);
  }

  setPaused(paused: boolean) { for (const timer of [this.cover, this.pulse, this.settle, this.minimum, this.lastPause, this.finish]) timer.setPaused(paused); }

  stop() {
    for (const timer of [this.cover, this.pulse, this.settle, this.minimum, this.lastPause, this.finish]) timer.clear();
    this.running = false; this.ready = false; this.settled = false;
    this.minimumElapsed = false; this.lastPaused = false; this.finishing = false; this.progress = 0; this.step = 0;
  }
}
