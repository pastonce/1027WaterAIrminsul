import { describe, expect, it } from 'vitest';
import { DEFERRED_DIALOGUE_POOLS, releaseDialoguePools } from '../src/data/dialogueRelease';
import type { DialogueCatalog } from '../src/data/dialogueSource';
import catalog from '../src/data/dialogues.generated.json';
import { readFileSync } from 'node:fs';
import { parseDialogueDocument } from '../src/data/dialogueSource';

const previous = { sha256: 'released-source', pools: { 'shared/mechanism': [{ id: 'X01', text: '机制提示', anchor: 'tree' as const }] } };
const incoming: DialogueCatalog = { 'shared/mechanism': [{ id: 'X00', text: 'pending', anchor: 'tree' }], 'A/normal': [{ id: 'A01', text: 'new text', anchor: 'tree' }] };

describe('用户确认接入的机制提示发布', () => {
  it('只保留已发布机制池，其他正文正常生成，不改写原稿解析结果', () => {
    const before = JSON.stringify(incoming); const release = releaseDialoguePools(incoming, previous, ['shared/mechanism']);
    expect(release.pools['shared/mechanism']).toEqual(previous.pools['shared/mechanism']); expect(release.pools['A/normal']).toEqual(incoming['A/normal']);
    expect(release.deferredPools).toEqual({ 'shared/mechanism': { sourceSha256: 'released-source' } }); expect(JSON.stringify(incoming)).toBe(before);
  });
  it('重复构建保持原发布来源，不把新原稿哈希误当作旧池来源', () => {
    const first = releaseDialoguePools(incoming, previous, ['shared/mechanism']);
    const second = releaseDialoguePools(incoming, { ...first, sha256: 'new-source' }, ['shared/mechanism']);
    expect(second).toEqual(first);
  });
  it('下一轮移除暂缓池配置后，整池按最新原稿发布且清除暂缓元数据', () => {
    const release = releaseDialoguePools(incoming, previous, []);
    expect(release.pools).toEqual(incoming); expect(release.deferredPools).toEqual({});
  });
  it('缺少已发布快照时明确失败，不偷偷发布待定文本', () => {
    expect(() => releaseDialoguePools(incoming, { sha256: 'empty', pools: {} }, ['shared/mechanism'])).toThrow(/Missing released dialogue pool/);
  });
  it('实际发布十八句最新原稿，保留编号并清除旧暂缓元数据', () => {
    expect(DEFERRED_DIALOGUE_POOLS).toEqual([]);
    const parsed = parseDialogueDocument(readFileSync('asserts/对白整合.md', 'utf8'));
    expect(catalog.pools['shared/mechanism']).toEqual(parsed.pools['shared/mechanism']);
    expect(catalog.pools['shared/mechanism']).toHaveLength(18);
    expect(catalog.pools['shared/mechanism'].every((entry) => entry.text !== '机制提示')).toBe(true);
    expect(catalog.deferredPools).toEqual({});
  });
});
