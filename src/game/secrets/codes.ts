export const EASTER_CODES = ['aranara', 'nidaha', 'rainstorm', 'nahida', 'birthday', 'test'] as const;
export type EasterCode = typeof EASTER_CODES[number];
export const EASTER_RULES = { rainCount: 40, rainLifetimeMs: 180000, maximumQueuedVisits: 8, noticeMs: 2800 } as const;
export function easterCode(value: string): EasterCode | null {
  const normalized = value.trim().toLowerCase();
  return EASTER_CODES.find((code) => code === normalized) ?? null;
}
export class CodeSequence {
  private buffer = '';
  clear() { this.buffer = ''; }
  key(key: string) {
    if (key === 'Backspace') { this.buffer = this.buffer.slice(0, -1); return null; }
    if (!/^[a-z]$/iu.test(key)) { this.clear(); return null; }
    this.buffer = `${this.buffer}${key.toLowerCase()}`.slice(-12);
    const code = EASTER_CODES.find((entry) => this.buffer.endsWith(entry));
    if (code) { this.clear(); return code; }
    return null;
  }
}
