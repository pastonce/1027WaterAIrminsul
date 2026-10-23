import content from './birthdayMail.generated.json' with { type: 'json' };
import assets from './birthdayMailAssets.generated.json' with { type: 'json' };
import type { BirthdayLetter } from './birthdayMailSource';

export const BIRTHDAY_LETTERS: BirthdayLetter[] = content.letters;
export const MAIL_ASSETS = assets;

export function birthdayArt(year: number, compact: boolean) {
  const art = (assets.art as Record<string, { compact: string; full: string } | null>)[year];
  return art ? art[compact ? 'compact' : 'full'] : null;
}

export function mailBookLayout(width: number, height: number) {
  const bookWidth = Math.min(width * .95, (height - 32) * 1103 / 677, 1540);
  const bookHeight = bookWidth * 677 / 1103;
  return { left: (width - bookWidth) / 2, top: (height - bookHeight) / 2, width: bookWidth, height: bookHeight };
}
