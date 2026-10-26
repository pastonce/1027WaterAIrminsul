import { assetCache, pruneAssetCaches } from './cache';
import { boundedAsset, bufferedAsset, CACHE_IO_MS, readCachedAsset, validAssetResponse } from './requests';
import type { StartupPlan } from './startupPlan';

export const STARTUP_RULES = { concurrency: 3, fileIdleMs: 30000, attempts: 3, retryMs: 800, runtimeTimeoutMs: 30000 } as const;
export interface StartupProgress { progress: number; completed: number; total: number; failed: number; done: boolean; blocked?: boolean }

export class StartupLoader {
  private controller = new AbortController();
  private cancelled = false;

  constructor(private readonly download: typeof fetch = (...args) => fetch(...args), private readonly openCache = assetCache, private readonly warm = (dynamic: boolean) => Promise.all([import('spine-player-4-0'), ...(dynamic ? [import('spine-webgl-4-1')] : [])]).then(() => {})) {}

  async load(plan: StartupPlan, report: (progress: StartupProgress) => void) {
    const progress: StartupProgress = { progress: 0, completed: 0, total: plan.files.length, failed: 0, done: false };
    const bytes = new Map<string, number>();
    const emit = () => {
      progress.progress = progress.done ? 1 : Math.min(.99, [...bytes.values()].reduce((sum, value) => sum + value, 0) / Math.max(1, plan.bytes));
      if (!this.cancelled) report({ ...progress });
    };
    emit();
    let cache: Cache | null = await boundedAsset(Promise.resolve().then(this.openCache), CACHE_IO_MS, this.controller.signal).catch(() => null);
    let cursor = 0;
    let blocked = false;
    let runtimeFailed = false;
    const workers = Array.from({ length: STARTUP_RULES.concurrency }, async () => {
      while (cursor < plan.files.length && !this.cancelled && !blocked) {
        const file = plan.files[cursor++];
        let succeeded = false;
        if (cache) {
          try { succeeded = Boolean(await readCachedAsset(cache, file.url, file.bytes, this.controller.signal)); }
          catch { cache = null; }
        }
        for (let attempt = 0; !succeeded && attempt < STARTUP_RULES.attempts && !this.cancelled; attempt++) {
          if (attempt) {
            let wait: ReturnType<typeof setTimeout> | undefined;
            try { await boundedAsset(new Promise<void>((resolve) => { wait = setTimeout(resolve, STARTUP_RULES.retryMs * attempt); }), STARTUP_RULES.retryMs * attempt + 100, this.controller.signal); }
            catch { break; } finally { clearTimeout(wait); }
          }
          const request = new AbortController();
          const abort = () => request.abort();
          this.controller.signal.addEventListener('abort', abort, { once: true });
          if (this.controller.signal.aborted) request.abort();
          let idle: ReturnType<typeof setTimeout>;
          const touch = () => { clearTimeout(idle); idle = setTimeout(abort, STARTUP_RULES.fileIdleMs); };
          let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
          try {
            touch();
            const response = await boundedAsset(this.download(file.url, { signal: request.signal, cache: attempt ? 'reload' : /[-.][a-f\d]{8,}\./i.test(file.url) ? 'force-cache' : 'reload' }), STARTUP_RULES.fileIdleMs, request.signal);
            if (!validAssetResponse(response)) throw new Error('startup-download');
            let body: Uint8Array<ArrayBuffer>;
            if (response.body) {
              reader = response.body.getReader();
              const chunks: Uint8Array[] = []; let received = 0;
              while (true) {
                touch();
                const chunk = await boundedAsset(reader.read(), STARTUP_RULES.fileIdleMs, request.signal);
                if (chunk.done) break;
                received += chunk.value.byteLength;
                if (received > file.bytes) throw new Error('startup-size');
                chunks.push(chunk.value);
                bytes.set(file.url, Math.max(bytes.get(file.url) ?? 0, received)); emit();
              }
              if (received !== file.bytes) throw new Error('startup-truncated');
              body = new Uint8Array(received); let offset = 0;
              for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
            } else {
              body = new Uint8Array(await boundedAsset(response.arrayBuffer(), STARTUP_RULES.fileIdleMs, request.signal));
              if (body.byteLength !== file.bytes) throw new Error('startup-size');
            }
            if (cache) {
              try { await boundedAsset(cache.put(file.url, bufferedAsset(body, response)), CACHE_IO_MS, request.signal); }
              catch { cache = null; }
            }
            succeeded = true;
          } catch { request.abort(); }
          finally {
            clearTimeout(idle!); this.controller.signal.removeEventListener('abort', abort);
            if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
          }
        }
        if (this.cancelled) return;
        if (succeeded) { bytes.set(file.url, file.bytes); progress.completed++; }
        else { progress.failed++; blocked = true; }
        emit();
      }
    });
    const runtime = plan.dynamic || plan.characterRuntime ? (async () => {
      for (let attempt = 0; attempt < STARTUP_RULES.attempts && !this.cancelled; attempt++) {
        try { await boundedAsset(this.warm(plan.dynamic), STARTUP_RULES.runtimeTimeoutMs, this.controller.signal); return; }
        catch { /* Failed runtime imports must not release the opening. */ }
      }
      if (!this.cancelled) { runtimeFailed = true; blocked = true; }
    })() : Promise.resolve();
    await Promise.all([...workers, runtime]);
    if (this.cancelled) return;
    progress.failed = progress.total - progress.completed + (runtimeFailed ? 1 : 0);
    progress.done = !progress.failed && progress.completed === progress.total;
    if (!progress.done) progress.blocked = true;
    emit();
    if (progress.done) void pruneAssetCaches();
  }

  cancel() { this.cancelled = true; this.controller.abort(); }
}
