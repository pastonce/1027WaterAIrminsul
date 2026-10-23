import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIALOGUE_ENTRIES, DIALOGUE_POOLS } from '../src/data/dialogues';
import { dialogueTheme } from '../src/game/dialogue/dialogueTheme';
import { DialogueBubble } from '../src/components/DialogueBubble';
import type { DialogueEntry, SpeechPlayback } from '../src/types/game';
import type { DialogueTheme } from '../src/game/dialogue/dialogueTheme';
import pageAssets from '../src/data/pageAssets.generated.json';

const examples: [string, DialogueTheme][] = [['A/normal', 'forest'], ['D/story', 'story'], ['shared/mechanism', 'mechanism'], ['F/nahida', 'nahida'], ['G/reply', 'celebration']];

describe('五套对白外观', () => {
  it.each(examples)('%s 的原始编号归属 %s，不依赖播放位置或触发来源', (pool, theme) => {
    for (const entry of DIALOGUE_POOLS[pool]) {
      expect(dialogueTheme(entry)).toBe(theme);
      expect(dialogueTheme(entry, 'tree')).toBe(theme); expect(dialogueTheme(entry, 'nahida')).toBe(theme);
    }
  });
  it('全部 371 句按池分类，常态 / 转场 / 上限 / 待机 / 欢迎共用森林', () => {
    const before = JSON.stringify(DIALOGUE_POOLS);
    for (const [pool, entries] of Object.entries(DIALOGUE_POOLS)) {
      const expected = pool === 'G/wish' || pool === 'G/reply' ? 'celebration' : pool.endsWith('/story') ? 'story' : pool === 'shared/mechanism' ? 'mechanism' : pool.endsWith('/nahida') ? 'nahida' : 'forest';
      for (const entry of entries) expect(dialogueTheme(entry), `${pool}:${entry.id}`).toBe(expected);
    }
    expect(Object.keys(DIALOGUE_ENTRIES)).toHaveLength(371); expect(JSON.stringify(DIALOGUE_POOLS)).toBe(before);
  });
  it('现实祝福和回复共享庆典框，未单独指定的现实日常沿用温柔草纹', () => {
    for (const entry of [...DIALOGUE_POOLS['G/wish'], ...DIALOGUE_POOLS['G/reply']]) expect(dialogueTheme(entry)).toBe('celebration');
    for (const entry of DIALOGUE_POOLS['G/nahida']) expect(dialogueTheme(entry)).toBe('nahida');
  });
  it('未知旧编号按实际说话者安全回退，不猜编号前缀', () => {
    const legacy: DialogueEntry = { id: 'X-obsolete', speaker: '树', text: '旧对白' };
    expect(dialogueTheme(legacy)).toBe('forest'); expect(dialogueTheme(legacy, 'nahida')).toBe('nahida'); expect(dialogueTheme(legacy, 'user')).toBe('celebration');
    expect(dialogueTheme({ ...legacy, anchor: 'nahida' })).toBe('nahida');
  });
  it.each(examples)('%s 保留自动气泡语义，装饰不读屏、不增加交互或改变原文', (pool, theme) => {
    const entry = DIALOGUE_POOLS[pool][0];
    const speech: SpeechPlayback = { entry: { ...entry, color: '#ff0000' }, anchor: entry.anchor!, sequence: 1, phase: 'holding', startedAt: 0, elapsedMs: 0, typingMs: 0 };
    const html = renderToStaticMarkup(createElement(DialogueBubble, { speech, position: { width: 420 }, reduced: true }));
    expect(html).toContain(`data-theme="${theme}"`); expect(html).toContain('role="status"'); expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="bubble-decoration" aria-hidden="true"'); expect(html).toContain(entry.text); expect(html).not.toContain('<button'); expect(html).not.toContain('#ff0000');
    expect(html.includes(pageAssets.dialogue)).toBe(theme === 'nahida');
  });
  it('主题仅使用静态局部装饰，正文仍由既有两行量尺负责', () => {
    const styles = readFileSync('src/styles/dialogue-themes.css', 'utf8');
    expect(styles).not.toMatch(/@keyframes|animation\s*:|backdrop-filter|https?:/);
    expect(styles).toContain('@media (forced-colors: active)');
    expect(styles).not.toMatch(/font-size|line-height|letter-spacing|\.bubble-measure/);
  });
});
