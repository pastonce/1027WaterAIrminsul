import { describe, expect, it } from 'vitest';
import { HIDING_PLACES } from '../src/data/inhabitants';
import { creatureLayout } from '../src/game/encounters/layout';
import { roamingMotion, roamingVariables } from '../src/game/encounters/motion';

describe('逐点入退场与屏缘跃出', () => {
  it('A1 / A2 与 C3 原地渐显，不沿物件滑入', () => {
    for (const place of [HIDING_PLACES.A![0], HIDING_PLACES.A![1], HIDING_PLACES.C![2]]) {
      expect(place.arrival).toBe('fade');
      expect(roamingMotion(0, undefined, false, false, place)).toMatchObject({ horizontal: 0, vertical: 0, opacity: 0 });
      expect(roamingMotion(0.375, undefined, false, false, place)).toMatchObject({ horizontal: 0, vertical: 0, opacity: 0.75 });
      expect(roamingMotion(0.75, undefined, false, false, place).opacity).toBe(1);
      expect(roamingVariables(place)).toMatchObject({ '--enter-x': '0%', '--enter-y': '0%', '--enter-opacity': 0 });
    }
  });

  it('C3 自然 / 领奖退场沿垂直方向移至屏幕下方，旋转和相机不改变出口', () => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 640, height: 360 }]) {
      for (const offset of [0, 800]) {
        const actor = creatureLayout('C', [{ id: 1, slot: 2, asset: 'aranara_01', phase: 'watching' }], { ...viewport, scale: 0.5, offset, root: viewport.height - 80, treeHeight: 360, seed: 1027 }, [])[0];
        expect(actor.departure).toBe('bottom');
        for (const celebrated of [false, true]) {
          const motion = roamingMotion(2, celebrated ? 1.35 : 0.7, celebrated, false, actor);
          expect(motion.horizontal).toBe(0); expect(actor.top + motion.vertical * actor.height).toBeGreaterThan(viewport.height);
        }
      }
    }
  });

  it('D / E 的 1 / 2 / 6 仅使用三成移动距离，其余藏点保持默认', () => {
    for (const stage of ['D', 'E'] as const) for (const slot of [0, 1, 5]) {
      const place = HIDING_PLACES[stage]![slot]; expect(place.travel).toBe(0.3);
      const entrance = roamingMotion(0, undefined, false, false, place);
      expect(entrance.opacity).toBe(0);
      const original = roamingMotion(0, undefined, false, false, { ...place, travel: 1 });
      expect(entrance.vertical).toBeCloseTo(original.vertical * 0.3);
      expect(entrance.horizontal).toBeCloseTo(original.horizontal * 0.3);
      const exit = roamingMotion(2, 0.7, false, false, place);
      expect(exit.opacity).toBe(0);
      expect(Math.abs(exit.vertical)).toBeLessThanOrEqual(0.36);
    }
    expect(HIDING_PLACES.D![4].travel).toBeUndefined();
  });

  it('左右屏缘领奖跳出后保持离地并直接向外飞走，不再回落原处', () => {
    for (const edge of ['left', 'right'] as const) {
      const peak = roamingMotion(2, 1.35 * 0.35, true, false, { edge });
      expect(peak.vertical).toBeCloseTo(-0.78);
      let previous = edge === 'left' ? -peak.horizontal : peak.horizontal;
      for (const progress of [0.45, 0.55, 0.7, 0.9, 1]) {
        const motion = roamingMotion(2, 1.35 * progress, true, false, { edge });
        const outward = edge === 'left' ? -motion.horizontal : motion.horizontal;
        expect(outward).toBeGreaterThan(previous); expect(motion.vertical).toBeLessThan(-0.5); previous = outward;
      }
      expect(previous).toBeCloseTo(1.2); expect(Number.parseFloat(roamingVariables({ edge })['--exit-y'])).toBeLessThan(-50);
    }
  });

  it('减少动态不保留透明度或位移，不改变奖励 / 自然退场计时', () => {
    expect(roamingMotion(0, undefined, false, true, HIDING_PLACES.A![0])).toMatchObject({ opacity: 1, horizontal: 0, vertical: 0 });
    expect(roamingMotion(2, 0.3, true, true, { edge: 'left' })).toMatchObject({ opacity: 1, horizontal: 0, vertical: 0 });
  });
});
