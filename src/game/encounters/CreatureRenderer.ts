import type * as Spine from 'spine-player-4-0';
import { INHABITANT_ASSETS } from '../../data/inhabitants';
import type { InhabitantId } from '../../data/inhabitants';
import type { CreatureActor } from './layout';
import { resizeAtlasPage } from '../backgrounds/atlas';
import { roamingMotion } from './motion';
import { fetchAsset } from '../assets/cache';

type Status = 'loading' | 'ready' | 'fallback';
type Runtime = typeof Spine;
interface Bundle { controller: AbortController; texture?: Spine.GLTexture; image?: ImageBitmap | HTMLImageElement; data?: Spine.SkeletonData; timeout?: ReturnType<typeof setTimeout>; poster?: boolean }
interface ActorState { skeleton?: Spine.Skeleton; animation?: Spine.Animation; trackTime: number; born: number; leaving?: number }

export async function createCreatureRenderer(canvas: HTMLCanvasElement, status: (asset: InhabitantId, value: Status, error?: unknown) => void, maximum = 1024) {
  const graphics = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!graphics) throw new Error('creature-webgl');
  const runtime = await import('spine-player-4-0');
  return new CreatureRenderer(canvas, graphics, runtime, status, maximum);
}

export class CreatureRenderer {
  private renderer: Spine.SceneRenderer | null;
  private bundles = new Map<InhabitantId, Bundle>();
  private instances = new Map<string, ActorState>();
  private actors: CreatureActor[] = [];
  private frame = 0;
  private lastFrame: number | null = null;
  private time = 0;
  private paused = false;
  private reduced = false;
  private lost = false;
  private disposed = false;
  private dirty = true;
  private width = 1;
  private height = 1;
  private fps = 30;
  private limit: number;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly graphics: WebGLRenderingContext, private readonly runtime: Runtime, private readonly status: (asset: InhabitantId, value: Status, error?: unknown) => void, maximum: number, private readonly manual = false) {
    this.limit = maximum;
    this.renderer = new runtime.SceneRenderer(canvas, graphics, true);
    if (!manual) { canvas.addEventListener('webglcontextlost', this.contextLost); canvas.addEventListener('webglcontextrestored', this.contextRestored); }
  }

  get textureBytes() { return [...this.bundles.values()].reduce((bytes, bundle) => bytes + (bundle.image ? bundle.image.width * bundle.image.height * 4 : 0), 0); }

  setViewport(width: number, height: number, compact: boolean, maximum?: number) {
    if (width !== this.width || height !== this.height) this.dirty = true;
    this.width = width; this.height = height; this.fps = compact ? 20 : 30;
    if (!this.manual && this.canvas.width !== Math.round(width)) this.canvas.width = Math.max(1, Math.round(width));
    if (!this.manual && this.canvas.height !== Math.round(height)) this.canvas.height = Math.max(1, Math.round(height));
    const limit = maximum ?? (compact ? 512 : 1024);
    if (limit !== this.limit) { this.releaseBundles(); this.limit = limit; this.setActors(this.actors); }
    if (!this.manual) this.draw(0);
  }

  setActors(actors: CreatureActor[]) {
    if (this.disposed) return;
    this.actors = actors;
    this.dirty = true;
    const required = new Set(actors.map((actor) => actor.asset));
    for (const [asset, bundle] of this.bundles) if (!required.has(asset)) { this.release(bundle); this.bundles.delete(asset); }
    const identities = new Set(actors.map((actor) => actor.id));
    for (const id of this.instances.keys()) if (!identities.has(id)) this.instances.delete(id);
    if (this.lost) return;
    for (const asset of required) if (!this.bundles.has(asset)) this.load(asset);
    if (!this.manual) this.draw(0); this.schedule();
  }

  private load(asset: InhabitantId) {
    const bundle: Bundle = { controller: new AbortController() }; this.bundles.set(asset, bundle); this.status(asset, 'loading');
    bundle.timeout = setTimeout(() => { if (this.manual) this.loadPoster(asset, bundle); else { this.release(bundle); if (!this.disposed && this.bundles.get(asset) === bundle) this.status(asset, 'fallback'); } }, 20000);
    const source = INHABITANT_ASSETS[asset];
    void (async () => {
      const responses = await Promise.all([source.json, source.atlas, source.texture].map((url) => fetchAsset(url, { signal: bundle.controller.signal })));
      if (responses.some((response) => !response.ok)) throw new Error('creature-asset');
      const [json, atlasText, blob] = await Promise.all([responses[0].json(), responses[1].text(), responses[2].blob()]);
      if (!json.skeleton?.spine?.startsWith('4.0.')) throw new Error('creature-version');
      let image: ImageBitmap | HTMLImageElement;
      if (typeof createImageBitmap === 'function') {
        let bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
        const scale = Math.min(1, this.limit / Math.max(bitmap.width, bitmap.height), (this.graphics.getParameter(this.graphics.MAX_TEXTURE_SIZE) as number) / Math.max(bitmap.width, bitmap.height));
        if (scale < 1) {
          try { image = await createImageBitmap(bitmap, { resizeWidth: Math.max(1, Math.round(bitmap.width * scale)), resizeHeight: Math.max(1, Math.round(bitmap.height * scale)), resizeQuality: 'high', premultiplyAlpha: 'none' }); }
          finally { bitmap.close(); }
        } else image = bitmap;
      } else {
        const url = URL.createObjectURL(blob);
        try { const element = new Image(); element.src = url; await element.decode(); image = element; }
        finally { URL.revokeObjectURL(url); }
      }
      bundle.image = image;
      if (this.disposed || this.lost || bundle.controller.signal.aborted || this.bundles.get(asset) !== bundle) { this.release(bundle); return; }
      const atlas = new this.runtime.TextureAtlas(atlasText);
      if (atlas.pages.length !== 1) throw new Error('creature-atlas');
      this.graphics.pixelStorei(this.graphics.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      bundle.texture = new this.runtime.GLTexture(this.graphics, image);
      const page = atlas.pages[0]; resizeAtlasPage(atlas.regions, page, image.width, image.height);
      page.minFilter = this.runtime.TextureFilter.Linear; page.magFilter = this.runtime.TextureFilter.Linear; page.setTexture(bundle.texture);
      bundle.data = new this.runtime.SkeletonJson(new this.runtime.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
      clearTimeout(bundle.timeout); bundle.timeout = undefined;
      this.dirty = true; if (!this.manual) this.draw(0); this.status(asset, 'ready'); this.schedule();
    })().catch((error: unknown) => {
      const cancelled = bundle.controller.signal.aborted;
      this.release(bundle);
      if (!this.disposed && !cancelled && this.bundles.get(asset) === bundle) { if (this.manual) this.loadPoster(asset, bundle); else this.status(asset, 'fallback', error); }
    });
  }

  private loadPoster(asset: InhabitantId, previous: Bundle) {
    if (this.disposed || this.lost || this.bundles.get(asset) !== previous) return;
    this.release(previous);
    const bundle: Bundle = { controller: new AbortController(), poster: true }; this.bundles.set(asset, bundle); this.status(asset, 'fallback');
    bundle.timeout = setTimeout(() => this.release(bundle), 10000);
    void (async () => {
      const response = await fetchAsset(INHABITANT_ASSETS[asset].poster, { signal: bundle.controller.signal });
      if (!response.ok) throw new Error('creature-poster');
      const blob = await response.blob();
      let image: ImageBitmap | HTMLImageElement;
      if (typeof createImageBitmap === 'function') image = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
      else { const url = URL.createObjectURL(blob); try { const element = new Image(); element.src = url; await element.decode(); image = element; } finally { URL.revokeObjectURL(url); } }
      bundle.image = image;
      if (this.disposed || this.lost || bundle.controller.signal.aborted || this.bundles.get(asset) !== bundle) { this.release(bundle); return; }
      this.graphics.pixelStorei(this.graphics.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      bundle.texture = new this.runtime.GLTexture(this.graphics, image); clearTimeout(bundle.timeout); bundle.timeout = undefined;
      this.status(asset, 'fallback');
    })().catch(() => { this.release(bundle); });
  }

  setPaused(paused: boolean, reduced: boolean) {
    if (this.paused === paused && this.reduced === reduced) return;
    this.paused = paused; this.reduced = reduced;
    cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = null;
    if (!this.manual) this.draw(0); this.schedule();
  }

  private schedule() { if (!this.manual && !this.frame && !this.paused && !this.reduced && !this.lost && !this.disposed && this.actors.length) this.frame = requestAnimationFrame(this.animate); }
  private animate = (timestamp: number) => {
    this.frame = 0;
    if (this.disposed || this.lost || this.paused || this.reduced) return;
    if (this.lastFrame === null || timestamp - this.lastFrame >= 1000 / this.fps) {
      const delta = this.lastFrame === null ? 0 : Math.max(0, Math.min(0.1, (timestamp - this.lastFrame) / 1000));
      this.lastFrame = timestamp; this.draw(delta);
    }
    this.schedule();
  };

  draw(delta: number, overscan = 1, filter?: (actor: CreatureActor) => boolean, advance = true) {
    const renderer = this.renderer; if (!renderer || this.disposed || this.lost) return;
    if (!this.manual && !this.dirty && (this.paused || this.reduced || delta <= 0)) return;
    this.dirty = false;
    const graphics = this.graphics;
    graphics.disable(graphics.DITHER);
    if (advance) this.time += this.paused || this.reduced ? 0 : Math.max(0, Math.min(0.1, delta));
    if (!this.manual) { graphics.viewport(0, 0, this.canvas.width, this.canvas.height); graphics.clearColor(0, 0, 0, 0); graphics.clear(graphics.COLOR_BUFFER_BIT); }
    graphics.disable(graphics.SCISSOR_TEST);
    renderer.camera.viewportWidth = this.width * overscan; renderer.camera.viewportHeight = this.height * overscan; renderer.camera.position.set(this.width / 2, this.height / 2, 0);
    const entrance = Number.parseFloat(this.canvas.parentElement?.parentElement?.style.getPropertyValue('--ground-entrance-y') ?? '') || 0;
    for (const actor of this.actors) {
      if (filter && !filter(actor)) continue;
      const bundle = this.bundles.get(actor.asset); if (!bundle?.data && !(bundle?.poster && bundle.texture)) continue;
      let instance = this.instances.get(actor.id);
      if (!instance) {
        const skeleton = bundle.data ? new this.runtime.Skeleton(bundle.data) : undefined;
        instance = { skeleton, animation: bundle.data?.findAnimation('loop') ?? undefined, trackTime: actor.kind === 'poster' ? 0 : actor.animationPhase ?? (this.instances.size % 7) * 0.43, born: this.time }; this.instances.set(actor.id, instance);
      }
      const age = this.time - instance.born;
      if (actor.phase === 'leaving' && instance.leaving === undefined) instance.leaving = this.time;
      const motion = actor.kind === 'roaming' ? roamingMotion(age, instance.leaving === undefined ? undefined : this.time - instance.leaving, actor.celebrated, this.reduced, actor) : { horizontal: 0, vertical: 0, scaleX: 1, scaleY: 1, opacity: 1 };
      const horizontalMotion = motion.horizontal * actor.width;
      const offset = motion.vertical * actor.height;
      const top = actor.top + offset + (actor.kind === 'crystal' ? entrance : 0);
      const horizontal = actor.left + horizontalMotion;
      const { skeleton } = instance;
      if (!skeleton) {
        renderer.begin(); renderer.batcher.setBlendMode(graphics.SRC_ALPHA, graphics.ONE, graphics.ONE_MINUS_SRC_ALPHA);
        renderer.drawTextureRotated(bundle.texture!, horizontal, this.height - top - actor.height, actor.width * motion.scaleX, actor.height * motion.scaleY, actor.width * motion.scaleX / 2, actor.height * motion.scaleY / 2, actor.edge === 'top' ? 180 : 0, new this.runtime.Color(1, 1, 1, motion.opacity));
        renderer.end(); continue;
      }
      skeleton.setToSetupPose();
      const bounds = INHABITANT_ASSETS[actor.asset].bounds;
      skeleton.scaleX = actor.width / bounds.width * motion.scaleX; skeleton.scaleY = actor.height / bounds.height * motion.scaleY;
      skeleton.x = actor.left - bounds.x * skeleton.scaleX + horizontalMotion;
      skeleton.y = this.height - top - actor.height - bounds.y * skeleton.scaleY;
      skeleton.color.a = actor.kind === 'crystal' && !this.reduced ? Math.min(1, age / 0.8) : motion.opacity;
      instance.trackTime += this.paused || this.reduced ? 0 : Math.max(0, Math.min(0.1, delta));
      instance.animation!.apply(skeleton, -1, instance.trackTime, true, [], 1, this.runtime.MixBlend.replace, this.runtime.MixDirection.mixIn);
      if (actor.edge === 'top') {
        const root = skeleton.getRootBone(); if (root) root.rotation += 180;
        skeleton.x += (2 * bounds.x + bounds.width - 2 * (root?.x ?? 0)) * skeleton.scaleX;
        skeleton.y += (2 * bounds.y + bounds.height - 2 * (root?.y ?? 0)) * skeleton.scaleY;
      }
      skeleton.updateWorldTransform();
      if (top + actor.height < 0 || top > this.height || horizontal + actor.width < 0 || horizontal > this.width) continue;
      renderer.begin(); renderer.drawSkeleton(skeleton, false); renderer.end();
      graphics.disable(graphics.SCISSOR_TEST);
    }
  }

  private release(bundle: Bundle) { clearTimeout(bundle.timeout); bundle.timeout = undefined; bundle.controller.abort(); bundle.texture?.dispose(); bundle.texture = undefined; if (bundle.image && 'close' in bundle.image) bundle.image.close(); else if (bundle.image) bundle.image.src = ''; bundle.image = undefined; bundle.data = undefined; }
  private releaseBundles() { this.bundles.forEach((bundle) => this.release(bundle)); this.bundles.clear(); this.instances.clear(); }
  private contextLost = (event: Event) => {
    event.preventDefault(); this.lost = true; cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = null;
    for (const actor of this.actors) this.status(actor.asset, 'fallback');
    this.releaseBundles(); this.renderer?.dispose(); this.renderer = null;
  };
  private contextRestored = () => { if (!this.disposed) { this.lost = false; this.renderer = new this.runtime.SceneRenderer(this.canvas, this.graphics, true); this.setActors(this.actors); } };
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.frame = 0;
    this.canvas.removeEventListener('webglcontextlost', this.contextLost); this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
    this.releaseBundles(); this.renderer?.dispose(); this.renderer = null;
    if (!this.manual) { this.graphics.getExtension('WEBGL_lose_context')?.loseContext(); this.canvas.width = 1; this.canvas.height = 1; }
  }
}
