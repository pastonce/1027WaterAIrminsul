import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TREE_ART, TREE_MAX_HALF_WIDTH, treeArtSources } from '../src/data/treeArt';
import { createTreeModel, treeBodyPath } from '../src/game/tree/model';
import { TREE_FINAL_GROWTH, TREE_GROWTH_HEIGHTS, treeGrowthDuration, treeGrowthStep } from '../src/game/tree/growth';
import { TREE_ANIMATIONS, treeAnimationPose, treePlayback, transformTreePoint } from '../src/game/tree/timeline';
import growthSource from '../src/data/treeGrowth.generated.json';
import { getTreeHeight } from '../src/game/growth/GrowthSystem';
import { startupPlan } from '../src/game/assets/startupPlan';
import { completeLoadingArtChoices } from '../src/data/stageLoading';
import manifest from '../docs/tree-assets.manifest.json' with { type: 'json' };

describe('世界树重绘素材', () => {
  it('原25张与6张E/F变体均有真正透明，两档哈希发布且不覆盖原始智慧树', () => {
    expect(Object.keys(TREE_ART)).toHaveLength(31); expect(manifest.inputs).toHaveLength(31); expect(manifest.files).toHaveLength(62);
    for (const input of manifest.inputs) {
      expect(input.transparentFraction).toBeGreaterThan(.04); expect(input.paintedFraction).toBeGreaterThan(.005);
      for (const [file, hash] of [[input.source, input.sourceSha256], [input.generated, input.generatedSha256]]) if (existsSync(file)) expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(hash);
    }
    for (const file of manifest.files) {
      const bytes = readFileSync(file.file);
      expect(bytes.length).toBe(file.bytes); expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
    expect(manifest.publishedBytes).toBeLessThan(4.5 * 1024 * 1024);
  });
  it.each([true, false])('compact=%s只下载当前档24张，不将原8192图集或4.2骨架接入运行时', (compact) => {
    const plan = startupPlan(completeLoadingArtChoices({}, () => .1), compact ? 844 : 1440, compact ? 390 : 900, 1, false);
    const sources = plan.files.filter((file) => file.url.includes('/tree/')).map((file) => file.url);
    expect(sources).toHaveLength(24); expect(new Set(sources)).toEqual(new Set(treeArtSources(compact)));
    expect(sources.some((url) => /TreeofWisdom|\.skel|\.png/.test(url))).toBe(false);
  });
});


describe('完整原始智慧树时间轴', () => {
  const original = JSON.parse(readFileSync(growthSource.source, 'utf8'));
  it('保留原骨骼、附件尺寸与槽位前后顺序，只剔除没有美术附件的anim辅助标记', () => {
    expect(createHash('sha256').update(readFileSync(growthSource.source)).digest('hex')).toBe(growthSource.sha256);
    expect(growthSource.spine).toBe('4.2.38'); expect(growthSource.bones).toHaveLength(57); expect(growthSource.slots).toHaveLength(56);
    expect(growthSource.bones).toEqual(original.bones.filter((bone: { name: string }) => growthSource.bones.some((entry) => entry.name === bone.name)));
    expect(growthSource.slots).toEqual(original.slots.filter((slot: { name: string }) => original.skins[0].attachments[slot.name]));
    expect(growthSource.attachments).toEqual(original.skins[0].attachments);
  });
  it.each(Array.from({ length: 52 }, (_, step) => step))('动画 %i 的每个原关键帧、负时间、离散切图及真实时长均不替换为终态插值', (step) => {
    const clip = TREE_ANIMATIONS[step]; const raw = original.animations[clip.name];
    const bones = Object.fromEntries(growthSource.bones.filter((bone) => raw.bones?.[bone.name]).map((bone) => [bone.name, raw.bones[bone.name]]));
    const slots = Object.fromEntries(growthSource.slots.filter((slot) => raw.slots?.[slot.name]).map((slot) => [slot.name, raw.slots[slot.name]]));
    expect(clip.name).toBe(step ? `grow${step}` : 'start'); expect(clip.bones).toEqual(bones); expect(clip.slots).toEqual(slots);
    const tracks = [bones, slots] as Record<string, Record<string, { time?: number }[]>>[];
    const duration = Math.max(0, ...tracks.flatMap((entries) => Object.values(entries).flatMap((entry) => Object.values(entry).flatMap((keys) => keys.map((key) => key.time ?? 0)))));
    expect(clip.duration).toBe(duration);
  });
  it('start只有草地、首次浇灌才长芽；原定时刻切换躯干而不是叠化两张树图', () => {
    expect(treeAnimationPose(0).map((part) => part.asset)).toEqual(['tree_grass']);
    const asset = (step: number, time: number) => createTreeModel(step, time).body.map((part) => part.asset);
    expect(asset(2, .3332)).toEqual(['tree01']); expect(asset(2, .3333)).toEqual(['tree1']);
    expect(asset(18, .3332)).toEqual(['tree3']); expect(asset(18, .3333)).toEqual(['tree4']);
    expect(asset(50, .4166)).toEqual(['tree8']); expect(asset(50, .4167)).toEqual(['tree9']);
    expect(TREE_ANIMATIONS[2].duration).toBe(.8333);
  });
  it('使用原生关键帧的升起 / 回弹，不用统一的power2.out或末端高度拉伸', () => {
    const center = (step: number, time: number, id: string) => transformTreePoint(treeAnimationPose(step, time).find((part) => part.id === id)!.matrix, 500, 500);
    expect(center(1, .3333, 'tree01').y).toBeLessThan(center(1, 0, 'tree01').y);
    const width = (time: number) => createTreeModel(36, time).body[0].width;
    expect(width(.5)).toBeGreaterThan(width(.3333)); expect(width(.6667)).toBeCloseTo(width(.5));
    expect(center(36, .5, 'tree6').y).toBeLessThan(center(36, .6667, 'tree6').y);
    expect(center(51, .3333, 'tree9').y).toBeLessThan(center(51, .6667, 'tree9').y);
  });
  it('原shear与独立X/Y缩放保留，负行列式不能简化成左右翻转', () => {
    const part = treeAnimationPose(18, .6667).find((entry) => entry.id === 'leaf4')!;
    expect(part.matrix[0] * part.matrix[3] - part.matrix[1] * part.matrix[2]).toBeLessThan(0);
    const body = treeAnimationPose(1, .3333).find((entry) => entry.id === 'tree01')!;
    expect(Math.hypot(body.matrix[0], body.matrix[1]) * 1000).toBeCloseTo(135 * .2);
    expect(Math.hypot(body.matrix[2], body.matrix[3]) * 1000).toBeCloseTo(215 * 1.2 * .2);
  });
  it('末段严格隐藏原文件隐藏的叶槽，不保留grow50冠部，也不补干、补枝、抬冠', () => {
    expect(createTreeModel(50).crown).toHaveLength(10);
    expect(createTreeModel(51).parts.map((part) => part.id)).toEqual(['tree9', 'grass', 'overlay9']);
    const used = new Set<string>();
    for (let step = 0; step <= 51; step++) for (let frame = 0; frame <= 4; frame++) {
      const model = createTreeModel(step, TREE_ANIMATIONS[step].duration * frame / 4);
      for (const part of model.parts) {
        used.add(part.asset); expect(part.x).toBeGreaterThanOrEqual(500 - TREE_MAX_HALF_WIDTH - 1); expect(part.x + part.width).toBeLessThanOrEqual(500 + TREE_MAX_HALF_WIDTH + 1);
        expect(part.matrix.every(Number.isFinite)).toBe(true);
      }
      expect(treeBodyPath(model.body)).not.toMatch(/NaN|Infinity/);
    }
    expect([...used].sort()).toEqual(Object.keys(TREE_ART).filter((name) => name !== 'trunk_column' && name !== 'tree9_growth' && !name.endsWith('_complete')).sort());
  });
  it('每20点推进有效生长，即使只添叶不长高也播放，最终7点不播放', () => {
    expect(treeGrowthStep(0)).toBe(0); expect(treeGrowthStep(TREE_FINAL_GROWTH)).toBe(51);
    expect(treeGrowthStep(39)).toBe(1); expect(treeGrowthStep(-20)).toBe(0); expect(treeGrowthStep(NaN)).toBe(0);
    expect(getTreeHeight(60)).toBeCloseTo(getTreeHeight(80)); expect(treeGrowthDuration(60, 80)).toBeGreaterThan(0);
    expect(getTreeHeight(1020)).toBe(getTreeHeight(1027)); expect(treeGrowthDuration(1020, 1027)).toBe(0);
    expect(TREE_GROWTH_HEIGHTS.every((height) => height >= 0 && height < 650)).toBe(true);
    expect(treeGrowthDuration(980, 1000)).toBe(750); expect(treeGrowthDuration(1000, 1020)).toBe(667);
  });
  it('播放游标按原秒数推进并可从当前帧续播，多段不插入额外延时或新缓动', () => {
    const playback = treePlayback({ step: 35, time: TREE_ANIMATIONS[35].duration }, 36);
    expect(playback.duration).toBe(TREE_ANIMATIONS[36].duration);
    expect(playback.at(.25)).toEqual({ step: 36, time: .25 });
    const resumed = treePlayback(playback.at(.25), 37);
    expect(resumed.at(.1)).toEqual({ step: 36, time: .35 });
    expect(resumed.at(resumed.duration)).toEqual({ step: 37, time: TREE_ANIMATIONS[37].duration });
    expect(treePlayback({ step: 51, time: TREE_ANIMATIONS[51].duration }, 51).duration).toBe(0);
  });
});
