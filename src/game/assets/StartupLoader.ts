import { assetCache, pruneAssetCaches } from './cache';
import type { StartupPlan } from './startupPlan';

export const STARTUP_RULES = { concurrency: 3, fileTimeoutMs: 10000, totalTimeoutMs: 60000 } as const;
export interface StartupProgress { progress: number; completed: number; total: number; failed: number; done: boolean }

export class StartupLoader {
  private controller = new AbortController();
  private cancelled = false;

  constructor(private readonly download: typeof fetch = (...args) => fetch(...args), private readonly openCache = assetCache, private readonly warm = (dynamic: boolean) => Promise.all([import('spine-player-4-0'), ...(dynamic ? [import('spine-webgl-4-1')] : [])]).then(() => {})) {}

  async load(plan: StartupPlan, report: (progress: StartupProgress) => void) {
    const progress: StartupProgress = { progress: 0, completed: 0, total: plan.files.length, failed: 0, done: false };
    const bytes = new Map<string, number>();
    const emit = () => {
      progress.progress = progress.done ? 1 : Math.min(0.99, [...bytes.values()].reduce((sum, value) => sum + value, 0) / Math.max(1, plan.bytes));
      if (!this.cancelled && !progress.done) report({ ...progress });
    };
    emit();
    let timeout: ReturnType<typeof setTimeout>;
    const deadline = new Promise<void>((resolve) => { timeout = setTimeout(() => { this.controller.abort(); resolve(); }, STARTUP_RULES.totalTimeoutMs); });
    let cursor = 0;
    try {
      const cache = await Promise.race([Promise.resolve().then(this.openCache).catch(() => null), deadline.then(() => null)]);
      const workers = Array.from({ length: STARTUP_RULES.concurrency }, async () => {
        while (cursor < plan.files.length && !this.cancelled && !this.controller.signal.aborted) {
          const file = plan.files[cursor++];
          const request = new AbortController();
          const abort = () => request.abort();
          this.controller.signal.addEventListener('abort', abort, { once: true });
          if (this.controller.signal.aborted) request.abort();
          const limit = setTimeout(abort, STARTUP_RULES.fileTimeoutMs);
          try {
            if (request.signal.aborted) throw new Error('startup-timeout');
            const cached = await cache?.match(file.url);
            if (!cached) {
              const response = await this.download(file.url, { signal: request.signal, cache: /[-.][a-f\d]{8,}\./i.test(file.url) ? 'force-cache' : 'reload' });
              if (!response.ok || response.status === 204 || response.headers.get('Content-Type')?.includes('text/html')) throw new Error('startup-download');
              const copy = cache ? response.clone() : null;
              if (response.body) {
                const reader = response.body.getReader();
                let received = 0;
                try {
                  while (true) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    received += chunk.value.byteLength;
                    bytes.set(file.url, Math.min(received, file.bytes)); emit();
                  }
                } finally { reader.releaseLock(); }
                if (!received) throw new Error('startup-empty');
              } else if (!(await response.arrayBuffer()).byteLength) throw new Error('startup-empty');
              if (copy) await cache!.put(file.url, copy).catch(() => {});
            }
          } catch { progress.failed++; }
          finally {
            clearTimeout(limit); this.controller.signal.removeEventListener('abort', abort);
            bytes.set(file.url, file.bytes); progress.completed++; emit();
          }
        }
      });
      const runtime = plan.dynamic || plan.characterRuntime ? Promise.race([this.warm(plan.dynamic).catch(() => {}), new Promise<void>((resolve) => { this.controller.signal.addEventListener('abort', () => resolve(), { once: true }); })]) : Promise.resolve();
      await Promise.race([Promise.all([...workers, runtime]), deadline]);
    } finally {
      clearTimeout(timeout!);
      progress.failed += Math.max(0, progress.total - progress.completed);
      progress.completed = progress.total; progress.progress = 1; progress.done = true;
      if (!this.cancelled) report({ ...progress });
      if (!this.cancelled && !progress.failed) void pruneAssetCaches();
    }
  }

  cancel() { this.cancelled = true; this.controller.abort(); }
}
