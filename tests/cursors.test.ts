import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../docs/cursor-assets.manifest.json';
import { parseNotice } from '../src/game/notice/markdown';

describe('桌面纳西妲指针与出处', () => {
  it('六个32px原CUR逐字节复制，保留各自原热点并使用安全发布文件名', () => {
    expect(manifest.files.map((file) => file.role)).toEqual(['normal', 'pointer', 'text', 'unavailable', 'help', 'horizontal']);
    for (const file of manifest.files) {
      const original = readFileSync(file.source); const published = readFileSync(file.file);
      expect(published.equals(original)).toBe(true); expect(published.length).toBe(file.bytes);
      expect(createHash('sha256').update(published).digest('hex')).toBe(file.sha256);
      expect(published.readUInt16LE(2)).toBe(2); expect(published.readUInt16LE(4)).toBe(1);
      expect([published[6], published[7]]).toEqual([32, 32]);
      expect(file.hotspot).toEqual({ x: published.readUInt16LE(10), y: published.readUInt16LE(12) });
      expect(file.src).toMatch(/^\/asserts\/cursor\/[a-z]+-[a-f0-9]{12}\.cur$/);
    }
    expect(manifest.publishedBytes).toBe(26110);
  });
  it('仅主鼠标精细悬停设备且非强制色时接入，声明完整原生回退、无脚本光标', () => {
    const css = readFileSync('src/styles/cursors.generated.css', 'utf8');
    expect(css).toMatch(/^@media \(hover: hover\) and \(pointer: fine\) and \(forced-colors: none\)/);
    for (const file of manifest.files) expect(css).toContain(`url("${file.src}") ${file.hotspot.x} ${file.hotspot.y}, ${file.fallback}`);
    expect(css).toContain('.tree-art, .creature-hit'); expect(css).toContain('button:disabled');
    expect(css).not.toMatch(/cursor:\s*none|!important|animation|position|pointer-events/);
    expect(readFileSync('src/main.tsx', 'utf8')).toContain("import './styles/cursors.generated.css'");
  });
  it('随站原样保留许可，公告写明作者、原作地址、限制和本地说明链接', () => {
    const copyright = readFileSync(manifest.copyright.file);
    expect(copyright.equals(readFileSync(manifest.copyright.source))).toBe(true);
    expect(createHash('sha256').update(copyright).digest('hex')).toBe(manifest.copyright.sha256);
    const document = parseNotice(readFileSync('src/content/notice.md', 'utf8'));
    const entry = document.blocks.flatMap((block) => block.kind === 'list' ? block.items : []).find((item) => item.includes('SAM TOKI STUDIO'))!;
    expect(entry).toContain(manifest.sourceUrl); expect(entry).toContain('/asserts/cursor/COPYRIGHT.txt');
    expect(entry).toContain('不得商用'); expect(entry).toContain('转载须注明出处');
  });
  it('统一继承并提升语义规则优先级，覆盖调试summary、设置label、日期与原生控件内部', () => {
    const css = readFileSync('src/styles/cursors.generated.css', 'utf8');
    expect(css).toContain(':root body :where(*)');
    expect(css).toContain(':root :is(button, a[href], summary, label,');
    for (const type of ['date', 'datetime-local', 'month', 'week', 'time']) expect(css).toContain(`[type="${type}"]`);
    for (const part of ['::-webkit-datetime-edit', '::-webkit-calendar-picker-indicator', '::-webkit-inner-spin-button', '::file-selector-button']) expect(css).toContain(`:root input${part}`);
    expect(css).toContain(':root input:disabled::-webkit-calendar-picker-indicator');
    expect(css).not.toContain('!important');
  });
});
