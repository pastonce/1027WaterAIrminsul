import { describe, expect, it } from 'vitest';
import { TREE_ART, TREE_MAX_HALF_WIDTH } from '../src/data/treeArt';
import { anchorTreeLeaves, CD_BRANCHES, LEAF_ATTACHMENTS } from '../src/game/tree/leafAnchors';
import type { CalibratedTreeBody } from '../src/game/tree/leafAnchors';
import { multiplyTreeMatrix, TREE_ANIMATIONS, treeAnimationPose, transformTreePoint } from '../src/game/tree/timeline';
import type { TreeMatrix, TreeSlot } from '../src/game/tree/timeline';

const artwork = (part: TreeSlot) => multiplyTreeMatrix(part.matrix, TREE_ART[part.asset].registration as TreeMatrix);
const anchor = (part: TreeSlot) => transformTreePoint(artwork(part), ...LEAF_ATTACHMENTS[part.asset]);
const trunk = (parts: TreeSlot[]) => parts.find((part) => /^tree(?:01|[1-9])$/.test(part.asset))!;
const contours = new WeakMap<TreeSlot, { x: number; y: number }[][]>();

function distanceToWood(point: { x: number; y: number }, body: TreeSlot) {
  let loops = contours.get(body);
  if (!loops) {
    const matrix = artwork(body);
    loops = TREE_ART[body.asset].outline.split('M').filter(Boolean).map((contour) => contour.replace('Z', '').split('L').map((entry) => {
      const [horizontal, vertical] = entry.split(' ').map(Number);
      return transformTreePoint(matrix, horizontal, vertical);
    }));
    contours.set(body, loops);
  }
  let distance = Infinity;
  let inside = false;
  for (const points of loops) {
    points.forEach((first, index) => {
      const second = points[(index + 1) % points.length];
      if ((first.y > point.y) !== (second.y > point.y) && point.x < (second.x - first.x) * (point.y - first.y) / (second.y - first.y) + first.x) inside = !inside;
      const horizontal = second.x - first.x; const vertical = second.y - first.y;
      const amount = Math.max(0, Math.min(1, ((point.x - first.x) * horizontal + (point.y - first.y) * vertical) / (horizontal * horizontal + vertical * vertical || 1)));
      distance = Math.min(distance, Math.hypot(point.x - first.x - horizontal * amount, point.y - first.y - vertical * amount));
    });
  }
  return inside ? 0 : distance;
}

describe('C/D原叶柄校准', () => {
  it('A/B早期与E/F原数据不被校准层修改', () => {
    for (const step of [...Array.from({ length: 17 }, (_, index) => index), ...Array.from({ length: 17 }, (_, index) => index + 35)]) {
      const source = treeAnimationPose(step);
      expect(anchorTreeLeaves(step, source)).toBe(source);
    }
  });

  it.each(Array.from({ length: 18 }, (_, index) => index + 17))('grow%d每个中间帧叶柄都贴当前可见木枝，不提前飞向下一树体', (step) => {
    const duration = TREE_ANIMATIONS[step].duration;
    const times = new Set([...Array.from({ length: 33 }, (_, frame) => duration * frame / 32), .33329, .3333, .33331]);
    for (const time of times) {
      const source = treeAnimationPose(step, time);
      const current = anchorTreeLeaves(step, source);
      const body = trunk(current);
      const branches = CD_BRANCHES[body.asset as CalibratedTreeBody];
      const bodyMatrix = artwork(body);
      for (const part of current.filter((entry) => entry.asset.startsWith('leaf'))) {
        const branch = branches[part.id];
        expect(branch, `${step}/${time}/${body.asset}/${part.id}`).toBeDefined();
        const point = anchor(part);
        const expected = transformTreePoint(bodyMatrix, branch[0] * 1000, branch[1] * 1000);
        expect(point.x).toBeCloseTo(expected.x, 8); expect(point.y).toBeCloseTo(expected.y, 8);
        expect(distanceToWood(point, body), `${step}/${time}/${part.id}`).toBeLessThan(.1);
        const original = source.find((entry) => entry.id === part.id)!;
        expect(part.asset).toBe(original.asset);
        expect(part.matrix.slice(0, 4)).toEqual(original.matrix.slice(0, 4));
        expect(part).not.toHaveProperty('opacity');
      }
      current.filter((part) => !part.asset.startsWith('leaf')).forEach((part) => expect(part).toBe(source.find((entry) => entry.id === part.id)));
    }
  });

  it('不改源矩阵、槽序、附件显隐，重复求值确定且不累加位移', () => {
    const source = treeAnimationPose(23, .4);
    const original = structuredClone(source);
    const current = anchorTreeLeaves(23, source);
    expect(source).toEqual(original);
    expect(current.map((part) => [part.id, part.asset])).toEqual(source.map((part) => [part.id, part.asset]));
    anchorTreeLeaves(23, current).forEach((part, index) => part.matrix.forEach((value, coefficient) => expect(value).toBeCloseTo(current[index].matrix[coefficient], 10)));
    expect(anchorTreeLeaves(23, treeAnimationPose(23, .4))).toEqual(current);
  });

  it('同枝芽到大叶替换承接点一致，相邻旧簇与新叶有独立位置', () => {
    const groups = {
      tree3: [['leaf4', 'leaf1_2']],
      tree4: [['leaf1_1', 'leaf3_4'], ['leaf4_1', 'leaf2_1']],
      tree5: [['leaf4', 'leaf1_1'], ['leaf4_1', 'leaf3_3'], ['leaf4_2', 'leaf1_3'], ['leaf4_3', 'leaf1_4'], ['leaf4_4', 'leaf2_2'], ['leaf4_5', 'leaf3_6']],
    };
    for (const [body, aliases] of Object.entries(groups)) for (const [before, after] of aliases) expect(CD_BRANCHES[body as CalibratedTreeBody][before]).toEqual(CD_BRANCHES[body as CalibratedTreeBody][after]);
    const body = CD_BRANCHES.tree5;
    expect(Math.hypot(body.bunch3_2[0] - body.leaf1_4[0], body.bunch3_2[1] - body.leaf1_4[1])).toBeGreaterThan(.035);
  });

  it('D末十五处种子经校准完整保留，旧离枝簇已接回枝端', () => {
    const source = treeAnimationPose(34);
    const current = anchorTreeLeaves(34, source);
    const leaves = current.filter((part) => part.asset.startsWith('leaf'));
    expect(leaves).toHaveLength(15);
    expect(leaves.map((part) => [part.id, part.asset])).toEqual(source.filter((part) => part.asset.startsWith('leaf')).map((part) => [part.id, part.asset]));
    const old = source.find((part) => part.id === 'bunch3_2')!;
    const corrected = leaves.find((part) => part.id === old.id)!;
    expect(distanceToWood(anchor(old), trunk(source))).toBeGreaterThan(15);
    expect(distanceToWood(anchor(corrected), trunk(current))).toBeLessThan(.1);
  });

  it('C/D全关键过程真实叶片包络不越480半宽', () => {
    let maximum = 0;
    for (let step = 17; step <= 34; step++) for (let frame = 0; frame <= 32; frame++) {
      const current = anchorTreeLeaves(step, treeAnimationPose(step, TREE_ANIMATIONS[step].duration * frame / 32));
      for (const part of current.filter((entry) => entry.asset.startsWith('leaf'))) {
        const matrix = artwork(part);
        const points = TREE_ART[part.asset].outline.split('M').filter(Boolean).flatMap((contour) => contour.replace('Z', '').split('L').map((entry) => {
          const [horizontal, vertical] = entry.split(' ').map(Number);
          return transformTreePoint(matrix, horizontal, vertical);
        }));
        for (const point of points) maximum = Math.max(maximum, Math.abs(point.x - 500));
      }
    }
    expect(maximum).toBeLessThanOrEqual(TREE_MAX_HALF_WIDTH);
  });
});
