import { assetCache } from '../assets/cache';

export interface MusicSource { src: string; release(): void }

export async function cachedMusicSource(src: string, openCache = assetCache, objects = URL): Promise<MusicSource> {
  const direct = { src, release: () => {} };
  let expired = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cached = async () => {
    try {
      const response = await (await openCache())?.match(src);
      if (expired || !response?.ok || response.headers.get('Content-Type')?.includes('text/html') || typeof objects.createObjectURL !== 'function') return direct;
      const blob = await response.blob();
      if (expired || !blob.size || blob.size > 8 * 1024 * 1024) return direct;
      const url = objects.createObjectURL(blob);
      return { src: url, release: () => objects.revokeObjectURL(url) };
    } catch { return direct; }
  };
  try {
    return await Promise.race([cached(), new Promise<MusicSource>((resolve) => { timeout = setTimeout(() => resolve(direct), 200); })]);
  } finally { expired = true; if (timeout !== undefined) clearTimeout(timeout); }
}
