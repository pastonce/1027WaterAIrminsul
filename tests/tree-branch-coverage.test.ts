import { describe, expect, it } from 'vitest';
import { TREE_ART } from '../src/data/treeArt';
import { FOLIAGE_ATTACHMENTS } from '../src/game/tree/foliage';
import { FOLIAGE_BRANCHES } from '../src/game/tree/foliageLayout';
import type { FoliageBranchStep } from '../src/game/tree/foliageLayout';
import { FOLIAGE_SITES } from '../src/game/tree/foliagePlan';
import { treeGrowthStep } from '../src/game/tree/growth';
import { createTreeModel } from '../src/game/tree/model';
import { transformTreePoint } from '../src/game/tree/timeline';
import type { TreeMatrix } from '../src/game/tree/timeline';

const bodies: FoliageBranchStep[] = [36, 42, 45, 50];
const peripheral = (horizontal: number, vertical: number) => vertical < .72 && (vertical < .20 || horizontal < .33 || horizontal > .76);
const region = (horizontal: number) => horizontal < .4 ? 'left' : horizontal > .7 ? 'right' : 'center';
const height = (vertical: number) => vertical < .18 ? 'upper' : vertical < .36 ? 'middle' : 'lower';

function inverseMatrix(matrix: TreeMatrix): TreeMatrix {
  const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = matrix;
  const determinant = scaleX * scaleY - skewX * skewY;
  return [scaleY / determinant, -skewY / determinant, -skewX / determinant, scaleX / determinant, (skewX * offsetY - scaleY * offsetX) / determinant, (skewY * offsetX - scaleX * offsetY) / determinant];
}

function branchNeighborhood(step: FoliageBranchStep) {
  const model = createTreeModel(step, undefined, true); const body = model.body[0];
  const inverse = inverseMatrix(body.artMatrix);
  const attachments = model.crown.map((part) => {
    const point = transformTreePoint(part.artMatrix, ...FOLIAGE_ATTACHMENTS[part.asset]);
    return transformTreePoint(inverse, point.x, point.y);
  });
  const outline = TREE_ART[body.art].outline.split('M').filter(Boolean).flatMap((loop) => loop.replace('Z', '').split('L').map((entry) => {
    const [horizontal, vertical] = entry.split(' ').map(Number);
    return { horizontal, vertical };
  })).filter((point) => peripheral(point.horizontal / 1000, point.vertical / 1000));
  const distances = outline.map((point) => ({
    ...point,
    nearest: Math.min(...attachments.map((attachment) => Math.hypot(attachment.x - point.horizontal, attachment.y - point.vertical))),
  }));
  return { model, distances };
}

describe('E/F真实外围木枝的局部枝叶覆盖', () => {
  it.each(bodies)('body%d外围每段木枝都有当前已生枝叶承接点，不靠全冠面积掩盖裸枝', (step) => {
    const { distances } = branchNeighborhood(step);
    expect(distances.length).toBeGreaterThan(1000);
    const worst = distances.reduce((largest, point) => point.nearest > largest.nearest ? point : largest);
    expect(worst.nearest, `grow${step} 最远裸枝UV(${(worst.horizontal / 1000).toFixed(3)}, ${(worst.vertical / 1000).toFixed(3)})`).toBeLessThanOrEqual(80);
  });

  it.each(bodies)('body%d左下与右下冠分别约束空档，不能用一侧繁密补偿另一侧', (step) => {
    const { distances } = branchNeighborhood(step);
    for (const side of ['left', 'right'] as const) {
      const branch = distances.filter((point) => point.vertical >= 360 && (side === 'left' ? point.horizontal < 330 : point.horizontal > 760));
      expect(branch.length).toBeGreaterThan(100);
      expect(Math.max(...branch.map((point) => point.nearest)), `grow${step} ${side} lower`).toBeLessThanOrEqual(80);
    }
  });

  it('四十八处新末梢在tree6真实切图后即有正常嫩芽，不等未来浇灌才补上光枝', () => {
    expect(FOLIAGE_SITES).toHaveLength(96);
    const added = FOLIAGE_SITES.slice(48);
    expect(added).toHaveLength(48);
    const before = createTreeModel(36, .3332, true).crown;
    const after = createTreeModel(36, .3333, true).crown;
    for (const [offset, site] of added.entries()) {
      const identity = `crown-growth-${48 + offset}`;
      expect(site.birth).toBe(36);
      expect(before.find((part) => part.id === identity)).toBeUndefined();
      const bud = after.find((part) => part.id === identity)!;
      expect(bud, identity).toBeDefined();
      expect(bud.phase).toBe('bud'); expect(bud.asset).toBe('leaf4');
      expect(bud).not.toHaveProperty('opacity');
    }
    expect(createTreeModel(36, undefined, true).crown).toHaveLength(67);
  });

  it('新增末梢每轮均有四处由芽舒叶，下一轮直接成簇，左右中上下交错延续到收尾', () => {
    const added = FOLIAGE_SITES.slice(48);
    for (let step = 37; step <= 48; step++) {
      const opened = added.map((site, offset) => ({ ...site, index: 48 + offset })).filter((site) => site.leafAt === step);
      expect(opened, `grow${step}`).toHaveLength(4);
      for (const site of opened) {
        const identity = `crown-growth-${site.index}`;
        expect(createTreeModel(step - 1, undefined, true).crown.find((part) => part.id === identity)?.phase).toBe('bud');
        expect(createTreeModel(step, undefined, true).crown.find((part) => part.id === identity)?.phase).toBe('leaf');
        expect(createTreeModel(step + 1, undefined, true).crown.find((part) => part.id === identity)?.phase).toBe('cluster');
      }
      for (const body of bodies) {
        const regions = opened.map((site) => region(FOLIAGE_BRANCHES[body][15 + site.index][0]));
        expect(regions, `body${body} grow${step}`).toContain('left');
        expect(regions, `body${body} grow${step}`).toContain('right');
      }
    }
    for (const body of bodies) for (let step = 37; step < 48; step++) {
      const opened = added.map((site, offset) => ({ ...site, index: 48 + offset })).filter((site) => site.leafAt === step || site.leafAt === step + 1);
      const heights = opened.map((site) => height(FOLIAGE_BRANCHES[body][15 + site.index][1]));
      expect(new Set(heights), `body${body} grow${step}–${step + 1}`).toEqual(new Set(['upper', 'middle', 'lower']));
    }
  });

  it('最终所有补入末梢都成为独立正常叶簇，旧身份全部留存且收尾七点不再变化', () => {
    const final = createTreeModel(51, undefined, true).crown;
    const initial = createTreeModel(34, undefined, true).crown;
    expect(final).toHaveLength(111);
    expect(new Set(final.map((part) => part.site)).size).toBe(111);
    for (const part of initial) expect(final.some((current) => current.site === part.site)).toBe(true);
    for (const part of final.slice(15)) {
      expect(part.phase).toBe('cluster'); expect(part.asset).toMatch(/^leafbunch[123]$/);
      expect(part).not.toHaveProperty('opacity');
    }
    expect(createTreeModel(treeGrowthStep(1020), undefined, true)).toEqual(createTreeModel(treeGrowthStep(1027), undefined, true));
  });
});
