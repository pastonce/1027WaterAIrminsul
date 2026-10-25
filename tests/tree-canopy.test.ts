import { describe, expect, it } from 'vitest';
import { TREE_ART } from '../src/data/treeArt';
import { createTreeModel } from '../src/game/tree/model';
import { FOLIAGE_SITES } from '../src/game/tree/foliagePlan';
import type { TreePart } from '../src/game/tree/model';

const outlines = Object.fromEntries(Object.entries(TREE_ART).map(([asset, art]) => [asset, art.outline.split('M').filter(Boolean).map((loop) => loop.replace('Z', '').split('L').map((point) => point.split(' ').map(Number)))]));

function painted(part: TreePart, horizontal: number, vertical: number) {
  if (horizontal < part.x || horizontal > part.x + part.width || vertical < part.y || vertical > part.y + part.height) return false;
  const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = part.artMatrix;
  const determinant = scaleX * scaleY - skewX * skewY;
  const localX = (scaleY * (horizontal - offsetX) - skewX * (vertical - offsetY)) / determinant;
  const localY = (scaleX * (vertical - offsetY) - skewY * (horizontal - offsetX)) / determinant;
  let inside = false;
  for (const outline of outlines[part.art]) for (let index = 0; index < outline.length; index++) {
    const first = outline[index]; const second = outline[(index + 1) % outline.length];
    if ((first[1] > localY) !== (second[1] > localY) && localX < (second[0] - first[0]) * (localY - first[1]) / (second[1] - first[1]) + first[0]) inside = !inside;
  }
  return inside;
}

describe('世界树终态丰茂树冠', () => {
  it('外梢、二级枝端与内冠共111枝位，旧枝位不被密冠替代，每处各有芽叶簇阶段', () => {
    expect(FOLIAGE_SITES).toHaveLength(96);
    const final = createTreeModel(51, undefined, true);
    expect(final.crown).toHaveLength(111);
    expect(final.crown.filter((part) => part.foliage === 'retained')).toHaveLength(15);
    expect(final.crown.filter((part) => part.foliage === 'extension' && part.phase === 'cluster')).toHaveLength(96);
    expect(new Set(FOLIAGE_SITES.map((site) => site.cluster)).size).toBe(3);
    expect(new Set(FOLIAGE_SITES.map((site) => site.angle)).size).toBeGreaterThan(5);
    expect(Math.max(...FOLIAGE_SITES.map((site) => site.width)) - Math.min(...FOLIAGE_SITES.map((site) => site.width))).toBeGreaterThan(80);
  });

  it('真实叶片轮廓覆盖冠区六成以上，中层连成树冠而非仅沿周围挂叶团', () => {
    const crown = createTreeModel(51, undefined, true).crown;
    let total = 0; let covered = 0; let middle = 0; let middleCovered = 0;
    for (let vertical = 2340; vertical <= 3060; vertical += 12) for (let horizontal = 20; horizontal <= 980; horizontal += 12) {
      if (((horizontal - 500) / 480) ** 2 + ((vertical - 2700) / 360) ** 2 > 1) continue;
      const visible = crown.some((part) => painted(part, horizontal, vertical));
      total++; if (visible) covered++;
      if (vertical >= 2580 && vertical < 2820) { middle++; if (visible) middleCovered++; }
    }
    expect(covered / total).toBeGreaterThan(.6);
    expect(middleCovered / middle).toBeGreaterThan(.75);
    expect(crown.some((part) => painted(part, 500, 3220))).toBe(false);
  });

  it('左侧与左下枝叉形成连贯叶簇，补密时不挖空原右冠', () => {
    const crown = createTreeModel(51, undefined, true).crown;
    const regions = { left: { total: 0, covered: 0 }, right: { total: 0, covered: 0 }, leftLower: { total: 0, covered: 0 }, rightLower: { total: 0, covered: 0 } };
    for (let vertical = 2340; vertical <= 3060; vertical += 12) for (let horizontal = 20; horizontal <= 980; horizontal += 12) {
      if (((horizontal - 500) / 480) ** 2 + ((vertical - 2700) / 360) ** 2 > 1) continue;
      const visible = crown.some((part) => painted(part, horizontal, vertical));
      const side = horizontal < 500 ? regions.left : regions.right;
      side.total++; if (visible) side.covered++;
      if (vertical >= 2820) {
        const lower = horizontal < 500 ? regions.leftLower : regions.rightLower;
        lower.total++; if (visible) lower.covered++;
      }
    }
    expect(regions.left.covered / regions.left.total).toBeGreaterThan(.65);
    expect(regions.right.covered / regions.right.total).toBeGreaterThan(.58);
    expect(regions.leftLower.covered / regions.leftLower.total).toBeGreaterThan(.55);
    expect(regions.rightLower.covered / regions.rightLower.total).toBeGreaterThan(.42);
  });

  it('新密冠分批展叶，不在末次换干整冠突现，最后7点所有图形相同', () => {
    const counts = [34, 36, 38, 40, 42, 44, 46, 49].map((step) => createTreeModel(step, undefined, true).crown.length);
    expect(counts[0]).toBe(15); expect(counts.at(-1)).toBe(111);
    counts.slice(1).forEach((count, index) => expect(count).toBeGreaterThanOrEqual(counts[index]));
    expect(counts[4]).toBeLessThan(counts[6]);
    expect(createTreeModel(50, undefined, true).crown.map((part) => part.id)).toEqual(createTreeModel(49, undefined, true).crown.map((part) => part.id));
    expect(createTreeModel(51, undefined, true)).toEqual(createTreeModel(Math.floor(1027 / 20), undefined, true));
  });
});
