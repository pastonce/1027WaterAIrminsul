import { SCHEDULE } from '../../data/schedule';
import { TIME_PROTOCOL_VERSION, TIME_SYNC_RULES } from './protocol';
import type { ServerTimeMessage } from './protocol';
import type { Clock } from './TimeGateService';

export interface TimeSyncSnapshot {
  status: 'checking' | 'synced' | 'offline';
  verifiedAt: number | null;
}

interface ServerClockOptions {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  monotonicNow?: () => number;
  requestId?: () => string;
}

const boundaries = [...new Set(SCHEDULE.map((entry) => Date.parse(entry.at)))];

export class ServerClock implements Clock {
  private snapshot: TimeSyncSnapshot = { status: 'checking', verifiedAt: null };
  private anchorTick = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: { controller: AbortController; completion: Promise<void> } | null = null;
  private active = false;
  private attempt = 0;
  private readonly fetchTime: NonNullable<ServerClockOptions['fetch']>;
  private readonly monotonicNow: () => number;
  private readonly requestId: () => string;

  constructor(options: ServerClockOptions = {}) {
    this.fetchTime = options.fetch ?? ((url, init) => fetch(url, init));
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.requestId = options.requestId ?? (() => crypto.getRandomValues(new Uint32Array(4)).join('-'));
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  now() {
    return this.snapshot.verifiedAt === null ? 0 : this.snapshot.verifiedAt + Math.max(0, this.monotonicNow() - this.anchorTick);
  }

  permissionNow() { return this.snapshot.verifiedAt ?? 0; }

  start() {
    if (this.active) return;
    this.active = true;
    void this.synchronize();
  }

  stop() {
    this.active = false;
    this.attempt++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending?.controller.abort();
    this.pending = null;
  }

  synchronize = (): Promise<void> => {
    if (!this.active) return Promise.resolve();
    if (this.pending) return this.pending.completion;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const controller = new AbortController();
    const attempt = ++this.attempt;
    const completion = Promise.resolve().then(() => this.requestTime(controller, attempt));
    this.pending = { controller, completion };
    return completion;
  };

  private update(patch: Partial<TimeSyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private async requestTime(controller: AbortController, attempt: number) {
    if (!this.active || attempt !== this.attempt) return;
    this.update({ status: 'checking' });
    let rejectAborted: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(new Error('Time request cancelled'));
      controller.signal.addEventListener('abort', rejectAborted, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), TIME_SYNC_RULES.timeoutMs);
    try {
      const requestId = this.requestId();
      const response = this.fetchTime(`${TIME_SYNC_RULES.endpoint}?requestId=${encodeURIComponent(requestId)}`, {
        method: 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      }).then(async (result) => {
        if (!result.ok || !result.headers.get('Content-Type')?.includes('application/json')) throw new Error('Invalid time response');
        return await result.json() as Partial<ServerTimeMessage> | null;
      });
      const message = await Promise.race([response, aborted]);
      if (!message || message.version !== TIME_PROTOCOL_VERSION || message.requestId !== requestId || typeof message.now !== 'number' || !Number.isSafeInteger(message.now) || message.now <= 0 || message.now > 8640000000000000) throw new Error('Invalid time message');
      if (!this.active || attempt !== this.attempt || controller.signal.aborted) return;
      this.anchorTick = this.monotonicNow();
      this.update({ status: 'synced', verifiedAt: message.now });
    } catch {
      if (this.active && attempt === this.attempt) this.update({ status: 'offline' });
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', rejectAborted);
      if (this.active && attempt === this.attempt) {
        this.pending = null;
        this.schedule();
      }
    }
  }

  private schedule() {
    let delay = this.snapshot.status === 'offline' ? TIME_SYNC_RULES.retryMs : TIME_SYNC_RULES.refreshMs;
    const next = boundaries.find((timestamp) => timestamp > this.permissionNow());
    if (this.snapshot.status === 'synced' && next !== undefined) delay = Math.min(delay, Math.max(250, next - this.now() + 50));
    this.timer = setTimeout(() => { this.timer = null; void this.synchronize(); }, delay);
  }
}
