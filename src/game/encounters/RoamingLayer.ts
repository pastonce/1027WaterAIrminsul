import type { CreatureActor } from './layout';
import { CreatureRenderer } from './CreatureRenderer';
import type { InhabitantId } from '../../data/inhabitants';
import { BACKGROUND_RULES } from '../backgrounds/policy';

type Status = 'loading' | 'ready' | 'fallback';
export class RoamingLayer {
  private renderer: CreatureRenderer | null = null;
  private actors: CreatureActor[] = [];
  private width = 1;
  private height = 1;
  private generation = 0;
  private states: Partial<Record<InhabitantId, Status>> = {};
  private delta = 0;
  private first = true;
  private listeners = new Set<() => void>();
  invalidate?: () => void;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.states;
  get attached() { return this.renderer !== null; }
  get visible() { return this.actors.length > 0; }
  get textureBytes() { return this.renderer?.textureBytes ?? 0; }
  private publish(asset?: InhabitantId, state?: Status) { this.states = asset ? { ...this.states, [asset]: state } : {}; this.listeners.forEach((listener) => listener()); }
  setActors(actors: CreatureActor[], width: number, height: number) {
    this.actors = actors; this.width = width; this.height = height;
    this.renderer?.setViewport(width, height, height <= 600 || width <= 950);
    this.renderer?.setActors(actors);
    this.invalidate?.();
  }
  async attach(canvas: HTMLCanvasElement, graphics: WebGLRenderingContext) {
    const generation = ++this.generation;
    const runtime = await import('spine-player-4-0');
    if (generation !== this.generation) return () => {};
    const instance = new CreatureRenderer(canvas, graphics, runtime, (asset, state) => { this.publish(asset, state); this.invalidate?.(); }, 1024, true);
    this.renderer = instance;
    instance.setViewport(this.width, this.height, this.height <= 600 || this.width <= 950); instance.setActors(this.actors); this.publish();
    return () => { if (this.renderer === instance) { this.generation++; this.renderer = null; this.publish(); } instance.dispose(); };
  }
  beginFrame(delta: number) { this.delta = delta; this.first = true; }
  drawAt(depth: string) { this.renderer?.draw(this.delta, BACKGROUND_RULES.overscan, (actor) => (actor.depth ?? 'middle') === depth, this.first); this.first = false; }
}
