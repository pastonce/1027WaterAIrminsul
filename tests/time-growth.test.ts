import { describe, expect, it } from 'vitest';
import { SCHEDULE } from '../src/data/schedule';
import { STAGES } from '../src/data/stages';
import { calculateWatering, getActiveStage, getTreeHeight } from '../src/game/growth/GrowthSystem';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { stageFixture } from '../src/dev/fixtures';
import { TestClock } from './support';

describe('北京时间开放表', () => {
  it('与任务书三批日期及六个成长上限一致', () => {
    expect(SCHEDULE.map((entry) => [entry.stage, entry.at, entry.cap])).toEqual([
      ['A', '2026-10-25T10:27:00+08:00', 210],
      ['B', '2026-10-25T10:27:00+08:00', 313],
      ['C', '2026-10-25T10:27:00+08:00', 520],
      ['D', '2026-10-26T10:27:00+08:00', 725],
      ['E', '2026-10-26T10:27:00+08:00', 814],
      ['F', '2026-10-27T10:27:00+08:00', 1027],
    ]);
  });
  it.each(SCHEDULE)('$stage 恰好在开放时间生效，上限 $cap', (entry) => {
    const clock = new TestClock(Date.parse(entry.at) - 1);
    const time = new TimeGateService(clock);
    expect(time.getGate().cap).toBe(SCHEDULE.filter((candidate) => Date.parse(candidate.at) < Date.parse(entry.at)).at(-1)?.cap ?? 0);
    expect(time.isOpen(entry.stage)).toBe(false);
    clock.value += 1;
    expect(time.getGate().cap).toBe(SCHEDULE.filter((candidate) => candidate.at === entry.at).at(-1)!.cap + (entry.stage === 'F' ? 1 : 0));
    expect(time.isOpen(entry.stage)).toBe(true);
  });

  it('不同设备时区不影响 ISO +08:00 的绝对时间', () => {
    const time = new TimeGateService(new TestClock(Date.parse('2026-10-27T02:27:00Z')));
    expect(time.getGate().cap).toBe(1028);
  });

  it('完成 F 后仍只有 G，晚间不再增加时间锁或阶段', () => {
    const clock = new TestClock(Date.parse('2026-10-27T22:26:00+08:00'));
    const time = new TimeGateService(clock);
    const before = time.getGate();
    clock.value = Date.parse('2026-10-27T22:27:00+08:00');
    expect(time.getGate()).toEqual(before); expect(time.getGate()).not.toHaveProperty('nightUnlocked');
  });

  it('未来存档不能授予当前时间尚未开放的现实结局', () => {
    const future = stageFixture('G', Date.parse(SCHEDULE[5].at));
    const time = new TimeGateService(new TestClock());
    expect(getActiveStage(future, time)).toBe('C');
    expect(time.getGate().cap).toBe(520);
  });
});

describe('成长事务规则', () => {
  it('消耗 13 梦露，增长 13', () => {
    expect(calculateWatering(0, 13, 210)).toEqual({ ok: true, growth: 13, dew: 0, gained: 13 });
  });
  it.each(SCHEDULE.map((entry) => entry.cap))('末次增长截断到 %s，不溢出', (cap) => {
    expect(calculateWatering(cap - 2, 13, cap)).toEqual({ ok: true, growth: cap, dew: 0, gained: 2 });
  });
  it('资源不足、未开放和上限不扣费', () => {
    expect(calculateWatering(0, 12, 210)).toEqual({ ok: false, reason: 'insufficient' });
    expect(calculateWatering(0, 13, 0)).toEqual({ ok: false, reason: 'locked' });
    expect(calculateWatering(210, 0, 210)).toEqual({ ok: false, reason: 'finished' });
  });
  it('六阶段高度连续，后期保持巨大尺寸', () => {
    for (const stage of SCHEDULE) {
      expect(getTreeHeight(stage.cap)).toBe(STAGES[stage.stage].height.end);
      if (stage.stage !== 'A') expect(getTreeHeight(STAGES[stage.stage].growth.start)).toBe(STAGES[stage.stage].height.start);
    }
    expect(getTreeHeight(1027)).toBe(3100);
  });
});
