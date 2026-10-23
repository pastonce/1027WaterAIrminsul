import { DIALOGUE_LAYOUT } from '../../data/dialogueLayout';

export interface RevealStep { at: number; end: number }

const sentenceStops = /[。.!！？?]+[”’」』】）》"'）)\]]*\s*/gu;
const speechTokens = /[，,、；;：:。.!！？?—…]+[”’」』】）》"'）)\]]*|[\s\S]/gu;

function decimalPoint(text: string, offset: number, token: string) {
  return token === '.' && /\d/u.test(text[offset - 1] ?? '') && /\d/u.test(text[offset + 1] ?? '');
}

export function textUnits(text: string) {
  return Array.from(text).reduce((total, character) => total + (/^[\x00-\x7f]$/.test(character) ? 0.55 : 1), 0);
}

export function splitDialogue(text: string, fits: (part: string) => boolean = (part) => textUnits(part) <= DIALOGUE_LAYOUT.capacityUnits): string[] {
  let best: { parts: string[]; difference: number } | null = null;
  for (const match of text.matchAll(sentenceStops)) {
    const punctuation = match[0].trim().replace(/[”’」』】）》"'）)\]]+$/u, '');
    if (decimalPoint(text, match.index, punctuation) || /\.{2,}/u.test(punctuation)) continue;
    const end = match.index + match[0].length;
    if (end >= text.length) continue;
    const parts = [text.slice(0, end), text.slice(end)];
    const lengths = parts.map(textUnits);
    const shorter = Math.min(...lengths); const longer = Math.max(...lengths);
    if (shorter < DIALOGUE_LAYOUT.minimumPartUnits || shorter / longer < DIALOGUE_LAYOUT.minimumBalance || !parts.every(fits)) continue;
    const difference = longer - shorter;
    if (!best || difference < best.difference) best = { parts, difference };
  }
  return best?.parts ?? [text];
}

export function revealTimeline(text: string, characterMs: number, shortPauseMs: number, longPauseMs: number): RevealStep[] {
  const reveal: RevealStep[] = [];
  const tokens = [...text.matchAll(speechTokens)];
  const stop = (index: number) => !!tokens[index] && /^[，,、；;：:。.!！？?—…]/u.test(tokens[index][0]) && !decimalPoint(text, tokens[index].index, tokens[index][0]);
  const pace = Math.min(1.4, Math.max(0.75, characterMs / 41.3));
  let elapsed = 0;
  let offset = 0;
  let phraseLength = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index][0];
    const punctuation = stop(index);
    const taper = punctuation ? 1 : stop(index + 1) ? 1.2 : stop(index + 2) ? 1.08 : 1;
    elapsed += characterMs * taper;
    offset += token.length;
    reveal.push({ at: Math.round(elapsed), end: offset });
    if (punctuation && text.slice(offset).trim()) {
      const pause = /…|\.{2,}/u.test(token) ? longPauseMs * 1.7
        : /—/u.test(token) ? longPauseMs * 1.25
        : /[！？!?]/u.test(token) ? longPauseMs * 1.15
        : /[。.]/u.test(token) ? longPauseMs
        : /[；;]/u.test(token) ? shortPauseMs * 1.45
        : /[：:]/u.test(token) ? shortPauseMs * 1.25
        : /[，,]/u.test(token) ? shortPauseMs * (phraseLength <= 4 ? 0.8 : phraseLength >= 14 ? 1.1 : 1)
        : shortPauseMs * 0.4;
      elapsed += pause * pace;
    }
    phraseLength = punctuation ? 0 : phraseLength + (token.trim() ? 1 : 0);
  }
  return reveal;
}

export function revealedCharacters(reveal: readonly RevealStep[], elapsed: number) {
  let lower = 0;
  let upper = reveal.length - 1;
  let end = 0;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (reveal[middle].at <= elapsed) { end = reveal[middle].end; lower = middle + 1; }
    else upper = middle - 1;
  }
  return end;
}
