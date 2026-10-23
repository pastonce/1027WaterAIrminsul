import { segmentTiming, PRESENTATION_RULES } from '../../data/presentation';
import type { CharacterAction, DialogueEntry, ExpressionChoice, SpeechAnchor, SpeechPlayback } from '../../types/game';
import { chooseDialogueExpression } from '../../data/expressions';
import { PausableTimer } from '../core/PausableTimer';
import { splitDialogue } from './textPlayback';

interface SpeechCallbacks {
  options(): { textSpeed: number; reducedMotion: boolean };
  speech(playback: SpeechPlayback | null): void;
  companion(action: CharacterAction | null): void;
  read(entry: DialogueEntry): void;
  prepare?(entry: DialogueEntry, start: () => void): void;
  available?(): void;
  canBless?(): boolean;
  blessing?(phase: 'channel' | 'bloom' | 'end'): void;
  expressionAllowed?(entry: DialogueEntry): boolean;
  expression?(choice: ExpressionChoice): void;
}

export class SpeechDirector {
  private timer = new PausableTimer();
  private hold = new PausableTimer();
  private presence = new PausableTimer();
  private expression = new PausableTimer();
  private visiting = false;
  private sequence = 0;
  private paused = false;
  private hovered = false;
  private playback: SpeechPlayback | null = null;
  private current: { lines: DialogueEntry[]; index: number; anchor: SpeechAnchor; visit: boolean; finished: () => void; parts: string[]; part: number; read: boolean; lingerMs?: number; casting?: boolean; expression?: ExpressionChoice; expressed: boolean } | null = null;

  constructor(private readonly callbacks: SpeechCallbacks, private readonly random = Math.random) {}

  get busy() { return this.current !== null; }
  get canVisit() { return !this.visiting; }

  start(lines: DialogueEntry[], anchor: SpeechAnchor, finished: () => void, visit = false) {
    if (this.busy || visit && this.visiting) return false;
    this.current = { lines, index: 0, anchor, visit, finished, parts: [], part: 0, read: false, expressed: false };
    if (visit) {
      this.visiting = true;
      this.callbacks.companion('arrive');
      this.timer.schedule(() => { this.callbacks.companion('observe'); this.playLine(); }, PRESENTATION_RULES.arrivalMs);
    } else this.playLine();
    return true;
  }

  private show(playback: SpeechPlayback | null) { this.playback = playback; this.callbacks.speech(playback); }

  private playLine() {
    const current = this.current;
    if (!current) return;
    const entry = current.lines[current.index];
    if (!entry) { this.finishSequence(); return; }
    this.show(null);
    const index = current.index;
    let prepared = false;
    const start = () => {
      if (prepared || this.current !== current || current.index !== index) return;
      prepared = true;
      this.beginLine(entry);
    };
    if (this.callbacks.prepare) this.callbacks.prepare(entry, start); else start();
  }

  private beginLine(entry: DialogueEntry) {
    const current = this.current;
    if (!current) return;
    current.parts = splitDialogue(entry.text);
    current.part = 0;
    current.read = false;
    current.expression = this.callbacks.expressionAllowed?.(entry) ? chooseDialogueExpression(entry.expressions, this.random) : undefined;
    current.expressed = false;
    this.hovered = false;
    this.playPart();
  }

  private playPart() {
    const current = this.current;
    if (!current) return;
    const entry = current.lines[current.index];
    const text = current.parts[current.part];
    this.timer.clear(); this.hold.clear(); this.expression.clear();
    this.hold.setPaused(this.paused || this.hovered);
    const options = this.callbacks.options();
    const timing = segmentTiming(text, entry.speed ?? 35, options.textSpeed, options.reducedMotion);
    this.show({ entry, text, segment: current.part, segments: current.parts.length, reveal: timing.reveal, anchor: entry.anchor ?? current.anchor, sequence: ++this.sequence, phase: 'speaking', startedAt: Date.now(), elapsedMs: 0, typingMs: timing.typingMs, ...(current.expression ? { expression: current.expression } : {}) });
    this.scheduleExpression(timing.reveal);
    if (!timing.typingMs) this.beginHold();
    else this.timer.schedule(() => this.beginHold(), timing.typingMs);
  }

  private scheduleExpression(reveal: Array<{ at: number; end: number }>) {
    const current = this.current;
    const choice = current?.expression;
    if (!current || !choice || current.expressed) return;
    const entry = current.lines[current.index];
    const offset = current.parts.slice(0, current.part).join('').length;
    const target = choice.mode === 'after' ? Array.from(entry.text).slice(0, -2).join('').length : choice.offset;
    const local = target - offset;
    if (local > current.parts[current.part].length) return;
    const trigger = () => {
      if (this.current !== current || current.expressed) return;
      current.expressed = true; this.callbacks.expression?.(choice);
    };
    const delay = local <= 0 ? 0 : reveal.find((step) => step.end >= local)?.at ?? 0;
    if (delay) this.expression.schedule(trigger, delay);
    else trigger();
  }

  revealExpression(sequence: number, visible: number) {
    const current = this.current;
    const choice = current?.expression;
    if (!current || !choice || current.expressed || this.playback?.sequence !== sequence || !Number.isFinite(visible) || this.paused) return;
    const offset = current.parts.slice(0, current.part).join('').length;
    const target = choice.mode === 'after' ? Array.from(current.lines[current.index].text).slice(0, -2).join('').length : choice.offset;
    if (offset + Math.min(current.parts[current.part].length, Math.max(0, visible)) < target) return;
    this.expression.clear(); current.expressed = true; this.callbacks.expression?.(choice);
  }

  private holdDuration() {
    return this.current && this.current.part < this.current.parts.length - 1 ? PRESENTATION_RULES.segmentHoldMs : PRESENTATION_RULES.minimumHoldMs;
  }

  private beginHold() {
    if (!this.playback) return;
    this.show({ ...this.playback, phase: 'holding', elapsedMs: this.playback.typingMs, startedAt: Date.now() });
    this.hold.schedule(() => this.finishPart(), this.holdDuration());
  }

  private finishPart() {
    const current = this.current;
    if (!current || !this.playback) return;
    if (current.part < current.parts.length - 1) {
      current.part += 1;
      this.playPart();
      return;
    }
    if (!current.read) { current.read = true; this.callbacks.read(current.lines[current.index]); }
    if (!this.current || !this.playback) return;
    this.show({ ...this.playback, phase: 'fading' });
    this.timer.schedule(() => {
      if (!this.current) return;
      this.current.index += 1;
      this.playLine();
    }, PRESENTATION_RULES.fadeMs);
  }

  setSegments(sequence: number, parts: string[]) {
    const current = this.current;
    if (!current || this.playback?.sequence !== sequence || !parts.length || parts.length > 2 || parts.some((part) => !part.length)) return;
    if (parts.join('') !== current.lines[current.index].text || parts.length === current.parts.length && parts.every((part, index) => part === current.parts[index])) return;
    const offset = current.parts.slice(0, current.part).join('').length;
    current.parts = parts;
    current.part = 0;
    let end = parts[0].length;
    while (end <= offset && current.part < parts.length - 1) { current.part += 1; end += parts[current.part].length; }
    this.playPart();
  }

  setHovered(sequence: number, hovered: boolean) {
    if (!this.current || !this.playback || this.playback.sequence !== sequence || this.hovered === hovered) return;
    this.hovered = hovered;
    this.hold.setPaused(this.paused || hovered);
    if (this.playback.phase === 'fading' && hovered) {
      this.timer.clear();
      this.show({ ...this.playback, phase: 'holding' });
      this.hold.schedule(() => this.finishPart(), this.holdDuration());
    } else if (this.playback.phase === 'holding' && !hovered) this.hold.schedule(() => this.finishPart(), this.holdDuration());
  }

  private finishSequence() {
    this.expression.clear();
    this.show(null);
    if (this.current?.visit) this.current.lingerMs = PRESENTATION_RULES.lingerMinMs + this.random() * (PRESENTATION_RULES.lingerMaxMs - PRESENTATION_RULES.lingerMinMs);
    if (this.current?.visit && this.callbacks.canBless?.()) {
      this.current.casting = true;
      this.callbacks.companion('happy');
      this.callbacks.blessing?.('channel');
      this.timer.schedule(() => {
        this.callbacks.blessing?.('bloom');
        this.timer.schedule(() => { this.callbacks.blessing?.('end'); this.callbacks.companion('observe'); this.finishVisit(); }, PRESENTATION_RULES.blessingBloomMs);
      }, PRESENTATION_RULES.blessingTravelMs);
    } else this.finishVisit();
  }

  private finishVisit() {
    if (this.current?.visit) {
      const linger = Math.max(0, (this.current.lingerMs ?? PRESENTATION_RULES.lingerMinMs) - (this.current.casting ? PRESENTATION_RULES.blessingTravelMs + PRESENTATION_RULES.blessingBloomMs : 0));
      this.presence.schedule(() => {
        this.callbacks.companion('leave');
        this.presence.schedule(() => { this.visiting = false; this.callbacks.companion(null); this.callbacks.available?.(); }, PRESENTATION_RULES.leaveMs);
      }, linger);
    }
    this.finish();
  }

  private finish() {
    const current = this.current;
    this.current = null;
    current?.finished();
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    if (this.playback) {
      const elapsedMs = this.playback.elapsedMs + (this.paused ? 0 : Math.max(0, Date.now() - this.playback.startedAt));
      this.show({ ...this.playback, startedAt: Date.now(), elapsedMs });
    }
    this.paused = paused;
    this.timer.setPaused(paused);
    this.hold.setPaused(paused || this.hovered);
    this.presence.setPaused(paused);
    this.expression.setPaused(paused);
  }

  restartLine() { if (this.playback && this.playback.phase !== 'fading') this.playPart(); }

  stop() {
    this.timer.clear();
    this.expression.clear();
    this.hold.clear(); this.hovered = false;
    this.presence.clear(); this.visiting = false;
    this.current = null;
    this.show(null);
    this.callbacks.companion(null);
  }
}
