import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { parseNotice, noticeLinkAllowed } from '../src/game/notice/markdown';
import { Atmosphere } from '../src/components/Atmosphere';
import { STAGES } from '../src/data/stages';
import { completeLoadingArtChoices } from '../src/data/stageLoading';
import { GameController } from '../src/game/core/GameController';
import { SaveManager } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { SCHEDULE } from '../src/data/schedule';
import { stageFixture } from '../src/dev/fixtures';
import { startScene, testGame, TestClock } from './support';

describe('可编辑的企划声明', () => {
  it('解析标题、段落和列表，兼容 CRLF，保持正文为纯文本', () => {
    expect(parseNotice('# 标题\r\n\r\n## 联系\r\n第一行\r\n第二行\r\n\r\n- 署名\r\n- 联系方式\r\n\r\n<script>alert(1)</script>')).toEqual({ title: '标题', blocks: [{ kind: 'heading', text: '联系' }, { kind: 'paragraph', text: '第一行 第二行' }, { kind: 'list', items: ['署名', '联系方式'] }, { kind: 'paragraph', text: '<script>alert(1)</script>' }] });
  });
  it.each([['https://example.com/a', true], ['/asserts/sfx/CREDITS.txt', true], ['javascript:alert(1)', false], ['//example.com', false], ['data:text/html,test', false], ['/\\example.com', false], ['/path with spaces', false]])('声明链接 %s：%s', (href, allowed) => {
    expect(noticeLinkAllowed(href as string)).toBe(allowed);
  });
  it('正式内容包含用户指定署名 / 联系方式、非官方性质及独立的素材说明', () => {
    const source = readFileSync('src/content/notice.md', 'utf8');
    const content = parseNotice(source);
    expect(content.title).toBe(source.match(/^# (.+)$/m)?.[1]?.trim()); expect(source).toContain('独钓'); expect(source).toContain('1666417849'); expect(source).toContain('190497686');
    expect(source).toContain('非商业同人'); expect(source).toContain('不是官方'); expect(source).toContain('/asserts/sfx/CREDITS.txt');
    expect(content.blocks.filter((block) => block.kind === 'heading')).toHaveLength(5);
  });
  it('G 底图不再额外放大 / 上移，也不挂载旧树影', () => {
    const html = renderToStaticMarkup(createElement(Atmosphere, { stage: STAGES.G, offset: 999, reduced: true, effects: [], night: false }));
    const background = html.match(/<img[^>]*class="landscape-image reality-landscape"[^>]*>/)?.[0];
    expect(background).toBeDefined(); expect(background).not.toMatch(/transform|scale/); expect(html).not.toContain('forest-silhouette');
    expect(readFileSync('src/styles/notice.css', 'utf8')).toContain('object-position: center bottom');
  });
});

describe('整页重抽插图与声明暂停', () => {
  const games: GameController[] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  it('整页进入忽略旧插图选择，只抽五次且同页重复准备不重抽', () => {
    const context = testGame({ growth: 20, dew: 5, loadingArtChoices: completeLoadingArtChoices({}, () => 0) });
    const random = vi.fn(() => .99);
    const game = new GameController(new TimeGateService(context.clock), new SaveManager(context.storage), random); games.push(game);
    random.mockClear(); const before = game.getSnapshot().save;
    game.prepareOpeningAssets(); expect(random).toHaveBeenCalledTimes(5);
    expect(game.getSnapshot().save.loadingArtChoices).toEqual({ B: 'AB2', C: 'BC2', D: 'CD2', E: 'DE2', F: 'EF2', G: 'FG1' });
    expect(game.getSnapshot().save.growth).toBe(before.growth); expect(game.getSnapshot().save.dew).toBe(before.dew);
    game.prepareOpeningAssets(); expect(random).toHaveBeenCalledTimes(5);
    const reopened = new GameController(new TimeGateService(context.clock), new SaveManager(context.storage), () => 0); games.push(reopened); reopened.prepareOpeningAssets();
    expect(reopened.getSnapshot().save.loadingArtChoices).toEqual({ B: 'AB1', C: 'BC1', D: 'CD1', E: 'DE1', F: 'EF1', G: 'FG1' });
    expect(reopened.getSnapshot().save.growth).toBe(20); expect(reopened.getSnapshot().save.dew).toBe(5);
  });
  it('浇灌中打开声明并跨面板切换，关闭后续播剩余演出', () => {
    const { game } = testGame({ dew: 20 }); games.push(game); startScene(game); game.water(); vi.advanceTimersByTime(100);
    game.openPanel('notice'); expect(game.getSnapshot()).toMatchObject({ mode: 'notice', presentationPaused: true });
    const speech = game.getSnapshot().speech; vi.advanceTimersByTime(20000); expect(game.getSnapshot().speech).toEqual(speech); expect(game.water()).toBe(false);
    game.openPanel('settings'); vi.advanceTimersByTime(10000); game.openPanel('notice'); game.closePanel();
    expect(game.getSnapshot().mode).toBe('watering'); vi.advanceTimersByTime(499); expect(game.getSnapshot().mode).toBe('watering');
    vi.advanceTimersByTime(1); expect(game.getSnapshot().mode).toBe('growing'); vi.advanceTimersByTime(800); expect(game.getSnapshot().mode).toBe('idle');
  });
  it('阅读声明不写已读 / 祝福，G 闲置关闭后重计二十秒', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const { game, storage } = testGame(stageFixture('G', clock.now()), clock); games.push(game); startScene(game);
    const before = [...storage.values]; game.openPanel('notice'); vi.advanceTimersByTime(120000);
    expect([...storage.values]).toEqual(before); expect(game.getSnapshot().speech).toBeNull(); game.closePanel();
    vi.advanceTimersByTime(19999); expect(game.getSnapshot().speech).toBeNull(); vi.advanceTimersByTime(1); expect(game.getSnapshot().speech?.anchor).toBe('nahida');
  });
});
