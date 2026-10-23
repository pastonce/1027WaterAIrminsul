import type { StorageLike } from '../save/SaveManager';

export const FIRST_NOTICE_KEY = 'irminsul.notice.seen.v1';

export class FirstVisitNotice {
  pending = true;
  constructor(private readonly storage: StorageLike | null) {
    try { this.pending = storage?.getItem(FIRST_NOTICE_KEY) !== '1'; } catch { }
  }
  shown() {
    if (!this.pending) return;
    this.pending = false;
    try { this.storage?.setItem(FIRST_NOTICE_KEY, '1'); } catch { }
  }
}
