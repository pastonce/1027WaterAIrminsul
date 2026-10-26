export const CACHE_IO_MS = 800;

export function boundedAsset<T>(operation: Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => finish(new DOMException('Asset cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('asset-timeout')), milliseconds);
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    operation.then((value) => finish(undefined, value), (error) => finish(error));
  });
}

export function validAssetResponse(response: Response) {
  return response.ok && response.status !== 204 && !response.headers.get('Content-Type')?.includes('text/html');
}

export function bufferedAsset(body: Uint8Array<ArrayBuffer>, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding'); headers.set('Content-Length', String(body.byteLength));
  headers.set('X-Irminsul-Bytes', String(body.byteLength));
  return new Response(body, { status: 200, headers });
}

export async function readCachedAsset(cache: Cache, url: string, expected: number, signal?: AbortSignal) {
  return boundedAsset((async () => {
    const response = await cache.match(url);
    if (!response) return null;
    if (validAssetResponse(response)) {
      if (response.headers.get('X-Irminsul-Bytes') === String(expected)) return response;
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength === expected) return bufferedAsset(body, response);
    }
    void cache.delete?.(url).catch(() => {});
    return null;
  })(), CACHE_IO_MS, signal);
}
