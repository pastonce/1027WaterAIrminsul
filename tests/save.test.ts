import { describe, expect, it } from 'vitest';
import { SAVE_KEYS, SaveManager, validateSave } from '../src/game/save/SaveManager';
import { MemoryStorage } from './support';
import { stageFixture } from '../src/dev/fixtures';

describe('存档校验与恢复', () => {
  it('没有存档时使用零资源的新梦境', () => {
    const save = new SaveManager(new MemoryStorage()).load();
    expect(save.growth).toBe(0); expect(save.dew).toBe(0); expect(save.introSeen).toBe(false);
  });
  it('损坏 JSON 保留恢复副本', () => {
    const storage = new MemoryStorage(); storage.setItem(SAVE_KEYS.player, '{broken');
    const manager = new SaveManager(storage);
    expect(manager.load().growth).toBe(0);
    expect(storage.getItem(`${SAVE_KEYS.player}.recovery`)).toBe('{broken');
    expect(manager.status).toBeTruthy();
  });
  it('字段缺失、不合法数值和数组被修正', () => {
    const save = validateSave({ growth: -20, dew: 990, seed: NaN, completedStages: ['F', 7], unlockedSecrets: ['moon', 'invalid', 'moon'], settings: { textSpeed: -10 } });
    expect(save.growth).toBe(0); expect(save.dew).toBe(990); expect(save.seed).toBe(1027);
    expect(save.completedStages).toEqual([]); expect(save.unlockedSecrets).toEqual(['moon']); expect(save.settings.textSpeed).toBe(10);
    expect(validateSave({ growth: Infinity, dew: null }).growth).toBe(0);
  });
  it('迁移 v1 resources 字段，补全新增字段', () => {
    const save = validateSave({ version: 1, growth: 13, resources: 8 });
    expect(save.version).toBe(2); expect(save.dew).toBe(8); expect(save.completedVisits).toEqual([]);
  });
  it('未完成连续阶段时不承认结局或夜间完成标记', () => {
    const save = validateSave({ growth: 1027, endingComplete: true, nightComplete: true, completedStages: ['A', 'C', 'F'] });
    expect(save.completedStages).toEqual(['A']); expect(save.endingComplete).toBe(false); expect(save.nightComplete).toBe(false);
  });
  it('更高版本存档受到保护，写入不会覆盖', () => {
    const storage = new MemoryStorage(); const raw = JSON.stringify({ version: 999, growth: 30 }); storage.setItem(SAVE_KEYS.player, raw);
    const manager = new SaveManager(storage); const save = manager.load();
    expect(manager.write(save)).toBe(false); expect(storage.getItem(SAVE_KEYS.player)).toBe(raw);
  });
  it('localStorage 被禁用时仍可继续游玩', () => {
    const manager = new SaveManager(null); expect(manager.load().growth).toBe(0); expect(manager.status).toBeTruthy(); expect(manager.write(validateSave({}))).toBe(false);
  });
  it('正式与调试存档分开存储', () => {
    expect(SAVE_KEYS.player).not.toBe(SAVE_KEYS.development);
  });
  it('旧存档补足待来访列表，并移除未知和已完成事件', () => {
    expect(validateSave({ version: 2 }).pendingVisits).toEqual([]);
    expect(validateSave({ completedVisits: ['visit-A'], pendingVisits: ['visit-A', 'visit-B', 'unknown', 'visit-B'] }).pendingVisits).toEqual(['visit-B']);
  });
  it('旧存档兼容浇灌对白队列，校验阶段、句子归属与唯一事务编号', () => {
    expect(validateSave({ version: 2 }).pendingWaterings).toEqual([]);
    const first = { id: 1, stage: 'A', dialogueId: 'tree-A-0' };
    const second = { id: 2, stage: 'A', dialogueId: 'tree-A-0' };
    expect(validateSave({ playedDialogues: ['tree-A-0'], pendingWaterings: [first, first, second, { id: -1, stage: 'A', dialogueId: 'tree-A-0' }, { id: 3, stage: 'B', dialogueId: 'tree-A-0' }, { id: 4, stage: 'G', dialogueId: 'reality-0' }, null] }).pendingWaterings).toEqual([first, second].map((entry) => ({ ...entry, dialogueId: 'A01', category: 'normal' })));
  });
  it('完成故事的事实能够修复缺失的结局与夜间冗余标记', () => {
    const save = stageFixture('G', Date.now());
    const repaired = validateSave({ ...save, endingComplete: undefined, nightComplete: undefined, watchedStories: [...save.watchedStories, 'night-1027'] });
    expect(repaired.endingComplete).toBe(true); expect(repaired.nightComplete).toBe(true);
  });
});
