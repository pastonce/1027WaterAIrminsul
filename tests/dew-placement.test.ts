import { describe, expect, it } from 'vitest';
import { DEW_RADIUS, dewSpawnRegions, isDewPositionSafe, placeDew, TREE_BODY_HALF_WIDTH } from '../src/game/dew/placement';
import { seededRandom } from '../src/game/tree/geometry';
import type { DewParticle } from '../src/types/game';
import { testGame } from './support';

const range: [number, number] = [22, 66];

describe('梦露避开树体与交互遮挡', () => {
  it.each([{ width: 1440, height: 900, scale: 1 }, { width: 844, height: 390, scale: 220 / 510 }, { width: 640, height: 360, scale: 190 / 510 }])('在 $width × $height 保留整棵树及触摸半径的空间', (viewport) => {
    const random = seededRandom(1027);
    for (let index = 0; index < 1000; index++) {
      const point = placeDew(viewport, range, [], random)!;
      expect(isDewPositionSafe(point, viewport, range)).toBe(true);
      expect(Math.abs(point.x * viewport.width / 100 - viewport.width / 2) - DEW_RADIUS).toBeGreaterThanOrEqual(TREE_BODY_HALF_WIDTH * viewport.scale + 11.99);
      expect(point.y * viewport.height / 100 - DEW_RADIUS).toBeGreaterThanOrEqual(61.99);
      expect(point.y * viewport.height / 100 + DEW_RADIUS).toBeLessThanOrEqual(viewport.height - 77.99);
    }
  });

  it('固定随机数和拥挤候选使用兜底网格，七颗梦露仍保持可点击间隔', () => {
    const viewport = { width: 844, height: 390, scale: 220 / 510 };
    const particles: DewParticle[] = [];
    for (let index = 0; index < 7; index++) {
      const point = placeDew(viewport, range, particles, () => 0.99)!;
      expect(point).not.toBeNull();
      for (const existing of particles) expect(Math.hypot((existing.x - point.x) * viewport.width / 100, (existing.y - point.y) * viewport.height / 100)).toBeGreaterThanOrEqual(59.99);
      particles.push({ id: index, ...point, value: 2, collected: false });
    }
  });

  it('没有可用区域时不把梦露放回树上', () => {
    const viewport = { width: 200, height: 180, scale: 1 };
    expect(dewSpawnRegions(viewport, range)).toEqual([]); expect(placeDew(viewport, range, [], Math.random)).toBeNull();
  });

  it('旋转和调整窗口后重新安置原有梦露，不改变编号、价值或资源', () => {
    const { game } = testGame(); game.spawnDew();
    const original = game.getSnapshot().dewParticles[0];
    const viewport = { width: 640, height: 360, scale: 190 / 510 }; game.setDewViewport(viewport);
    const particle = game.getSnapshot().dewParticles[0];
    expect(isDewPositionSafe(particle, viewport, range)).toBe(true); expect(particle.id).toBe(original.id); expect(particle.value).toBe(original.value); expect(game.getSnapshot().save.dew).toBe(0);
  });

  it('窗口缩窄后不保留互相重叠的命中区域，空间不足时暂时减少数量', () => {
    const { game } = testGame(); for (let index = 0; index < 7; index++) game.spawnDew();
    const viewport = { width: 640, height: 360, scale: 190 / 510 }; game.setDewViewport(viewport);
    const placed: DewParticle[] = [];
    for (const particle of game.getSnapshot().dewParticles) { expect(isDewPositionSafe(particle, viewport, range, placed)).toBe(true); placed.push(particle); }
    expect(placed.length).toBeGreaterThan(0); expect(game.getSnapshot().save.dew).toBe(0);
  });
});
