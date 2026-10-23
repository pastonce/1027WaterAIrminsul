import type { BackgroundAsset, BackgroundLayer, BackgroundPlane } from '../../data/backgrounds';
import { BACKGROUND_RULES, backgroundView } from './policy';
import type { BackgroundQuality } from './policy';
import type { AnimationState, GLTexture, Skeleton } from 'spine-player-4-0';
import { resizeAtlasPage } from './atlas';
import { BackgroundExtraMotion } from './extra-motion';
import type { ExtraMotionSource } from './extra-motion';
import { projectBackgroundMesh } from './mesh';
import { BackgroundEffects, backgroundQuad, sunlightOpacity } from './effects';
import type { BackgroundEffect } from './effects';
import { entrancePose } from './entrance';
import { BackgroundTreatment } from './treatment';
import type { RoamingLayer } from '../encounters/RoamingLayer';
import { fetchAsset } from '../assets/cache';

type SpineRuntime = Pick<typeof import('spine-player-4-0'), 'Color' | 'Shader' | 'SceneRenderer' | 'GLTexture' | 'TextureAtlas' | 'TextureFilter' | 'AtlasAttachmentLoader' | 'SkeletonJson' | 'Skeleton' | 'AnimationState' | 'AnimationStateData'>;
type TextureImage = ImageBitmap | HTMLImageElement;

export interface BackgroundScene {
  layers: number;
  textureBytes: number;
  draw(delta: number, width: number, height: number, entranceTime?: number, foregroundOnly?: boolean, backOnly?: boolean, selectedBand?: number, additiveOnly?: boolean): void;
  dispose(): void;
}

async function loadImage(url: string, signal: AbortSignal, maximum: number): Promise<TextureImage> {
  const response = await fetchAsset(url, { signal });
  if (!response.ok) throw new Error('background-image');
  const blob = await response.blob();
  if (signal.aborted) throw new Error('background-cancelled');
  if (typeof createImageBitmap === 'function') {
    let bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
    try {
      const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
      if (scale < 1) {
        const resized = await createImageBitmap(bitmap, { resizeWidth: Math.max(1, Math.round(bitmap.width * scale)), resizeHeight: Math.max(1, Math.round(bitmap.height * scale)), resizeQuality: 'high', premultiplyAlpha: 'none' });
        bitmap.close(); bitmap = resized;
      }
      if (signal.aborted) throw new Error('background-cancelled');
      return bitmap;
    } catch (error) { bitmap.close(); throw error; }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    const cleanup = () => { URL.revokeObjectURL(url); signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null; };
    const abort = () => { cleanup(); image.src = ''; reject(new Error('background-cancelled')); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('background-image')); };
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}

export async function createBackgroundScene(canvas: HTMLCanvasElement, graphics: WebGLRenderingContext, asset: BackgroundAsset, quality: BackgroundQuality, signal: AbortSignal, guests?: RoamingLayer): Promise<BackgroundScene> {
  const runtime: SpineRuntime = asset.runtime === '4.0' ? await import('spine-player-4-0') : await import('spine-webgl-4-1') as unknown as SpineRuntime;
  if (signal.aborted) throw new Error('background-cancelled');
  const downloads = new AbortController();
  const abort = () => downloads.abort();
  signal.addEventListener('abort', abort, { once: true });
  const images = new Set<TextureImage>();
  const textures: GLTexture[] = [];
  const imageRequests = new Map<string, Promise<TextureImage>>();
  const uploaded = new Map<TextureImage, GLTexture>();
  const layers: Array<{ skeleton: Skeleton; state: AnimationState; motion: BackgroundExtraMotion; layer: BackgroundLayer; order: number }> = [];
  const draws: Array<{ order: number; band: number; additive?: boolean; draw: () => void }> = [];
  const cuts = (asset.hiding?.cuts ?? []).flatMap((cut) => {
    const layer = asset.layers.find((layer) => layer.json.src.endsWith(`/${cut.layer}.json`));
    return layer ? [{ ...cut, order: layer.order }] : [];
  });
  const selected = asset.layers.filter((entry) => !quality.compact || !entry.optional);
  const prepared: Array<{ layer: BackgroundLayer; json: object; atlas: string; pages: Map<string, TextureImage> }> = [];
  let textureBytes = 0;
  let renderer: InstanceType<SpineRuntime['SceneRenderer']> | null = null;
  let effects: BackgroundEffects | null = null;
  let treatment: BackgroundTreatment | null = null;
  let disposed = false;
  let time = 0;
  let entranceTime = Infinity;
  let detach: (() => void) | undefined;
  const releaseImages = () => { images.forEach((image) => { if ('close' in image) image.close(); else image.src = ''; }); images.clear(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    detach?.(); detach = undefined;
    textures.forEach((texture) => texture.dispose()); textures.length = 0;
    effects?.dispose(); effects = null; treatment?.dispose(); treatment = null; uploaded.clear(); imageRequests.clear();
    renderer?.dispose(); renderer = null; layers.length = 0; prepared.length = 0; draws.length = 0;
    releaseImages();
  };
  const image = async (url: string) => {
    let pending = imageRequests.get(url);
    if (!pending) {
      pending = loadImage(url, downloads.signal, Math.min(quality.textureSize, graphics.getParameter(graphics.MAX_TEXTURE_SIZE) as number)).then((loaded) => { images.add(loaded); return loaded; });
      imageRequests.set(url, pending);
    }
    return pending;
  };
  const upload = (loaded: TextureImage) => {
    if (downloads.signal.aborted) throw new Error('background-cancelled');
    const existing = uploaded.get(loaded);
    if (existing) return existing;
    graphics.pixelStorei(graphics.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const texture = new runtime.GLTexture(graphics, loaded);
    textureBytes += loaded.width * loaded.height * 4;
    textures.push(texture); uploaded.set(loaded, texture); return texture;
  };
  try {
    const base = await image(asset.base.src);
    const baseAspect = asset.baseAspect ?? base.width / base.height;
    let cursor = 0;
    const workers = Array.from({ length: BACKGROUND_RULES.concurrency }, async () => {
      try {
        while (cursor < selected.length && !downloads.signal.aborted) {
          const index = cursor++;
          const layer = selected[index];
          const responses = await Promise.all([fetchAsset(layer.json.src, { signal: downloads.signal }), fetchAsset(layer.atlas.src, { signal: downloads.signal })]);
          if (responses.some((response) => !response.ok)) throw new Error('background-data');
          const [json, atlas] = await Promise.all([responses[0].json() as Promise<{ skeleton?: { spine?: string } }>, responses[1].text()]);
          if (!json.skeleton?.spine?.startsWith(`${asset.runtime}.`)) throw new Error('background-version');
          const pages = new Map<string, TextureImage>();
          for (const texture of layer.textures) pages.set(texture.page, await image(texture.src));
          prepared[index] = { layer, json, atlas, pages };
        }
      } catch (error) { downloads.abort(); throw error; }
    });
    const results = await Promise.allSettled(workers);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    if (downloads.signal.aborted) throw new Error('background-cancelled');
    const planes: Array<{ plane: BackgroundPlane; image: TextureImage; noise?: TextureImage; mesh?: ReturnType<typeof projectBackgroundMesh> }> = [];
    for (const plane of asset.planes ?? []) {
      if (quality.compact && plane.optional) continue;
      const loaded = await image(plane.texture.src);
      const noise = plane.noise ? await image(plane.noise.src) : undefined;
      let mesh: ReturnType<typeof projectBackgroundMesh> | undefined;
      if (plane.mesh) {
        const response = await fetchAsset(plane.mesh.geometry.src, { signal: downloads.signal });
        if (!response.ok) throw new Error('background-mesh');
        mesh = projectBackgroundMesh(await response.json(), plane.mesh);
      }
      planes.push({ plane, image: loaded, noise, mesh });
    }
    renderer = new runtime.SceneRenderer(canvas, graphics, true);
    if (asset.treatment) treatment = new BackgroundTreatment(graphics, runtime.Shader, Math.min(quality.textureSize, graphics.getParameter(graphics.MAX_TEXTURE_SIZE) as number));
    effects = new BackgroundEffects(graphics, runtime.Shader, planes.flatMap(({ plane }) => plane.effect === 'sand' || plane.effect === 'red-flow' || plane.effect === 'mist' ? [plane.effect as BackgroundEffect] : []));
    const baseTexture = upload(base);
    const blend = (additive = false) => {
      if (asset.runtime === '4.0') renderer!.batcher.setBlendMode(graphics.SRC_ALPHA, graphics.ONE, additive ? graphics.ONE : graphics.ONE_MINUS_SRC_ALPHA);
      else (renderer!.batcher as unknown as { setBlendMode(mode: number, premultiplied: boolean): void }).setBlendMode(additive ? 1 : 0, false);
    };
    for (const entry of prepared) {
      const atlas = new runtime.TextureAtlas(entry.atlas);
      if (atlas.pages.length !== entry.pages.size) throw new Error('background-atlas');
      for (const page of atlas.pages) {
        const loaded = entry.pages.get(page.name);
        if (!loaded) throw new Error('background-page');
        resizeAtlasPage(atlas.regions, page, loaded.width, loaded.height);
        page.minFilter = runtime.TextureFilter.Linear; page.magFilter = runtime.TextureFilter.Linear;
        page.setTexture(upload(loaded));
      }
      const data = new runtime.SkeletonJson(new runtime.AtlasAttachmentLoader(atlas)).readSkeletonData(entry.json);
      const skeleton = new runtime.Skeleton(data);
      skeleton.x = entry.layer.horizontal; skeleton.y = entry.layer.vertical;
      skeleton.scaleX = entry.layer.scale; skeleton.scaleY = entry.layer.scale;
      const state = new runtime.AnimationState(new runtime.AnimationStateData(data));
      const intro = data.findAnimation('in');
      if (entry.layer.animation === 'loop' && intro) {
        state.setAnimation(0, 'in', false); state.update(intro.duration); state.apply(skeleton);
      }
      state.setAnimation(0, entry.layer.animation, true);
      state.apply(skeleton); skeleton.updateWorldTransform();
      if (entry.layer.slots) skeleton.drawOrder = skeleton.drawOrder.filter((slot) => entry.layer.slots!.includes(slot.data.name));
      const motion = new BackgroundExtraMotion(skeleton, entry.json as ExtraMotionSource, entry.layer.animation);
      const layer = { skeleton, state, motion, layer: entry.layer, order: entry.layer.order };
      layers.push(layer);
      const boundaries = cuts.filter((cut) => entry.layer.json.src.endsWith(`/${cut.layer}.json`));
      const initial = cuts.filter((cut) => cut.order < layer.order).length;
      if (boundaries.length) {
        for (let segment = 0; segment <= boundaries.length; segment++) draws.push({ order: layer.order + segment * 0.0001, band: initial + segment, draw: () => {
          const slots = skeleton.drawOrder;
          const boundary = (index: number) => {
            if (index < 0) return 0;
            if (index >= boundaries.length) return slots.length;
            if (!boundaries[index].slot) return 0;
            const position = slots.findIndex((slot) => slot.data.name === boundaries[index].slot);
            if (position < 0) throw new Error('background-hiding-slot');
            return position;
          };
          skeleton.drawOrder = slots.slice(boundary(segment - 1), boundary(segment));
          try { renderer!.drawSkeleton(skeleton, false); } finally { skeleton.drawOrder = slots; }
        } });
      } else draws.push({ order: layer.order, band: cuts.filter((cut) => cut.order <= layer.order).length, draw: () => renderer!.drawSkeleton(skeleton, false) });
    }
    for (const { plane, image: loaded, noise: noiseImage, mesh } of planes) {
      const texture = upload(loaded);
      const noise = noiseImage ? upload(noiseImage) : undefined;
      const color = new runtime.Color(1, 1, 1, 1);
      const vertices = backgroundQuad(plane);
      const originalVertices = vertices.slice();
      draws.push({ order: plane.order, band: cuts.filter((cut) => cut.order <= plane.order).length, additive: plane.additive, draw: () => {
        blend(plane.additive);
        if (mesh) { renderer!.batcher.draw(texture, mesh.vertices, mesh.indices); return; }
        if (plane.effect === 'sand' || plane.effect === 'red-flow' || plane.effect === 'mist') {
          effects!.draw(renderer!, plane, texture, noise, vertices, time); return;
        }
        const pose = entrancePose(plane.entrance, entranceTime);
        color.a = pose.opacity * (plane.effect === 'sunlight' ? sunlightOpacity(time, plane.opacity ?? 1, plane.range ?? 0.37) : (plane.opacity ?? 1) * (plane.effect === 'glow' ? 0.88 + Math.sin(time * 0.65) * 0.12 : 1));
        if (plane.effect === 'leaves') {
          const frames = Math.max(1, plane.frames ?? 1);
          for (let index = 0; index < 8; index++) {
            const progress = (time / (14 + index * 0.8) + index * 0.137) % 1;
            const horizontal = (progress - 0.55) * plane.width * 1.25;
            const vertical = Math.sin(progress * Math.PI * 2 + index) * 120 + ((index * 137) % plane.height) - plane.height / 2;
            const size = 22 + index % 3 * 9;
            const frame = index % frames;
            renderer!.drawTextureUV(texture, horizontal, vertical, size, size * loaded.height / (loaded.width / frames), frame / frames, 0, (frame + 1) / frames, 1, color);
          }
          return;
        }
        for (let index = 0; index < 4; index++) {
          vertices[index * 12] = originalVertices[index * 12] * pose.scale;
          vertices[index * 12 + 1] = originalVertices[index * 12 + 1] * pose.scale + pose.vertical;
          vertices[index * 12 + 5] = color.a;
        }
        renderer!.batcher.draw(texture, vertices, [0, 1, 2, 2, 3, 0]);
      } });
    }
    draws.sort((first, second) => first.order - second.order);
    if (guests && asset.hiding) detach = await guests.attach(canvas, graphics);
    if (signal.aborted) throw new Error('background-cancelled');
    prepared.length = 0;
    return {
      layers: layers.length,
      get textureBytes() { return textureBytes + (treatment?.bytes ?? 0) + (guests?.textureBytes ?? 0); },
      draw(delta, width, height, entry = Infinity, foregroundOnly = false, backOnly = false, selectedBand?: number, additiveOnly = false) {
        if (disposed || !renderer) return;
        const view = backgroundView(width, height, asset.view);
        renderer.camera.viewportWidth = view.width * BACKGROUND_RULES.overscan; renderer.camera.viewportHeight = view.height * BACKGROUND_RULES.overscan;
        renderer.camera.position.set(asset.view.horizontal, asset.view.vertical, 0);
        if (treatment) treatment.begin(canvas.width, canvas.height);
        else graphics.viewport(0, 0, canvas.width, canvas.height);
        const transparent = foregroundOnly || additiveOnly || selectedBand !== undefined && selectedBand > 0;
        if (transparent) graphics.clearColor(0, 0, 0, 0); else graphics.clearColor(0.13, 0.24, 0.23, 1);
        graphics.clear(graphics.COLOR_BUFFER_BIT);
        renderer.begin();
        blend();
        const elapsed = Math.max(0, Math.min(0.1, delta));
        time += elapsed;
        entranceTime = entry;
        const baseWidth = Math.max(view.width, view.height * baseAspect) * BACKGROUND_RULES.overscan;
        const baseHeight = baseWidth / baseAspect;
        if (!transparent) renderer.drawTexture(baseTexture, asset.view.horizontal - baseWidth / 2, asset.view.vertical - baseHeight / 2, baseWidth, baseHeight);
        if (!transparent && asset.baseBounds) {
          const bounds = asset.baseBounds;
          const pose = entrancePose(asset.baseEntrance, entranceTime);
          renderer.drawTexture(baseTexture, (bounds.horizontal - bounds.width / 2) * pose.scale, (bounds.vertical - bounds.height / 2) * pose.scale + pose.vertical, bounds.width * pose.scale, bounds.height * pose.scale);
        }
        for (const layer of layers) {
          const pose = entrancePose(layer.layer.entrance, entranceTime);
          layer.skeleton.x = layer.layer.horizontal * pose.scale; layer.skeleton.y = layer.layer.vertical * pose.scale + pose.vertical;
          layer.skeleton.scaleX = layer.layer.scale * pose.scale; layer.skeleton.scaleY = layer.layer.scale * pose.scale;
          layer.skeleton.color.a = pose.opacity;
          layer.motion.restore();
          layer.state.update(elapsed); layer.state.apply(layer.skeleton);
          if (layer.layer.slots) layer.skeleton.drawOrder = layer.skeleton.drawOrder.filter((slot) => layer.layer.slots!.includes(slot.data.name));
          if (layer.motion.count) layer.motion.apply(elapsed);
          else layer.skeleton.updateWorldTransform();
        }
        const separated = Boolean(guests?.visible && asset.hiding && !foregroundOnly && !backOnly && selectedBand === undefined);
        const treatmentView = { width: view.width * BACKGROUND_RULES.overscan / asset.view.width, height: view.height * BACKGROUND_RULES.overscan / asset.view.height };
        if (selectedBand !== undefined) { for (const entry of draws) if (entry.band === selectedBand && Boolean(entry.additive) === additiveOnly) entry.draw(); }
        else if (foregroundOnly || backOnly) { for (const entry of draws) if ((entry.band > 0) === foregroundOnly && !entry.additive) entry.draw(); }
        else if (separated) {
          guests!.beginFrame(elapsed);
          for (let band = 0; band <= cuts.length; band++) {
            if (band > 0) { if (treatment) { treatment.begin(canvas.width, canvas.height); graphics.clearColor(0, 0, 0, 0); graphics.clear(graphics.COLOR_BUFFER_BIT); } renderer.begin(); blend(); }
            for (const entry of draws) if (entry.band === band) entry.draw();
            renderer.end(); treatment?.present(canvas.width, canvas.height, treatmentView, time, band > 0);
            guests!.drawAt(cuts[band]?.id ?? 'edge');
          }
          return;
        } else { for (const entry of draws) entry.draw(); }
        renderer.end();
        if (treatment && transparent) { graphics.bindFramebuffer(graphics.FRAMEBUFFER, null); graphics.viewport(0, 0, canvas.width, canvas.height); graphics.clearColor(0, 0, 0, 0); graphics.clear(graphics.COLOR_BUFFER_BIT); }
        treatment?.present(canvas.width, canvas.height, treatmentView, time, transparent);
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
  finally { signal.removeEventListener('abort', abort); }
}
