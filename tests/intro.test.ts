import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntroScene } from '../src/scenes/IntroScene';

vi.mock('../src/hooks/useViewportSize', () => ({ useViewportSize: () => ({ width: 1440, height: 900 }) }));

describe('首屏文案', () => {
  it('首屏保留直接设置入口，不要求先入梦才可使用手机彩蛋输入', () => {
    const markup = renderToStaticMarkup(createElement(IntroScene, { onEnter: vi.fn(), onSettings: vi.fn() }));
    expect(markup).toContain('intro-settings'); expect(markup).toContain('aria-label="设置"');
    expect(markup).not.toContain('placeholder=');
  });
  it('完整保留两行邀请文字，并使用新的入梦按钮和声明', () => {
    const markup = renderToStaticMarkup(createElement(IntroScene, { onEnter: vi.fn() }));
    expect(markup).toContain('植物的生长，需要水，需要风，需要养料与阳光。<br/>梦景的天成，源于形，源于声，源于喧嚣与幽思。');
    expect(markup).toContain('>沉入梦乡 ');
    expect(markup).toContain('非商业同人生贺企划 · 不代表任何官方立场');
    expect(markup).toContain('10.27 · 献给纳西妲');
  });
  it('删除按钮下方小字及旧邀请与声明，不披露内部进度', () => {
    const markup = renderToStaticMarkup(createElement(IntroScene, { onEnter: vi.fn() }));
    expect(markup).not.toMatch(/intro-note|戴上耳机|循着微光|在风停下的地方|原创占位文案|成长值|阶段/);
  });
  it('保留开放前提示，但默认不显示提示', () => {
    const hidden = renderToStaticMarkup(createElement(IntroScene, { onEnter: vi.fn() }));
    const shown = renderToStaticMarkup(createElement(IntroScene, { onEnter: vi.fn(), message: '梦境尚未开启，请稍后再来。' }));
    expect(hidden).not.toContain('role="status"');
    expect(shown).toContain('role="status">梦境尚未开启，请稍后再来。');
  });
});
