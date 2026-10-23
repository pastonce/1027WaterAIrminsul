import { afterEach, describe, expect, it, vi } from 'vitest';
import { PausableTimer } from '../src/game/core/PausableTimer';
import { dialogueTiming, PRESENTATION_RULES } from '../src/data/presentation';
import { dreamLayout, realityLayout } from '../src/game/camera/sceneLayout';
import { VISIT_FORMS } from '../src/data/inhabitants';

afterEach(() => { vi.useRealTimers(); });

describe('气泡生命周期', () => {
  it('暂停保留剩余时间，多次恢复不会重复执行', () => {
    vi.useFakeTimers(); const callback = vi.fn(); const timer = new PausableTimer(); timer.schedule(callback, 1000);
    vi.advanceTimersByTime(400); timer.setPaused(true); vi.advanceTimersByTime(20000); expect(callback).not.toHaveBeenCalled();
    timer.setPaused(false); timer.setPaused(false); vi.advanceTimersByTime(599); expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(callback).toHaveBeenCalledTimes(1); timer.clear();
  });

  it('减少动态效果不会跳过阅读停留时间', () => {
    const entry = { id: 'example', speaker: '梦中的树', text: '树叶正在听风说话。' };
    const normal = dialogueTiming(entry, 35, false); const reduced = dialogueTiming(entry, 35, true);
    expect(reduced.typingMs).toBe(0); expect(reduced.durationMs).toBeGreaterThanOrEqual(PRESENTATION_RULES.minimumHoldMs); expect(normal.durationMs).toBeGreaterThan(reduced.durationMs);
  });
});

describe('角色与气泡的视口位置', () => {
  it.each([{ width: 1440, height: 900, scale: 1 }, { width: 844, height: 390, scale: 0.43 }, { width: 640, height: 360, scale: 0.37 }])('六阶段双位置气泡横向展开并保留屏幕安全区 $width × $height', (viewport) => {
    const compact = viewport.height <= 600;
    for (const stage of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      for (const position of [0, 1] as const) {
        const layout = dreamLayout(viewport.width, viewport.height, viewport.scale, 1000, 0, undefined, VISIT_FORMS[stage] ?? 'dream', stage, position);
        for (const bubble of [layout.treeBubble, layout.characterBubble]) {
          expect(bubble.width).toBe(compact ? 236 : 326);
          expect(bubble.left).toBeGreaterThanOrEqual(20); expect(bubble.left + bubble.width).toBeLessThanOrEqual(viewport.width - 20);
        }
      }
    }
    const reality = realityLayout(viewport.width, viewport.height);
    expect(reality.bubble.width).toBe(compact ? 236 : 326);
    expect(reality.userBubble.width).toBe(compact ? 236 : 326);
  });
  it.each([{ width: 1440, height: 900, scale: 1 }, { width: 844, height: 390, scale: 0.43 }, { width: 640, height: 360, scale: 0.37 }])('梦境角色与气泡在 $width × $height 内', (viewport) => {
    for (const offset of [0, 500, 2500]) {
      const layout = dreamLayout(viewport.width, viewport.height, viewport.scale, 3100, offset);
      expect(layout.character.left).toBeGreaterThanOrEqual(0); expect(layout.character.left + layout.character.width).toBeLessThan(viewport.width);
      expect(layout.character.height).toBeGreaterThanOrEqual(viewport.height <= 600 ? 140 : 300);
      expect(layout.character.top + layout.character.height).toBeLessThanOrEqual(viewport.height - 19);
      for (const bubble of [layout.treeBubble, layout.characterBubble]) {
        expect(bubble.left).toBeGreaterThanOrEqual(0); expect(bubble.left + bubble.width).toBeLessThan(viewport.width); expect(bubble.top).toBeGreaterThanOrEqual(80);
      }
      if (viewport.height <= 600) { expect(layout.characterBubbleSide).toBe('bottom'); expect(layout.characterBubble.top + 83).toBeLessThan(layout.character.top + 16); }
    }
  });

  it.each([{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 640, height: 360 }])('现实气泡在 $width × $height 内，位于角色旁', ({ width, height }) => {
    const layout = realityLayout(width, height);
    if (width <= 700) { expect(layout.bubble.left + layout.bubble.width).toBeLessThan(layout.character.left + layout.character.width * 0.25); expect(layout.bubble.left + layout.bubble.width).toBeGreaterThan(layout.character.left - 8); }
    else { expect(layout.bubble.left).toBeGreaterThan(layout.character.left + layout.character.width * 0.8); expect(layout.bubble.left).toBeLessThan(layout.character.left + layout.character.width); }
    expect(layout.bubble.left + layout.bubble.width).toBeLessThanOrEqual(width - 10);
    expect(layout.character.height).toBeGreaterThanOrEqual(height <= 600 ? 280 : 600);
    expect(layout.character.top).toBeGreaterThanOrEqual(55); expect(layout.character.top + layout.character.height).toBeLessThanOrEqual(height - 19);
  });
});
