import catalog from '../../data/startupAssets.generated.json' with { type: 'json' };
import { boundedAsset, CACHE_IO_MS, readCachedAsset } from './requests';

export const ASSET_CACHE_NAME = `irminsul-assets-${catalog.revision}`;
const files: Record<string, number> = catalog.files;
let storage: Promise<Cache | null> | undefined;

export function assetCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return Promise.resolve(null);
    return storage ??= boundedAsset(caches.open(ASSET_CACHE_NAME), CACHE_IO_MS).catch(() => null);
  } catch { return Promise.resolve(null); }
}

export async function pruneAssetCaches() {
  if (typeof caches === 'undefined') return;
  try {
    const owned = (await caches.keys()).filter((name) => /^irminsul-assets-[a-f\d]{16}$/.test(name));
    const previous = owned.filter((name) => name !== ASSET_CACHE_NAME).at(-1);
    await Promise.all(owned.filter((name) => name !== ASSET_CACHE_NAME && name !== previous).map((name) => caches.delete(name)));
  } catch { return; }
}

export async function fetchAsset(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (!files[path] || init?.method && init.method !== 'GET') return fetch(input, init);
  const check = () => { if (init?.signal?.aborted) throw new DOMException('Asset cancelled', 'AbortError'); };
  check();
  try {
    const cache = await assetCache();
    const cached = cache ? await readCachedAsset(cache, path, files[path], init?.signal ?? undefined) : null;
    check();
    if (cached) return cached;
  } catch { check(); storage = Promise.resolve(null); }
  return fetch(input, { cache: 'no-cache', ...init });
}
