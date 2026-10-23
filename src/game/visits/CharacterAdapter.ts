import type { CharacterAction } from '../../types/game';
import { CHARACTER_ASSETS } from '../../data/assets';
import type { CharacterVariant } from '../../data/assets';
import { PRESENTATION_RULES } from '../../data/presentation';
import { fetchAsset } from '../assets/cache';

export interface CharacterAdapter {
  play(action: CharacterAction): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

interface CharacterPlayer {
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

export function createSpineAdapter(element: HTMLElement, variant: CharacterVariant, status: (value: 'ready' | 'fallback') => void, reduced: boolean): CharacterAdapter {
  const asset = CHARACTER_ASSETS[variant];
  let player: CharacterPlayer | null = null;
  let disposed = false;
  let ready = false;
  let paused = false;
  let action: CharacterAction = 'idle';
  const downloads = new AbortController();
  const urls: string[] = [];
  const playback = () => { if (ready && player) { if (paused || reduced) player.pause(); else player.play(); } };
  const release = () => {
    const graphics = player?.context?.gl;
    player?.dispose(); player = null; element.replaceChildren();
    graphics?.getExtension('WEBGL_lose_context')?.loseContext();
    urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  };
  const fail = () => { if (!disposed) { ready = false; downloads.abort(); status('fallback'); queueMicrotask(release); } };
  const pose = () => {
    if (!ready || !player?.animationState) return;
    if (action === 'arrive' && asset.arrival && !reduced) {
      const arrival = player.animationState.setAnimation(0, asset.arrival, false);
      arrival.trackTime = Math.max(0, (arrival.animation?.duration ?? 0) - PRESENTATION_RULES.arrivalMs / 1000);
      player.animationState.addAnimation(0, asset.animation, true, 0);
    }
  };
  void (async () => {
    const [runtime, responses] = await Promise.all([
      import('spine-player-4-0'),
      Promise.all([asset.json, asset.atlas, asset.texture].map(async (url) => {
        const response = await fetchAsset(url, { signal: downloads.signal });
        if (!response.ok) throw new Error(`character-asset-${response.status}`);
        return response;
      })),
    ]);
    const [json, atlas, texture] = await Promise.all([responses[0].text(), responses[1].text(), responses[2].blob()]);
    if (disposed) return;
    const image = URL.createObjectURL(texture); urls.push(image);
    player = new runtime.SpinePlayer(element, {
      jsonUrl: asset.json, atlasUrl: asset.atlas, animation: asset.animation,
      rawDataURIs: { [asset.json]: `data:application/json,${json}`, [asset.atlas]: `data:text/plain,${atlas}`, [asset.atlasTexture]: image },
      premultipliedAlpha: asset.premultipliedAlpha,
      showControls: false, showLoading: false, alpha: true, backgroundColor: '#00000000', preserveDrawingBuffer: false,
      viewport: { ...(asset.fixedBounds ? asset.bounds : {}), padLeft: asset.fixedBounds ? '0%' : '8%', padRight: asset.fixedBounds ? '0%' : '8%', padTop: asset.fixedBounds ? '0%' : '8%', padBottom: asset.fixedBounds ? '0%' : '8%', transitionTime: 0 },
      success: (loaded: CharacterPlayer) => {
        if (disposed) { loaded.dispose(); return; }
        player = loaded; loaded.setAnimation(asset.animation, true); ready = true; pose(); playback(); status('ready');
      },
      error: fail,
    });
  })().catch(fail);
  return {
    play(next) { if (next !== action) { action = next; pose(); } },
    setPaused(next) { paused = next; playback(); },
    dispose() { disposed = true; ready = false; downloads.abort(); release(); },
  };
}
