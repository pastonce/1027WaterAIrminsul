import assets from '../../data/music.generated.json' with { type: 'json' };
import type { StageId } from '../../types/game';
import { PausableTimer } from '../core/PausableTimer';

export const MUSIC_RULES = { entryGapMs: 8000, loopGapMs: 12000, fadeInMs: 1800, fadeOutMs: 2200, sceneFadeMs: 1200, pauseFadeMs: 350, volume: 0.45 } as const;
export type MusicPhase = 'silent' | 'blocked' | 'waiting' | 'loading' | 'buffering' | 'playing' | 'paused' | 'error';
export interface MusicState { phase: MusicPhase; playing: boolean }
export interface MusicOptions { stage: StageId | null; enabled: boolean; paused: boolean; volume?: number; immediate?: boolean }

const SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';

export class MusicManager {
  private listeners = new Set<() => void>();
  private state: MusicState = { phase: 'silent', playing: false };
  private options: MusicOptions = { stage: null, enabled: true, paused: true };
  private media: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private gap = new PausableTimer();
  private fade = new PausableTimer();
  private loading = new PausableTimer();
  private rampTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded: StageId | null = null;
  private unlocked = false;
  private warming = false;
  private disposed = false;
  private failed = false;
  private ready = false;
  private gapScheduled = false;
  private nextGap: number = MUSIC_RULES.entryGapMs;
  private stopping: { release: boolean } | null = null;
  private ending = false;
  private playSequence = 0;
  private starting: number | null = null;

  constructor(private readonly getContext: () => AudioContext | null, private readonly createAudio = () => new Audio()) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;

  private publish(phase: MusicPhase, playing = false) {
    if (this.disposed || this.state.phase === phase && this.state.playing === playing) return;
    this.state = { phase, playing }; this.listeners.forEach((listener) => listener());
  }

  private targetVolume() { return Number.isFinite(this.options.volume) ? Math.max(0, Math.min(1, this.options.volume!)) : MUSIC_RULES.volume; }
  private wanted() { return !this.disposed && this.options.enabled && this.targetVolume() > 0 && !this.options.paused && this.options.stage !== null; }

  configure(options: MusicOptions) {
    if (this.disposed) return;
    const changed = this.options.stage !== options.stage;
    const previousVolume = this.targetVolume();
    if (changed || this.options.enabled !== options.enabled || this.options.paused !== options.paused) { this.playSequence++; this.starting = null; this.loading.clear(); }
    this.options = options;
    if (changed) {
      this.playSequence++; this.gap.clear(); this.gapScheduled = false;
      this.ready = false; this.nextGap = MUSIC_RULES.entryGapMs; this.failed = false;
    }
    this.sync();
    if (previousVolume !== this.targetVolume() && this.wanted() && this.state.playing && !this.ending && !this.stopping) this.ramp(this.targetVolume(), 150);
  }

  async unlock() {
    if (this.disposed || this.warming) return;
    if (this.unlocked) {
      if (this.failed) { this.failed = false; this.resetSource(); this.ready = false; }
      this.sync(); return;
    }
    this.warming = true;
    try {
      this.context = this.getContext();
      if (!this.media) {
        this.media = this.createAudio(); this.media.preload = 'none'; this.media.loop = false;
        this.media.setAttribute('playsinline', '');
        this.media.onplaying = () => {
          if (this.warming) return;
          if (!this.wanted() || this.loaded !== this.options.stage) { this.media?.pause(); return; }
          this.loading.clear();
          if (this.state.phase === 'buffering') this.ramp(this.targetVolume(), 400);
          this.publish('playing', true);
        };
        this.media.onpause = () => { if (!this.warming && this.media?.paused && this.state.playing) this.publish(this.wanted() ? 'waiting' : 'paused'); };
        this.media.onwaiting = () => {
          if (!this.warming && this.state.playing && this.wanted()) {
            this.freezeRamp(); this.ending = false; this.publish('buffering');
            this.loading.schedule(() => { if (this.state.phase === 'buffering') this.error(); }, 15000);
          }
        };
        this.media.ontimeupdate = () => this.tail();
        this.media.onended = () => this.ended();
        this.media.onerror = () => { if (!this.warming && this.loaded) this.error(); };
        if (this.context) {
          this.source = this.context.createMediaElementSource(this.media);
          this.gain = this.context.createGain(); this.gain.gain.value = 0;
          this.source.connect(this.gain); this.gain.connect(this.context.destination);
        }
      }
      const media = this.media;
      const position = media.currentTime;
      this.setVolume(0);
      if (!this.loaded) media.src = SILENCE;
      const resume = this.context?.state === 'suspended' ? this.context.resume() : Promise.resolve();
      await Promise.all([resume, media.play()]);
      if (this.disposed) return;
      media.pause();
      if (!this.loaded) { media.removeAttribute('src'); media.load(); }
      else media.currentTime = position;
      this.unlocked = true; this.failed = false;
    } catch { this.publish('blocked'); }
    finally { this.warming = false; if (this.unlocked) this.sync(); }
  }

  private sync() {
    const release = this.loaded !== this.options.stage;
    this.gap.setPaused(!this.wanted() || !this.unlocked || this.failed);
    if (release && this.loaded) {
      if (this.stopping) { this.stopping.release = true; if (this.options.immediate) this.finishStop(); }
      else this.stop(true);
      return;
    }
    if (!this.wanted()) {
      if (this.stopping) {
        if (this.options.immediate) this.finishStop();
      } else if (this.media && !this.media.paused) this.stop(false);
      else this.publish(!this.options.stage ? 'silent' : this.options.enabled && !this.unlocked ? 'blocked' : 'paused');
      return;
    }
    if (!this.unlocked) { this.publish('blocked'); return; }
    if (this.failed) { this.publish('error'); return; }
    if (this.stopping) {
      if (this.stopping.release) return;
      this.fade.clear(); this.stopping = null; this.ramp(this.targetVolume(), MUSIC_RULES.fadeInMs);
      this.publish('playing', true); return;
    }
    if (this.ready) { if (this.media?.paused && this.starting === null) void this.play(); return; }
    this.publish('waiting');
    if (!this.gapScheduled) {
      this.gapScheduled = true;
      this.gap.schedule(() => { this.gapScheduled = false; this.ready = true; void this.play(); }, this.nextGap);
    }
  }

  private async play() {
    if (!this.wanted() || !this.unlocked || this.failed || !this.media || !this.options.stage) return;
    const sequence = ++this.playSequence;
    this.starting = sequence;
    const stage = this.options.stage;
    this.publish('loading');
    try {
      if (this.loaded !== stage) {
        this.media.src = assets.tracks[stage].src; this.loaded = stage;
        this.media.load();
      }
      this.ending = false; this.setVolume(0);
      if (this.context?.state === 'suspended') await this.context.resume();
      if (sequence !== this.playSequence || !this.wanted()) return;
      this.loading.schedule(() => { if (sequence === this.playSequence && !this.state.playing) this.error(); }, 15000);
      await this.media.play();
      if (sequence !== this.playSequence || !this.wanted()) return;
      this.loading.clear();
      this.ramp(this.targetVolume(), MUSIC_RULES.fadeInMs); this.publish('playing', true);
    } catch (error) {
      if (sequence !== this.playSequence || !this.wanted()) return;
      this.loading.clear();
      if (error instanceof DOMException && error.name === 'NotAllowedError') { this.unlocked = false; this.publish('blocked'); }
      else this.error();
    } finally { if (this.starting === sequence) this.starting = null; }
  }

  private tail() {
    if (!this.media || this.warming || this.ending || this.stopping || !this.state.playing) return;
    const remaining = (this.media.duration - this.media.currentTime) * 1000;
    if (Number.isFinite(remaining) && remaining > 0 && remaining <= MUSIC_RULES.fadeOutMs) {
      this.ending = true; this.ramp(0, remaining);
    }
  }

  private ended() {
    if (this.warming || !this.loaded || !this.media) return;
    if (this.loaded !== this.options.stage) { if (this.stopping) this.finishStop(); else { this.resetSource(); this.sync(); } return; }
    this.freezeRamp(); this.setVolume(0); this.media.currentTime = 0;
    this.ending = false; this.ready = false; this.nextGap = MUSIC_RULES.loopGapMs;
    this.gap.clear(); this.gapScheduled = false; this.sync();
  }

  private stop(release: boolean) {
    if (!this.media || this.media.paused || this.options.immediate) {
      this.stopping = { release }; this.finishStop(); return;
    }
    this.stopping = { release }; this.ending = false;
    const duration = release ? MUSIC_RULES.sceneFadeMs : MUSIC_RULES.pauseFadeMs;
    this.ramp(0, duration); this.fade.schedule(() => this.finishStop(), duration);
  }

  private finishStop() {
    const release = this.stopping?.release;
    this.fade.clear(); this.stopping = null; this.freezeRamp(); this.setVolume(0);
    this.media?.pause();
    if (release) this.resetSource();
    this.publish(!this.options.stage ? 'silent' : 'paused'); this.sync();
  }

  private error() {
    if (this.disposed) return;
    this.playSequence++; this.loading.clear();
    this.failed = true; this.gap.setPaused(true); this.freezeRamp(); this.setVolume(0); this.media?.pause(); this.publish('error');
  }

  private setVolume(value: number) {
    if (this.gain && this.context) this.gain.gain.setValueAtTime(value, this.context.currentTime);
    else if (this.media) this.media.volume = value;
  }

  private freezeRamp() {
    if (this.rampTimer !== null) clearTimeout(this.rampTimer);
    this.rampTimer = null;
    if (this.gain && this.context) {
      const now = this.context.currentTime; const volume = this.gain.gain.value;
      if (typeof this.gain.gain.cancelAndHoldAtTime === 'function') this.gain.gain.cancelAndHoldAtTime(now);
      else { this.gain.gain.cancelScheduledValues(now); this.gain.gain.setValueAtTime(volume, now); }
    }
  }

  private ramp(value: number, duration: number) {
    this.freezeRamp();
    if (this.gain && this.context) { this.gain.gain.linearRampToValueAtTime(value, this.context.currentTime + duration / 1000); return; }
    if (!this.media) return;
    const start = Date.now(); const volume = this.media.volume;
    const advance = () => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      this.media!.volume = volume + (value - volume) * progress;
      if (progress < 1) this.rampTimer = setTimeout(advance, Math.max(1, Math.min(60, duration - (Date.now() - start))));
      else this.rampTimer = null;
    };
    advance();
  }

  private resetSource() {
    if (this.media) { this.media.pause(); this.media.removeAttribute('src'); this.media.load(); }
    this.loaded = null; this.ending = false;
  }

  dispose() {
    this.disposed = true; this.playSequence++;
    this.gap.clear(); this.fade.clear(); this.loading.clear(); this.freezeRamp();
    if (this.media) { this.media.onplaying = this.media.onpause = this.media.onwaiting = this.media.ontimeupdate = this.media.onended = this.media.onerror = null; this.resetSource(); }
    this.source?.disconnect(); this.gain?.disconnect();
    this.media = null; this.source = null; this.gain = null; this.listeners.clear();
  }
}
