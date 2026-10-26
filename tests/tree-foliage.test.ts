import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TreeRenderer } from '../src/components/TreeRenderer';
import { TREE_MAX_HALF_WIDTH, treeArtSources, TREE_ART } from '../src/data/treeArt';
import { createTreeModel } from '../src/game/tree/model';
import type { TreePart } from '../src/game/tree/model';
import { multiplyTreeMatrix, TREE_ANIMATIONS, treeAnimationPose, transformTreePoint, treePlayback } from '../src/game/tree/timeline';
import type { TreeMatrix } from '../src/game/tree/timeline';
import { treeGrowthDuration, treeGrowthStep } from '../src/game/tree/growth';
import { FOLIAGE_ATTACHMENTS, foliageDuration } from '../src/game/tree/foliage';
import { FOLIAGE_BRANCHES } from '../src/game/tree/foliageLayout';
import type { FoliageBranchStep } from '../src/game/tree/foliageLayout';
import { applyLeafMotion, sampleLeafMotion } from '../src/game/tree/leafMotion';
import { leafMotionDuration } from '../src/game/tree/leafMotion';
import { foliageEventDelay, leafMotionProgress } from '../src/game/tree/foliageTiming';
import { FOLIAGE_SITES } from '../src/game/tree/foliagePlan';
import { anchorTreeLeaves } from '../src/game/tree/leafAnchors';

const leaves = (step: number, time?: number) => createTreeModel(step, time, true).crown;
const anchor = (part: TreePart) => transformTreePoint(part.artMatrix, ...FOLIAGE_ATTACHMENTS[part.asset]);
const initial = anchorTreeLeaves(34, treeAnimationPose(34)).filter((part) => part.asset.startsWith('leaf'));
const events = FOLIAGE_SITES.map((site, index) => ({ birth: site.birth, leafAt: site.leafAt ?? site.birth + 1, clusterAt: (site.leafAt ?? site.birth + 1) + 1, index }));
const cutovers: FoliageBranchStep[] = [36, 42, 45, 50];
const cutTimes: Record<number, number> = { 36: .3333, 42: .3333, 45: .3333, 50: .4167 };
const matrixArea = (matrix: TreeMatrix) => Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]);
const contourCache = new WeakMap<ReturnType<typeof createTreeModel>['body'], { x: number; y: number }[][]>();

function inverseMatrix(matrix: TreeMatrix): TreeMatrix {
  const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = matrix;
  const determinant = scaleX * scaleY - skewX * skewY;
  return [scaleY / determinant, -skewY / determinant, -skewX / determinant, scaleX / determinant, (skewX * offsetY - scaleY * offsetX) / determinant, (skewY * offsetX - scaleX * offsetY) / determinant];
}

function expectMatrix(actual: TreeMatrix, expected: TreeMatrix) {
  actual.forEach((value, coefficient) => expect(value, `coefficient ${coefficient}`).toBeCloseTo(expected[coefficient], 8));
}

function branchDistance(point: { x: number; y: number }, body: ReturnType<typeof createTreeModel>['body']) {
  let distance = Infinity; let inside = false;
  let contours = contourCache.get(body);
  if (!contours) {
    contours = body.flatMap((part) => TREE_ART[part.art].outline.split('M').filter(Boolean).map((contour) => contour.replace('Z', '').split('L').map((entry) => {
      const [horizontal, vertical] = entry.split(' ').map(Number);
      return transformTreePoint(part.artMatrix, horizontal, vertical);
    })));
    contourCache.set(body, contours);
  }
  for (const points of contours) {
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

describe('E/F真实枝条附着与原生切图回弹', () => {
  it('D到E交接逐一保留十五个已校准叶柄的原附件完整矩阵', () => {
    const continued = leaves(34);
    expect(continued).toHaveLength(15);
    expect(continued.map((part) => part.id)).toEqual(initial.map((part) => part.id));
    continued.forEach((part, index) => {
      expect(part.asset).toBe(initial[index].asset); expectMatrix(part.matrix, initial[index].matrix);
      expect(part).not.toHaveProperty('opacity');
    });
  });

  it('八片旧单叶与六个旧小簇不被新增大簇替代，唯一芽首浇原生切为大叶', () => {
    const bud = initial.find((part) => part.asset === 'leaf4')!;
    const singles = initial.filter((part) => part.id.startsWith('leaf') && part !== bud);
    const clusters = initial.filter((part) => part.id.startsWith('bunch'));
    expect(singles).toHaveLength(8); expect(clusters).toHaveLength(6);
    for (let step = 34; step <= 51; step++) for (const seed of [...singles, ...clusters]) {
      const current = leaves(step).find((part) => part.id === seed.id)!;
      expect(current.asset).toBe(seed.asset);
      current.matrix.slice(0, 4).forEach((value, coefficient) => expect(value).toBeCloseTo(seed.matrix[coefficient], 10));
    }
    const before = leaves(34).find((part) => part.id === bud.id)!;
    const complete = leaves(35).find((part) => part.id === bud.id)!;
    const mature = treeAnimationPose(35).find((part) => part.id === 'leaf1_3')!;
    expect(complete.asset).toBe('leaf1'); expect(complete.phase).toBe('leaf'); expect(complete.motion).toBe('leaf');
    expect(anchor(complete).x).toBeCloseTo(anchor(before).x, 8); expect(anchor(complete).y).toBeCloseTo(anchor(before).y, 8);
    complete.matrix.slice(0, 4).forEach((value, coefficient) => expect(value).toBeCloseTo(mature.matrix[coefficient], 10));
    for (const progress of [0, .25, .5, .75, 1]) {
      const current = leaves(35, foliageDuration(35) * progress).find((part) => part.id === bud.id)!;
      expectMatrix(current.matrix, applyLeafMotion('leaf', progress, complete.matrix));
    }
  });

  it('全程每个枝位只有一图且完全不透明，身份只增不减，最终一百一十一个唯一枝位', () => {
    let previous = new Set<string>();
    for (let step = 34; step <= 51; step++) for (let frame = 0; frame <= 24; frame++) {
      const current = leaves(step, foliageDuration(step) * frame / 24); const identities = current.map((part) => part.site!);
      expect(new Set(identities).size).toBe(current.length);
      expect(current.slice(0, 15).map((part) => part.id)).toEqual(initial.map((part) => part.id));
      for (const identity of previous) expect(identities).toContain(identity);
      for (const part of current) {
        expect(part.id).toBe(part.site); expect(part.id.endsWith('-crown')).toBe(false); expect(part).not.toHaveProperty('opacity');
      }
      previous = new Set(identities);
    }
    expect(FOLIAGE_SITES).toHaveLength(96);
    expect(leaves(51)).toHaveLength(111); expect(previous.size).toBe(111);
  });

  it.each(events)('新枝位 $index 在 grow$birth 出芽、grow$leafAt 换正常大叶、下一浇直接换叶簇', ({ birth, leafAt, clusterAt, index }) => {
    const id = `crown-growth-${index}`;
    expect(leaves(birth - 1).find((part) => part.id === id)).toBeUndefined();
    const bud = leaves(birth).find((part) => part.id === id)!; const leaf = leaves(leafAt).find((part) => part.id === id)!;
    const cluster = leaves(clusterAt).find((part) => part.id === id)!; const unchanged = leaves(clusterAt + 1).find((part) => part.id === id)!;
    expect(bud.phase).toBe('bud'); expect(bud.asset).toBe('leaf4'); expect(bud.motion).toBe('bud');
    expect(leaf.phase).toBe('leaf'); expect(leaf.asset).toMatch(/^leaf[123]$/); expect(leaf.motion).toBe('leaf');
    expect(cluster.phase).toBe('cluster'); expect(cluster.asset).toMatch(/^leafbunch[123]$/); expect(cluster.motion).toMatch(/^cluster[123]$/);
    expect(unchanged.phase).toBe('cluster'); expect(unchanged.asset).toBe(cluster.asset); expect(unchanged.motion).toBeUndefined();
    expect(new Set([bud.asset, leaf.asset, cluster.asset]).size).toBe(3);
    for (let step = birth + 1; step < leafAt; step++) {
      const waiting = leaves(step).find((part) => part.id === id)!;
      expect(waiting.phase).toBe('bud'); expect(waiting.asset).toBe('leaf4'); expect(waiting.motion).toBeUndefined();
    }
    for (const [step, phase, previous] of [[birth, 'bud', undefined], [leafAt, 'leaf', 'bud'], [clusterAt, 'cluster', 'leaf']] as const) if (cutTimes[step]) {
      expect(leaves(step, cutTimes[step] - .0001).find((part) => part.id === id)?.phase).toBe(previous);
      expect(leaves(step, cutTimes[step]).find((part) => part.id === id)?.phase).toBe(phase);
    }
  });

  it('新增枝位仅正常嫩芽和大叶，扣除原生回弹后芽宽16～22、单叶宽36～54世界单位', () => {
    let buds = 0; let largeLeaves = 0;
    for (let step = 35; step <= 49; step++) {
      const delay = foliageEventDelay(step);
      const times = new Set([0, delay, delay + .1, delay + .25, delay + .5, foliageDuration(step)]);
      for (const time of times) for (const part of leaves(step, Math.min(time, foliageDuration(step)))) {
        if (part.foliage !== 'extension' || part.phase === 'cluster') continue;
        const progress = part.motion ? leafMotionProgress(part.motion, Math.min(time, foliageDuration(step)), delay) : 1;
        const settled = part.motion ? multiplyTreeMatrix(part.matrix, inverseMatrix(sampleLeafMotion(part.motion, progress))) : part.matrix;
        const artMatrix = multiplyTreeMatrix(settled, TREE_ART[part.art].registration as TreeMatrix);
        const sourceWidth = Math.hypot(artMatrix[0], artMatrix[1]) * 1000;
        expect(sourceWidth, `grow${step}@${time} ${part.id} ${part.phase}`).toBeLessThanOrEqual((part.phase === 'bud' ? 22 : 54) + .000001);
        expect(sourceWidth).toBeGreaterThanOrEqual((part.phase === 'bud' ? 16 : 36) - .000001);
        if (part.phase === 'bud') buds++; else largeLeaves++;
      }
    }
    expect(buds).toBeGreaterThan(96); expect(largeLeaves).toBeGreaterThan(96);
  });

  it('原叶柄和新簇承接点严格落在对应树体已校准枝位，而非图片中心', () => {
    for (const step of cutovers) {
      const model = createTreeModel(step, undefined, true); const body = model.body[0];
      for (const part of model.crown) {
        const index = part.foliage === 'retained' ? initial.findIndex((seed) => seed.id === part.id) : 15 + Number(part.id.replace('crown-growth-', ''));
        const [horizontal, vertical] = FOLIAGE_BRANCHES[step][index];
        const expected = transformTreePoint(body.artMatrix, horizontal * 1000, vertical * 1000); const attached = anchor(part);
        expect(attached.x, `grow${step} ${part.id} horizontal`).toBeCloseTo(expected.x, 8);
        expect(attached.y, `grow${step} ${part.id} vertical`).toBeCloseTo(expected.y, 8);
      }
    }
  });

  it('各浇灌终态的叶柄和簇承接点都贴近实际木质轮廓', () => {
    const violations: string[] = [];
    for (let step = 36; step <= 51; step++) {
      const model = createTreeModel(step, undefined, true);
      for (const part of model.crown) {
        const distance = branchDistance(anchor(part), model.body);
        if (distance >= 20) violations.push(`grow${step} ${part.id}: ${distance.toFixed(4)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('成熟树冠新增九十六处枝位均经历芽叶簇，不以同位叠图伪造繁茂', () => {
    const final = leaves(51);
    expect(final.filter((part) => part.foliage === 'extension')).toHaveLength(96);
    const positions = final.filter((part) => part.foliage === 'extension').map(anchor);
    expect(new Set(positions.map((point) => `${point.x.toFixed(5)},${point.y.toFixed(5)}`)).size).toBe(96);
    expect(final.filter((part) => part.foliage === 'extension').every((part) => part.phase === 'cluster')).toBe(true);
  });

  it('同身份随对应枝条延伸而不随机重排，非事件终态附着关系保持', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('树枝位不得随机重排'); });
    try {
      const before = leaves(36); const after = leaves(50);
      const existing = new Set(before.map((part) => part.id));
      expect(after.filter((part) => existing.has(part.id)).map((part) => part.id)).toEqual(before.map((part) => part.id));
      expect(before.some((part) => {
        const moved = after.find((current) => current.id === part.id)!;
        return Math.hypot(anchor(part).x - anchor(moved).x, anchor(part).y - anchor(moved).y) > 30;
      })).toBe(true);
      for (let step = 36; step <= 51; step++) {
        const reference = [...cutovers].reverse().find((cutover) => cutover <= step)!;
        const body = createTreeModel(reference, undefined, true).body[0];
        for (const part of leaves(step)) {
          const index = part.foliage === 'retained' ? initial.findIndex((seed) => seed.id === part.id) : 15 + Number(part.id.replace('crown-growth-', ''));
          const [horizontal, vertical] = FOLIAGE_BRANCHES[reference][index];
          const expected = transformTreePoint(body.artMatrix, horizontal * 1000, vertical * 1000);
          expect(anchor(part).x).toBeCloseTo(expected.x, 8); expect(anchor(part).y).toBeCloseTo(expected.y, 8);
        }
      }
    } finally { random.mockRestore(); }
  });

  it('非换干事件按原真实秒数完整复用矩阵和峰值回落，不归一化加速或透明展叶', () => {
    let events = 0;
    for (let step = 35; step <= 49; step++) {
      if (cutovers.includes(step as FoliageBranchStep)) continue;
      for (const settled of leaves(step).filter((part) => part.motion)) {
        events++;
        for (const progress of [0, .2, .5, .75, 1]) {
          const current = leaves(step, leafMotionDuration(settled.motion!) * progress).find((part) => part.id === settled.id)!;
          expect(current.asset).toBe(settled.asset); expect(current.motion).toBe(settled.motion);
          expectMatrix(current.matrix, multiplyTreeMatrix(settled.matrix, sampleLeafMotion(settled.motion!, progress)));
          expect(current).not.toHaveProperty('opacity');
        }
        const peak = settled.motion === 'bud' || settled.motion === 'leaf' ? .5 : 0;
        const peakPart = leaves(step, leafMotionDuration(settled.motion!) * peak).find((part) => part.id === settled.id)!;
        expect(matrixArea(peakPart.matrix)).toBeGreaterThan(matrixArea(settled.matrix) * 1.06);
      }
    }
    expect(events).toBeGreaterThan(20);
  });

  it('换干树干与地面逐帧保留原关键帧，枝位不被原藏叶事件清空', () => {
    for (const step of cutovers) for (const time of [0, cutTimes[step] - .0001, cutTimes[step], (cutTimes[step] + foliageDuration(step)) / 2, foliageDuration(step)]) {
      const original = treeAnimationPose(step, time).filter((part) => !part.asset.startsWith('leaf'));
      const model = createTreeModel(step, time, true); const actual = model.parts.filter((part) => !part.foliage);
      expect(actual.map((part) => part.id)).toEqual(original.map((part) => part.id));
      actual.forEach((part, index) => { expect(part.asset).toBe(original[index].asset); expectMatrix(part.matrix, original[index].matrix); });
      expect(model.crown.slice(0, 15).map((part) => part.id)).toEqual(initial.map((part) => part.id));
    }
  });

  it('四次换干各三十三帧及grow51回弹始终绑定当前可见木质，不提前搬到未来树体', () => {
    const baselines = [34, ...cutovers].map((step) => ({ step, body: createTreeModel(step, undefined, true).body[0] }));
    const oldModel = createTreeModel(34, undefined, true); const oldAnchors = oldModel.crown.map(anchor);
    const oldDistances = oldAnchors.map((point) => branchDistance(point, oldModel.body));
    const violations: string[] = [];
    for (const step of [...cutovers, 51]) {
      const times = new Set(Array.from({ length: 33 }, (_, frame) => foliageDuration(step) * frame / 32));
      if (cutTimes[step]) for (const offset of [-.0001, 0, .0001]) times.add(cutTimes[step] + offset);
      for (const time of times) {
        const model = createTreeModel(step, time, true); const body = model.body[0];
        const reference = baselines.find((candidate) => candidate.body.id === body.id)!;
        const nativeMotion = multiplyTreeMatrix(body.artMatrix, inverseMatrix(reference.body.artMatrix));
        const trace = nativeMotion.slice(0, 4).reduce((sum, value) => sum + value * value, 0);
        const determinant = nativeMotion[0] * nativeMotion[3] - nativeMotion[1] * nativeMotion[2];
        const stretch = Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * determinant * determinant))) / 2);
        if (cutTimes[step]) expect(reference.step, `grow${step}@${time} 可见木质`).toBe(time < cutTimes[step] ? baselines[baselines.findIndex((candidate) => candidate.step === step) - 1].step : step);
        for (const part of model.crown) {
          const index = part.foliage === 'retained' ? initial.findIndex((seed) => seed.id === part.id) : 15 + Number(part.id.replace('crown-growth-', ''));
          let expected: { x: number; y: number };
          if (reference.step === 34) {
            const original = oldAnchors[index];
            expected = transformTreePoint(nativeMotion, original.x, original.y);
          } else {
            const [horizontal, vertical] = FOLIAGE_BRANCHES[reference.step as FoliageBranchStep][index];
            expected = transformTreePoint(body.artMatrix, horizontal * 1000, vertical * 1000);
          }
          const progress = part.motion ? leafMotionProgress(part.motion, time, foliageEventDelay(step)) : 1;
          const settled = part.motion ? multiplyTreeMatrix(part.matrix, inverseMatrix(sampleLeafMotion(part.motion, progress))) : part.matrix;
          const artMatrix = multiplyTreeMatrix(settled, TREE_ART[part.art].registration as TreeMatrix);
          const attached = transformTreePoint(artMatrix, ...FOLIAGE_ATTACHMENTS[part.asset]);
          expect(attached.x, `grow${step}@${time} ${part.id} 承接点横向`).toBeCloseTo(expected.x, 8);
          expect(attached.y, `grow${step}@${time} ${part.id} 承接点纵向`).toBeCloseTo(expected.y, 8);
          const distance = branchDistance(attached, model.body);
          const limit = reference.step === 34 ? oldDistances[index] * stretch + .000001 : 20;
          if (distance >= limit) violations.push(`grow${step}@${time.toFixed(4)} ${part.id}: ${distance.toFixed(4)} / ${limit.toFixed(4)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('零时长grow49使用250ms原簇模板，暂停续帧和末游标不回零', () => {
    const id = 'crown-growth-5'; const settled = leaves(49).find((part) => part.id === id)!;
    expect(TREE_ANIMATIONS[49].duration).toBe(0); expect(foliageDuration(49)).toBe(.25);
    expect(settled.asset).toBe('leafbunch2'); expect(settled.motion).toBe('cluster2');
    for (const progress of [0, .25, .5, 1]) {
      const current = leaves(49, .25 * progress).find((part) => part.id === id)!;
      expectMatrix(current.matrix, applyLeafMotion('cluster2', progress, settled.matrix));
    }
    const playback = treePlayback({ step: 48, time: foliageDuration(48) }, 49, foliageDuration);
    expect(playback.duration).toBe(.25); expect(playback.at(.1)).toEqual({ step: 49, time: .1 });
    const paused = playback.at(.1); const saved = createTreeModel(paused.step, paused.time, true);
    expect(createTreeModel(paused.step, paused.time, true)).toEqual(saved);
    const resumed = treePlayback(paused, 49, foliageDuration);
    expect(resumed.duration).toBeCloseTo(.15); expect(resumed.at(.15)).toEqual({ step: 49, time: .25 });
    expect(playback.at(.25)).toEqual(resumed.at(.15));
    expect(createTreeModel(playback.at(.25).step, playback.at(.25).time, true)).toEqual(createTreeModel(49, undefined, true));
  });

  it('原轨低层播放使用相同真实秒数，等待所有新增枝叶回稳后才完结', () => {
    for (let step = 35; step <= 51; step++) {
      const milliseconds = Math.round(foliageDuration(step) * 1000);
      const playback = treePlayback({ step: step - 1, time: foliageDuration(step - 1) }, step, foliageDuration);
      expect(milliseconds).toBe(Math.round(foliageDuration(step) * 1000));
      expect(Math.round(playback.duration * 1000)).toBe(milliseconds);
      expect(playback.at(playback.duration)).toEqual({ step, time: foliageDuration(step) });
      expect(createTreeModel(step, playback.at(playback.duration).time, true)).toEqual(createTreeModel(step, undefined, true));
      for (const part of leaves(step).filter((current) => current.motion)) {
        expect(leafMotionProgress(part.motion!, foliageDuration(step), step === 35 ? 0 : foliageEventDelay(step))).toBe(1);
      }
    }
  });

  it('读档重建无需随机或额外存档，最后七点所有枝叶矩阵完全不变', () => {
    for (let step = 34; step <= 51; step++) {
      const loaded = createTreeModel(step, undefined, true);
      expect(loaded).toEqual(createTreeModel(step, foliageDuration(step), true));
      for (const progress of [0, .5, 1]) expect(createTreeModel(step, foliageDuration(step) * progress, true)).toEqual(createTreeModel(step, foliageDuration(step) * progress, true));
    }
    expect(treeGrowthDuration(1020, 1027)).toBe(0);
    expect(createTreeModel(treeGrowthStep(1020), undefined, true)).toEqual(createTreeModel(treeGrowthStep(1027), undefined, true));
  });

  it('原木质与所有原生过冲枝叶全过程严格保持480半宽梦露避让包络', () => {
    const violations: string[] = [];
    for (let step = 34; step <= 51; step++) {
      const times = new Set(Array.from({ length: 33 }, (_, frame) => foliageDuration(step) * frame / 32));
      if (cutTimes[step]) for (const offset of [-.0001, 0, .0001]) times.add(cutTimes[step] + offset);
      for (const time of times) for (const part of createTreeModel(step, time, true).parts) {
        if (part.x < 500 - TREE_MAX_HALF_WIDTH || part.x + part.width > 500 + TREE_MAX_HALF_WIDTH) violations.push(`grow${step}@${time.toFixed(4)} ${part.id} ${part.asset}: [${part.x.toFixed(4)}, ${(part.x + part.width).toFixed(4)}]`);
        expect(part.artMatrix.every(Number.isFinite)).toBe(true);
      }
    }
    expect(violations).toEqual([]);
    const scene = renderToStaticMarkup(createElement(TreeRenderer, { stage: 'F', growth: 1020, reduced: true, growing: false, onInteract() {} }));
    expect(scene).toContain('data-tree-art="tree9_growth"'); expect(scene).not.toContain('data-tree-art="tree9_complete"');
    expect(scene).not.toMatch(/pointer-events="all"|<canvas|data-tree-part="[^"]+-crown"/);
    expect(scene.match(/<mask /g)).toHaveLength(1);
  });

  it('设备仍只预载二十四张单档，不下载旧烘焙成熟冠与另一档', () => {
    for (const compact of [false, true]) {
      const sources = treeArtSources(compact);
      expect(sources).toHaveLength(24); expect(new Set(sources).size).toBe(24);
      expect(sources).toContain(TREE_ART.tree9_growth[compact ? 'compact' : 'full']);
      expect(sources).not.toContain(TREE_ART.tree9_complete[compact ? 'compact' : 'full']);
    }
  });

  it('原轨早期保持原叶槽，连续枝叶前移后同成长值不因背景阶段重置身份或图形', () => {
    for (let step = 0; step < 34; step++) {
      const source = anchorTreeLeaves(step, treeAnimationPose(step));
      const seedling = source.some((part) => part.asset === 'tree01' || part.asset === 'tree1');
      const actual = createTreeModel(step, undefined, true).parts;
      expect(actual.map((part) => [part.id, part.asset])).toEqual(source.map((part) => [part.id, part.asset]));
      actual.forEach((part, index) => {
        const expected = [...source[index].matrix];
        if (seedling && part.id !== 'grass') expected[5] += 16;
        expectMatrix(part.matrix, expected as TreeMatrix);
      });
    }
    for (const growth of [340, 520, 580, 600, 680, 840, 1020]) {
      const markup = renderToStaticMarkup(createElement(TreeRenderer, { stage: 'A', growth, reduced: true, growing: false, onInteract() {} }));
      for (const stage of ['B', 'C', 'D', 'E', 'F'] as const) expect(renderToStaticMarkup(createElement(TreeRenderer, { stage, growth, reduced: true, growing: false, onInteract() {} }))).toBe(markup);
    }
    const markup = (stage: 'E' | 'F') => renderToStaticMarkup(createElement(TreeRenderer, { stage, growth: 840, reduced: true, growing: false, onInteract() {} }));
    expect(markup('E')).toBe(markup('F'));
  });
});
