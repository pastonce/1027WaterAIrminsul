import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TreeRenderer } from '../src/components/TreeRenderer';
import { STAGES } from '../src/data/stages';
import { trunkPath } from '../src/game/tree/geometry';

describe('树的可见几何与命中', () => {
  it.each([95, 230, 1360, 3100])('高度 %s 的透明视口不接输入，树干命中和当前可见轮廓相同', (height) => {
    const markup = renderToStaticMarkup(createElement(TreeRenderer, { height, seed: 1027, stage: STAGES.A, reduced: false, growing: false, onInteract: () => {} }));
    expect(markup).toMatch(/<svg[^>]*pointer-events="none"/);
    expect(markup).toContain('class="tree-art" pointer-events="visiblePainted"');
    expect(markup).toContain(`<path class="tree-hit-target" d="${trunkPath(height)}" fill="url(#bark)"`);
    expect(markup).not.toContain('pointer-events="all"');
    expect(markup).toContain('role="button" aria-label="梦中的树" tabindex="0"');
  });

  it('尚未显现的叶片不截获点击，光晕和生长发光仍可穿透', () => {
    const markup = renderToStaticMarkup(createElement(TreeRenderer, { height: 95, seed: 1027, stage: STAGES.A, reduced: false, growing: true, onInteract: () => {} }));
    expect(markup).toMatch(/<use[^>]*opacity="0" pointer-events="none"/);
    expect(markup).toMatch(/<ellipse[^>]*tree-halo[^>]*pointer-events="none"/);
    expect(markup).toMatch(/<path[^>]*gentle-glow[^>]*pointer-events="none"/);
  });
});
