import { describe, expect, it } from 'vitest';
import { DEFERRED_DIALOGUE_POOLS, releaseDialoguePools } from '../src/data/dialogueRelease';
import type { DialogueCatalog } from '../src/data/dialogueSource';
import catalog from '../src/data/dialogues.generated.json';

const previous = { sha256: 'released-source', pools: { 'shared/mechanism': [{ id: 'X01', text: '机制提示', anchor: 'tree' as const }] } };
const incoming: DialogueCatalog = { 'shared/mechanism': [{ id: 'X00', text: 'pending', anchor: 'tree' }], 'A/normal': [{ id: 'A01', text: 'new text', anchor: 'tree' }] };

describe('用户确认暂缓的机制提示发布', () => {
  it('只保留已发布机制池，其他正文正常生成，不改写原稿解析结果', () => {
    const before = JSON.stringify(incoming); const release = releaseDialoguePools(incoming, previous);
    expect(release.pools['shared/mechanism']).toEqual(previous.pools['shared/mechanism']); expect(release.pools['A/normal']).toEqual(incoming['A/normal']);
    expect(release.deferredPools).toEqual({ 'shared/mechanism': { sourceSha256: 'released-source' } }); expect(JSON.stringify(incoming)).toBe(before);
  });
  it('重复构建保持原发布来源，不把新原稿哈希误当作旧池来源', () => {
    const first = releaseDialoguePools(incoming, previous);
    const second = releaseDialoguePools(incoming, { ...first, sha256: 'new-source' });
    expect(second).toEqual(first);
  });
  it('下一轮移除暂缓池配置后，整池按最新原稿发布且清除暂缓元数据', () => {
    const release = releaseDialoguePools(incoming, previous, []);
    expect(release.pools).toEqual(incoming); expect(release.deferredPools).toEqual({});
  });
  it('缺少已发布快照时明确失败，不偷偷发布待定文本', () => {
    expect(() => releaseDialoguePools(incoming, { sha256: 'empty', pools: {} })).toThrow(/Missing released dialogue pool/);
  });
  it('实际发布保留十八个原占位与来源，不包含新增代码 / 成长数值提示', () => {
    expect(DEFERRED_DIALOGUE_POOLS).toEqual(['shared/mechanism']);
    expect(catalog.pools['shared/mechanism']).toEqual(Array.from({ length: 18 }, (_, index) => ({ id: `X${String(index + 1).padStart(2, '0')}`, text: '机制提示', anchor: 'tree' })));
    expect(catalog.deferredPools['shared/mechanism'].sourceSha256).toBe('666f36a9249176fd43aba89e5352ff77f94e337f85fa6233c88e0d189795d3f5');
  });
});
