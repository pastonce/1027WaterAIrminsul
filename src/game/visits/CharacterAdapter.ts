import type { CharacterAction } from '../../types/game';
import { CHARACTER_ASSETS } from '../../data/assets';
import type { CharacterVariant } from '../../data/assets';
import { PRESENTATION_RULES } from '../../data/presentation';
import { fetchAsset } from '../assets/cache';
import { boundedAsset, validAssetResponse } from '../assets/requests';

export interface CharacterAdapter {
  play(action: CharacterAction): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

interface CharacterPlayer {
  canvas?: HTMLCanvasElement;
  context: { gl: WebGLRenderingContext } | null;
  animationState: {
    setAnimation(track: number, name: string, loop: boolean): { animation: { duration: number } | null; trackTime: number };
    addAnimation(track: number, name: string, loop: boolean, delay: number): unknown;
  } | null;
  play(): void;
  pause(): void;
  setAnimation(name: string, loop: boolean): unknown;
  dispose(): void;
}

export const CHARACTER_LOADING_RULES = { fileIdleMs: 30000, decodeTimeoutMs: 20000, retryMs: 1200, attempts: 3 } as const;
type CharacterStatus = 'loading' | 'ready' | 'fallback';
interface CharacterAttempt {
  downloads: AbortController; urls: string[]; player: CharacterPlayer | null; ready: boolean; failed: boolean;
  timeout?: ReturnType<typeof setTimeout>; removeContextListener?: () => void;
}

async function characterBytes(url: string, signal: AbortSignal) {
  const response = await boundedAsset(fetchAsset(url, { signal }), CHARACTER_LOADING_RULES.fileIdleMs, signal);
  if (!validAssetResponse(response)) throw new Error(`character-asset-${response.status}`);
  if (!response.body) return new Uint8Array(await boundedAsset(response.arrayBuffer(), CHARACTER_LOADING_RULES.fileIdleMs, signal));
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      // Reset the deadline after each chunk: a long download that still advances is valid.
      const chunk = await boundedAsset(reader.read(), CHARACTER_LOADING_RULES.fileIdleMs, signal);
      if (chunk.done) break;
      chunks.push(chunk.value); length += chunk.value.byteLength;
    }
    const body = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return body;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createSpineAdapter(element: HTMLElement, variant: CharacterVariant, status: (value: CharacterStatus) => void, reduced: boolean): CharacterAdapter {
  const asset = CHARACTER_ASSETS[variant];
  let current: CharacterAttempt | null = null;
  let disposed = false;
  let paused = false;
  let action: CharacterAction = 'idle';
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const live = (attempt: CharacterAttempt) => !disposed && current === attempt && !attempt.failed;
  const playback = () => { const player = current?.player; if (current?.ready && player) { if (paused || reduced) player.pause(); else player.play(); } };
  const release = (attempt: CharacterAttempt) => {
    clearTimeout(attempt.timeout); attempt.removeContextListener?.(); attempt.removeContextListener = undefined;
    attempt.downloads.abort(); attempt.ready = false;
    const graphics = attempt.player?.context?.gl;
    attempt.player?.dispose(); attempt.player = null;
    if (current === attempt) element.replaceChildren();
    graphics?.getExtension('WEBGL_lose_context')?.loseContext();
    attempt.urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  };
  const fail = (attempt: CharacterAttempt) => {
    if (!live(attempt)) return;
    attempt.failed = true; attempt.ready = false; clearTimeout(attempt.timeout); attempt.downloads.abort(); status('fallback');
    queueMicrotask(() => release(attempt));
    if (attempts < CHARACTER_LOADING_RULES.attempts) retry = setTimeout(() => { retry = undefined; start(); }, CHARACTER_LOADING_RULES.retryMs * attempts);
  };
  const pose = () => {
    const player = current?.player;
    if (!current?.ready || !player?.animationState) return;
    if (action === 'arrive' && asset.arrival && !reduced) {
      const arrival = player.animationState.setAnimation(0, asset.arrival, false);
      arrival.trackTime = Math.max(0, (arrival.animation?.duration ?? 0) - PRESENTATION_RULES.arrivalMs / 1000);
      player.animationState.addAnimation(0, asset.animation, true, 0);
    }
  };
  const start = () => {
    if (disposed) return;
    clearTimeout(retry); retry = undefined;
    if (current) release(current);
    const attempt: CharacterAttempt = { downloads: new AbortController(), urls: [], player: null, ready: false, failed: false };
    current = attempt; attempts++; status('loading');
    void (async () => {
      const [runtime, responses] = await Promise.all([
        import('spine-player-4-0'),
        Promise.all([asset.json, asset.atlas, asset.texture].map((url) => characterBytes(url, attempt.downloads.signal))),
      ]);
      const texture = new Blob([responses[2]]);
      if (!live(attempt)) return;
      const image = URL.createObjectURL(texture); attempt.urls.push(image);
      // Spine 4.0 consumes these raw text entries internally without browser URL parsing.
      const json = new TextDecoder().decode(responses[0]); const atlas = new TextDecoder().decode(responses[1]);
      // All response bodies are local now: this deadline only bounds decode / first-frame setup.
      attempt.timeout = setTimeout(() => fail(attempt), CHARACTER_LOADING_RULES.decodeTimeoutMs);
      const player = new runtime.SpinePlayer(element, {
        jsonUrl: asset.json, atlasUrl: asset.atlas, animation: asset.animation,
        rawDataURIs: { [asset.json]: `data:application/json,${json}`, [asset.atlas]: `data:text/plain,${atlas}`, [asset.atlasTexture]: image },
        premultipliedAlpha: asset.premultipliedAlpha,
        showControls: false, showLoading: false, alpha: true, backgroundColor: '#00000000', preserveDrawingBuffer: false,
        viewport: { ...(asset.fixedBounds ? asset.bounds : {}), padLeft: asset.fixedBounds ? '0%' : '8%', padRight: asset.fixedBounds ? '0%' : '8%', padTop: asset.fixedBounds ? '0%' : '8%', padBottom: asset.fixedBounds ? '0%' : '8%', transitionTime: 0 },
        success: (loaded: CharacterPlayer) => {
          if (!live(attempt)) return;
          clearTimeout(attempt.timeout); attempt.player = loaded;
          loaded.setAnimation(asset.animation, true); attempt.ready = true; pose(); playback(); status('ready');
        },
        error: () => fail(attempt),
      });
      attempt.player = player;
      if (!live(attempt)) { release(attempt); return; }
      if (player.canvas) {
        const lost = (event: Event) => { event.preventDefault(); fail(attempt); };
        player.canvas.addEventListener('webglcontextlost', lost);
        attempt.removeContextListener = () => player.canvas?.removeEventListener('webglcontextlost', lost);
      }
    })().catch(() => fail(attempt));
  };
  const online = () => { if (!disposed && current?.failed) { attempts = 0; start(); } };
  if (typeof window !== 'undefined') window.addEventListener('online', online);
  start();
  return {
    play(next) { if (next !== action) { action = next; pose(); } },
    setPaused(next) { paused = next; playback(); },
    dispose() { disposed = true; clearTimeout(retry); if (current) release(current); if (typeof window !== 'undefined') window.removeEventListener('online', online); },
  };
}
