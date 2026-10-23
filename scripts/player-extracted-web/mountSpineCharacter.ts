import { SpinePlayer } from '@esotericsoftware/spine-player';
import '@esotericsoftware/spine-player/dist/spine-player.css';

/** Pass the asset URL without .json/.atlas; the PNG lives in that same folder. */
export async function mountSpineCharacter(
  container: HTMLElement,
  assetUrl: string,
  options: { animation?: string; showControls?: boolean; signal?: AbortSignal } = {},
): Promise<SpinePlayer> {
  const response = await fetch(`${assetUrl}.json`, { signal: options.signal });
  if (!response.ok) throw new Error(`Spine JSON failed: ${response.status} ${assetUrl}`);
  const raw: { skeleton?: { x?: number; y?: number; width?: number; height?: number } } = await response.json();
  const bounds = raw.skeleton;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || (bounds.width ?? 0) <= 0 || (bounds.height ?? 0) <= 0) throw new Error('Invalid Spine viewport');
  options.signal?.throwIfAborted();
  return new Promise<SpinePlayer>((resolve, reject) => {
    let player: SpinePlayer | undefined;
    const abort = () => { player?.dispose(); reject(options.signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    options.signal?.addEventListener('abort', abort, { once: true });
    player = new SpinePlayer(container, {
      jsonUrl: `${assetUrl}.json`, atlasUrl: `${assetUrl}.atlas`,
      animation: options.animation ?? 'loop', premultipliedAlpha: false,
      alpha: true, backgroundColor: '#00000000', showControls: options.showControls ?? false,
      viewport: { ...bounds, padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 },
      success: (ready) => { options.signal?.removeEventListener('abort', abort); resolve(ready); },
      error: (failed, message) => { options.signal?.removeEventListener('abort', abort); failed.dispose(); reject(new Error(message)); },
    });
  });
}
