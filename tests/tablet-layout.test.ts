import { describe, expect, it } from 'vitest';
import { treeDewObstacles } from '../src/game/dew/treeSpace';
import { isDewPositionSafe, placeDew } from '../src/game/dew/placement';
import { placeRainstorm } from '../src/game/dew/rainstorm';
import { sceneRoot } from '../src/game/tree/scenePlacement';
import { sceneScale } from '../src/hooks/useSceneViewport';
import { dreamLayout } from '../src/game/camera/sceneLayout';
import { visitExpressionAnchor } from '../src/game/expressions/placement';
import { getTreeHeight } from '../src/game/growth/GrowthSystem';
import { seededRandom } from '../src/game/tree/geometry';
import { openingTracks, OPENING_RULES } from '../src/game/opening/choreography';

describe('平板当前树形的梦露空间', () => {
  it.each([[1024, 768], [1180, 820], [1366, 1024]])('%s×%s释放未被当前树占据的中部，不挤在两条屏缘', (width, height) => {
    const scale = sceneScale(height); const root = sceneRoot(height, scale);
    const viewport = { width, height, scale, tree: treeDewObstacles(140, width, root, scale) };
    const random = seededRandom(1027);
    const points = Array.from({ length: 500 }, () => placeDew(viewport, [22, 66], [], random)!);
    expect(points.every((point) => point && isDewPositionSafe(point, viewport, [22, 66]))).toBe(true);
    expect(points.filter((point) => point.x > 20 && point.x < 80).length).toBeGreaterThan(220);
    expect(Math.min(...points.map((point) => point.x))).toBeLessThan(15);
    expect(Math.max(...points.map((point) => point.x))).toBeGreaterThan(80);
  });

  it.each([0, 140, 320, 520, 680, 840, 1020])('成长%s保留根干 / 枝叶及生长回弹避让，普通 / 奖励 / 暴雨同用当前空间', (growth) => {
    const width = 1024; const height = 768; const scale = sceneScale(height);
    const tree = treeDewObstacles(growth, width, sceneRoot(height, scale), scale, true);
    expect(tree.length).toBeGreaterThan(0); expect(tree.every((box) => Object.values(box).every(Number.isFinite))).toBe(true);
    const viewport = { width, height, scale, tree };
    const random = seededRandom(growth + 1);
    for (const reward of [false, true]) for (let index = 0; index < 80; index++) {
      const position = placeDew(viewport, [0, 100], [], random, reward);
      if (position) expect(isDewPositionSafe(position, viewport, [0, 100], [], reward)).toBe(true);
    }
    const rain = placeRainstorm(viewport, [], random); expect(rain).toHaveLength(40);
    for (const point of rain) expect(tree.some((box) => point.x * width / 100 + 10 > box.left && point.x * width / 100 - 10 < box.left + box.width && point.y * height / 100 + 10 > box.top && point.y * height / 100 - 10 < box.top + box.height)).toBe(false);
  });
});

describe('B / E宽幅角色的头部留空', () => {
  it.each([[568, 320], [844, 390], [1024, 768], [1180, 820], [1440, 900], [1920, 1080]])('%s×%s两处来访气泡不盖头部', (width, height) => {
    const scale = sceneScale(height); const root = sceneRoot(height, scale);
    for (const stage of ['B', 'E'] as const) for (const position of [0, 1] as const) {
      const growth = stage === 'B' ? 200 : 700;
      const layout = dreamLayout(width, height, scale, getTreeHeight(growth), 0, root, 'dream', stage, position, growth);
      const head = visitExpressionAnchor(layout.character, stage); const bubble = layout.characterBubble;
      const bubbleHeight = height <= 600 ? 96 : 128;
      expect(bubble.left >= head.x + head.radiusX + 8 || bubble.left + bubble.width <= head.x - head.radiusX - 8 || bubble.top + bubbleHeight <= head.y - head.radiusY - 8 || bubble.top >= head.y + head.radiusY + 8).toBe(true);
      expect(bubble.left).toBeGreaterThanOrEqual(20); expect(bubble.left + bubble.width).toBeLessThanOrEqual(width - 20);
    }
  });
});

it('加载前内容透明、相对裁切归零，揭框后才显现并同步等比扩张', () => {
  for (const [width, height] of [[1024, 768], [1180, 820]]) {
    const frames = openingTracks(width, height).find((track) => track.selector === '.opening-content')!.frames;
    expect(frames[0]).toMatchObject({ opacity: 0, clipPath: 'inset(calc(50% - 0px) calc(50% - 0px))' });
    expect(frames.find((frame) => frame.offset === OPENING_RULES.revealMs / OPENING_RULES.durationMs)?.opacity).toBe(0);
    expect(frames.find((frame) => frame.offset === OPENING_RULES.windowMs / OPENING_RULES.durationMs)?.opacity).toBe(1);
  }
});
