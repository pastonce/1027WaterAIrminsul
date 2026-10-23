import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKGROUND_ASSETS } from '../src/data/backgrounds';
import { BackgroundExtraMotion, motionWave } from '../src/game/backgrounds/extra-motion';
import type { ExtraMotionSource } from '../src/game/backgrounds/extra-motion';
import { projectBackgroundMesh } from '../src/game/backgrounds/mesh';

type Runtime = Pick<typeof import('spine-player-4-0'), 'SkeletonJson' | 'TextureAtlas' | 'AtlasAttachmentLoader' | 'Skeleton' | 'AnimationState' | 'AnimationStateData'>;

async function skeletonRuntime(version: '4.0' | '4.1' = '4.0'): Promise<Runtime> {
  return version === '4.0' ? import('spine-player-4-0') : import('spine-webgl-4-1') as unknown as Promise<Runtime>;
}

async function simpleSkeleton() {
  const runtime = await skeletonRuntime();
  const parser = new runtime.SkeletonJson(new runtime.AtlasAttachmentLoader(new runtime.TextureAtlas('')));
  const data = parser.readSkeletonData({ bones: [{ name: 'root', length: 80 }, { name: 'child', parent: 'root', x: 80, length: 40 }, { name: 'end', parent: 'child', x: 40 }], slots: [], skins: [], animations: {} });
  const skeleton = new runtime.Skeleton(data); skeleton.updateWorldTransform();
  return skeleton;
}

describe('原站扩展动画适配', () => {
  it('多谐波位移保留周期、振幅与相位语义', () => {
    expect(motionWave(2, 10, 0, 0.5, 0)).toBeCloseTo(10);
    expect(motionWave(2, 10, 0, 0, Math.PI / 2)).toBeCloseTo(10);
    for (let index = 0; index < 100; index++) expect(Math.abs(motionWave(3, 6, 2, index / 10, 0.7))).toBeLessThanOrEqual(6);
  });

  it('风摆沿子链延迟传播，结束骨骼不受扩展动画修改', async () => {
    const skeleton = await simpleSkeleton();
    const motion = new BackgroundExtraMotion(skeleton, { extra: { wind: { rootBoneName: 'root', endBoneName: 'end', animation: { default: { mode: 1, rotateTime: 2, rotateRange: 8, rotateOffset: 0, childOffset: 0.25, affectByLevel: 0.2 } } } } }, 'animation');
    motion.apply(0.1);
    expect(skeleton.bones[0].rotation).toBeCloseTo(Math.sin(0.1 * Math.PI) * 8);
    expect(skeleton.bones[1].rotation).toBeCloseTo(Math.sin(-0.15 * Math.PI) * 8 * 1.2);
    expect(skeleton.bones[2].rotation).toBe(0);
  });

  it('缩放扩展使用各轴参数，重复重画不累积变形', async () => {
    const skeleton = await simpleSkeleton();
    const motion = new BackgroundExtraMotion(skeleton, { extra: { wind: { rootBoneName: 'root', animation: { default: { mode: 1, rotateRange: 0, scaleXRange: 0.1, scaleXTime: 2, scaleYRange: 0.2, scaleYTime: 4 } } } } }, 'animation');
    motion.apply(0.1);
    const snapshot = skeleton.bones.map((bone) => [bone.scaleX, bone.scaleY, bone.rotation]);
    expect(snapshot[0][0]).toBeCloseTo(1 + Math.sin(0.1 * Math.PI) * 0.1);
    expect(snapshot[0][1]).toBeCloseTo(1 + Math.sin(0.05 * Math.PI) * 0.2);
    for (let index = 0; index < 20; index++) { motion.restore(); motion.apply(0); }
    expect(skeleton.bones.map((bone) => [bone.scaleX, bone.scaleY, bone.rotation])).toEqual(snapshot);
  });

  it('漂移修改根骨骼且可还原，不覆盖同级骨骼', async () => {
    const skeleton = await simpleSkeleton();
    const motion = new BackgroundExtraMotion(skeleton, { extra: { drift: { rootBoneName: 'root', animation: { default: { mode: 3, moveXFreq: 2, moveXAmp: 10, moveYFreq: 4, moveYAmp: 3, moveYDelay: 0.5 } } } } }, 'animation');
    motion.apply(0.1);
    expect(skeleton.bones[0].x).toBeCloseTo(Math.sin(0.1 * Math.PI) * 10);
    expect(skeleton.bones[0].y).toBeCloseTo(Math.sin(0.05 * Math.PI + 0.5) * 3);
    expect(skeleton.bones[1].x).toBe(80);
    motion.restore(); expect(skeleton.bones[0].x).toBe(0); expect(skeleton.bones[0].y).toBe(0);
  });

  it('时间比例为零时不推进，并忽略不存在或不支持的绑定', async () => {
    const skeleton = await simpleSkeleton();
    const motion = new BackgroundExtraMotion(skeleton, { extraConfig: { timeScale: 0 }, extra: {
      wind: { rootBoneName: 'root', animation: { default: { mode: 1 } } },
      missing: { rootBoneName: 'missing', animation: { default: { mode: 1 } } },
      unknown: { rootBoneName: 'child', animation: { default: { mode: 99 } } },
    } }, 'animation');
    expect(motion.count).toBe(1); motion.apply(0.1);
    expect(skeleton.bones[0].rotation).toBe(0);
  });

  it('蝴蝶随动在位移后响应、保持有限角度，暂停重画不推进物理', async () => {
    const skeleton = await simpleSkeleton();
    const motion = new BackgroundExtraMotion(skeleton, { extra: { follow: { rootBoneName: 'root', animation: { default: { mode: 4, limitRange: 15, delay: 0.1, speed: 0.3, friction: 0.2 } } } } }, 'animation');
    motion.apply(0);
    let changed = false;
    for (let index = 0; index < 60; index++) {
      motion.restore(); skeleton.bones[0].y = Math.sin(index * 0.2) * 20; skeleton.updateWorldTransform(); motion.apply(0.05);
      expect(Number.isFinite(skeleton.bones[0].rotation)).toBe(true);
      expect(Math.abs(skeleton.bones[0].rotation)).toBeLessThanOrEqual(15);
      changed ||= Math.abs(skeleton.bones[0].rotation) > 0.01;
    }
    expect(changed).toBe(true);
    const rotation = skeleton.bones[0].rotation;
    motion.restore(); motion.apply(0); expect(skeleton.bones[0].rotation).toBe(rotation);
  });

  it.each(Object.values(BACKGROUND_ASSETS))('$id 的原生或扩展动画实际驱动骨骼，而不只依赖画布非空或光照变化', async (asset) => {
    const runtime = await skeletonRuntime(asset.runtime);
    let bindings = 0; let animated = 0;
    for (const layer of asset.layers) {
      const input = JSON.parse(readFileSync(`public${layer.json.src}`, 'utf8'));
      const atlas = new runtime.TextureAtlas(readFileSync(`public${layer.atlas.src}`, 'utf8'));
      for (const page of atlas.pages) page.setTexture({ getImage: () => ({ width: page.width, height: page.height }), setFilters: () => {}, setWraps: () => {} } as unknown as Parameters<typeof page.setTexture>[0]);
      const data = new runtime.SkeletonJson(new runtime.AtlasAttachmentLoader(atlas)).readSkeletonData(input);
      const skeleton = new runtime.Skeleton(data);
      const state = new runtime.AnimationState(new runtime.AnimationStateData(data)); state.setAnimation(0, layer.animation, true); state.apply(skeleton); skeleton.updateWorldTransform();
      const motion = new BackgroundExtraMotion(skeleton, input as ExtraMotionSource, layer.animation); bindings += motion.count + data.findAnimation(layer.animation)!.timelines.length;
      motion.apply(0);
      const snapshot = skeleton.bones.map((bone) => [bone.x, bone.y, bone.rotation, bone.scaleX, bone.scaleY]);
      for (let frame = 0; frame < 20; frame++) { motion.restore(); state.update(0.05); state.apply(skeleton); motion.apply(0.05); }
      if (skeleton.bones.some((bone, index) => [bone.x, bone.y, bone.rotation, bone.scaleX, bone.scaleY].some((value, coordinate) => Math.abs(value - snapshot[index][coordinate]) > 0.01))) animated++;
      const paused = skeleton.bones.map((bone) => [bone.x, bone.y, bone.rotation]);
      motion.restore(); state.apply(skeleton); motion.apply(0);
      skeleton.bones.forEach((bone, index) => [bone.x, bone.y, bone.rotation].forEach((value, coordinate) => { expect(Number.isFinite(value)).toBe(true); expect(value).toBeCloseTo(paused[index][coordinate], 6); }));
    }
    expect(bindings).toBeGreaterThan(0); expect(animated).toBeGreaterThan(0);
  });
});

describe('参考页补充资源与构图校准', () => {
  it('补取文件具有固定来源、字节数及 SHA-256，不以远程运行时依赖替代发布副本', () => {
    const records = JSON.parse(readFileSync('asserts/reference-supplements/manifest.json', 'utf8')) as Array<{ file: string; source: string; bytes: number; sha256: string }>;
    expect(records).toHaveLength(8);
    for (const record of records) {
      const bytes = readFileSync(`asserts/reference-supplements/${record.file}`);
      expect(record.source.startsWith('https://webstatic.mihoyo.com/ys/event/')).toBe(true);
      expect(bytes.length).toBe(record.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
    }
  });

  it('统一原站设计取景，恢复 B 地台坐标和 C 缺失舞台地面，不绘制 NPC', () => {
    for (const asset of Object.values(BACKGROUND_ASSETS).filter((asset) => asset.id !== 'festival')) expect(asset.view).toEqual({ horizontal: 0, vertical: 0, width: 2500, height: 1080 });
    expect(BACKGROUND_ASSETS.festival.view).toEqual({ horizontal: 0, vertical: 0, width: 2400, height: 1350 });
    const distant = BACKGROUND_ASSETS.forest.layers[0]; expect([distant.horizontal, distant.vertical, distant.scale]).toEqual([0, 0, 1]);
    const ledge = BACKGROUND_ASSETS.dunes.layers.find((layer) => layer.json.src.endsWith('/L_steps_2.json'))!;
    expect([ledge.horizontal, ledge.vertical, ledge.scale]).toEqual([-552.24, -363.67, 1]);
    const floor = BACKGROUND_ASSETS.canopy.layers.find((layer) => layer.json.src.endsWith('/full_NPC.json'))!;
    expect(floor.slots).toEqual(['2']);
    expect(BACKGROUND_ASSETS.canopy.layers.every((layer) => !layer.json.src.endsWith('/medium_NPC.json'))).toBe(true);
    expect(BACKGROUND_ASSETS.sanctuary.layers.some((layer) => layer.json.src.endsWith('/shouye_effect_immobilized.json'))).toBe(true);
    expect(BACKGROUND_ASSETS.sanctuary.planes?.some((plane) => plane.effect === 'mist')).toBe(true);
  });

  it('C 保留原站地形的 28 个顶点、26 个三角面与透视层次，不用色块遮挡穿空', () => {
    const plane = BACKGROUND_ASSETS.canopy.planes!.find((entry) => entry.mesh)!;
    const geometry = JSON.parse(readFileSync(`public${plane.mesh!.geometry.src}`, 'utf8'));
    const projected = projectBackgroundMesh(geometry, plane.mesh!);
    expect(projected.vertices).toHaveLength(28 * 12); expect(projected.indices).toHaveLength(78);
    expect(projected.vertices[0]).toBeLessThan(-3000);
    expect(projected.vertices[7]).toBeCloseTo(1 - 0.01476, 5);
    expect(Array.from(projected.vertices).every(Number.isFinite)).toBe(true);
    expect(new Set(Array.from(projected.vertices).filter((_value, index) => index % 12 === 1).map((value) => Math.round(value))).size).toBeGreaterThan(10);
    expect(plane.optional).not.toBe(true);
    expect(plane.order).toBeGreaterThan(BACKGROUND_ASSETS.canopy.layers[0].order);
    expect(plane.order).toBeLessThan(BACKGROUND_ASSETS.canopy.layers.find((entry) => entry.json.src.endsWith('/medium_flag.json'))!.order);
  });

  it('地形拒绝越界索引与不可见的相机投影', () => {
    const geometry = { attributes: { position: { array: [0, 0, 20] }, uv: { array: [0, 0] } }, index: [1] };
    const transform = { rotationX: 0, localVertical: 0, vertical: 0, cameraDepth: 10 };
    expect(() => projectBackgroundMesh(geometry, transform)).toThrow('background-mesh');
    geometry.index = [0]; expect(() => projectBackgroundMesh(geometry, transform)).toThrow('background-mesh-camera');
  });
});
