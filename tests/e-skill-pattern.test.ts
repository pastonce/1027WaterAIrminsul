import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pattern from '../src/data/eSkillPattern.generated.json' with { type: 'json' };
import { PRESENTATION_RULES } from '../src/data/presentation';

describe('用户 E 技能图案接入', () => {
  it('原三件套保留，发布分离后的派生纹理，骨骼与图集区域不变', () => {
    for (const source of [...pattern.sources, ...pattern.originalSources]) expect(createHash('sha256').update(readFileSync(source.file)).digest('hex')).toBe(source.sha256);
    expect(pattern.separated).toBe(true);
    expect(readFileSync(`public${pattern.texture}`).equals(readFileSync('asserts/E技能素材/clean-v2/e_skill_frame.png'))).toBe(true);
    expect(readFileSync(`public${pattern.texture}`).equals(readFileSync('asserts/E技能素材/e_skill_frame.png'))).toBe(false);
    expect(readFileSync('asserts/E技能素材/clean-v2/e_skill_frame.json').equals(readFileSync('asserts/E技能素材/e_skill_frame.json'))).toBe(true);
    expect(readFileSync('asserts/E技能素材/clean-v2/e_skill_frame.atlas').equals(readFileSync('asserts/E技能素材/e_skill_frame.atlas'))).toBe(true);
    expect(pattern.textureSize).toEqual([1024, 640]); expect(pattern.version).toBe('4.0.33');
  });

  it('只取四角、八段珠链、四边线，不把原中心法阵叠在草元素图标上', () => {
    expect(pattern.pieces).toHaveLength(16); expect(pattern.omitted).toEqual(['center_emblem']);
    expect(pattern.pieces.filter((piece) => piece.name.startsWith('corner_'))).toHaveLength(4);
    expect(pattern.pieces.filter((piece) => piece.name.startsWith('chain_'))).toHaveLength(8);
    expect(pattern.pieces.filter((piece) => piece.name.startsWith('line_'))).toHaveLength(4);
  });

  it('真实 4.0 解析器逐块核对 SVG 的世界顶点、图集 UV 和渐入延迟', async () => {
    const runtime = await import('spine-player-4-0');
    const atlas = new runtime.TextureAtlas(readFileSync('asserts/E技能素材/e_skill_frame.atlas', 'utf8'));
    for (const page of atlas.pages) page.setTexture({ getImage: () => ({ width: page.width, height: page.height }), setFilters() {}, setWraps() {} } as unknown as Parameters<typeof page.setTexture>[0]);
    const input = JSON.parse(readFileSync('asserts/E技能素材/e_skill_frame.json', 'utf8'));
    const data = new runtime.SkeletonJson(new runtime.AtlasAttachmentLoader(atlas)).readSkeletonData(input);
    const skeleton = new runtime.Skeleton(data); skeleton.updateWorldTransform();
    for (const piece of [...pattern.pieces, pattern.openingCenter]) {
      const slot = skeleton.findSlot(piece.name)!; const attachment = slot.getAttachment()!;
      expect(attachment).toBeInstanceOf(runtime.RegionAttachment);
      if (!(attachment instanceof runtime.RegionAttachment)) throw new Error('Expected a region');
      const vertices = new Float32Array(8); attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
      const [horizontal, skewY, skewX, vertical, left, top] = piece.matrix;
      const [regionX, regionY, width, height] = piece.region;
      for (const [horizontalRatio, verticalRatio, index] of [[0, 1, 0], [0, 0, 2], [1, 0, 4], [1, 1, 6]]) {
        expect(left + horizontal * width * horizontalRatio + skewX * height * verticalRatio).toBeCloseTo(vertices[index], 4);
        expect(top + skewY * width * horizontalRatio + vertical * height * verticalRatio).toBeCloseTo(-vertices[index + 1], 4);
      }
      expect(attachment.uvs[2] * 1024).toBeCloseTo(regionX, 4); expect(attachment.uvs[3] * 640).toBeCloseTo(regionY, 4);
      expect(piece.showDelayMs).toBeCloseTo(input.animations.show.slots[piece.name].rgba[1].time * 1000, 5);
      expect(piece.showDelayMs + piece.showDurationMs).toBeLessThanOrEqual(PRESENTATION_RULES.blessingFocusMs);
    }
  });

  it('轮廓 300 ms → 花叶 500 ms → 扫描 700 ms，扫描完成后才到结算时刻', () => {
    expect([PRESENTATION_RULES.blessingAuraMs, PRESENTATION_RULES.blessingFlowMs, PRESENTATION_RULES.blessingFocusMs]).toEqual([300, 500, 700]);
    expect(PRESENTATION_RULES.blessingAuraMs + PRESENTATION_RULES.blessingFlowMs + PRESENTATION_RULES.blessingFocusMs).toBe(PRESENTATION_RULES.blessingTravelMs);
    expect(PRESENTATION_RULES.blessingTravelMs + PRESENTATION_RULES.blessingBloomMs).toBeLessThan(PRESENTATION_RULES.lingerMinMs);
    const css = readFileSync('src/styles/blessing.css', 'utf8');
    expect(css).toContain('.nahida-companion[data-blessing=channel] .spine-host'); expect(css).toContain('.nahida-companion[data-blessing=channel] .character-static');
    expect(css).toContain('.nahida-companion[data-paused=true]'); expect(css).not.toMatch(/blessing-circuit|blessing-data-packet/);
  });
});
