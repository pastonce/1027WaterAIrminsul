import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NahidaAvatar } from '../src/components/NahidaAvatar';
import { ASSETS, CHARACTER_ASSETS } from '../src/data/assets';
import type { CharacterVariant } from '../src/data/assets';
import manifest from '../docs/character-posters.manifest.json';

describe('加载中与失败的纳西妲不会意外展示Nidaha彩蛋', () => {
  it.each(Object.keys(CHARACTER_ASSETS) as CharacterVariant[])('%s加载首帧只使用对应姿态的透明poster', (variant) => {
    const html = renderToStaticMarkup(createElement(NahidaAvatar, { variant }));
    const asset = CHARACTER_ASSETS[variant];
    expect(asset.poster).toMatch(/\.webp$/); expect(readFileSync(`public${asset.poster}`).subarray(8, 12).toString()).toBe('WEBP');
    expect(html).toContain(`src="${asset.poster}"`); expect(html).not.toContain(ASSETS.nahida.src);
    expect(html).toContain('data-renderer="loading"');
  });

  it('只有显式彩蛋开关才选择原型SVG，普通G也不例外', () => {
    const html = renderToStaticMarkup(createElement(NahidaAvatar, { variant: 'reality', placeholder: true }));
    expect(html).toContain(`src="${ASSETS.nahida.src}"`); expect(html).toContain('data-renderer="placeholder"');
  });

  it('补齐的B/E与G两张派生图及源文件哈希全部登记，不改原图或骨骼', () => {
    expect(manifest.files).toHaveLength(2);
    for (const file of manifest.files) {
      const image = readFileSync(`public${file.url}`);
      expect(image.length).toBe(file.bytes); expect(createHash('sha256').update(image).digest('hex')).toBe(file.sha256);
      expect(file.visiblePixels).toBeGreaterThan(file.width * file.height * .01);
      for (const source of file.sources) { const bytes = readFileSync(source.path); expect(bytes.length).toBe(source.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256); }
    }
  });
});
