import { describe, expect, it, vi } from 'vitest';
import { crystalPerches, crystalPlan } from '../src/game/encounters/crystalflies';
import { FOLIAGE_ATTACHMENTS } from '../src/game/tree/foliage';
import { TREE_WORLD } from '../src/game/tree/geometry';
import * as treePresentation from '../src/game/tree/presentation';
import { transformTreePoint } from '../src/game/tree/timeline';

function anchors(growth: number) {
  return treePresentation.createTreeGrowthModel(growth).crown.filter((part) => part.site).map((part) => ({
    site: part.site!, point: transformTreePoint(part.artMatrix, ...FOLIAGE_ATTACHMENTS[part.asset]),
  }));
}
const identity = ({ horizontal: _horizontal, elevation: _elevation, ...entry }: ReturnType<typeof crystalPlan>[number]) => entry;
const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(first.x - second.x, first.y - second.y);

describe('晶蝶沿稳定枝组延伸', () => {
  it('前移后的连续枝叶接管前复用原计划，580交接不改变任何位置', () => {
    const plan = crystalPlan(1027);
    for (const growth of [0, 100, 180, 340, 520, 560, 580]) {
      expect(crystalPerches(1027, growth)).toEqual(plan);
      expect(crystalPerches(1027, growth, false)).toEqual(plan);
      expect(crystalPerches(1027, growth, true)).toEqual(plan);
      if (growth < 580) expect(crystalPerches(1027, growth)).toBe(plan);
    }
  });

  it('旧晶蝶保持各自原偏移，换干后始终跟随同一叶柄，而非全冠缩放', () => {
    const seed = 1027; const plan = crystalPlan(seed); const base = anchors(580);
    const followed = plan.filter((entry) => entry.threshold <= 580).map((entry) => ({ entry, candidates: new Set(base.map((anchor) => anchor.site)) }));
    for (const growth of [600, 680, 720, 840, 900, 1000, 1020]) {
      const current = new Map(anchors(growth).map((anchor) => [anchor.site, anchor.point]));
      const perches = crystalPerches(seed, growth, true);
      for (const followedEntry of followed) {
        const perch = perches.find((entry) => entry.id === followedEntry.entry.id)!;
        const movement = { x: perch.horizontal - followedEntry.entry.horizontal, y: followedEntry.entry.elevation - perch.elevation };
        for (const origin of base) {
          const target = current.get(origin.site)!;
          if (distance(movement, { x: target.x - origin.point.x, y: target.y - origin.point.y }) > .000001) followedEntry.candidates.delete(origin.site);
        }
        expect(followedEntry.candidates.size).toBeGreaterThan(0);
      }
    }
    const movement = followed.map(({ entry }) => {
      const current = crystalPerches(seed, 1020, true).find((perch) => perch.id === entry.id)!;
      return `${(current.horizontal - entry.horizontal).toFixed(3)},${(entry.elevation - current.elevation).toFixed(3)}`;
    });
    expect(new Set(movement).size).toBeGreaterThan(3);
  });

  it('连续枝叶接管后新出现的晶蝶在出生枝位绑定，之后分拍不改变绑定', () => {
    const seed = 190497686; const plan = crystalPlan(seed);
    const occupied = new Set<string>();
    for (const entry of plan.filter((perch) => perch.threshold > 580)) {
      const birth = crystalPerches(seed, entry.threshold, true).find((perch) => perch.id === entry.id)!;
      expect(identity(birth)).toEqual(identity(entry));
      const origin = anchors(entry.threshold);
      const position = { x: birth.horizontal + TREE_WORLD.width / 2, y: TREE_WORLD.ground - birth.elevation };
      const attachment = { x: position.x - Math.sin(entry.phase) * entry.width * .2, y: position.y + (.35 + Math.cos(entry.phase) * .1) * entry.width };
      const site = origin.find((anchor) => distance(anchor.point, attachment) < .000001)!.site;
      expect(occupied.has(site)).toBe(false); occupied.add(site);
      let candidates = new Set(origin.filter((anchor) => distance(position, anchor.point) <= entry.width * .5 && position.y < anchor.point.y).map((anchor) => anchor.site));
      expect(candidates.size).toBeGreaterThan(0);
      for (const growth of [entry.threshold + 20, 1020]) {
        const perch = crystalPerches(seed, growth, true).find((current) => current.id === entry.id)!;
        const current = new Map(anchors(growth).map((anchor) => [anchor.site, anchor.point]));
        candidates = new Set(origin.filter((anchor) => {
          const target = current.get(anchor.site)!;
          return candidates.has(anchor.site) && distance({ x: perch.horizontal - birth.horizontal, y: birth.elevation - perch.elevation }, { x: target.x - anchor.point.x, y: target.y - anchor.point.y }) < .000001;
        }).map((anchor) => anchor.site));
        expect(candidates.size).toBeGreaterThan(0);
      }
    }
  });

  it('不重抽形象、阈值、尺寸、相位或ID，最后7点位置完全相同', () => {
    const random = vi.spyOn(Math, 'random');
    try {
      const plan = crystalPlan(20261027); const snapshot = structuredClone(plan);
      for (const growth of [700, 740, 840, 880, 980, 1020, 1027]) {
        const perches = crystalPerches(20261027, growth, true);
        expect(perches.map(identity)).toEqual(plan.map(identity));
        expect(perches.every((entry) => Number.isFinite(entry.horizontal) && Number.isFinite(entry.elevation))).toBe(true);
      }
      expect(plan).toEqual(snapshot);
      expect(crystalPerches(20261027, 1027, true)).toBe(crystalPerches(20261027, 1020, true));
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it('同seed和成长步复用结果与模型，切换seed不重排原计划', () => {
    crystalPerches(318, 1000, true);
    const model = vi.spyOn(treePresentation, 'createTreeGrowthModel');
    try {
      const first = crystalPerches(318, 1001, true);
      expect(crystalPerches(318, 1019, true)).toBe(first);
      expect(model).not.toHaveBeenCalled();
      crystalPerches(319, 1000, true);
      expect(crystalPerches(318, 1000, true)).toBe(first);
      expect(first.every((entry) => Math.abs(entry.horizontal) < TREE_WORLD.width)).toBe(true);
    } finally { model.mockRestore(); }
  });
});
