import type { StageId } from '../types/game';

export type BackgroundId = 'forest' | 'dunes' | 'canopy' | 'sanctuary' | 'embers' | 'festival';
export interface BackgroundFile { src: string; source: string }
export interface BackgroundEntrance {
  vertical: number;
  start?: number;
  end: number;
  ease?: 'back';
  light?: boolean;
}
export interface BackgroundMesh {
  geometry: BackgroundFile;
  rotationX: number;
  localVertical: number;
  vertical: number;
  cameraDepth: number;
}
export interface BackgroundPlane {
  texture: BackgroundFile;
  horizontal: number;
  vertical: number;
  width: number;
  height: number;
  order: number;
  opacity?: number;
  additive?: boolean;
  effect?: 'glow' | 'mist' | 'leaves' | 'sand' | 'red-flow' | 'sunlight';
  noise?: BackgroundFile;
  rotation?: number;
  tilt?: number;
  depth?: number;
  speed?: number;
  range?: number;
  entrance?: BackgroundEntrance;
  frames?: number;
  optional?: boolean;
  mesh?: BackgroundMesh;
}
export interface BackgroundLayer {
  json: BackgroundFile;
  atlas: BackgroundFile;
  textures: Array<BackgroundFile & { page: string }>;
  animation: 'animation' | 'loop';
  horizontal: number;
  vertical: number;
  scale: number;
  optional: boolean;
  order: number;
  slots?: string[];
  entrance?: BackgroundEntrance;
}
export interface BackgroundAsset {
  id: BackgroundId;
  runtime: '4.0' | '4.1';
  reference: string;
  base: BackgroundFile;
  baseAspect?: number;
  baseBounds?: { horizontal: number; vertical: number; width: number; height: number };
  baseEntrance?: BackgroundEntrance;
  poster?: string;
  view: { horizontal: number; vertical: number; width: number; height: number };
  layers: BackgroundLayer[];
  planes?: BackgroundPlane[];
  treatment?: 'weathered';
  hiding?: { layer: string; slot?: string; foreground: string; lightBands?: number[]; cuts: Array<{ id: string; layer: string; slot?: string }> };
}

function layer(id: BackgroundId, version: string, name: string, textures: Record<string, string>, options: Partial<Pick<BackgroundLayer, 'animation' | 'horizontal' | 'vertical' | 'scale' | 'optional' | 'order' | 'entrance'>> = {}): BackgroundLayer {
  const directory = `/asserts/backgrounds/${id}`;
  return {
    json: { src: `${directory}/${name}.json`, source: `asserts/${version}/SPINE/${name}.json` },
    atlas: { src: `${directory}/${name}.atlas`, source: `asserts/${version}/SPINE/${name}.atlas` },
    textures: Object.entries(textures).map(([page, source]) => ({ page, src: `${directory}/${page}`, source: `asserts/${version}/${source}` })),
    animation: 'animation', horizontal: 0, vertical: 0, scale: 1, optional: false, order: 0, ...options,
  };
}

function sand(horizontal: number, vertical: number, width: number, height: number, rotation: number, order: number, parentDepth: number, parentScale: number, opacity = 1, depth = -50): BackgroundPlane {
  const projection = 1920 * parentScale / (1920 - parentDepth - depth * parentScale);
  return {
    texture: { src: '/asserts/backgrounds/dunes/mainview_sha.png', source: 'asserts/3.1/scene_mainview/mainview_sha.png' },
    horizontal: horizontal * projection, vertical: vertical * projection, width: width * projection, height: height * projection,
    rotation, order, opacity, effect: 'sand', speed: 0.2,
  };
}

const sourceBackgrounds: Record<Exclude<BackgroundId, 'embers' | 'festival'>, BackgroundAsset> = {
  forest: {
    id: 'forest', runtime: '4.0', reference: 'https://webstatic.mihoyo.com/ys/event/e20220814prev/index.html', poster: '/asserts/backgrounds/forest/poster.webp',
    base: { src: '/asserts/backgrounds/dream.jpg', source: 'asserts/3.0/_other_resources/loading_bg.29f573d9.jpg' },
    view: { horizontal: 0, vertical: 0, width: 2500, height: 1080 },
    hiding: { layer: 'zhongjing2', slot: '右后花3', foreground: '/asserts/backgrounds/forest/hiding-foreground.webp', lightBands: [1], cuts: [{ id: 'middle', layer: 'zhongjing2', slot: '右后花3' }, { id: 'log', layer: 'zhongjing1' }, { id: 'near', layer: 'qianjin' }] },
    baseBounds: { horizontal: 0, vertical: 118, width: 2500, height: 1310 },
    baseEntrance: { vertical: -233, end: 56 },
    layers: [
      layer('forest', '3.0', 'yhuanjing', { 'yhuanjing.png': '_other_resources/yhuanjing.4604d1e3.png' }, { order: 1, entrance: { vertical: -1437, end: 61 } }),
      layer('forest', '3.0', 'zhongjing2', { 'zhongjing2.png': '_other_resources/zhongjing2.c2db5d37.png', 'zhongjing2_2.png': '_other_resources/zhongjing2_2.f177f821.png', 'zhongjing2_3.png': '_other_resources/33291.png' }, { order: 2, entrance: { vertical: -1200, end: 61 } }),
      layer('forest', '3.0', 'zhongjing1', { 'zhongjing1.png': '_other_resources/zhongjing1.8abfefc6.png', 'zhongjing1_2.png': '_other_resources/zhongjing1_2.c215579b.png' }, { order: 4, entrance: { vertical: -1500, end: 61 } }),
      layer('forest', '3.0', 'qianjin', { 'qianjin.png': '_other_resources/qianjin.d27e6561.png', 'qianjin_2.png': '_other_resources/qianjin_2.7313e589.png', 'qianjin_3.png': '_other_resources/qianjin_3.07ba360d.png' }, { order: 7, entrance: { vertical: -1500, end: 61 } }),
      layer('forest', '3.0', 'qianjintm', { 'qianjintm.png': '_other_resources/qianjintm.9aa92272.png' }, { order: 8, entrance: { vertical: 116, start: 16, end: 61, ease: 'back' } }),
    ],
    planes: [
      { texture: { src: '/asserts/backgrounds/forest/index_light.jpg', source: 'asserts/reference-supplements/3.0/index_light.jpg' }, horizontal: 256, vertical: 155, width: 1538, height: 800, order: 3, additive: true, effect: 'glow', opacity: 0.5, entrance: { vertical: -1155, end: 61, light: true } },
      { texture: { src: '/asserts/backgrounds/forest/loading_leaf_small.png', source: 'asserts/3.0/_other_resources/loading_leaf_small.972a493d.png' }, horizontal: 0, vertical: 0, width: 2500, height: 1080, order: 11, effect: 'leaves', frames: 2, opacity: 0.65, optional: true },
    ],
  },
  dunes: {
    id: 'dunes', runtime: '4.0', reference: 'https://webstatic.mihoyo.com/ys/event/e20220917prev/index.html', poster: '/asserts/backgrounds/dunes/poster.webp',
    base: { src: '/asserts/backgrounds/dunes/sand.png', source: 'asserts/3.1/scene_mainview/sand.png' },
    view: { horizontal: 0, vertical: 0, width: 2500, height: 1080 },
    baseBounds: { horizontal: -81.243, vertical: 65.33, width: 2696, height: 1015 },
    layers: [
      layer('dunes', '3.1', 'M_steps', { 'M_steps.png': 'scene_mainview/M_steps.png' }, { horizontal: -227.24, vertical: -265.17, order: 3 }),
      layer('dunes', '3.1', 'R_steps_4', { 'R_steps_4.png': 'scene_mainview/R_steps_4.png' }, { horizontal: 846.76, vertical: 67.83, order: 4 }),
      layer('dunes', '3.1', 'L_steps_3', { 'L_steps_3.png': 'scene_mainview/L_steps_3.png' }, { horizontal: -1127.2, vertical: -15.17, order: 5 }),
      layer('dunes', '3.1', 'L_steps_2', { 'L_steps_2.png': 'scene_mainview/L_steps_2.png' }, { horizontal: -552.24, vertical: -363.67, order: 6 }),
      layer('dunes', '3.1', 'R_steps_3', { 'R_steps_3.png': 'scene_mainview/R_steps_3.png' }, { horizontal: 1090.3, vertical: -64.67, order: 7 }),
      layer('dunes', '3.1', 'R_steps_2', { 'R_steps_2.png': 'scene_mainview/R_steps_2.png' }, { horizontal: 578.26, vertical: -383.17, order: 8 }),
      layer('dunes', '3.1', 'R_steps_1', { 'R_steps_1.png': 'scene_mainview/R_steps_1.png' }, { horizontal: 904.26, vertical: -259.17, order: 10 }),
    ],
    planes: [
      sand(126, 175, 2500, 600, 0, 0.5, -900, 1.4688, 0.6, 50),
      { texture: { src: '/asserts/backgrounds/dunes/red.png', source: 'asserts/3.1/scene_mainview/red.png' }, horizontal: -351.24, vertical: 515.33, width: 956, height: 331, order: 1 },
      { texture: { src: '/asserts/backgrounds/dunes/red.png', source: 'asserts/3.1/scene_mainview/red.png' }, noise: { src: '/asserts/backgrounds/dunes/abd_smoke_diffuse.jpg', source: 'asserts/reference-supplements/3.1/abd_smoke_diffuse.jpg' }, horizontal: -351, vertical: 534, width: 956, height: 331, order: 1, effect: 'red-flow', opacity: 0.7, range: 0.56 },
      { texture: { src: '/asserts/backgrounds/dunes/chiwang_ding.png', source: 'asserts/3.1/scene_mainview/chiwang_ding.png' }, horizontal: -340.74, vertical: 362.33, width: 201, height: 73, order: 2 },
      { texture: { src: '/asserts/backgrounds/dunes/L_steps_1.png', source: 'asserts/3.1/scene_mainview/L_steps_1.png' }, horizontal: -1080.7, vertical: -462.17, width: 777, height: 346, order: 9 },
      sand(-475, -473, 1500, 600, -0.57596, 6.5, -100, 1.0521),
      sand(841, 60, 1200, 600, 0.5236, 7.5, 185, 0.90365),
      sand(-616, -311, 1700, 1000, -0.17454, 9.5, 600, 0.6875),
      sand(723, -421, 1500, 800, 0.48869, 10.5, 800, 0.58333),
      { texture: { src: '/asserts/backgrounds/dunes/mainview_caihong.png', source: 'asserts/3.1/scene_mainview/mainview_caihong.png' }, horizontal: 21, vertical: 57, width: 2880, height: 940, tilt: -0.41888, rotation: 0.034907, order: 11 },
      { texture: { src: '/asserts/backgrounds/dunes/mainview_light_top.png', source: 'asserts/3.1/scene_mainview/mainview_light_top.png' }, horizontal: -520.08, vertical: 385.09, width: 1231.1, height: 835.9, depth: -258.17, order: 12, opacity: 1.35, range: 0.37, effect: 'sunlight', additive: true },
    ],
  },
  canopy: {
    id: 'canopy', runtime: '4.1', reference: 'https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/index.html', poster: '/asserts/backgrounds/canopy/poster.webp',
    base: { src: '/asserts/backgrounds/canopy/bg.png', source: 'asserts/3.6/_other_resources/bg.71a4d00e.png' },
    view: { horizontal: 0, vertical: 0, width: 2500, height: 1080 },
    hiding: { layer: 'medium_box', foreground: '/asserts/backgrounds/canopy/hiding-foreground.webp', cuts: [{ id: 'middle', layer: 'medium_box' }, { id: 'near', layer: 'close_flower' }] },
    baseBounds: { horizontal: 0, vertical: 0, width: 2858, height: 1480 },
    layers: [
      layer('canopy', '3.6', 'full_cloads', { 'full_cloads.png': '_other_resources/full_cloads.848b8fed.png' }, { order: 98 }),
      layer('canopy', '3.6', 'full_building2', { 'full_building2.png': '_other_resources/full_building2.f052ea25.png' }, { order: 99 }),
      layer('canopy', '3.6', 'full_tree2', { 'full_tree2.png': '_other_resources/full_tree2.8ab2f3a0.png' }, { order: 106 }),
      layer('canopy', '3.6', 'full_tree', { 'full_tree.png': '_other_resources/full_tree.f2b7a1ac.png' }, { order: 107 }),
      layer('canopy', '3.6', 'full_building', { 'full_building.png': '_other_resources/full_building.c26fd254.png' }, { order: 108 }),
      {
        ...layer('canopy', '3.6', 'full_NPC', {}, { order: 109 }),
        json: { src: '/asserts/backgrounds/canopy/full_NPC.json', source: 'asserts/reference-supplements/3.6/full_NPC.json' },
        atlas: { src: '/asserts/backgrounds/canopy/full_NPC.atlas', source: 'asserts/reference-supplements/3.6/full_NPC.atlas' },
        textures: [{ page: 'full_NPC.png', src: '/asserts/backgrounds/canopy/full_NPC.png', source: 'asserts/reference-supplements/3.6/full_NPC.png' }],
        slots: ['2'],
      },
      layer('canopy', '3.6', 'medium_box', { 'medium_box.png': '_other_resources/medium_box.05f172eb.png' }, { order: 110 }),
      layer('canopy', '3.6', 'medium_flag', { 'medium_flag.png': '_other_resources/medium_flag.7dc3cc33.png' }, { order: 112 }),
      layer('canopy', '3.6', 'close_flower', { 'close_flower.png': '_other_resources/close_flower.f4ba543d.png' }, { order: 114 }),
      layer('canopy', '3.6', 'Close_butterfly', { 'Close_butterfly.png': '_other_resources/Close_butterfly.93bfcba4.png' }, { optional: true, order: 115 }),
      layer('canopy', '3.6', 'close_bottle', { 'close_bottle.png': '_other_resources/close_bottle.ee287092.png' }, { horizontal: -2, vertical: 13, optional: true, order: 127 }),
    ],
    planes: [{
      texture: { src: '/asserts/backgrounds/canopy/ground.png', source: 'asserts/reference-supplements/3.6/ground.png' },
      horizontal: 0, vertical: 0, width: 2500, height: 1080, order: 100,
      mesh: {
        geometry: { src: '/asserts/backgrounds/canopy/ground.geometry.json', source: 'asserts/reference-supplements/3.6/ground.geometry.json' },
        rotationX: 0.11973, localVertical: 39.8897, vertical: -228.5352, cameraDepth: 2500,
      },
    }],
  },
  sanctuary: {
    id: 'sanctuary', runtime: '4.0', reference: 'https://webstatic.mihoyo.com/ys/event/e20221024prev/index.html', poster: '/asserts/backgrounds/sanctuary/poster.webp',
    base: { src: '/asserts/backgrounds/celebration.jpg', source: 'asserts/3.2/_other_resources/main_bg.971baf45.jpg' },
    view: { horizontal: 0, vertical: 0, width: 2500, height: 1080 },
    hiding: { layer: 'shouye_floor', slot: '护栏', foreground: '/asserts/backgrounds/sanctuary/hiding-foreground.webp', cuts: [{ id: 'middle', layer: 'shouye_floor', slot: '护栏' }, { id: 'near', layer: 'shouye_floor', slot: '楼梯' }] },
    layers: [
      layer('sanctuary', '3.2', 'shouye_sky', { 'shouye_sky.png': '_other_resources/shouye_sky.2f619686.png' }, { animation: 'loop' }),
      layer('sanctuary', '3.2', 'shouye_moutain', { 'shouye_moutain.png': '_other_resources/shouye_moutain.3145a455.png' }, { animation: 'loop' }),
      layer('sanctuary', '3.2', 'shouye_clouds', { 'shouye_clouds.png': '_other_resources/shouye_clouds.a37e3e34.png' }, { animation: 'loop', order: 2 }),
      layer('sanctuary', '3.2', 'shouye_tree', { 'shouye_tree.png': '_other_resources/shouye_tree.d8b49318.png' }, { animation: 'loop', order: 3 }),
      layer('sanctuary', '3.2', 'shouye_floor', { 'shouye_floor.png': '_other_resources/shouye_floor.e9c4f351.png' }, { animation: 'loop', order: 4 }),
      layer('sanctuary', '3.2', 'shouye_effect_immobilized', { 'shouye_effect_immobilized.png': '_other_resources/shouye_effect_immobilized.15b51ac0.png' }, { order: 5 }),
      layer('sanctuary', '3.2', 'shouye_light', { 'shouye_light.png': '_other_resources/shouye_light.f4e06c97.png' }, { animation: 'loop', order: 21 }),
      layer('sanctuary', '3.2', 'shouye_leaf', { 'shouye_leaf.png': '_other_resources/shouye_leaf.8449abd5.png' }, { animation: 'loop', order: 24, horizontal: -120 }),
    ],
    planes: [
      { texture: { src: '/asserts/backgrounds/sanctuary/main_cloud.png', source: 'asserts/3.2/_other_resources/main_cloud_w2820.88113652.png' }, noise: { src: '/asserts/backgrounds/sanctuary/loading_flowMap.jpg', source: 'asserts/reference-supplements/3.2/loading_flowMap.jpg' }, horizontal: 20, vertical: -445, width: 2820, height: 512, order: 23, effect: 'mist', opacity: 1, speed: 0.2 },
      { texture: { src: '/asserts/backgrounds/sanctuary/main_leaf_particle.png', source: 'asserts/3.2/_other_resources/33985.png' }, horizontal: 0, vertical: 0, width: 2800, height: 1080, order: 25, effect: 'leaves', frames: 5, opacity: 0.75, optional: true },
    ],
  },
};

export const BACKGROUND_ASSETS: Record<BackgroundId, BackgroundAsset> = {
  ...sourceBackgrounds,
  embers: {
    ...sourceBackgrounds.sanctuary,
    id: 'embers', treatment: 'weathered', poster: '/asserts/backgrounds/embers/poster.webp',
    hiding: { ...sourceBackgrounds.sanctuary.hiding!, foreground: '/asserts/backgrounds/embers/hiding-foreground.webp' },
    reference: '用户提供的青蓝遗迹与燃烧世界树色彩参考；复用 D 的分层与动画',
  },
  festival: {
    id: 'festival', runtime: '4.0', reference: 'asserts/player/image_2（完整移除 Role 层的派生背景）',
    poster: '/asserts/backgrounds/festival/poster.webp',
    base: { src: '/asserts/backgrounds/festival/image_2_01.png', source: 'asserts/player/image_2/image_2_01.png' },
    baseAspect: 2400 / 1350,
    baseBounds: { horizontal: 0, vertical: 0, width: 2400, height: 1350 },
    view: { horizontal: 0, vertical: 0, width: 2400, height: 1350 },
    hiding: { layer: 'festival', slot: 'layer_18_Flower/flower_sub_4_07', foreground: '/asserts/backgrounds/festival/hiding-foreground.webp', cuts: [{ id: 'middle', layer: 'festival', slot: 'layer_18_Flower/flower_sub_4_07' }, { id: 'near', layer: 'festival', slot: 'layer_19_Grasses/leaf_l6_1' }] },
    layers: [
      {
        json: { src: '/asserts/backgrounds/festival/festival.json', source: 'asserts/background-derived/festival/festival.json' },
        atlas: { src: '/asserts/backgrounds/festival/festival.atlas', source: 'asserts/background-derived/festival/festival.atlas' },
        textures: Array.from({ length: 14 }, (_, index) => index + 1).map((index) => {
          const page = `image_2_${String(index).padStart(2, '0')}.png`;
          return { page, src: `/asserts/backgrounds/festival/${page}`, source: `asserts/player/image_2/${page}` };
        }),
        animation: 'loop', horizontal: 0, vertical: 0, scale: 1, optional: false, order: 1,
      },
    ],
  },
};

const stageBackgrounds: Record<StageId, BackgroundId | null> = { A: 'forest', B: 'dunes', C: 'canopy', D: 'sanctuary', E: 'embers', F: 'festival', G: null };

export function getStageBackground(stage: StageId) {
  const id = stageBackgrounds[stage];
  return id ? BACKGROUND_ASSETS[id] : null;
}

export function backgroundFiles(asset: BackgroundAsset): BackgroundFile[] {
  return [asset.base, ...asset.layers.flatMap((entry) => [entry.json, entry.atlas, ...entry.textures]), ...(asset.planes?.flatMap((plane) => [plane.texture, ...(plane.noise ? [plane.noise] : []), ...(plane.mesh ? [plane.mesh.geometry] : [])]) ?? [])];
}
