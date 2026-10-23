import { INTERACTION_SOUNDS, SOUND_RULES } from '../../data/sounds';
import type { InteractionSound } from '../../data/sounds';
import { fetchAsset as cachedFetch } from '../assets/cache';

interface SoundOptions { volume: number; paused: boolean; transitioning: boolean; scope: string }
interface Voice { kind: InteractionSound; source: AudioBufferSourceNode; gain: GainNode }

function createContext() {
  const Context = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context() : null;
}

export class SoundManager {
  private context: AudioContext | null = null;
  private bus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private unlocked = false;
  private unlocking: Promise<void> | null = null;
  private generation = 0;
  private options: SoundOptions = { volume: 0, paused: true, transitioning: false, scope: '' };
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private downloads = new Set<AbortController>();
  private failures = new Map<string, number>();
  private requests = new Map<InteractionSound, number>();
  private voices = new Set<Voice>();

  constructor(private readonly contextFactory = createContext, private readonly fetchAsset: typeof fetch = cachedFetch) {}

  getContext() {
    try { this.context ??= this.contextFactory(); } catch { return null; }
    return this.context;
  }

  unlock(): Promise<void> {
    try {
      const context = this.getContext();
      if (!context) return Promise.resolve();
      if (context.state === 'running') { this.unlocked = true; return Promise.resolve(); }
      this.unlocking ??= context.resume().then(() => { if (this.context === context) this.unlocked = context.state === 'running'; }).catch(() => undefined).finally(() => { this.unlocking = null; });
      return this.unlocking;
    } catch { return Promise.resolve(); }
  }

  configure(options: SoundOptions) {
    const volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume)) : 0;
    if (options.scope !== this.options.scope || options.paused && !this.options.paused || volume === 0 && this.options.volume > 0) this.cancel();
    this.options = { ...options, volume };
    if (this.bus && this.context) {
      this.bus.gain.cancelScheduledValues(this.context.currentTime);
      this.bus.gain.setTargetAtTime(options.paused ? 0 : volume, this.context.currentTime, 0.015);
    }
  }

  private cancel() {
    this.generation++; this.requests.clear();
    this.downloads.forEach((controller) => controller.abort()); this.downloads.clear(); this.pending.clear();
    for (const voice of this.voices) this.stopVoice(voice);
  }

  private stopVoice(voice: Voice) {
    this.voices.delete(voice);
    voice.source.onended = null;
    try { voice.source.stop(); } catch { }
    voice.source.disconnect(); voice.gain.disconnect();
  }

  private async buffer(src: string, context: AudioContext) {
    const cached = this.buffers.get(src);
    if (cached) return cached;
    const existing = this.pending.get(src);
    if (existing) return existing;
    if (Date.now() - (this.failures.get(src) ?? -Infinity) < SOUND_RULES.retryMs) return null;
    const controller = new AbortController(); this.downloads.add(controller);
    let rejectAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error('Sound request cancelled')); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
    const timeout = setTimeout(() => { this.failures.set(src, Date.now()); controller.abort(); }, SOUND_RULES.loadTimeoutMs);
    const loaded = async () => {
      const response = await this.fetchAsset(src, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Sound unavailable');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > SOUND_RULES.maximumBytes) throw new Error('Sound exceeds size limit');
      const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!payload || typeof payload !== 'object' || !('version' in payload) || payload.version !== 1 || !('audio' in payload) || typeof payload.audio !== 'string' || !payload.audio.length || payload.audio.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(payload.audio)) throw new Error('Invalid sound payload');
      const audio = Uint8Array.from(atob(payload.audio), (character) => character.charCodeAt(0));
      return context.decodeAudioData(audio.buffer);
    };
    const request = Promise.race([loaded(), cancelled]).then((buffer) => {
      if (!controller.signal.aborted && this.context === context) this.buffers.set(src, buffer);
      return buffer;
    }).catch(() => {
      if (!controller.signal.aborted) this.failures.set(src, Date.now());
      return null;
    }).finally(() => {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', rejectAbort); this.downloads.delete(controller);
      if (this.pending.get(src) === request) this.pending.delete(src);
    });
    this.pending.set(src, request);
    return request;
  }

  async play(kind: InteractionSound) {
    const requested = Date.now(); const generation = this.generation;
    if (this.unlocking) await this.unlocking;
    const context = this.context;
    if (generation !== this.generation || !context || !this.unlocked || context.state !== 'running' || this.options.paused || this.options.volume <= 0 || this.options.transitioning && kind !== 'transition') return;
    const definition = INTERACTION_SOUNDS[kind];
    if (requested - (this.requests.get(kind) ?? -Infinity) < definition.cooldownMs) return;
    this.requests.set(kind, requested);
    try {
      const buffer = await this.buffer(definition.asset.src, context);
      if (!buffer || generation !== this.generation || this.requests.get(kind) !== requested || context.state !== 'running' || Date.now() - requested > definition.deadlineMs) return;
      if (!this.bus) {
        this.bus = context.createGain(); this.bus.gain.value = this.options.volume;
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -8; this.compressor.knee.value = 12; this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.003; this.compressor.release.value = 0.12;
        this.bus.connect(this.compressor); this.compressor.connect(context.destination);
      }
      if (kind === 'transition') for (const voice of this.voices) this.stopVoice(voice);
      const matching = [...this.voices].filter((voice) => voice.kind === kind);
      if (matching.length >= definition.maximum) this.stopVoice(matching[0]);
      if (this.voices.size >= SOUND_RULES.maximumVoices) this.stopVoice(this.voices.values().next().value!);
      const source = context.createBufferSource(); const gain = context.createGain();
      source.buffer = buffer; source.playbackRate.value = definition.rate;
      const start = context.currentTime; const end = start + buffer.duration / definition.rate;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(definition.gain, start + 0.008);
      gain.gain.setValueAtTime(definition.gain, Math.max(start + 0.008, end - 0.06)); gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain); gain.connect(this.bus);
      const voice = { kind, source, gain }; this.voices.add(voice);
      source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect(); };
      try { source.start(); source.stop(end); } catch { this.stopVoice(voice); }
    } catch { return; }
  }

  dispose() {
    this.cancel(); this.buffers.clear(); this.failures.clear(); this.unlocked = false; this.unlocking = null;
    this.bus?.disconnect(); this.compressor?.disconnect(); this.bus = null; this.compressor = null;
    const context = this.context; this.context = null;
    if (context) void context.close().catch(() => undefined);
  }
}

export const sound = new SoundManager();
