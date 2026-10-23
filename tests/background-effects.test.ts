import { describe, expect, it, vi } from 'vitest';
import type { GLTexture, SceneRenderer, Shader } from 'spine-player-4-0';
import { BACKGROUND_ASSETS } from '../src/data/backgrounds';
import { BackgroundEffects, backgroundEffectTime, backgroundQuad, sunlightOpacity } from '../src/game/backgrounds/effects';
import { entrancePose, FOREST_ENTRANCE_SECONDS } from '../src/game/backgrounds/entrance';

describe('森林入场时间线', () => {
  it('庆典下方地面向上平移 40 世界单位，仍保留原透视、纹理与主体位置', () => {
    const plane = BACKGROUND_ASSETS.canopy.planes![0];
    expect(plane.mesh!.vertical).toBeCloseTo(-268.5352 + 40);
    expect(plane.mesh!.rotationX).toBeCloseTo(0.11973);
  });
  it('按原站 30 FPS × 0.6 速度进入，结束与静态图保持同一构图', () => {
    expect(FOREST_ENTRANCE_SECONDS).toBeCloseTo(3.388889);
    for (const entrance of [BACKGROUND_ASSETS.forest.baseEntrance, ...BACKGROUND_ASSETS.forest.layers.map((layer) => layer.entrance), ...BACKGROUND_ASSETS.forest.planes!.map((plane) => plane.entrance)]) {
      expect(entrancePose(entrance, FOREST_ENTRANCE_SECONDS)).toEqual({ vertical: 0, scale: 1, opacity: 1 });
      expect(entrancePose(entrance, Infinity)).toEqual({ vertical: 0, scale: 1, opacity: 1 });
    }
  });

  it('远中近景分别上升，始终保持终态比例，不再沿景深反复缩放', () => {
    const distant = BACKGROUND_ASSETS.forest.layers[0].entrance!;
    const foreground = BACKGROUND_ASSETS.forest.layers[3].entrance!;
    expect(entrancePose(distant, 0)).toEqual({ vertical: -1437, scale: 1, opacity: 1 });
    expect(entrancePose(distant, FOREST_ENTRANCE_SECONDS / 2).vertical).toBeCloseTo(-1437 / 8);
    for (let frame = 0; frame <= 61; frame++) for (const layer of BACKGROUND_ASSETS.forest.layers) expect(entrancePose(layer.entrance, frame / 18).scale).toBe(1);
    expect(entrancePose(foreground, 1).vertical).toBeLessThan(entrancePose(distant, 1).vertical);
  });

  it('藤蔓延迟显现并落位，天空逐渐上移但不缩放', () => {
    const vine = BACKGROUND_ASSETS.forest.layers[4].entrance!;
    expect(entrancePose(vine, 0)).toEqual(entrancePose(vine, 15 / 18));
    expect(entrancePose(vine, 15 / 18).opacity).toBe(0);
    expect(entrancePose(vine, 50 / 18).vertical).toBeLessThan(0);
    expect(entrancePose(BACKGROUND_ASSETS.forest.baseEntrance, 0).vertical).toBe(-233);
    expect(entrancePose(BACKGROUND_ASSETS.forest.baseEntrance, 2).vertical).toBeGreaterThan(-20);
  });

  it('光照延迟柔和亮起，保留原站两段短脉冲与最终亮度', () => {
    const light = BACKGROUND_ASSETS.forest.planes![0].entrance!;
    expect(entrancePose(light, 33 / 18).opacity).toBe(0);
    expect(entrancePose(light, 38 / 18).opacity).toBeCloseTo(0.5);
    expect(entrancePose(light, 42 / 18).opacity).toBe(0);
    expect(entrancePose(light, 56 / 18).opacity).toBe(1);
    expect(BACKGROUND_ASSETS.forest.planes![0].optional).not.toBe(true);
  });
});

describe('飞沙、光晕与流图布局', () => {
  it('五条风沙分别保留方向、透视补偿与遮边，不在手机删除', () => {
    const bands = BACKGROUND_ASSETS.dunes.planes!.filter((plane) => plane.effect === 'sand');
    expect(bands).toHaveLength(5);
    expect(new Set(bands.map((plane) => plane.texture.src)).size).toBe(1);
    expect(bands.every((plane) => !plane.optional && plane.speed === 0.2)).toBe(true);
    expect(bands.filter((plane) => plane.horizontal < 0 && plane.vertical < -250)).toHaveLength(2);
    expect(bands.filter((plane) => plane.horizontal > 600)).toHaveLength(2);
    expect(bands.map((plane) => plane.rotation)).toEqual([0, -0.57596, 0.5236, -0.17454, 0.48869]);
    expect(bands.find((plane) => plane.order === 9.5)!.width).toBeCloseTo(1656.85, 1);
  });

  it('红色物质使用静态底层及独立流图层，雾使用原站独立噪声，不再平移整片纹理', () => {
    const red = BACKGROUND_ASSETS.dunes.planes!.find((plane) => plane.effect === 'red-flow')!;
    expect(red.noise!.source).toBe('asserts/reference-supplements/3.1/abd_smoke_diffuse.jpg');
    expect(red.range).toBe(0.56); expect(red.opacity).toBe(0.7);
    expect(BACKGROUND_ASSETS.dunes.planes!.filter((plane) => plane.texture.src === red.texture.src)).toHaveLength(2);
    const fog = BACKGROUND_ASSETS.sanctuary.planes!.find((plane) => plane.effect === 'mist')!;
    expect(fog.noise!.source).toBe('asserts/reference-supplements/3.2/loading_flowMap.jpg');
    expect(fog.speed).toBe(0.2); expect(fog.optional).not.toBe(true);
  });

  it('阳光加色与透视缩放独立于倾斜光晕，按双正弦明暗变化', () => {
    const sunlight = BACKGROUND_ASSETS.dunes.planes!.find((plane) => plane.effect === 'sunlight')!;
    expect(sunlight.additive).toBe(true); expect(sunlight.optional).not.toBe(true);
    expect(sunlight.depth).toBe(-258.17);
    expect(BACKGROUND_ASSETS.dunes.planes!.some((plane) => plane.texture.src.endsWith('mainview_caihong.png') && plane.tilt === -0.41888)).toBe(true);
    expect(sunlightOpacity(0, 1.35, 0.37)).toBe(1.35);
    expect(sunlightOpacity(Math.PI / 2, 1.35, 0.37)).toBeCloseTo(0.98);
  });

  it('平面沿原 UV 绘制，旋转与倾斜保持四个角点的透视关系', () => {
    const plane = { horizontal: 10, vertical: 20, width: 100, height: 60 };
    const vertices = backgroundQuad(plane);
    expect(Array.from(vertices.slice(0, 8))).toEqual([-40, -10, 1, 1, 1, 1, 0, 1]);
    expect(Array.from(vertices.slice(24, 32))).toEqual([60, 50, 1, 1, 1, 1, 1, 0]);
    const rotated = backgroundQuad({ ...plane, rotation: Math.PI / 2 });
    expect(rotated[0]).toBeCloseTo(40); expect(rotated[1]).toBeCloseTo(-30);
    const tilted = backgroundQuad({ ...plane, tilt: -0.4, depth: -258 });
    expect(Array.from(tilted).every(Number.isFinite)).toBe(true);
    expect(tilted[12] - tilted[0]).not.toBeCloseTo(tilted[24] - tilted[36]);
  });
});

function setupEffects(failOn = 0) {
  const programs: Array<{ dispose: ReturnType<typeof vi.fn>; source: string; setUniformf: ReturnType<typeof vi.fn>; setUniformi: ReturnType<typeof vi.fn>; bind: ReturnType<typeof vi.fn>; setUniform4x4f: ReturnType<typeof vi.fn> }> = [];
  const ShaderType = class {
    constructor(_graphics: unknown, vertex: string, fragment: string) {
      if (failOn === programs.length + 1) throw new Error('compile-failed');
      const program = { dispose: vi.fn(), source: vertex + fragment, setUniformf: vi.fn(), setUniformi: vi.fn(), bind: vi.fn(), setUniform4x4f: vi.fn() };
      programs.push(program); return program;
    }
  } as unknown as typeof Shader;
  const graphics = { activeTexture: vi.fn(), TEXTURE0: 33984 } as unknown as WebGLRenderingContext;
  return { ShaderType, graphics, programs };
}

describe('单上下文效果批次与清理', () => {
  it('时间按各自无缝周期归一化，长时间浏览不损失移动 GPU 的浮点精度', () => {
    expect(backgroundEffectTime('sand', 500003, 0.2)).toBeCloseTo(3);
    expect(backgroundEffectTime('mist', 500003, 0.2)).toBeCloseTo(3);
    expect(backgroundEffectTime('red-flow', 1000003)).toBeCloseTo(3);
    expect(backgroundEffectTime('mist', 1000000, 0)).toBe(0);
    expect(backgroundEffectTime('sand', 500003, -0.2)).toBeCloseTo(3);
  });

  it('相同效果只编译一次，所有着色器保留实际批次需要的双颜色顶点属性', () => {
    const context = setupEffects();
    const effects = new BackgroundEffects(context.graphics, context.ShaderType, ['sand', 'mist', 'sand', 'red-flow']);
    expect(context.programs).toHaveLength(3);
    for (const program of context.programs) {
      expect(program.source).toContain('a_texCoords'); expect(program.source).toContain('a_color2');
    }
    effects.dispose(); effects.dispose();
    context.programs.forEach((program) => expect(program.dispose).toHaveBeenCalledTimes(1));
  });

  it('部分着色器编译失败时释放已创建程序，允许导演回退静态图', () => {
    const context = setupEffects(2);
    expect(() => new BackgroundEffects(context.graphics, context.ShaderType, ['sand', 'mist'])).toThrow('compile-failed');
    expect(context.programs[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('流图使用第二纹理单元，提交后恢复普通 Spine 批次', () => {
    const context = setupEffects();
    const effects = new BackgroundEffects(context.graphics, context.ShaderType, ['mist']);
    const renderer = { end: vi.fn(), begin: vi.fn(), camera: { projectionView: { values: [] } }, batcher: { begin: vi.fn(), draw: vi.fn(), end: vi.fn() } } as unknown as SceneRenderer;
    const noise = { bind: vi.fn() } as unknown as GLTexture;
    const plane = BACKGROUND_ASSETS.sanctuary.planes![0];
    effects.draw(renderer, plane, {} as GLTexture, noise, backgroundQuad(plane), 3);
    expect(noise.bind).toHaveBeenCalledWith(1);
    expect(context.graphics.activeTexture).toHaveBeenCalledWith(33984);
    expect(context.programs[0].setUniformf).toHaveBeenCalledWith('u_time', 3);
    expect(renderer.batcher.draw).toHaveBeenCalledTimes(1); expect(renderer.end).toHaveBeenCalledOnce(); expect(renderer.begin).toHaveBeenCalledOnce();
    effects.dispose();
  });
});
