import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/time';
import { createTimeResponse } from '../server/timeEndpoint';
import { SCHEDULE } from '../src/data/schedule';
import { GameController } from '../src/game/core/GameController';
import { SaveManager, SAVE_KEYS, createSave } from '../src/game/save/SaveManager';
import { ServerClock } from '../src/game/time/ServerClock';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { TIME_SYNC_RULES } from '../src/game/time/protocol';
import { MemoryStorage } from './support';

const opening = Date.parse(SCHEDULE[0].at);
const cleanups: Array<() => void> = [];

function timeResponse(url: string, now: number) {
  return Response.json({ version: 1, now, requestId: new URL(url, 'https://example.test').searchParams.get('requestId') });
}

function setup(initial = opening) {
  let serverNow = initial;
  let tick = 0;
  let sequence = 0;
  const fetchTime = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url) => timeResponse(url, serverNow));
  const clock = new ServerClock({ fetch: fetchTime, monotonicNow: () => tick, requestId: () => `request-${++sequence}` });
  cleanups.push(() => clock.stop());
  return {
    clock, fetchTime, time: new TimeGateService(clock),
    server: (value: number) => { serverNow = value; },
    tick: (value: number) => { tick = value; },
    start: async () => { clock.start(); await clock.synchronize(); },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2050-01-01T00:00:00Z')); });
afterEach(() => {
  cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe('服务器时间与离线权限', () => {
  it('首次失败时不使用设备日期或授予任何日期权限', async () => {
    const context = setup();
    context.fetchTime.mockRejectedValue(new Error('offline'));
    expect(context.clock.now()).toBe(0);
    await context.start();
    expect(context.clock.getSnapshot()).toEqual({ status: 'offline', verifiedAt: null });
    expect(context.time.getGate()).toMatchObject({ cap: 0, available: [] });
    expect(context.time.isOpen('A')).toBe(false);
  });

  it('显示时间以单调时钟走动，改变设备日期不改变开放权限', async () => {
    const context = setup();
    await context.start();
    expect(context.clock.now()).toBe(opening);
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
    context.tick(86400000);
    expect(context.clock.now()).toBe(opening + 86400000);
    expect(context.time.getGate().cap).toBe(520);
    expect(context.time.isOpen('D')).toBe(false);
    const [url, options] = context.fetchTime.mock.calls[0];
    expect(url).toBe('/api/time?requestId=request-1');
    expect(options).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin' });
  });

  it.each([...new Set(SCHEDULE.map((entry) => entry.at))].map((at) => ({ name: at, boundary: Date.parse(at), cap: SCHEDULE.filter((entry) => entry.at === at).at(-1)!.cap + (at === SCHEDULE[5].at ? 1 : 0) })))('$name 批次边界仅在服务器确认后开放', async ({ boundary, cap }) => {
    const context = setup(boundary - 1);
    await context.start();
    const previous = context.time.getGate();
    context.tick(86400000);
    expect(context.time.getGate()).toEqual(previous);
    expect(context.time.isOpen('F')).toBe(previous.available.includes('F'));
    context.server(boundary);
    await context.clock.synchronize();
    expect(context.time.getGate().cap).toBe(cap);
    expect(context.time.getGate()).not.toHaveProperty('nightUnlocked');
  });

  it('联网时在临近边界主动重新校时，页面无需刷新', async () => {
    const context = setup(opening - 1);
    await context.start();
    context.server(opening);
    context.tick(250);
    await vi.advanceTimersByTimeAsync(250);
    expect(context.fetchTime).toHaveBeenCalledTimes(2);
    expect(context.time.isOpen('A')).toBe(true);
  });

  it('定期校时，失败后短间隔重试且保留已确认权限', async () => {
    const context = setup();
    await context.start();
    context.fetchTime.mockRejectedValueOnce(new Error('offline'));
    context.tick(TIME_SYNC_RULES.refreshMs);
    await vi.advanceTimersByTimeAsync(TIME_SYNC_RULES.refreshMs);
    expect(context.clock.getSnapshot()).toEqual({ status: 'offline', verifiedAt: opening });
    expect(context.time.getGate().cap).toBe(520);
    context.server(Date.parse(SCHEDULE[3].at));
    await vi.advanceTimersByTimeAsync(TIME_SYNC_RULES.retryMs);
    expect(context.fetchTime).toHaveBeenCalledTimes(3);
    expect(context.time.getGate().cap).toBe(814);
  });

  it('同页离线继续已开放的成长，刷新后不从本地存档恢复日期权限', async () => {
    const context = setup();
    await context.start();
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEYS.player, JSON.stringify({ ...createSave(), introSeen: true, growth: 13, dew: 13 }));
    const game = new GameController(context.time, new SaveManager(storage), () => 0.99);
    cleanups.push(() => game.stop());
    game.start();
    context.fetchTime.mockRejectedValue(new Error('offline'));
    await context.clock.synchronize();
    context.tick(7 * 86400000);
    expect(game.water()).toBe(true);
    expect(game.getSnapshot().save.growth).toBe(26);
    expect(game.getSnapshot().save.dew).toBe(0);
    game.stop();
    const reloaded = setup();
    reloaded.fetchTime.mockRejectedValue(new Error('offline'));
    await reloaded.start();
    const restored = new GameController(reloaded.time, new SaveManager(storage), () => 0.99);
    cleanups.push(() => restored.stop());
    restored.start();
    expect(restored.getSnapshot().growth).toBe(0);
    expect(restored.getSnapshot().save.growth).toBe(26);
    expect(restored.water()).toBe(false);
    expect(restored.getSnapshot().mode).toBe('intro');
    expect(restored.getSnapshot().save.growth).toBe(26);
    expect(restored.getSnapshot().save.dew).toBe(0);
  });

  it.each([
    { name: 'HTTP 503', response: () => new Response('', { status: 503 }) },
    { name: 'SPA HTML', response: () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) },
    { name: '错误协议', response: () => Response.json({ version: 2, now: opening, requestId: 'request-1' }) },
    { name: '缓存的旧请求', response: () => Response.json({ version: 1, now: opening, requestId: 'request-0' }) },
    { name: '字符串时间', response: () => Response.json({ version: 1, now: String(opening), requestId: 'request-1' }) },
    { name: '小数时间', response: () => Response.json({ version: 1, now: opening + 0.5, requestId: 'request-1' }) },
    { name: '非法日期', response: () => Response.json({ version: 1, now: 8640000000000001, requestId: 'request-1' }) },
    { name: '负数', response: () => Response.json({ version: 1, now: -1, requestId: 'request-1' }) },
    { name: '空响应', response: () => Response.json(null) },
  ])('$name 不解锁，也不回退设备时间', async ({ response }) => {
    const context = setup();
    context.fetchTime.mockResolvedValue(response());
    await context.start();
    expect(context.clock.getSnapshot().status).toBe('offline');
    expect(context.time.getGate().cap).toBe(0);
  });

  it('超时覆盖整个响应读取，晚到的正文不能写入时钟', async () => {
    const context = setup();
    const response = timeResponse('/api/time?requestId=request-1', opening);
    let finishBody!: (value: unknown) => void;
    vi.spyOn(response, 'json').mockImplementation(() => new Promise((resolve) => { finishBody = resolve; }));
    context.fetchTime.mockResolvedValue(response);
    context.clock.start();
    const completion = context.clock.synchronize();
    await vi.advanceTimersByTimeAsync(TIME_SYNC_RULES.timeoutMs);
    await completion;
    expect(context.fetchTime.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(context.clock.getSnapshot().status).toBe('offline');
    finishBody({ version: 1, now: opening, requestId: 'request-1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(context.time.getGate().cap).toBe(0);
  });

  it('请求合并、停止中止与重启隔离，旧请求不能覆盖新确认', async () => {
    const context = setup();
    let finishOld!: (value: Response) => void;
    context.fetchTime.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    context.clock.start();
    const old = context.clock.synchronize();
    expect(context.clock.synchronize()).toBe(old);
    await vi.advanceTimersByTimeAsync(0);
    context.clock.stop();
    expect(context.fetchTime.mock.calls[0][1].signal?.aborted).toBe(true);
    await context.start();
    finishOld(timeResponse('/api/time?requestId=request-1', Date.parse(SCHEDULE[5].at)));
    await old;
    expect(context.time.getGate().cap).toBe(520);
    expect(context.clock.getSnapshot().status).toBe('synced');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('卸载移除后续校时与通知，重复启动不创建重复轮询', async () => {
    const context = setup();
    const listener = vi.fn();
    const unsubscribe = context.clock.subscribe(listener);
    await context.start();
    context.clock.start();
    expect(context.fetchTime).toHaveBeenCalledTimes(1);
    unsubscribe();
    listener.mockClear();
    context.clock.stop();
    await vi.advanceTimersByTimeAsync(3600000);
    expect(context.fetchTime).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Pages Function 时间端点', () => {
  it('只返回服务器日期，忽略客户端日期参数并禁止缓存', async () => {
    const response = onRequest({ request: new Request('https://example.test/api/time?requestId=test-123&now=0&skipTime=1') });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 1, now: Date.now(), requestId: 'test-123' });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
  });

  it('HEAD 只有响应头，普通无参数 GET 仍可用于部署检查', async () => {
    const head = createTimeResponse(new Request('https://example.test/api/time', { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const get = createTimeResponse(new Request('https://example.test/api/time'));
    expect(await get.json()).toMatchObject({ requestId: '', now: Date.now() });
  });

  it.each(['POST', 'PUT', 'DELETE'])('%s 不作为时间来源', (method) => {
    const response = createTimeResponse(new Request('https://example.test/api/time', { method }));
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });

  it.each(['x'.repeat(129), 'bad%20request'])('拒绝过长或非法的请求标识', (requestId) => {
    expect(createTimeResponse(new Request(`https://example.test/api/time?requestId=${requestId}`)).status).toBe(400);
  });
});
