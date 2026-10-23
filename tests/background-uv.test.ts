import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKGROUND_ASSETS } from '../src/data/backgrounds';
import { resizeAtlasPage } from '../src/game/backgrounds/atlas';

type Runtime = Pick<typeof import('spine-player-4-0'), 'TextureAtlas' | 'AtlasAttachmentLoader' | 'SkeletonJson'>;

describe('真实 Spine 网格的缩纹理回归', () => {
  it.each(Object.values(BACKGROUND_ASSETS))('$id 缩到 1024 后归一化 UV 和附件几何保持一致', async (asset) => {
    const runtime: Runtime = asset.runtime === '4.0' ? await import('spine-player-4-0') : await import('spine-webgl-4-1') as unknown as Runtime;
    for (const layer of asset.layers) {
      const input = JSON.parse(readFileSync(`public${layer.json.src}`, 'utf8'));
      const atlasText = readFileSync(`public${layer.atlas.src}`, 'utf8');
      const attachments = (resized: boolean) => {
        const atlas = new runtime.TextureAtlas(atlasText);
        for (const page of atlas.pages) {
          const texture = layer.textures.find((entry) => entry.page === page.name)!;
          const png = readFileSync(`public${texture.src}`);
          const scale = resized ? Math.min(1, 1024 / Math.max(png.readUInt32BE(16), png.readUInt32BE(20))) : 1;
          const width = Math.round(png.readUInt32BE(16) * scale);
          const height = Math.round(png.readUInt32BE(20) * scale);
          if (resized) resizeAtlasPage(atlas.regions, page, width, height);
          page.setTexture({ getImage: () => ({ width, height }), setFilters: () => {}, setWraps: () => {} } as unknown as Parameters<typeof page.setTexture>[0]);
        }
        return new runtime.SkeletonJson(new runtime.AtlasAttachmentLoader(atlas)).readSkeletonData(input).defaultSkin.getAttachments().map((entry) => {
          const attachment = entry.attachment as unknown as { uvs?: ArrayLike<number>; offset?: ArrayLike<number> };
          return { name: entry.name, uvs: Array.from(attachment.uvs ?? []), offset: Array.from(attachment.offset ?? []) };
        });
      };
      const full = attachments(false); const resized = attachments(true);
      expect(resized.length).toBe(full.length);
      for (let index = 0; index < full.length; index++) {
        expect(resized[index].name).toBe(full[index].name);
        expect(resized[index].uvs.length).toBe(full[index].uvs.length);
        full[index].uvs.forEach((value, coordinate) => expect(resized[index].uvs[coordinate], `${layer.json.src}:${full[index].name}`).toBeCloseTo(value, 5));
        full[index].offset.forEach((value, coordinate) => expect(resized[index].offset[coordinate]).toBeCloseTo(value, 4));
      }
    }
  });
});
