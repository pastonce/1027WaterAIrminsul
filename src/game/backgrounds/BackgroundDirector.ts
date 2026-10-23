import type { BackgroundAsset } from '../../data/backgrounds';
import { createBackgroundScene } from './scene';
import type { BackgroundScene } from './scene';
import { BACKGROUND_RULES, backgroundQuality } from './policy';
import type { RoamingLayer } from '../encounters/RoamingLayer';

export type BackgroundStatus = 'loading' | 'ready' | 'fallback' | 'static';
export interface BackgroundStats { layers: number; textureBytes: number }

export class BackgroundDirector {
  get asset() { return this.selected; }
  private graphics: WebGLRenderingContext | null = null;
  private scene: BackgroundScene | null = null;
  private selected: BackgroundAsset | null = null;
  private downloads: AbortController | null = null;
  private frame = 0;
  private fadeFrame = 0;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private disposed = false;
  private paused = false;
  private reduced = false;
  private entranceTime = 0;
  private lastFrame: number | null = null;
  private width = 1;
  private height = 1;
  private quality = backgroundQuality(1440, 900, 1);

  constructor(private readonly canvas: HTMLCanvasElement, private readonly previous: HTMLCanvasElement, private readonly status: (value: BackgroundStatus, stats?: BackgroundStats) => void, private readonly load = createBackgroundScene, private readonly present?: (asset: BackgroundAsset | null, time: number) => void, private readonly guests?: RoamingLayer) {
    if (guests) guests.invalidate = () => { if (!this.disposed && this.scene) { try { this.render(0); this.schedule(); } catch { this.lost(); } } };
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
  }

  resize(width: number, height: number, density: number) {
    if (this.disposed || width <= 0 || height <= 0) return;
    const quality = backgroundQuality(width, height, density);
    const changed = quality.compact !== this.quality.compact;
    this.width = width; this.height = height; this.quality = quality;
    if (!this.selected || this.reduced) { this.canvas.width = 1; this.canvas.height = 1; return; }
    const pixelWidth = Math.max(1, Math.round(width * quality.density));
    const pixelHeight = Math.max(1, Math.round(height * quality.density));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
      try { this.render(0); if (this.scene) this.status('ready', { layers: this.scene.layers, textureBytes: this.scene.textureBytes }); } catch { this.lost(); }
    }
    if (changed && this.selected) this.setScene(this.selected, true, this.reduced);
  }

  setScene(asset: BackgroundAsset | null, force = false, reduced = false) {
    if (this.disposed || !force && this.selected === asset && this.reduced === reduced) return;
    this.cancelFade();
    this.freeze();
    this.cancelPlayback();
    this.cancelDownload();
    this.scene?.dispose(); this.scene = null;
    if (this.selected !== asset) this.entranceTime = 0;
    if (reduced) this.entranceTime = Infinity;
    this.selected = asset; this.reduced = reduced;
    this.present?.(asset, this.entranceTime);
    const generation = ++this.generation;
    this.canvas.style.opacity = '0';
    if (!asset || reduced) { this.canvas.width = 1; this.canvas.height = 1; this.status('static'); this.fade(); return; }
    this.canvas.width = Math.max(1, Math.round(this.width * this.quality.density));
    this.canvas.height = Math.max(1, Math.round(this.height * this.quality.density));
    this.status('loading');
    try {
      this.graphics ??= this.canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!this.graphics || this.graphics.isContextLost()) throw new Error('background-webgl');
      const downloads = new AbortController(); this.downloads = downloads;
      this.loadTimer = setTimeout(() => {
        this.loadTimer = null;
        if (!this.disposed && generation === this.generation) {
          downloads.abort(); this.finishEntrance(); this.canvas.style.opacity = '0'; this.status('fallback'); this.fade();
        }
      }, BACKGROUND_RULES.timeoutMs);
      void this.load(this.canvas, this.graphics, asset, this.quality, downloads.signal, this.guests).then((scene) => {
        if (this.disposed || generation !== this.generation || downloads.signal.aborted) { scene.dispose(); return; }
        this.clearLoadTimer();
        this.scene = scene;
        this.render(0);
        this.canvas.style.opacity = '1';
        this.status('ready', { layers: scene.layers, textureBytes: scene.textureBytes });
        this.fade(); this.schedule();
      }).catch(() => {
        if (!this.disposed && generation === this.generation && !downloads.signal.aborted) {
          this.clearLoadTimer();
          this.scene?.dispose(); this.scene = null;
          this.finishEntrance(); this.canvas.style.opacity = '0'; this.status('fallback'); this.fade();
        }
      });
    } catch { this.cancelDownload(); this.finishEntrance(); this.status('fallback'); this.fade(); }
  }

  setPaused(paused: boolean) {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    this.cancelPlayback();
    if (!paused) this.schedule();
  }

  private cancelPlayback() {
    cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = null;
  }

  private clearLoadTimer() {
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.loadTimer = null;
  }

  private cancelDownload() {
    this.clearLoadTimer(); this.downloads?.abort(); this.downloads = null;
  }

  private schedule() {
    if (!this.disposed && !this.paused && this.scene && !this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  private draw = (timestamp: number) => {
    this.frame = 0;
    if (this.disposed || this.paused || !this.scene) return;
    if (this.lastFrame === null || timestamp - this.lastFrame >= 1000 / this.quality.fps) {
      const delta = this.lastFrame === null ? 0 : (timestamp - this.lastFrame) / 1000;
      this.lastFrame = timestamp;
      try { this.render(delta); }
      catch { this.lost(); return; }
    }
    this.schedule();
  };

  private render(delta: number) {
    if (!this.scene) return;
    this.entranceTime += Math.max(0, Math.min(0.1, delta));
    this.scene.draw(delta, this.width, this.height, this.entranceTime);
    this.present?.(this.selected, this.entranceTime);
  }

  private finishEntrance() {
    this.entranceTime = Infinity;
    this.present?.(this.selected, this.entranceTime);
  }

  private freeze() {
    if (!this.scene || this.graphics?.isContextLost()) return;
    try {
      this.render(0);
      this.previous.width = this.canvas.width; this.previous.height = this.canvas.height;
      const context = this.previous.getContext('2d');
      if (!context) return;
      context.drawImage(this.canvas, 0, 0);
      this.previous.hidden = false; this.previous.style.opacity = '1';
    } catch { this.previous.hidden = true; }
  }

  private fade() {
    this.fadeFrame = requestAnimationFrame(() => {
      this.fadeFrame = 0;
      this.previous.style.opacity = '0';
      this.fadeTimer = setTimeout(() => {
        this.fadeTimer = null; this.previous.hidden = true;
        this.previous.width = 1; this.previous.height = 1;
      }, BACKGROUND_RULES.transitionMs);
    });
  }

  private cancelFade() {
    cancelAnimationFrame(this.fadeFrame); this.fadeFrame = 0;
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
  }

  private lost = (event?: Event) => {
    event?.preventDefault();
    if (this.disposed) return;
    this.generation++; this.cancelDownload();
    this.cancelPlayback(); this.cancelFade();
    this.scene?.dispose(); this.scene = null;
    this.finishEntrance();
    this.canvas.style.opacity = '0'; this.previous.hidden = true;
    this.previous.width = 1; this.previous.height = 1;
    this.status('fallback');
  };

  private restored = () => { if (this.selected) this.setScene(this.selected, true, this.reduced); };

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.generation++;
    this.cancelDownload();
    this.cancelPlayback(); this.cancelFade();
    this.scene?.dispose(); this.scene = null;
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.graphics?.getExtension('WEBGL_lose_context')?.loseContext(); this.graphics = null;
    this.canvas.width = 1; this.canvas.height = 1; this.previous.width = 1; this.previous.height = 1;
    this.selected = null;
    if (this.guests) this.guests.invalidate = undefined;
  }
}
