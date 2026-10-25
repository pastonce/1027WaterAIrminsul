import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIALOGUE_ENTRIES, DIALOGUE_POOLS, dialogueArchive, dialoguePool, transitionDialoguePool } from '../src/data/dialogues';
import catalog from '../src/data/dialogues.generated.json' with { type: 'json' };
import { parseDialogueSource } from '../src/data/dialogueSource';
import type { DialogueCatalog } from '../src/data/dialogueSource';
import { releaseDialoguePools } from '../src/data/dialogueRelease';
import { drawDialogue, dreamDialogueCategory } from '../src/game/dialogue/DialogueSystem';
import { GameController } from '../src/game/core/GameController';
import { createSave, SaveManager, SAVE_KEYS, validateSave } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { stageFixture } from '../src/dev/fixtures';
import { STAGES } from '../src/data/stages';
import { SCHEDULE } from '../src/data/schedule';
import { dialogueTiming, PRESENTATION_RULES } from '../src/data/presentation';
import type { GameSave, StageId } from '../src/types/game';
import { DREAM_STAGES } from '../src/types/game';
import { startScene, MemoryStorage, TestClock } from './support';

const games: GameController[] = [];
function setup(stage: StageId = 'A', patch: Partial<GameSave> = {}, date = SCHEDULE[5].at, storage = new MemoryStorage()) {
  const clock = new TestClock(Date.parse(date));
  const random = vi.fn(() => 0.99);
  if (!storage.getItem(SAVE_KEYS.player)) storage.setItem(SAVE_KEYS.player, JSON.stringify({ ...stageFixture(stage, clock.now()), ...patch }));
  const game = new GameController(new TimeGateService(clock), new SaveManager(storage), random);
  games.push(game); startScene(game);
  return { game, clock, random, storage };
}
function until(condition: () => boolean, maximum = 60000) {
  for (let elapsed = 0; elapsed < maximum && !condition(); elapsed += 50) vi.advanceTimersByTime(50);
  expect(condition()).toBe(true);
}
function drain(game: GameController) {
  until(() => game.getSnapshot().mode === 'idle' && !game.getSnapshot().speech && !game.getSnapshot().event && !game.getSnapshot().companion && !game.getSnapshot().save.pendingWaterings.length && !game.getSnapshot().save.pendingDialogues.length && !game.getSnapshot().save.pendingVisits.length);
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('对白原文、唯一编号与循环抽取', () => {
  it('31 个范围按原稿发布，仅用户明确暂缓的机制池保留旧快照', () => {
    const bytes = readFileSync('asserts/对白整合.md');
    const parsed = parseDialogueSource(bytes.toString('utf8'));
    const released = releaseDialoguePools(parsed, { ...catalog, pools: catalog.pools as DialogueCatalog });
    expect(released.pools).toEqual(catalog.pools); expect(createHash('sha256').update(bytes).digest('hex')).toBe(catalog.sha256);
    expect(Object.keys(parsed)).toHaveLength(31); expect(Object.keys(DIALOGUE_ENTRIES)).toHaveLength(Object.values(released.pools).flat().length);
    expect(DIALOGUE_ENTRIES.A27.text).not.toContain('**'); expect(DIALOGUE_ENTRIES.A3Q.text).toContain('░░');
    expect(DIALOGUE_ENTRIES.U01.anchor).toBe('user'); expect(DIALOGUE_ENTRIES.N01.anchor).toBe('nahida');
    expect(dialoguePool('shared/mechanism')).toHaveLength(18);
    expect(() => parseDialogueSource(bytes.toString('utf8') + '\n- **R01** 重复')).toThrow(/R01/);
  });
  it('阶段标题与句首 / 句中 / 句尾数字编辑标记不显示，正文、原编号及非数字括号保留', () => {
    const original = readFileSync('asserts/对白整合.md', 'utf8').replace(/\[\d+\]/gu, '');
    const marked = original.replace(/^## ([A-G])$/gmu, '## $1[13456]').replace('咦，雨停了吗？', '[179]咦，[35]雨停了吗？[9]');
    const spoken = (source: string) => Object.values(parseDialogueSource(source)).flat().map(({ id, text, anchor }) => ({ id, text, anchor }));
    expect(spoken(marked)).toEqual(spoken(original));
    expect(parseDialogueSource(original.replace('咦，雨停了吗？', '[生日]咦，雨停了吗？'))['A/normal'][0].text).toContain('[生日]');
    expect(Object.values(parseDialogueSource(marked)).flat().every((entry) => !/\[\d+\]/u.test(entry.text))).toBe(true);
  });
  it.each(Object.keys(DIALOGUE_POOLS))('%s 无放回直到整轮用尽，其他池互不影响', (key) => {
    let decks = {};
    const chosen: string[] = [];
    for (let index = 0; index < DIALOGUE_POOLS[key].length; index++) {
      const selected = drawDialogue(decks, key, () => 0.99); decks = selected.decks; chosen.push(selected.entry.id);
    }
    expect(new Set(chosen).size).toBe(DIALOGUE_POOLS[key].length);
    expect(Object.keys(decks)).toEqual([key]);
    expect(DIALOGUE_POOLS[key].map((entry) => entry.id)).toContain(drawDialogue(decks, key, () => 0).entry.id);
  });
  it('抽取池、单段计数、来访与双句待播可安全保存，外链 / 串池不能混入', () => {
    const save = validateSave({
      dialogueDecks: { 'A/normal': ['A01', 'A01', 'B01', 'https://bad'], bad: ['A01'] },
      dialogueCounts: { A: { story: 100, mechanism: -3 }, G: { story: 2 } },
      pendingVisits: ['visit-A'], visitLines: { 'visit-A': { dialogueId: 'A1N', read: true }, 'visit-B': { dialogueId: 'A1N' } },
      pendingDialogues: [{ id: 5, stage: 'G', kind: 'wish', lines: ['U01', 'N01'], cursor: 1 }, { id: 6, stage: 'A', kind: 'wish', lines: ['U01', 'N01'] }, { id: 7, stage: 'B', from: 'A', kind: 'transition', lines: ['A1Z'], cursor: 0 }],
      pendingWaterings: [{ id: 2, stage: 'A', dialogueId: 'tree-A-0' }, { id: 3, stage: 'A', dialogueId: 'B01' }, { id: 4, stage: 'A', dialogueId: 'A1Q' }],
    });
    expect(save.dialogueDecks).toEqual({ 'A/normal': ['A01'] }); expect(save.dialogueCounts.A).toEqual({ story: 2, mechanism: 0 });
    expect(save.visitLines).toEqual({ 'visit-A': { dialogueId: 'A1N', read: true } });
    expect(save.pendingDialogues).toHaveLength(2); expect(save.pendingDialogues[0].cursor).toBe(1); expect(save.dialogueSequence).toBe(7);
    expect(save.pendingWaterings.map((entry) => entry.dialogueId)).toEqual(['A01', 'A1Q']);
    expect(createSave().dialogueDecks).toEqual({});
  });
});

describe('完整已读归档与权限', () => {
  it('全部已开放且已读时可归档全部原句，包含剧情、公共、非首句转场及用户回复', () => {
    const entries = dialogueArchive(Object.keys(DIALOGUE_ENTRIES), [...DREAM_STAGES, 'G']);
    expect(entries).toHaveLength(Object.keys(DIALOGUE_ENTRIES).length); expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });
  it('只展示真正读过的原稿条目，未知或旧占位编号不冒充新正文', () => {
    expect(dialogueArchive(['unknown', 'tree-A-0', 'R01'], [...DREAM_STAGES, 'G']).map((entry) => entry.id)).toEqual(['R01']);
  });
  it('目标转场按其本段日期过滤，A 转场可用于初入但不泄露 B', () => {
    expect(dialogueArchive(['A01', 'A1Q', 'A2Z', 'A1N', 'B01', 'B2Z', 'X01'], ['A']).map((entry) => entry.id)).toEqual(['A01', 'A1Q', 'A2Z', 'A1N', 'X01']);
    expect(dialogueArchive(['A2Z', 'B01'], ['A', 'B']).map((entry) => entry.id)).toEqual(['A2Z', 'B01']);
  });
  it('梦境不展示 G 的用户、回复、日常，F 的入场句归 F；现实可展示全部', () => {
    const played = ['U01', 'N01', 'G1N', 'F2Z'];
    expect(dialogueArchive(played, DREAM_STAGES).map((entry) => entry.id)).toEqual(['F2Z']);
    expect(dialogueArchive(played, [...DREAM_STAGES, 'G']).map((entry) => entry.id)).toEqual(['F2Z', 'U01', 'N01', 'G1N']);
  });
});

describe('互斥概率与次数上限', () => {
  const options = { visitAllowed: true, guaranteed: false, capped: false, story: 0, mechanism: 0 };
  it.each([[0, 'visit'], [0.129999, 'visit'], [0.13, 'story'], [0.259999, 'story'], [0.26, 'mechanism'], [0.329999, 'mechanism'], [0.33, 'normal'], [0.99, 'normal']] as const)('%s 落在 %s 独立区间', (roll, expected) => {
    expect(dreamDialogueCategory(roll, options)).toBe(expected);
  });
  it('点击不来访，满额后新增 45% 上限区间，耗尽概率不重抽其他稀有分支', () => {
    expect(dreamDialogueCategory(0.01, { ...options, visitAllowed: false })).toBe('normal');
    expect(dreamDialogueCategory(0.33, { ...options, visitAllowed: false, capped: true })).toBe('limit');
    expect(dreamDialogueCategory(0.779999, { ...options, visitAllowed: false, capped: true })).toBe('limit');
    expect(dreamDialogueCategory(0.78, { ...options, visitAllowed: false, capped: true })).toBe('normal');
    expect(dreamDialogueCategory(0.2, { ...options, story: 2, capped: true })).toBe('normal');
    expect(dreamDialogueCategory(0.3, { ...options, mechanism: 1, capped: true })).toBe('normal');
    expect(dreamDialogueCategory(0.99, { ...options, guaranteed: true })).toBe('visit');
  });
  it('树点击与浇灌共用剧情两次、机制一次；同一库无放回', () => {
    const { game, random } = setup(); drain(game);
    random.mockReturnValue(0.2); game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\dQ$/); const first = game.getSnapshot().speech!.entry.id; drain(game);
    game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\dQ$/); expect(game.getSnapshot().speech!.entry.id).not.toBe(first); drain(game);
    game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\d\d$/); drain(game);
    random.mockReturnValue(0.3); game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^X/); drain(game);
    game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\d\d$/); drain(game);
    expect(game.getSnapshot().save.dialogueCounts.A).toEqual({ story: 2, mechanism: 1 });
    expect(game.getSnapshot().save.pendingVisits).toEqual([]);
    random.mockReturnValue(0.2); expect(game.water()).toBe(true); vi.advanceTimersByTime(1400);
    expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\d\d$/);
  });
  it('浇灌触发来访只选该阶段一句，树点击不会预约，最多两访', () => {
    const { game, random } = setup(); drain(game);
    random.mockReturnValue(0.01); game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\d\d$/); expect(game.getSnapshot().save.pendingVisits).toEqual([]); drain(game);
    expect(game.water()).toBe(true); expect(game.getSnapshot().save.pendingWaterings).toEqual([]);
    until(() => game.getSnapshot().speech?.anchor === 'nahida');
    const first = game.getSnapshot().speech!.entry.id; expect(first).toMatch(/^A\dN$/); drain(game);
    game.requestVisit(); until(() => game.getSnapshot().speech?.anchor === 'nahida'); expect(game.getSnapshot().speech!.entry.id).not.toBe(first); drain(game);
    game.requestVisit(); expect(game.getSnapshot().save.completedVisits).toHaveLength(2); expect(game.getSnapshot().save.pendingVisits).toEqual([]);
  });
  it('日期封顶后不随机 / 保底召唤，免费浇灌仍能抽剧情、机制和上限', () => {
    const { game, random } = setup('C', { growth: STAGES.C.growth.end, dew: 8, wateringCounts: { C: 20 } }, SCHEDULE[0].at); drain(game);
    expect(game.getSnapshot().save.pendingVisits).toEqual([]);
    random.mockReturnValue(0.01); expect(game.water()).toBe(false); vi.advanceTimersByTime(600); expect(game.getSnapshot().speech?.entry.id).toMatch(/^C\d\d$/); drain(game);
    random.mockReturnValue(0.15); game.water(); vi.advanceTimersByTime(600); expect(game.getSnapshot().speech?.entry.id).toMatch(/^C\dQ$/); drain(game);
    random.mockReturnValue(0.3); game.water(); vi.advanceTimersByTime(600); expect(game.getSnapshot().speech?.entry.id).toMatch(/^X/); drain(game);
    random.mockReturnValue(0.4); game.water(); vi.advanceTimersByTime(600); expect(game.getSnapshot().speech?.entry.id).toMatch(/^L/);
    expect(game.getSnapshot().save.growth).toBe(STAGES.C.growth.end); expect(game.getSnapshot().save.dew).toBe(8); expect(game.getSnapshot().save.pendingVisits).toEqual([]);
  });
  it('已预定的剧情 / 普通句刷新恢复，不消耗额外一次抽签或重复扣露', () => {
    const first = setup(); drain(first.game); first.random.mockReturnValue(0.2); first.game.water();
    const pending = first.game.getSnapshot().save.pendingWaterings[0]; const decks = first.game.getSnapshot().save.dialogueDecks; first.game.stop();
    const restored = setup('A', {}, SCHEDULE[5].at, first.storage);
    until(() => restored.game.getSnapshot().event?.type === 'watering');
    expect(restored.game.getSnapshot().speech?.entry.id).toBe(pending.dialogueId);
    expect(restored.game.getSnapshot().save.dialogueDecks['A/story']).toEqual(decks['A/story']);
    expect(restored.game.getSnapshot().save.dialogueCounts.A?.story).toBe(1); expect(restored.game.getSnapshot().save.growth).toBe(20); expect(restored.game.getSnapshot().save.dew).toBe(0);
  });
  it('最后一行淡出时再次点击不会复用待播编号吞掉新回应', () => {
    const { game } = setup(); drain(game); game.talk();
    until(() => game.getSnapshot().speech?.phase === 'fading'); const previous = game.getSnapshot().event!.id;
    game.talk(); expect(game.getSnapshot().save.pendingWaterings).toHaveLength(1); const pending = game.getSnapshot().save.pendingWaterings[0];
    expect(`watering-${pending.id}`).not.toBe(previous); vi.advanceTimersByTime(PRESENTATION_RULES.fadeMs);
    expect(game.getSnapshot().speech?.entry.id).toBe(pending.dialogueId);
  });
});

describe('进入、待机、转场与祝福双句', () => {
  it('每次页面进入仅一条 R01，设置与暂停不重复触发', () => {
    const { game } = setup(); expect(game.getSnapshot().speech?.entry.id).toBe('R01'); drain(game);
    game.openPanel('settings'); game.closePanel(); game.setSuspended(true); game.setSuspended(false);
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().save.pendingDialogues).toEqual([]);
  });
  it('60 秒没有操作播共享待机并重计时，后台暂停不偷走剩余时间', () => {
    const { game } = setup(); drain(game); game.activity(); vi.advanceTimersByTime(59000);
    expect(game.getSnapshot().speech).toBeNull(); game.setSuspended(true); vi.advanceTimersByTime(120000); expect(game.getSnapshot().speech).toBeNull();
    game.setSuspended(false); vi.advanceTimersByTime(999); expect(game.getSnapshot().speech).toBeNull(); vi.advanceTimersByTime(1);
    expect(game.getSnapshot().speech?.entry.id).toMatch(/^I/); const first = game.getSnapshot().speech!.entry.id; drain(game);
    until(() => game.getSnapshot().speech?.entry.id.startsWith('I') === true);
    expect(game.getSnapshot().speech!.entry.id).not.toBe(first);
  });
  it('页面操作、收露和面板点击均重置六十秒，自动生物 / 露珠不重置', () => {
    const { game } = setup('A', { dew: 0 }); drain(game); game.activity(); vi.advanceTimersByTime(59000); game.activity(); vi.advanceTimersByTime(59000);
    expect(game.getSnapshot().speech).toBeNull(); game.spawnDew(); const particle = game.getSnapshot().dewParticles.find((entry) => !entry.collected && !entry.expiring)!;
    expect(game.collectDew(particle.id)).toBe(true); vi.advanceTimersByTime(59000); expect(game.getSnapshot().speech).toBeNull();
    game.openPanel('settings'); vi.advanceTimersByTime(120000); expect(game.getSnapshot().speech).toBeNull(); game.closePanel();
    vi.advanceTimersByTime(59999); expect(game.getSnapshot().speech).toBeNull(); vi.advanceTimersByTime(1); expect(game.getSnapshot().speech?.entry.id).toMatch(/^I/);
  });
  it('同批次等于上限不转段，补浇不增长后加载；结束才播目标段 Z，刷新不重抽', () => {
    const first = setup('A', { growth: 180, completedVisits: ['visit-A', 'visit-A-2'] }, SCHEDULE[0].at); drain(first.game);
    expect(first.game.getSnapshot().stageLoading).toBeNull(); first.clock.value = Date.parse(SCHEDULE[1].at); first.game.tick(); expect(first.game.getSnapshot().stageLoading).toBeNull();
    first.game.water(); until(() => first.game.getSnapshot().stageLoading !== null);
    const selected = first.game.getSnapshot().save.pendingDialogues.find((entry) => entry.kind === 'transition')!;
    expect(selected.from).toBe('A'); expect(selected.stage).toBe('B'); expect(selected.lines[0]).toMatch(/^B\dZ$/); expect(first.game.getSnapshot().speech).toBeNull(); first.game.stop();
    const restored = setup('A', {}, SCHEDULE[1].at, first.storage);
    until(() => restored.game.getSnapshot().stageLoading?.phase === 'loading');
    const loading = restored.game.getSnapshot().stageLoading!; expect(restored.game.getSnapshot().speech).toBeNull(); expect(restored.game.getSnapshot().save.sceneStage).toBe('A');
    restored.game.stageArtworkReady(loading.id, loading.artId); restored.game.stageSceneReady(loading.id, 'B'); until(() => restored.game.getSnapshot().stageLoading === null);
    expect(restored.game.getSnapshot().speech?.entry.id).toBe(selected.lines[0]); expect(restored.game.getSnapshot().speech?.anchor).toBe('tree'); expect(restored.game.getSnapshot().save.sceneStage).toBe('B');
  });
  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('%s 完成收据后加载才播放目标段转场，最终梦醒同样适用', (stage) => {
    const { game } = setup(stage, { growth: STAGES[stage].growth.end, completedStages: [...DREAM_STAGES.slice(0, DREAM_STAGES.indexOf(stage) + 1)], completedVisits: [...stageFixture(stage, Date.parse(SCHEDULE[5].at)).completedVisits, `visit-${stage}`, `visit-${stage}-2`] });
    until(() => game.getSnapshot().stageLoading?.phase === 'loading');
    const loading = game.getSnapshot().stageLoading!;
    expect(game.getSnapshot().speech).toBeNull();
    const pending = game.getSnapshot().save.pendingDialogues.find((entry) => entry.kind === 'transition')!;
    expect(pending.from).toBe(stage); expect(dialoguePool(transitionDialoguePool(loading.to)).map((entry) => entry.id)).toContain(pending.lines[0]);
    game.stageArtworkReady(loading.id, loading.artId); game.stageSceneReady(loading.id, loading.to);
    until(() => game.getSnapshot().stageLoading === null);
    until(() => game.getSnapshot().waking === null);
    until(() => game.getSnapshot().waking === null);
    expect(game.getSnapshot().speech?.entry.id).toBe(pending.lines[0]); expect(game.getSnapshot().speech?.anchor).toBe(stage === 'F' ? 'nahida' : 'tree');
    if (stage === 'F') { expect(game.getSnapshot().stage).toBe('G'); expect(validateSave(game.getSnapshot().save).endingComplete).toBe(true); }
  });
  it('G 祝福先用户后回复，两库独立；用户读完刷新只恢复原回复', () => {
    const first = setup('G'); first.game.sendWish(); const pending = first.game.getSnapshot().save.pendingDialogues[0];
    expect(first.game.getSnapshot().speech?.entry.id).toMatch(/^U/); expect(first.game.getSnapshot().speech?.anchor).toBe('user');
    expect(pending.lines).toHaveLength(2); expect(pending.lines[1]).toMatch(/^N\d\d$/);
    const user = DIALOGUE_ENTRIES[pending.lines[0]]; vi.advanceTimersByTime(dialogueTiming(user, 35, false).durationMs); expect(first.game.getSnapshot().save.pendingDialogues[0].cursor).toBe(1); first.game.stop();
    const restored = setup('G', {}, SCHEDULE[5].at, first.storage); until(() => restored.game.getSnapshot().birthday === null); expect(restored.game.getSnapshot().speech?.entry.id).toBe(pending.lines[1]); expect(restored.game.getSnapshot().speech?.anchor).toBe('nahida');
    expect(restored.game.getSnapshot().save.dialogueDecks['G/reply']).toEqual(first.game.getSnapshot().save.dialogueDecks['G/reply']);
  });
  it('G 点击和二十秒无点击共用不重复池，任意页面点击会重新计时', () => {
    const { game } = setup('G'); vi.advanceTimersByTime(19999); expect(game.getSnapshot().speech).toBeNull(); game.activity(); vi.advanceTimersByTime(19999); expect(game.getSnapshot().speech).toBeNull(); vi.advanceTimersByTime(1);
    const first = game.getSnapshot().speech!.entry.id; expect(first).toMatch(/^G\dN$/); drain(game);
    game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^G\dN$/); expect(game.getSnapshot().speech!.entry.id).not.toBe(first);
    expect(game.getSnapshot().save.pendingVisits).toEqual([]);
  });
});
