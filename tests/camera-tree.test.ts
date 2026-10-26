import { describe, expect, it } from 'vitest';
import { createTreeModel } from '../src/game/tree/model';
import { createTreeGrowthModel } from '../src/game/tree/presentation';
import { sceneRoot, treeCanopyFocus, TREE_BASE_DEPTH } from '../src/game/tree/scenePlacement';
import { sceneScale } from '../src/hooks/useSceneViewport';

describe('固定树根与原尺寸树体', () => {
  it('相同动画时刻恢复相同原始槽位，不再生成额外旧枝或接干', () => {
    expect(createTreeModel(40, .25)).toEqual(createTreeModel(40, .25));
    expect(createTreeModel(51).parts.map((part) => part.id)).toEqual(['tree9', 'grass', 'overlay9']);
  });
  it.each([{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 640, height: 360 }, { width: 2560, height: 900 }])('$width×$height保持原设备比例，树根与底部始终在画面内', ({ width, height }) => {
    const scale = sceneScale(height);
    expect(scale).toBe(Math.min(1, Math.max(.35, (height - 170) / 510)));
    for (const ground of [undefined, height / 2 + 360 * width / 2500]) {
      const root = sceneRoot(height, scale, ground);
      expect(root).toBeGreaterThan(0); expect(root + TREE_BASE_DEPTH * scale).toBe(height + 1);
      for (const growth of [20, 180, 520, 680, 840, 1027]) {
        const model = createTreeGrowthModel(growth);
        const bottom = root + (Math.max(...model.roots.map((part) => part.y + part.height)) - 3300) * scale;
        expect(bottom).toBeGreaterThanOrEqual(height); expect(bottom).toBeLessThanOrEqual(height + 1);
        const focus = treeCanopyFocus(model, width, height, root, scale);
        expect(focus.x).toBeGreaterThan(0); expect(focus.x).toBeLessThan(width);
        expect(focus.y).toBeGreaterThanOrEqual(105); expect(focus.y).toBeLessThanOrEqual(height - 105);
        expect(sceneRoot(height, scale, ground)).toBe(root);
      }
    }
  });
  it('后期允许树冠超出屏幕，而不缩小树体或自动抬高镜头', () => {
    const scale = sceneScale(390); const root = sceneRoot(390, scale);
    expect(treeCanopyFocus(createTreeGrowthModel(1027), 844, 390, root, scale).top).toBeLessThan(0);
    expect(scale).toBeCloseTo(220 / 510);
    expect(createTreeGrowthModel(1020).parts).toEqual(createTreeGrowthModel(1027).parts);
  });
});
