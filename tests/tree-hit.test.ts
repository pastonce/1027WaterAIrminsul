import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TreeRenderer } from '../src/components/TreeRenderer';
import { treeBodyPath } from '../src/game/tree/model';
import { createTreeGrowthModel } from '../src/game/tree/presentation';

describe('原槽位可见几何与命中', () => {
  it.each([20, 180, 520, 1000, 1027])('成长 %s 的透明视口穿透，命中路径使用当前原始附件矩阵', (growth) => {
    const markup = renderToStaticMarkup(createElement(TreeRenderer, { growth, reduced: false, growing: false, onInteract: () => {} }));
    expect(markup).toMatch(/<svg[^>]*pointer-events="none"/);
    expect(markup).toContain('class="tree-art" pointer-events="visiblePainted"');
    expect(markup).toContain(`class="tree-hit-target" d="${treeBodyPath(createTreeGrowthModel(growth).body)}"`);
    expect(markup).toContain('fill-rule="nonzero" pointer-events="visibleFill"');
    expect(markup).not.toContain('pointer-events="all"');
    expect(markup).toContain('role="button" aria-label="梦中的树" tabindex="0"');
    expect(markup).not.toMatch(/tree-branch|tree-flower|irminsul-join|trunk_column/);
  });
  it('未显现槽位不生成图片或命中，草地不挡兰那罗，初始仍支持键盘', () => {
    const markup = renderToStaticMarkup(createElement(TreeRenderer, { growth: 0, reduced: false, growing: false, onInteract: () => {} }));
    expect(markup).toMatch(/<image[^>]*pointer-events="none"/);
    expect(markup).toContain('data-tree-part="grass"'); expect(markup).toContain('class="tree-hit-target" d=""');
    expect(markup).not.toContain('class="tree-part-hit"'); expect(markup).not.toContain('data-tree-part="tree9"');
  });
  it('渲染顺序和源槽位顺序一致，仅根部前景使用固定接缝柔化', () => {
    const growth = 980; const model = createTreeGrowthModel(growth);
    const markup = renderToStaticMarkup(createElement(TreeRenderer, { growth, reduced: false, growing: false, onInteract: () => {} }));
    const slots = [...markup.matchAll(/data-tree-part="([^"]+)"/g)].map((match) => match[1]);
    expect(slots).toEqual(model.parts.map((part) => part.id)); expect(markup.match(/<mask /g)).toHaveLength(1);
    expect(markup).toContain('mask-type:alpha'); expect(markup).toContain('y="160" width="1000" height="840"');
  });
});
