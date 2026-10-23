import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Shader } from 'spine-player-4-0';
import { BACKGROUND_ASSETS, backgroundFiles } from '../src/data/backgrounds';
import { BackgroundTreatment, treatmentTarget } from '../src/game/backgrounds/treatment';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

describe('背景变体与角色剔除', () => {
  it('E 共用 D 资源和几何，只单独处理背景、生成对应静态回退图', () => {
    const original = BACKGROUND_ASSETS.sanctuary; const variant = BACKGROUND_ASSETS.embers;
    expect(variant.layers).toBe(original.layers); expect(variant.planes).toBe(original.planes);
    expect(variant.view).toEqual(original.view); expect(backgroundFiles(variant)).toEqual(backgroundFiles(original));
    expect(variant.treatment).toBe('weathered'); expect(original.treatment).toBeUndefined();
    expect(variant.poster).not.toBe(original.poster);
    expect(BACKGROUND_ASSETS.festival.treatment).toBeUndefined();
  });

  it('F 使用无 Role 派生包，原文件哈希不变且不下载专用角色页', () => {
    const manifest = read('asserts/background-derived/festival/manifest.json');
    expect(manifest.removed).toEqual({ prefix: 'layer_17_Role', bones: 404, slots: 184, pages: ['image_2_15.png'] });
    for (const input of manifest.inputs) expect(createHash('sha256').update(readFileSync(input.file)).digest('hex')).toBe(input.sha256);
    for (const output of manifest.files) {
      const bytes = readFileSync(`public/asserts/backgrounds/festival/${output.file}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(output.sha256);
      expect(bytes.equals(readFileSync(output.source))).toBe(true);
    }
    const result = read('asserts/background-derived/festival/festival.json');
    expect(JSON.stringify(result)).not.toMatch(/layer_17_Role|nahida|naxida|caoshen|cloak_|eyelash/);
    expect(result.bones).toHaveLength(329); expect(result.slots).toHaveLength(158);
    const atlas = readFileSync('asserts/background-derived/festival/festival.atlas', 'utf8');
    expect(atlas).not.toContain('image_2_15.png');
    expect(BACKGROUND_ASSETS.festival.layers[0].json.source).toBe('asserts/background-derived/festival/festival.json');
    expect(BACKGROUND_ASSETS.festival.layers[0].animation).toBe('loop'); expect(BACKGROUND_ASSETS.festival.layers[0].textures).toHaveLength(14);
    expect(backgroundFiles(BACKGROUND_ASSETS.festival).some((file) => file.src.endsWith('/image_2_15.png'))).toBe(false);
    expect(manifest.retained.loopSeconds).toBe(40);
  });

  it('F 的环境原生循环保留相同世界顶点、UV 与约束，剔除后不变形', async () => {
    const runtime = await import('spine-player-4-0');
    const parse = (folder: string, name: string) => {
      const atlas = new runtime.TextureAtlas(readFileSync(`${folder}/${name}.atlas`, 'utf8'));
      for (const page of atlas.pages) page.setTexture({ getImage: () => ({ width: page.width, height: page.height }), setFilters() {}, setWraps() {} } as unknown as Parameters<typeof page.setTexture>[0]);
      return new runtime.SkeletonJson(new runtime.AtlasAttachmentLoader(atlas)).readSkeletonData(read(`${folder}/${name}.json`));
    };
    const original = parse('asserts/player/image_2', 'image_2');
    const derived = parse('public/asserts/backgrounds/festival', 'festival');
    for (const time of [0, 0.5, 3, 11, 24, 39.95, 40.05, 81.2]) {
      const source = new runtime.Skeleton(original); const result = new runtime.Skeleton(derived);
      for (const skeleton of [source, result]) {
        const animation = skeleton.data.findAnimation('loop')!;
        animation.apply(skeleton, -1, time, true, [], 1, runtime.MixBlend.replace, runtime.MixDirection.mixIn);
        skeleton.updateWorldTransform();
      }
      for (const slot of result.slots) {
        const before = source.findSlot(slot.data.name)!;
        const attachment = slot.getAttachment(); const originalAttachment = before.getAttachment();
        expect(attachment?.name).toBe(originalAttachment?.name);
        const vertices = (current: typeof slot, currentAttachment: typeof attachment) => {
          if (currentAttachment instanceof runtime.RegionAttachment) {
            const points = new Float32Array(8); currentAttachment.computeWorldVertices(current.bone, points, 0, 2); return Array.from(points);
          }
          if (currentAttachment instanceof runtime.MeshAttachment) {
            const points = new Float32Array(currentAttachment.worldVerticesLength); currentAttachment.computeWorldVertices(current, 0, points.length, points, 0, 2); return Array.from(points);
          }
          return [];
        };
        const actual = vertices(slot, attachment); const expected = vertices(before, originalAttachment);
        expect(actual.length).toBe(expected.length);
        actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 3));
        if (attachment instanceof runtime.MeshAttachment || attachment instanceof runtime.RegionAttachment) {
          expect(Array.from(attachment.uvs)).toEqual(Array.from((originalAttachment as typeof attachment).uvs));
        }
      }
    }
  });
});

function setupTreatment() {
  const calls = ['bindBuffer', 'bufferData', 'activeTexture', 'bindTexture', 'texParameteri', 'bindFramebuffer', 'texImage2D', 'framebufferTexture2D', 'viewport', 'disable', 'enableVertexAttribArray', 'vertexAttribPointer', 'drawArrays', 'disableVertexAttribArray', 'deleteTexture', 'deleteFramebuffer', 'deleteBuffer'];
  const graphics = Object.fromEntries(calls.map((name) => [name, vi.fn()]));
  Object.assign(graphics, { createTexture: vi.fn(() => ({})), createFramebuffer: vi.fn(() => ({})), createBuffer: vi.fn(() => ({})), FRAMEBUFFER_COMPLETE: 36053, checkFramebufferStatus: vi.fn(() => 36053) });
  const shader = { bind: vi.fn(), unbind: vi.fn(), setUniformi: vi.fn(), setUniformf: vi.fn(), setUniform2f: vi.fn(), getAttributeLocation: vi.fn(() => 0), dispose: vi.fn() };
  const ShaderType = class { constructor() { return shader; } } as unknown as typeof Shader;
  return { graphics, shader, ShaderType, create: () => new BackgroundTreatment(graphics as unknown as WebGLRenderingContext, ShaderType, 1024) };
}

describe('背景专用调色合成资源', () => {
  it('按像素预算等比缩小且不放大，桌面与横屏目标都有上限', () => {
    expect(treatmentTarget(2880, 1800, 2048)).toEqual({ width: 2048, height: 1280 });
    expect(treatmentTarget(844, 390, 1024)).toEqual({ width: 844, height: 390 });
    expect(treatmentTarget(1, 1, 1024)).toEqual({ width: 1, height: 1 });
  });

  it('尺寸不变不重新分配，恢复默认目标，长时间归一化且完全释放', () => {
    const context = setupTreatment(); const treatment = context.create();
    treatment.begin(1800, 1125); treatment.begin(1800, 1125);
    expect(context.graphics.texImage2D).toHaveBeenCalledTimes(1);
    expect(treatment.bytes).toBe(1024 * 640 * 4);
    treatment.present(1800, 1125, { width: 1.12, height: 1.12 }, 1000003);
    expect(context.shader.setUniformf).toHaveBeenCalledWith('u_time', 43);
    expect(context.shader.setUniform2f).toHaveBeenCalledWith('u_view', 1.12, 1.12);
    treatment.begin(844, 390); expect(context.graphics.texImage2D).toHaveBeenCalledTimes(2);
    treatment.dispose(); treatment.dispose(); expect(treatment.bytes).toBe(0);
    for (const call of ['deleteTexture', 'deleteFramebuffer', 'deleteBuffer']) expect(context.graphics[call]).toHaveBeenCalledTimes(1);
    expect(context.shader.dispose).toHaveBeenCalledTimes(1);
  });

  it('不完整目标回退且释放，部分分配失败也不遗留程序或纹理', () => {
    const context = setupTreatment(); const treatment = context.create();
    context.graphics.checkFramebufferStatus.mockReturnValue(0);
    expect(() => treatment.begin(844, 390)).toThrow('background-treatment-target');
    treatment.dispose(); expect(context.shader.dispose).toHaveBeenCalledOnce();
    const failed = setupTreatment(); failed.graphics.createBuffer.mockReturnValue(null);
    expect(failed.create).toThrow('background-treatment-resources');
    expect(failed.graphics.deleteTexture).toHaveBeenCalledOnce(); expect(failed.graphics.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(failed.shader.dispose).toHaveBeenCalledOnce();
  });
});
