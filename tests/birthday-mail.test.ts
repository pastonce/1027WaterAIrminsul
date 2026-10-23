import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseBirthdayMail } from '../src/data/birthdayMailSource';
import { BIRTHDAY_LETTERS, birthdayArt, mailBookLayout, MAIL_ASSETS } from '../src/data/birthdayMail';
import { BirthdayMailDirector, MAIL_TIMING } from '../src/game/birthday-mail/BirthdayMailDirector';
import type { MailPlayback } from '../src/game/birthday-mail/BirthdayMailDirector';
import { stageFixture } from '../src/dev/fixtures';
import { SCHEDULE } from '../src/data/schedule';
import { startupPlan } from '../src/game/assets/startupPlan';
import { completeLoadingArtChoices } from '../src/data/stageLoading';
import { testGame, startScene, TestClock } from './support';
import content from '../src/data/birthdayMail.generated.json' with { type: 'json' };
import manifest from '../docs/birthday-mail-assets.manifest.json' with { type: 'json' };

describe('生日来信正文与压缩素材', () => {
  it('原稿按年份 / 两个正文块解析，保留原段落、标点与空白年份', () => {
    const source = readFileSync('asserts/生日贺图/信与回复.md');
    expect(createHash('sha256').update(source).digest('hex')).toBe(content.sha256);
    expect(parseBirthdayMail(source.toString('utf8'))).toEqual(BIRTHDAY_LETTERS);
    expect(BIRTHDAY_LETTERS.map((letter) => letter.year)).toEqual([2023, 2024, 2025, 2026]);
    expect(BIRTHDAY_LETTERS[0].title).toBe('闭上眼睛…');
    expect(BIRTHDAY_LETTERS[1].mail.join('\n')).toContain('当我早上睁开眼睛之后，能邀请你同游吗？');
    expect(BIRTHDAY_LETTERS[2].reply).toHaveLength(4);
    expect(BIRTHDAY_LETTERS[3]).toEqual({ year: 2026, title: '', mail: [], reply: [], pending: true });
  });
  it('兼容 CRLF，年份和章节缺失 / 重复时拒绝静默发布', () => {
    const source = readFileSync('asserts/生日贺图/信与回复.md', 'utf8');
    expect(parseBirthdayMail(source.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'))).toEqual(BIRTHDAY_LETTERS);
    expect(() => parseBirthdayMail(source.replace('# 24', '# 23'))).toThrow('年份缺失或重复');
    expect(() => parseBirthdayMail(source.replace('## 贺图回复', '## 其他'))).toThrow('章节缺失');
    expect(() => parseBirthdayMail('')).toThrow('四个年份');
  });
  it('所有源图不改字节、派生哈希精确，空 26.png 不当作可请求图', () => {
    for (const entry of [...manifest.inputs, ...manifest.files]) {
      const bytes = readFileSync(entry.file);
      expect(bytes.length).toBe(entry.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    }
    expect(manifest.publishedBytes).toBeLessThan(manifest.sourceBytes / 20);
    expect(birthdayArt(2026, false)).toBeNull(); expect(birthdayArt(1999, false)).toBeNull();
    expect(manifest.files.filter((entry) => /20\d\d-/.test(entry.src))).toHaveLength(6);
    expect(manifest.files.every((entry) => entry.width <= 1280)).toBe(true);
  });
  it.each([[1440, 900], [844, 390], [640, 360]])('书页在 %i×%i 中保持原比例且不越屏', (width, height) => {
    const book = mailBookLayout(width, height);
    expect(book.width / book.height).toBeCloseTo(1103 / 677);
    expect(book.left).toBeGreaterThan(0); expect(book.top).toBeGreaterThanOrEqual(16);
    expect(book.left + book.width).toBeLessThan(width); expect(book.top + book.height).toBeLessThan(height);
  });
  it.each([[1440, 900, false], [844, 390, true]] as const)('启动 %i×%i 只下载单档贺图，无原图 / 空占位 / 预解码', (width, height, compact) => {
    const urls = startupPlan(completeLoadingArtChoices({}, () => .99), width, height, 1, false).files.map((file) => file.url);
    expect(urls).toContain(MAIL_ASSETS.book); expect(urls).toContain(MAIL_ASSETS.arrowHover);
    for (const year of [2023, 2024, 2025]) { expect(urls).toContain(birthdayArt(year, compact)); expect(urls).not.toContain(birthdayArt(year, !compact)); }
    expect(urls.filter((url) => /birthday-mail\/20/.test(url))).toHaveLength(3);
  });
});

describe('信封打开、循环翻页和原位收信时钟', () => {
  let frame: MailPlayback;
  const complete = vi.fn();
  let director: BirthdayMailDirector;
  beforeEach(() => { vi.useFakeTimers(); complete.mockClear(); director = new BirthdayMailDirector((next) => { frame = next; }, complete); });
  afterEach(() => { director.stop(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  const read = (index = 0, reduced = false) => { director.open(index, reduced); vi.advanceTimersByTime(1000); expect(frame.phase).toBe('reading'); };
  it('先启封再展开，完成后才允许翻页', () => {
    director.open(0, false); expect(frame.phase).toBe('unsealing'); director.move(1);
    vi.advanceTimersByTime(MAIL_TIMING.unsealing); expect(frame).toMatchObject({ phase: 'expanding', index: 0 });
    vi.advanceTimersByTime(MAIL_TIMING.expanding - 1); expect(frame.phase).toBe('expanding');
    vi.advanceTimersByTime(1); expect(frame.phase).toBe('reading'); expect(complete).not.toHaveBeenCalled();
  });
  it('上一年 / 下一年循环，翻页期间不接受重复点击', () => {
    read(); director.move(-1); director.move(-1); expect(frame).toMatchObject({ phase: 'turning-out', index: 0, direction: -1 });
    vi.advanceTimersByTime(250); expect(frame).toMatchObject({ phase: 'turning-in', index: 3 });
    vi.advanceTimersByTime(500); director.move(1); vi.advanceTimersByTime(750); expect(frame).toMatchObject({ phase: 'reading', index: 0, direction: 1 });
    director.select(2); vi.advanceTimersByTime(750); expect(frame.index).toBe(2);
  });
  it('关闭顺序是收页、返回原信封、合封，最后才恢复页面', () => {
    read(1); director.select(3); vi.advanceTimersByTime(750); director.close(); expect(frame.phase).toBe('folding');
    vi.advanceTimersByTime(350); expect(frame.phase).toBe('returning');
    vi.advanceTimersByTime(620); expect(frame.phase).toBe('sealing'); expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(260); expect(complete).toHaveBeenCalledTimes(1); director.close(); expect(complete).toHaveBeenCalledTimes(1);
  });
  it('展开中或翻页中 Escape 延后收起，不跳过完整回程', () => {
    director.open(0, false); director.close(); vi.advanceTimersByTime(1000); expect(frame.phase).toBe('folding');
    vi.advanceTimersByTime(1230); expect(complete).toHaveBeenCalledTimes(1);
    read(); director.move(1); director.close(); vi.advanceTimersByTime(750); expect(frame.phase).toBe('folding');
  });
  it('后台 / 竖屏暂停剩余阶段时间，停止后无悬挂回调', () => {
    director.open(2, false); vi.advanceTimersByTime(300); director.setPaused(true); vi.advanceTimersByTime(30000);
    expect(frame.phase).toBe('expanding'); director.setPaused(false); vi.advanceTimersByTime(699); expect(frame.phase).toBe('expanding');
    vi.advanceTimersByTime(1); expect(frame.phase).toBe('reading'); director.close(); director.stop(); vi.advanceTimersByTime(10000); expect(complete).not.toHaveBeenCalled();
  });
  it('减少动态用短淡入淡出，但不跳过收信事务', () => {
    read(3, true); expect(frame.reduced).toBe(true); director.close(); vi.advanceTimersByTime(359); expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(complete).toHaveBeenCalledOnce();
  });
});

describe('G 读信隔离与对白恢复', () => {
  const games: ReturnType<typeof testGame>['game'][] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  const setup = (stage: 'A' | 'G' = 'G') => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at));
    const context = testGame(stageFixture(stage, clock.now()), clock); games.push(context.game); startScene(context.game); return context;
  };
  it('仅 G 普通空闲可打开，设置 / 回望 / 送祝福 / 未 start 均不能绕过', () => {
    const dream = setup('A').game; expect(dream.openBirthdayMail()).toBe(false);
    const { game } = setup(); game.openPanel('settings'); expect(game.openBirthdayMail()).toBe(false); game.closePanel();
    game.review('F'); expect(game.openBirthdayMail()).toBe(false); game.review(null); game.sendWish(); expect(game.openBirthdayMail()).toBe(false);
    game.stop(); expect(game.openBirthdayMail()).toBe(false);
  });
  it('读信暂停 G 闲置与表达，不写存档 / 已读 / 祝福，收起后重计二十秒', () => {
    const { game, storage } = setup(); const before = [...storage.values];
    expect(game.openBirthdayMail()).toBe(true); expect(game.getSnapshot().presentationPaused).toBe(true);
    vi.advanceTimersByTime(120000); expect(game.getSnapshot().speech).toBeNull(); expect([...storage.values]).toEqual(before);
    game.closePanel(); expect(game.getSnapshot()).toMatchObject({ mode: 'idle', presentationPaused: false });
    vi.advanceTimersByTime(19999); expect(game.getSnapshot().speech).toBeNull();
    vi.advanceTimersByTime(1); expect(game.getSnapshot().speech?.anchor).toBe('nahida');
  });
  it('已有 G 日常可以挂起原字时钟，读信期间不能触发新祝福', () => {
    const { game } = setup(); game.talk(); vi.advanceTimersByTime(500);
    expect(game.openBirthdayMail()).toBe(true); const speech = game.getSnapshot().speech!;
    game.sendWish(); game.talk(); vi.advanceTimersByTime(60000);
    expect(game.getSnapshot().speech).toEqual(speech); expect(game.getSnapshot().birthday).toBeNull();
    game.closePanel(); vi.advanceTimersByTime(100); expect(game.getSnapshot().speech?.entry.id).toBe(speech.entry.id);
  });
  it('撤销日期 / 重置 / stop 清理读信模式，不持久化页面状态', () => {
    const { game, clock } = setup(); game.openBirthdayMail(); clock.value = Date.parse(SCHEDULE[0].at) - 1; game.tick(); expect(game.getSnapshot().mode).toBe('intro');
    clock.value = Date.parse(SCHEDULE[5].at); game.tick(); game.restore(stageFixture('G', clock.now())); expect(game.openBirthdayMail()).toBe(true);
    game.stop(); expect(game.getSnapshot().mode).toBe('idle'); game.start(); expect(game.openBirthdayMail()).toBe(true); game.reset(); expect(game.getSnapshot().mode).toBe('intro');
  });
});
