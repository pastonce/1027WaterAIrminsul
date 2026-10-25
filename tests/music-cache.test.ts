import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedMusicSource } from '../src/game/audio/musicCache';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const src = '/asserts/music/current.m4a';
describe('当前曲压缩预载复用', () => {
  it('只读当前缓存响应，返回可播放Blob地址并在释放时撤销，不解码或新建播放器', async () => {
    const match = vi.fn(async () => new Response(new Blob(['AAC'], { type: 'audio/mp4' })));
    const createObjectURL = vi.fn(() => 'blob:music'); const revokeObjectURL = vi.fn();
    const source = await cachedMusicSource(src, async () => ({ match }) as unknown as Cache, { createObjectURL, revokeObjectURL } as unknown as typeof URL);
    expect(source.src).toBe('blob:music'); expect(match).toHaveBeenCalledExactlyOnceWith(src); expect(createObjectURL).toHaveBeenCalledOnce();
    source.release(); expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:music');
  });
  it('缓存未命中、隐私模式拒绝或错误页面直接退回原URL，继续流式播放', async () => {
    for (const open of [async () => null, async () => { throw new Error('denied'); }, async () => ({ match: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }) }) as unknown as Cache]) {
      expect((await cachedMusicSource(src, open)).src).toBe(src);
    }
  });
  it('缓存异常挂起只等200ms，迟到结果不创建泄漏的Blob', async () => {
    vi.useFakeTimers(); let resolve!: (cache: Cache) => void;
    const objects = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() } as unknown as typeof URL;
    const result = cachedMusicSource(src, () => new Promise<Cache>((done) => { resolve = done; }), objects);
    await vi.advanceTimersByTimeAsync(200); expect((await result).src).toBe(src);
    resolve({ match: async () => new Response('AAC') } as unknown as Cache); await vi.advanceTimersByTimeAsync(0);
    expect(objects.createObjectURL).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
