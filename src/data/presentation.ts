import type { DialogueEntry } from '../types/game';
import { revealTimeline, splitDialogue } from '../game/dialogue/textPlayback';

export const PRESENTATION_RULES = {
  arrivalMs: 650,
  blessingAuraMs: 300,
  blessingFlowMs: 500,
  blessingFocusMs: 700,
  blessingTravelMs: 1500,
  blessingBloomMs: 900,
  lingerMinMs: 3000,
  lingerMaxMs: 7000,
  leaveMs: 450,
  fadeMs: 450,
  awakeningMs: 1100,
  minimumHoldMs: 1400,
  segmentHoldMs: 750,
  shortPauseMs: 180,
  longPauseMs: 360,
  typingSlowdown: 1.18,
} as const;

export function segmentTiming(text: string, speed: number, textSpeed: number, reducedMotion: boolean) {
  const reveal = reducedMotion ? [] : revealTimeline(text, speed * textSpeed / 35 * PRESENTATION_RULES.typingSlowdown, PRESENTATION_RULES.shortPauseMs, PRESENTATION_RULES.longPauseMs);
  return { reveal, typingMs: reveal.at(-1)?.at ?? 0 };
}

export function dialogueTiming(entry: DialogueEntry, textSpeed: number, reducedMotion: boolean, segments = splitDialogue(entry.text)) {
  const typingMs = segments.reduce((total, text) => total + segmentTiming(text, entry.speed ?? 35, textSpeed, reducedMotion).typingMs, 0);
  const holdMs = PRESENTATION_RULES.minimumHoldMs + Math.max(0, segments.length - 1) * PRESENTATION_RULES.segmentHoldMs;
  return { typingMs, holdMs, durationMs: typingMs + holdMs };
}
