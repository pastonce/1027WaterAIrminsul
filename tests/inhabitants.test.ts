import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CRYSTALFLIES, ENCOUNTER_RULES, FESTIVAL_ARANARA, HIDING_PLACES, INHABITANT_ASSETS, VISIT_FORMS } from '../src/data/inhabitants';
import { stageVisitIds } from '../src/data/visits';
import { STAGES } from '../src/data/stages';
import { SCHEDULE } from '../src/data/schedule';
import { EncounterDirector } from '../src/game/encounters/EncounterDirector';
import { creatureLayout } from '../src/game/encounters/layout';
import { crystalPlan } from '../src/game/encounters/crystalflies';
import { roamingMotion } from '../src/game/encounters/motion';
import { getTreeHeight } from '../src/game/growth/GrowthSystem';
import { PRESENTATION_RULES } from '../src/data/presentation';
import { isDewPositionSafe } from '../src/game/dew/placement';
import { GameController } from '../src/game/core/GameController';
import { SaveManager, validateSave } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { stageFixture } from '../src/dev/fixtures';
import { startScene, testGame, TestClock } from './support';
import type { ForestEncounter } from '../src/types/game';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const until = (condition: () => boolean, maximum = 120000) => {
  for (let elapsed = 0; elapsed < maximum && !condition(); elapsed += 100) vi.advanceTimersByTime(100);
  expect(condition()).toBe(true);
};

describe('当前用户独立素材与实际映射', () => {
  it.each(Object.values(INHABITANT_ASSETS))('$id 当前三件套哈希与发布副本一致，透明回退图存在', (asset) => {
    for (const file of asset.files) {
      const bytes = readFileSync(file.source);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
      expect(readFileSync(`public${asset.json.slice(0, asset.json.lastIndexOf('/') + 1)}${file.file}`).equals(bytes)).toBe(true);
    }
    const data = JSON.parse(readFileSync(`public${asset.json}`, 'utf8'));
    expect(data.skeleton.spine).toMatch(/^4\.0\./); expect(data.animations.loop).toBeTruthy();
    expect(readFileSync(`public${asset.poster}`).subarray(8, 12).toString()).toBe('WEBP');
  });

  it('四个指定形象、五组各十个固定藏身点与四个常驻角色不混用', () => {
    expect(VISIT_FORMS).toEqual({ A: 'nahida_dream', C: 'nahida_wave', D: 'nahida_bouquet', F: 'nahida_swing' });
    expect(Object.keys(HIDING_PLACES)).toEqual(['A', 'C', 'D', 'E', 'F']);
    for (const places of Object.values(HIDING_PLACES)) { expect(places).toHaveLength(10); expect(new Set(places.map((place) => JSON.stringify(place))).size).toBe(10); }
    expect(FESTIVAL_ARANARA).toEqual(['aranara_07', 'aranara_08', 'aranara_09', 'aranara_10']); expect(CRYSTALFLIES).toHaveLength(3);
  });

  it('晶蝶世界锚点不随生长重排，树长高逐层添加，跟随镜头而非屏幕', () => {
    const base = { width: 1440, height: 900, scale: 1, offset: 0, root: 760, treeHeight: getTreeHeight(100), growth: 100, seed: 1027 };
    expect(creatureLayout('A', [], { ...base, growth: 99 }, []).filter((actor) => actor.kind === 'crystal')).toHaveLength(0);
    const early = creatureLayout('A', [], base, []).filter((actor) => actor.kind === 'crystal'); expect(early).toHaveLength(1);
    const grown = creatureLayout('F', [], { ...base, treeHeight: 3100 }, []); expect(grown.filter((actor) => actor.kind === 'crystal')).toHaveLength(15);
    for (const actor of early) expect(grown.find((entry) => entry.id === actor.id)).toEqual(actor);
    const moved = creatureLayout('A', [], { ...base, offset: 150 }, []);
    early.forEach((actor) => expect(moved.find((entry) => entry.id === actor.id)!.top).toBeCloseTo(actor.top + 150));
    expect(grown.filter((actor) => actor.kind === 'fixed')).toHaveLength(4);
  });
});

describe('兰那罗活动时间与退场', () => {
  it.each([0, 0.5, 0.999])('随机 %s 的首次出现间隔在 15～45 秒，30 秒未交互退场', (random) => {
    let entries: ForestEncounter[] = []; const director = new EncounterDirector((value) => { entries = value; }, () => random);
    director.configure('A', false); const delay = ENCOUNTER_RULES.spawnMinMs + random * (ENCOUNTER_RULES.spawnMaxMs - ENCOUNTER_RULES.spawnMinMs);
    vi.advanceTimersByTime(delay - 1); expect(entries).toHaveLength(0); vi.advanceTimersByTime(1); expect(entries).toHaveLength(1);
    director.setAvailable([]); vi.advanceTimersByTime(ENCOUNTER_RULES.lifetimeMs - 1); expect(entries[0].phase).toBe('watching'); vi.advanceTimersByTime(1); expect(entries[0].phase).toBe('leaving');
    expect(director.has(entries[0].id)).toBe(false); vi.advanceTimersByTime(700); expect(entries).toHaveLength(0); director.clear(); expect(vi.getTimerCount()).toBe(0);
  });

  it('同屏最多三只、形象 / 位置不重复，退场期间也占席位', () => {
    let entries: ForestEncounter[] = []; const director = new EncounterDirector((value) => { entries = value; }, () => 0.5);
    director.configure('F', false); expect(director.spawn(0)).toBe(true); expect(director.spawn(0)).toBe(false);
    director.spawn(1); director.spawn(2); expect(director.spawn(3)).toBe(false);
    expect(new Set(entries.map((entry) => entry.asset)).size).toBe(3); director.leave(entries[0].id); expect(director.spawn(3)).toBe(false);
    vi.advanceTimersByTime(700); expect(director.spawn(3)).toBe(true); director.clear(); expect(vi.getTimerCount()).toBe(0);
  });

  it('设置暂停剩余出现 / 退场时间，换阶段、回访和停止清理全部回调', () => {
    let entries: ForestEncounter[] = []; const director = new EncounterDirector((value) => { entries = value; }, () => 0);
    director.configure('C', false); vi.advanceTimersByTime(10000); director.configure('C', true); vi.advanceTimersByTime(100000); expect(entries).toHaveLength(0);
    director.configure('C', false); vi.advanceTimersByTime(5000); expect(entries).toHaveLength(1);
    director.configure('C', true); vi.advanceTimersByTime(30000); expect(entries[0].phase).not.toBe('leaving');
    director.configure('B', false); expect(entries).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    director.configure('D', false); director.configure(null, false); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('奖励梦露、一次性互动与兼容存档', () => {
  it('奖励不占七颗上限，合计 24 点；满额不收取、不丢弃部分余量', () => {
    const { game } = testGame({ dew: 12 }); startScene(game); game.setDewViewport({ width: 844, height: 390, scale: 0.43 });
    for (let index = 0; index < 7; index++) game.spawnDew();
    game.spawnAranara(0); const id = game.getSnapshot().encounters[0].id;
    expect(game.interactAranara(id, { x: 20, y: 50 })).toBe(true); expect(game.interactAranara(id, { x: 20, y: 50 })).toBe(false);
    const state = game.getSnapshot(); const rewards = state.dewParticles.filter((particle) => particle.kind === 'reward');
    expect(state.dewParticles.length).toBeGreaterThan(7); expect(rewards.reduce((total, particle) => total + particle.value, 0)).toBe(24);
    rewards.forEach((particle) => expect(isDewPositionSafe(particle, { width: 844, height: 390, scale: 0.43 }, [0, 100], state.dewParticles.filter((entry) => entry.id !== particle.id), true)).toBe(true));
    expect(game.collectDew(rewards[0].id)).toBe(false); vi.advanceTimersByTime(850);
    game.collectDew(rewards[0].id); expect(game.getSnapshot().save.dew).toBe(13);
    expect(game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'reward' && !particle.collected).reduce((total, particle) => total + particle.value, 0)).toBe(23);
    expect(game.collectDew(rewards[1].id)).toBe(false); expect(game.getSnapshot().dewFeedback).toBe('full');
    game.water(); expect(game.collectDew(rewards[1].id)).toBe(true); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('奖励 60 秒过期、普通五秒过期，暂停与窗口重排不续命', () => {
    const { game } = testGame(); startScene(game); game.spawnAranara(); game.interactAranara(game.getSnapshot().encounters[0].id, { x: 20, y: 50 });
    const ids = game.getSnapshot().dewParticles.map((particle) => particle.id); vi.advanceTimersByTime(5000);
    expect(game.getSnapshot().dewParticles.filter((particle) => ids.includes(particle.id) && !particle.expiring)).toHaveLength(ids.length);
    game.openPanel('settings'); vi.advanceTimersByTime(90000); game.closePanel();
    game.setDewViewport({ width: 640, height: 360, scale: 0.37 });
    expect(game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'reward' && !particle.collected).reduce((total, particle) => total + particle.value, 0)).toBe(24);
    vi.advanceTimersByTime(54999); expect(game.getSnapshot().dewParticles.some((particle) => particle.kind === 'reward' && !particle.expiring)).toBe(true);
    vi.advanceTimersByTime(1); expect(game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'reward').every((particle) => particle.expiring)).toBe(true);
    vi.advanceTimersByTime(300); expect(game.getSnapshot().dewParticles.some((particle) => particle.kind === 'reward')).toBe(false); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('四只常驻连续奖励在拥挤屏幕保留全部 96 点，分别到期，领取记录刷新后保持', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const { game, storage } = testGame(stageFixture('F', clock.now()), clock);
    startScene(game); game.setDewViewport({ width: 640, height: 360, scale: 0.37 });
    FESTIVAL_ARANARA.forEach((id) => expect(game.interactAranara(id, { x: 20, y: 50 })).toBe(true));
    expect(game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'reward').reduce((total, particle) => total + particle.value, 0)).toBe(96);
    expect(game.getSnapshot().save.claimedAranara).toEqual([...FESTIVAL_ARANARA]); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage)); startScene(restored);
    FESTIVAL_ARANARA.forEach((id) => expect(restored.interactAranara(id, { x: 20, y: 50 })).toBe(false)); expect(restored.getSnapshot().dewParticles).toEqual([]); restored.stop();
  });

  it('错时合并的奖励批次各自六十秒到期，新批次不为旧份额续命', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const { game } = testGame(stageFixture('F', clock.now()), clock);
    startScene(game); game.setDewViewport({ width: 640, height: 360, scale: 0.37 });
    const remaining = () => game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'reward').reduce((total, particle) => total + particle.value, 0);
    FESTIVAL_ARANARA.slice(0, 3).forEach((id) => game.interactAranara(id, { x: 20, y: 50 })); vi.advanceTimersByTime(20000);
    game.interactAranara('aranara_10', { x: 20, y: 50 }); expect(remaining()).toBe(96);
    expect(game.getSnapshot().dewParticles.some((particle) => (particle.portions?.length ?? 0) > 1)).toBe(true);
    vi.advanceTimersByTime(39999); expect(remaining()).toBe(96);
    vi.advanceTimersByTime(1); expect(remaining()).toBe(24);
    vi.advanceTimersByTime(19999); expect(remaining()).toBe(24);
    vi.advanceTimersByTime(1); expect(remaining()).toBe(0);
    game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('旧 v2 默认未领奖，只保留合法去重的常驻 ID 与两次来访资格', () => {
    expect(validateSave({ version: 2 }).claimedAranara).toEqual([]);
    const save = validateSave({ version: 2, claimedAranara: ['aranara_07', 'aranara_07', 'aranara_01', 'unknown'], pendingVisits: ['visit-A-2'] });
    expect(save.claimedAranara).toEqual(['aranara_07']); expect(save.pendingVisits).toEqual(['visit-A-2']);
  });
});

describe('两次来访、独立对白和额外停留', () => {
  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('%s 两个已抽中的来访各播一条不重复的阶段对白，第二次不是空播', (stage) => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const fixture = stageFixture(stage, clock.now());
    const { game } = testGame({ ...fixture, pendingVisits: stageVisitIds(stage), playedDialogues: [...fixture.playedDialogues, STAGES[stage].transition.id] }, clock);
    const seen = new Set<string>(); game.subscribe(() => { const speech = game.getSnapshot().speech; if (speech?.anchor === 'nahida') seen.add(speech.entry.id); });
    startScene(game); until(() => stageVisitIds(stage).every((id) => game.getSnapshot().save.completedVisits.includes(id)));
    expect(seen.size).toBe(2);
    for (const id of seen) expect(STAGES[stage].visit.dialogue.map((line) => line.id)).toContain(id);
    game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('对白结束仍停留 3～7 秒，但允许树体对白和浇灌；停留可暂停', () => {
    const { game } = testGame({ dew: 13 }); startScene(game); game.requestVisit(); until(() => game.getSnapshot().save.completedVisits.includes('visit-A'));
    expect(game.getSnapshot().companion).toBe('observe'); expect(game.getSnapshot().speech).toBeNull();
    game.openPanel('settings'); vi.advanceTimersByTime(30000); expect(game.getSnapshot().companion).toBe('observe'); game.closePanel();
    game.talk(); expect(game.getSnapshot().speech?.anchor).toBe('tree'); expect(game.water()).toBe(true);
    expect(PRESENTATION_RULES.lingerMinMs).toBe(3000); expect(PRESENTATION_RULES.lingerMaxMs).toBe(7000);
    vi.advanceTimersByTime(2900); expect(game.getSnapshot().companion).toBe('observe'); vi.advanceTimersByTime(4600); expect(game.getSnapshot().companion).toBeNull(); game.stop();
  });
});

describe('分散藏身、跳出钻入与独立晶蝶', () => {
  it('五组均为六处场景物件与四周各一处，真实姿态校准只调整位置', () => {
    const report = JSON.parse(readFileSync('docs/inhabitants/hiding-calibration.json', 'utf8')) as Array<{ ratio: number }>;
    expect(report).toHaveLength(180); report.forEach((entry) => { expect(entry.ratio).toBeGreaterThanOrEqual(0.08); expect(entry.ratio).toBeLessThan(0.65); });
    const layers = JSON.parse(readFileSync('docs/inhabitants/hiding-layers.json', 'utf8')) as { files: Array<{ file: string; bytes: number; sha256: string }> };
    expect(layers.files).toHaveLength(43);
    for (const layer of layers.files) { const bytes = readFileSync(layer.file); expect(bytes.length).toBe(layer.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(layer.sha256); }
    for (const [stage, anchors] of Object.entries(HIDING_PLACES)) {
      expect(anchors.filter((anchor) => !anchor.edge)).toHaveLength(6);
      expect(new Set(anchors.map((anchor) => anchor.edge).filter(Boolean))).toEqual(new Set(['top', 'bottom', 'left', 'right']));
      const actors = creatureLayout(stage as 'A', anchors.map((_, slot) => ({ id: slot, slot, asset: 'aranara_01', phase: 'watching' })), { width: 1440, height: 900, scale: 1, offset: 0, root: 760, treeHeight: 95, seed: 1027 }, []);
      expect(actors.every((actor) => !('clip' in actor))).toBe(true);
      expect(actors.filter((actor) => actor.edge)).toHaveLength(4);
      expect(new Set(actors.map((actor) => actor.depth)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('活动随机只选可见藏身点，屏幕上缘只使用适合倒挂的形象', () => {
    let entries: ForestEncounter[] = []; const director = new EncounterDirector((value) => { entries = value; }, () => 0.5);
    director.configure('A', false); director.setAvailable([8]); expect(director.spawn()).toBe(true);
    expect(entries[0].slot).toBe(8); expect(['aranara_01', 'aranara_02']).toContain(entries[0].asset);
    expect(director.spawn()).toBe(false); director.clear();
    const occupied = new EncounterDirector((value) => { entries = value; }, () => 0);
    occupied.configure('A', false); occupied.spawn(0); occupied.spawn(1); occupied.setAvailable([8, 9]); expect(occupied.spawn()).toBe(true);
    expect(entries[2].slot).toBe(9); occupied.clear();
  });

  it('领奖退场先蹲身跳出，再钻回物件；自然退场不额外跳跃', () => {
    expect(roamingMotion(2, 0.05, true).scaleY).toBeLessThan(1);
    expect(roamingMotion(2, 0.4, true).vertical).toBeLessThan(-0.6);
    expect(roamingMotion(2, 1.3, true).vertical).toBeGreaterThan(0.8);
    expect(roamingMotion(2, 0.4, false).vertical).toBeGreaterThan(0);
    expect(roamingMotion(2, 0.4, true, true).vertical).toBe(0);
    let entries: ForestEncounter[] = []; const director = new EncounterDirector((value) => { entries = value; }, () => 0.5);
    director.configure('C', false); director.spawn(0); director.leave(entries[0].id, true);
    expect(entries[0].celebrated).toBe(true); vi.advanceTimersByTime(1349); expect(entries).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(entries).toHaveLength(0); director.clear();
  });

  it('奖励均从点击中心扩散，飞散可暂停且落定前不提前收取', () => {
    const { game } = testGame({ dew: 0 }); startScene(game); game.spawnAranara(0);
    game.interactAranara(game.getSnapshot().encounters[0].id, { x: 18, y: 46 });
    const rewards = game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'reward');
    expect(rewards.length).toBeGreaterThan(0); rewards.forEach((particle) => expect(particle.launch).toEqual({ x: 18, y: 46 }));
    expect(game.collectDew(rewards[0].id)).toBe(false); vi.advanceTimersByTime(300);
    game.openPanel('settings'); vi.advanceTimersByTime(30000); game.closePanel();
    expect(game.getSnapshot().rewardBursts).toHaveLength(1);
    vi.advanceTimersByTime(549); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === rewards[0].id)?.launch).toBeTruthy();
    vi.advanceTimersByTime(1); expect(game.collectDew(rewards[0].id)).toBe(true); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('过百后每个随机树高阈值只新增一只，随机锚点 / 形象无三只一组的重复排列', () => {
    const plan = crystalPlan(1027); expect(plan).toHaveLength(15); expect(crystalPlan(1027)).toEqual(plan); expect(crystalPlan(1030)).not.toEqual(plan);
    expect(new Set(plan.map((entry) => `${entry.horizontal},${entry.elevation}`)).size).toBe(15);
    const viewport = { width: 1440, height: 900, scale: 1, offset: 0, root: 760, seed: 1027, growth: 1000, treeHeight: getTreeHeight(100) };
    for (let index = 1; index < plan.length; index++) {
      expect(plan[index].threshold).toBeGreaterThan(plan[index - 1].threshold); expect(plan[index].asset).not.toBe(plan[index - 1].asset);
      expect(creatureLayout('F', [], { ...viewport, treeHeight: plan[index].threshold - 0.001 }, []).filter((actor) => actor.kind === 'crystal')).toHaveLength(index);
      expect(creatureLayout('F', [], { ...viewport, treeHeight: plan[index].threshold }, []).filter((actor) => actor.kind === 'crystal')).toHaveLength(index + 1);
    }
  });
});
