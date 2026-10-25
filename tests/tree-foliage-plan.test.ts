import { describe, expect, it } from 'vitest';
import { FOLIAGE_BRANCHES } from '../src/game/tree/foliageLayout';
import { FOLIAGE_SITES } from '../src/game/tree/foliagePlan';

const steps = Array.from({ length: 12 }, (_, index) => 36 + index);
const sites = FOLIAGE_SITES.map((site, index) => ({ ...site, index }));
const original = sites.slice(0, 48);
const terminals = sites.slice(48);
const region = (horizontal: number) => horizontal < .4 ? 'left' : horizontal > .7 ? 'right' : 'center';
const height = (vertical: number) => vertical < .18 ? 'upper' : vertical < .36 ? 'middle' : 'lower';

describe('E/F全冠交错生长排程', () => {
  it('保留原48个新增枝位，另外48个真实末梢在首轮实际换干后同时带出嫩芽', () => {
    expect(FOLIAGE_SITES).toHaveLength(96);
    expect(original).toHaveLength(48); expect(terminals).toHaveLength(48);
    for (const step of steps) {
      const current = original.filter((site) => site.birth === step);
      expect(current, `grow${step}`).toHaveLength(4);
      expect(current.filter((site) => site.index < 12), `grow${step} outer`).toHaveLength(1);
      expect(current.filter((site) => site.index >= 12), `grow${step} inner`).toHaveLength(3);
    }
    expect(terminals.every((site) => site.birth === 36)).toBe(true);
    expect(terminals.every((site) => site.leafAt !== undefined && site.leafAt > site.birth)).toBe(true);
    expect(Math.min(...sites.map((site) => site.birth))).toBe(36);
    expect(Math.max(...sites.map((site) => site.birth))).toBe(47);
  });

  it.each([36, 42, 45, 50] as const)('body%d的实际木枝每一浇均覆盖左中右，不先长满两侧', (body) => {
    for (const step of steps) {
      const regions = original.filter((site) => site.birth === step).map((site) => region(FOLIAGE_BRANCHES[body][15 + site.index][0]));
      expect(new Set(regions), `body${body} grow${step}`).toEqual(new Set(['left', 'center', 'right']));
    }
  });

  it.each([36, 42, 45, 50] as const)('body%d任意连续两浇同时兼顾上下冠与内外枝', (body) => {
    for (const step of steps.slice(0, -1)) {
      const current = original.filter((site) => site.birth === step || site.birth === step + 1);
      const heights = current.map((site) => height(FOLIAGE_BRANCHES[body][15 + site.index][1]));
      expect(new Set(heights), `body${body} grow${step}–${step + 1}`).toEqual(new Set(['upper', 'middle', 'lower']));
      expect(current.filter((site) => site.index < 12)).toHaveLength(2);
      expect(current.filter((site) => site.index >= 12)).toHaveLength(6);
    }
  });

  it('末梢嫩芽分十二轮各四处舒叶，与原枝位合计每轮八处大叶和下一轮八处成簇', () => {
    for (let step = 37; step <= 48; step++) {
      const terminalLeaves = terminals.filter((site) => site.leafAt === step);
      expect(terminalLeaves, `grow${step} terminal leaf`).toHaveLength(4);
      expect(sites.filter((site) => (site.leafAt ?? site.birth + 1) === step), `grow${step} all leaf`).toHaveLength(8);
      expect(sites.filter((site) => (site.leafAt ?? site.birth + 1) + 1 === step + 1), `grow${step + 1} cluster`).toHaveLength(8);
    }
    expect(Math.min(...terminals.map((site) => site.leafAt!))).toBe(37);
    expect(Math.max(...terminals.map((site) => site.leafAt!))).toBe(48);
    expect(original.every((site) => site.leafAt === undefined || site.leafAt === site.birth + 1)).toBe(true);
  });

  it.each([36, 42, 45, 50] as const)('body%d末梢每轮兼顾两侧、连续两轮兼顾上下冠，不从外侧顺序扫到中央', (body) => {
    for (let step = 37; step <= 48; step++) {
      const current = terminals.filter((site) => site.leafAt === step);
      const sides = current.map((site) => FOLIAGE_BRANCHES[body][15 + site.index][0] < .5 ? 'left' : 'right');
      expect(new Set(sides), `body${body} grow${step} sides`).toEqual(new Set(['left', 'right']));
      if (step < 48) {
        const pair = terminals.filter((site) => site.leafAt === step || site.leafAt === step + 1);
        const heights = pair.map((site) => height(FOLIAGE_BRANCHES[body][15 + site.index][1]));
        expect(new Set(heights), `body${body} grow${step}–${step + 1} terminal heights`).toEqual(new Set(['upper', 'middle', 'lower']));
      }
    }
  });

  it('中央内冠第一轮已发芽，新增左冠上下层分批生长而非最后集中补齐', () => {
    expect(FOLIAGE_SITES[24].birth).toBe(36);
    expect(FOLIAGE_SITES[33].birth).toBe(38);
    expect(FOLIAGE_SITES[29].birth).toBe(40);
    expect(FOLIAGE_SITES[32].birth).toBe(41);
    expect(FOLIAGE_SITES[40].birth).toBe(44);
    for (const body of [36, 42, 45, 50] as const) {
      for (const index of [33, 40, 29, 32]) expect(FOLIAGE_BRANCHES[body][15 + index][0]).toBeLessThan(.4);
    }
  });

  it('最后三轮持续跨冠添叶，grow49保留原簇2收尾', () => {
    const final = FOLIAGE_SITES[5];
    expect(final.birth).toBe(47);
    expect(final.cluster).toBe('leafbunch2');
    expect(final.birth + 2).toBe(49);
    for (const step of [45, 46, 47]) {
      expect(original.filter((site) => site.birth === step)).toHaveLength(4);
      expect(sites.filter((site) => (site.leafAt ?? site.birth + 1) + 1 === step + 2)).toHaveLength(8);
    }
  });

  it('出生排程为固定工程数据，重复读取不改变身份、形象或轮次', () => {
    const before = JSON.stringify(FOLIAGE_SITES);
    expect(new Set(sites.map((site) => site.index)).size).toBe(96);
    for (const site of sites) {
      expect(Number.isInteger(site.birth)).toBe(true);
      if (site.leafAt !== undefined) { expect(Number.isInteger(site.leafAt)).toBe(true); expect(site.leafAt).toBeGreaterThan(site.birth); }
      expect(site.width).toBeGreaterThan(0);
      expect(['leafbunch1', 'leafbunch2', 'leafbunch3']).toContain(site.cluster);
    }
    expect(JSON.stringify(FOLIAGE_SITES)).toBe(before);
  });
});
