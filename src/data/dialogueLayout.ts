export const DIALOGUE_LAYOUT = {
  reference: '我以前觉得，智慧应该能够让人找到所有问题的答案，可有些答案即使找到了，心里还是会有一点难过。',
  desktopWidth: 326,
  compactWidth: 236,
  capacityUnits: 46,
  minimumPartUnits: 6,
  minimumBalance: 1 / 3,
} as const;

export function dialogueWidth(width: number, height: number) {
  return Math.min(height <= 600 ? DIALOGUE_LAYOUT.compactWidth : DIALOGUE_LAYOUT.desktopWidth, width - 48);
}
