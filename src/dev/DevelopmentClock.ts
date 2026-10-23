import { SCHEDULE } from '../data/schedule';
import type { Clock } from '../game/time/TimeGateService';

export class DevelopmentClock implements Clock {
  private offset = Date.parse(SCHEDULE[0].at) - Date.now();
  simulated = true;

  constructor(private readonly options: { persist?: boolean; now?: number } = {}) {
    if (options.now !== undefined) this.offset = options.now - Date.now();
    if (options.persist === false) return;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem('irminsul.development.clock') ?? 'null');
      if (saved && typeof saved === 'object' && 'offset' in saved && typeof saved.offset === 'number' && Number.isFinite(saved.offset)) {
        this.offset = saved.offset;
        this.simulated = !('simulated' in saved) || saved.simulated !== false;
      }
    } catch { return; }
  }

  private persist() {
    if (this.options.persist === false) return;
    try { sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: this.offset, simulated: this.simulated })); } catch { return; }
  }

  now() { return Date.now() + this.offset; }
  set(timestamp: number) { if (Number.isFinite(timestamp)) { this.offset = timestamp - Date.now(); this.simulated = true; this.persist(); } }
  system() { this.offset = 0; this.simulated = false; this.persist(); }
}
