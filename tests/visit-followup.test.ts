import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialoguePool } from '../src/data/dialogues';
import { VISIT_EXPRESSION_CHOICES } from '../src/data/expressions';
import { STAGES } from '../src/data/stages';
import { stageFixture } from '../src/dev/fixtures';
import { GameController } from '../src/game/core/GameController';
import { drawUnplayedDialogue } from '../src/game/dialogue/DialogueSystem';
import { SaveManager, SAVE_KEYS, validateSave } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { DREAM_STAGES } from '../src/types/game';
import type { DreamStageId, GameSave } from '../src/types/game';
import { MemoryStorage, startScene, TestClock } from './support';

const games: GameController[] = [];
const date = Date.parse('2026-10-27T10:27:00+08:00');
function setup(stage: DreamStageId = 'A', patch: Partial<GameSave> = {}, storage = new MemoryStorage()) {
  const fixture = stageFixture(stage, date);
  const line = dialoguePool(`${stage}/nahida`)[0];
  if (!storage.getItem(SAVE_KEYS.player)) storage.setItem(SAVE_KEYS.player, JSON.stringify({ ...fixture, pendingVisits: [`visit-${stage}`], visitLines: { [`visit-${stage}`]: { dialogueId: line.id, read: false } }, visitPositions: { [`visit-${stage}`]: 1 }, settings: { ...fixture.settings, reducedMotion: true }, ...patch }));
  const game = new GameController(new TimeGateService(new TestClock(date)), new SaveManager(storage), () => .99);
  games.push(game); startScene(game);
  return { game, storage, line };
}
function until(condition: () => boolean, maximum = 50000) {
  for (let elapsed = 0; elapsed < maximum && !condition(); elapsed += 25) vi.advanceTimersByTime(25);
  expect(condition()).toBe(true);
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('来访中一次追加对白', () => {
  it.each(DREAM_STAGES)('%s 来访中预约未触发台词，原对白与施法结束后说出，表情同期开播且不二次祝福', (stage) => {
    const { game, line } = setup(stage);
    until(() => game.getSnapshot().companionCanTalk);
    expect(game.talkToCompanion()).toBe(true);
    const extra = game.getSnapshot().save.visitLines[`visit-${stage}`].followup!;
    expect(extra.dialogueId).not.toBe(line.id); expect(VISIT_EXPRESSION_CHOICES).toContain(extra.expression);
    expect(game.talkToCompanion()).toBe(false);
    until(() => game.getSnapshot().speech?.entry.id === extra.dialogueId);
    expect(game.getSnapshot().expression).toMatchObject({ asset: extra.expression, anchor: 'nahida' });
    const grown = game.getSnapshot().save.growth;
    expect(grown).toBeCloseTo(STAGES[stage].growth.start + (stage === 'A' ? 0 : 1) + (STAGES[stage].growth.end - STAGES[stage].growth.start) / 10, 1);
    expect(game.getSnapshot().save.completedVisits).toContain(`visit-${stage}`);
    game.water(); expect(game.getSnapshot().speech?.entry.id).toBe(extra.dialogueId);
    until(() => game.getSnapshot().save.visitLines[`visit-${stage}`].followup?.read === true);
    expect(game.getSnapshot().save.blessedVisits.filter((id) => id === `visit-${stage}`)).toHaveLength(1);
    expect(game.getSnapshot().save.growth).toBeCloseTo(grown + 13);
    until(() => !game.getSnapshot().companion);
    expect(game.talkToCompanion()).toBe(false);
  });

  it('停留期点击取消原离场计时，追加对白完整播放且不重新入场 / 换位置', () => {
    const { game } = setup();
    until(() => game.getSnapshot().save.completedVisits.includes('visit-A'));
    vi.advanceTimersByTime(3500);
    expect(game.getSnapshot().companion).toBe('observe'); expect(game.talkToCompanion()).toBe(true);
    const extra = game.getSnapshot().save.visitLines['visit-A'].followup!;
    expect(game.getSnapshot().speech?.entry.id).toBe(extra.dialogueId);
    expect(game.getSnapshot().companion).toBe('observe'); expect(game.getSnapshot().companionPosition).toBe(1);
    game.openPanel('settings'); vi.advanceTimersByTime(60000);
    expect(game.getSnapshot().save.visitLines['visit-A'].followup?.read).toBe(false);
    expect(game.getSnapshot().companion).toBe('observe');
    game.closePanel(); until(() => !game.getSnapshot().speech);
    expect(game.getSnapshot().companion).toBe('observe');
    vi.advanceTimersByTime(2900); expect(game.getSnapshot().companion).not.toBeNull();
    until(() => !game.getSnapshot().companion);
  });

  it('未播放追加对白刷新后保留原抽签 / 表情 / 位置，不重赠成长，不允许再次点击预约', () => {
    const first = setup(); until(() => first.game.getSnapshot().companionCanTalk);
    first.game.talkToCompanion();
    const extra = first.game.getSnapshot().save.visitLines['visit-A'].followup!;
    until(() => first.game.getSnapshot().speech?.entry.id === extra.dialogueId);
    const growth = first.game.getSnapshot().save.growth;
    first.game.stop();
    const { game } = setup('A', {}, first.storage);
    until(() => game.getSnapshot().speech?.entry.id === extra.dialogueId);
    expect(game.getSnapshot().save.growth).toBe(growth);
    expect(game.getSnapshot().expression?.asset).toBe(extra.expression);
    expect(game.getSnapshot().companionPosition).toBe(1); expect(game.talkToCompanion()).toBe(false);
    until(() => !game.getSnapshot().companion);
    const persisted = JSON.parse(first.storage.getItem(SAVE_KEYS.player)!);
    expect(persisted.visitLines['visit-A'].followup.read).toBe(true);
  });

  it('原对白期间刷新仍不覆盖已预约的追加对白', () => {
    const first = setup(); until(() => first.game.getSnapshot().companionCanTalk);
    first.game.talkToCompanion(); const extra = first.game.getSnapshot().save.visitLines['visit-A'].followup!;
    first.game.stop(); const { game } = setup('A', {}, first.storage);
    until(() => Boolean(game.getSnapshot().companion)); expect(game.talkToCompanion()).toBe(false);
    until(() => game.getSnapshot().speech?.entry.id === extra.dialogueId);
    expect(game.getSnapshot().save.visitLines['visit-A'].followup).toEqual(extra);
  });

  it('已经播放过的台词与其他预约均排除，池耗尽不重复也不写新收据', () => {
    const pool = dialoguePool('A/nahida');
    const { game } = setup('A', { playedDialogues: pool.slice(1).map((entry) => entry.id) });
    until(() => Boolean(game.getSnapshot().companion));
    expect(game.talkToCompanion()).toBe(false); expect(game.getSnapshot().save.visitLines['visit-A'].followup).toBeUndefined();
  });

  it('离场后不能点击，下一次自然来访重新提供一次机会且不重用先前台词', () => {
    const { game } = setup(); until(() => game.getSnapshot().companionCanTalk); game.talkToCompanion();
    const first = game.getSnapshot().save.visitLines['visit-A'];
    until(() => !game.getSnapshot().companion);
    expect(game.talkToCompanion()).toBe(false); game.requestVisit();
    until(() => game.getSnapshot().companionCanTalk); expect(game.talkToCompanion()).toBe(true);
    expect(game.getSnapshot().save.visitLines['visit-A-2'].followup?.dialogueId).not.toBe(first.dialogueId);
    expect(game.getSnapshot().save.visitLines['visit-A-2'].followup?.dialogueId).not.toBe(first.followup?.dialogueId);
  });

  it('彩蛋来访也可追加一次，保留落点且不占正式来访名额', () => {
    const { game } = setup('C', { pendingVisits: [], visitLines: {} });
    until(() => !game.getSnapshot().speech && !game.getSnapshot().event);
    game.easterEgg('nahida'); until(() => game.getSnapshot().companionCanTalk);
    expect(game.getSnapshot().companionPosition).toBe(1); expect(game.talkToCompanion()).toBe(true);
    until(() => game.getSnapshot().event?.type === 'visit-followup');
    expect(game.getSnapshot().companionPosition).toBe(1);
    until(() => !game.getSnapshot().companion);
    expect(game.getSnapshot().save.completedVisits.filter((id) => id.startsWith('visit-C'))).toEqual([]);
  });
});

describe('追加选择与存档验证', () => {
  it('只从未触发集合随机抽，保留无放回牌堆，不重置其他范围', () => {
    const pool = dialoguePool('A/nahida'); const excluded = pool.slice(0, -2).map((entry) => entry.id);
    const decks = { 'A/nahida': pool.slice(1).map((entry) => entry.id), other: ['keep'] };
    const selected = drawUnplayedDialogue(decks, 'A/nahida', excluded, () => .99)!;
    expect(selected.entry.id).toBe(pool.at(-1)!.id); expect(selected.decks.other).toEqual(['keep']);
    expect(selected.decks['A/nahida']).not.toContain(selected.entry.id);
    expect(drawUnplayedDialogue(decks, 'A/nahida', pool.map((entry) => entry.id))).toBeUndefined();
  });
  it('追加收据只接受同阶段不同台词、六种表情与严格布尔已读，旧存档不受影响', () => {
    const fixture = stageFixture('A', date); const pool = dialoguePool('A/nahida');
    const line = { dialogueId: pool[0].id, read: true, followup: { dialogueId: pool[1].id, expression: 7, read: 'true' } };
    const saved = { ...fixture, completedVisits: ['visit-A'], visitLines: { 'visit-A': line } };
    expect(validateSave(saved).visitLines['visit-A'].followup).toEqual({ dialogueId: pool[1].id, expression: 7, read: false });
    for (const extra of [{ ...line.followup, dialogueId: pool[0].id }, { ...line.followup, dialogueId: 'B1N' }, { ...line.followup, expression: 3 }]) expect(validateSave({ ...saved, visitLines: { 'visit-A': { ...line, followup: extra } } }).visitLines['visit-A'].followup).toBeUndefined();
    expect(validateSave({ ...saved, visitLines: { 'visit-A': { dialogueId: pool[0].id, read: true } } }).visitLines['visit-A']).toEqual({ dialogueId: pool[0].id, read: true });
  });
});
