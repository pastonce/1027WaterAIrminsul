import { PausableTimer } from '../core/PausableTimer';

export type MailPhase = 'unsealing' | 'expanding' | 'reading' | 'turning-out' | 'turning-in' | 'folding' | 'returning' | 'sealing';
export interface MailPlayback { phase: MailPhase; index: number; direction: -1 | 1; reduced: boolean }
export const MAIL_TIMING = { unsealing: 280, expanding: 720, 'turning-out': 250, 'turning-in': 500, folding: 350, returning: 620, sealing: 260 } as const;

export class BirthdayMailDirector {
  private timer = new PausableTimer();
  private frame: MailPlayback | null = null;
  private closing = false;
  private stopped = true;

  constructor(private update: (frame: MailPlayback) => void, private complete: () => void) {}

  open(index: number, reduced: boolean) {
    this.stop(); this.stopped = false; this.closing = false;
    this.frame = { phase: 'unsealing', index: Math.max(0, Math.min(3, Math.floor(index))), direction: 1, reduced };
    this.step('unsealing', () => this.step('expanding', () => this.read()));
  }

  private step(phase: Exclude<MailPhase, 'reading'>, after: () => void) {
    if (!this.frame || this.stopped) return;
    this.frame = { ...this.frame, phase }; this.update(this.frame);
    this.timer.schedule(after, this.frame.reduced ? Math.min(120, MAIL_TIMING[phase]) : MAIL_TIMING[phase]);
  }

  private read() {
    if (!this.frame || this.stopped) return;
    this.frame = { ...this.frame, phase: 'reading' }; this.update(this.frame);
    if (this.closing) this.close();
  }

  select(index: number, direction?: -1 | 1) {
    if (!this.frame || this.frame.phase !== 'reading' || this.closing) return;
    const target = ((Math.trunc(index) % 4) + 4) % 4;
    if (target === this.frame.index) return;
    this.frame = { ...this.frame, direction: direction ?? (target > this.frame.index ? 1 : -1) };
    this.step('turning-out', () => {
      if (!this.frame) return;
      this.frame = { ...this.frame, index: target };
      this.step('turning-in', () => this.read());
    });
  }

  move(direction: -1 | 1) { if (this.frame) this.select(this.frame.index + direction, direction); }

  setReduced(reduced: boolean) {
    if (!this.frame || this.frame.reduced === reduced) return;
    this.frame = { ...this.frame, reduced }; this.update(this.frame);
  }

  close() {
    if (!this.frame || this.stopped || ['folding', 'returning', 'sealing'].includes(this.frame.phase)) return;
    this.closing = true;
    if (this.frame.phase !== 'reading') return;
    this.step('folding', () => this.step('returning', () => this.step('sealing', () => {
      if (this.stopped) return;
      this.stop(); this.complete();
    })));
  }

  setPaused(paused: boolean) { this.timer.setPaused(paused); }
  stop() { this.timer.clear(); this.frame = null; this.closing = false; this.stopped = true; }
}
