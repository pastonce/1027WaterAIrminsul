import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_ASSETS, backgroundFiles, getStageBackground } from '../src/data/backgrounds';
import { BackgroundDirector } from '../src/game/backgrounds/BackgroundDirector';
import { backgroundParallax, backgroundQuality, backgroundView } from '../src/game/backgrounds/policy';
import type { BackgroundScene } from '../src/game/backgrounds/scene';
import { resizeAtlasPage } from '../src/game/backgrounds/atlas';
import type { RoamingLayer } from '../src/game/encounters/RoamingLayer';

describe('背景素材与用户指定映射', () => {
  it.each(Object.values(BACKGROUND_ASSETS))('$id 使用真实且完整的同版本本地素材', (asset) => {
    for (const file of backgroundFiles(asset)) {
      expect(readFileSync(`public${file.src}`).equals(readFileSync(file.source)), file.src).toBe(true);
    }
    const poster = readFileSync(`public${asset.poster}`);
    expect(poster.subarray(8, 12).toString()).toBe('WEBP');
    expect(poster.length).toBeLessThan(300 * 1024);
    for (const layer of asset.layers) {
      const json = JSON.parse(readFileSync(`public${layer.json.src}`, 'utf8'));
      const atlas = readFileSync(`public${layer.atlas.src}`, 'utf8');
      expect(json.skeleton.spine.startsWith(`${asset.runtime}.`)).toBe(true);
      expect(json.animations).toHaveProperty(layer.animation);
      expect([...atlas.matchAll(/^([^\r\n]+\.png)\r?$/gm)].map((match) => match[1])).toEqual(layer.textures.map((texture) => texture.page));
      for (const texture of layer.textures) {
        const png = readFileSync(`public${texture.src}`);
        expect(png.subarray(1, 4).toString()).toBe('PNG');
        expect(png.readUInt32BE(16)).toBeGreaterThan(0);
        expect(png.readUInt32BE(20)).toBeGreaterThan(0);
      }
    }
  });

  it('A～D 保持映射，E 使用 D 氛围变体，F 使用无角色庆典，G 不变', () => {
    expect(getStageBackground('A')?.id).toBe('forest');
    expect(getStageBackground('B')?.id).toBe('dunes');
    expect(getStageBackground('C')?.runtime).toBe('4.1');
    expect(getStageBackground('D')?.id).toBe('sanctuary');
    expect(getStageBackground('E')?.id).toBe('embers');
    expect(getStageBackground('F')?.id).toBe('festival');
    expect(getStageBackground('G')).toBeNull();
    expect(BACKGROUND_ASSETS.dunes.layers.some((layer) => layer.json.src.endsWith('/BG.json'))).toBe(false);
  });

  it('A 的内嵌第三页有实际来源，不漏掉或伪造纹理', () => {
    const page = BACKGROUND_ASSETS.forest.layers.flatMap((layer) => layer.textures).find((texture) => texture.page === 'zhongjing2_3.png');
    expect(page?.source).toBe('asserts/3.0/_other_resources/33291.png');
    expect(readFileSync(`public${page!.src}`).readUInt32BE(16)).toBe(1102);
  });
});

describe('背景构图与性能策略', () => {
  it.each([[1440, 900], [844, 390], [640, 360], [2560, 1080]])('%s × %s 使用 cover 构图且视差不露边', (width, height) => {
    const design = BACKGROUND_ASSETS.forest.view;
    const view = backgroundView(width, height, design);
    expect(view.width / view.height).toBeCloseTo(width / height);
    expect(view.width).toBeLessThanOrEqual(design.width + 0.001);
    expect(view.height).toBeLessThanOrEqual(design.height + 0.001);
    expect(backgroundParallax(10000, height)).toBeLessThan(height * 0.06);
    expect(backgroundParallax(-100, height)).toBe(0);
  });

  it('横屏收敛分辨率、帧率和可选层，桌面限制高 DPI', () => {
    expect(backgroundQuality(844, 390, 3)).toEqual({ compact: true, density: 1, fps: 20, textureSize: 1024 });
    expect(backgroundQuality(1440, 900, 3)).toEqual({ compact: false, density: 1.25, fps: 30, textureSize: 2048 });
    expect(BACKGROUND_ASSETS.dunes.planes!.every((plane) => !plane.optional)).toBe(true);
    for (const asset of Object.values(BACKGROUND_ASSETS).filter((asset) => !['dunes', 'festival'].includes(asset.id))) {
      expect([...asset.layers, ...(asset.planes ?? [])].some((entry) => entry.optional)).toBe(true);
    }
    expect(BACKGROUND_ASSETS.festival.layers.every((entry) => !entry.optional)).toBe(true);
  });

  it.each([0, 90, 180, 270])('纹理缩小时同步 %s° 图集像素坐标，保持归一化 UV 与几何比例', (degrees) => {
    const page = { width: 2048, height: 1023 };
    const region = { page, degrees, x: 320, y: 100, width: 240, height: 140, originalWidth: 260, originalHeight: 180, offsetX: 10, offsetY: 20, u: 320 / 2048, v: 100 / 1023 };
    const other = { ...region, page: { width: 2048, height: 1023 } };
    const normalized = { u: region.u, v: region.v, width: region.width / region.originalWidth, height: region.height / region.originalHeight, offsetX: region.offsetX / region.originalWidth };
    resizeAtlasPage([region, other], page, 1024, 512);
    expect(page).toEqual({ width: 1024, height: 512 });
    expect(region.x / page.width).toBeCloseTo(normalized.u);
    expect(region.y / page.height).toBeCloseTo(normalized.v);
    expect(region.width / region.originalWidth).toBeCloseTo(normalized.width);
    expect(region.height / region.originalHeight).toBeCloseTo(normalized.height);
    expect(region.offsetX / region.originalWidth).toBeCloseTo(normalized.offsetX);
    expect(region.originalWidth).toBeCloseTo(260 * (degrees === 90 || degrees === 270 ? 512 / 1023 : 0.5));
    expect(region.originalHeight).toBeCloseTo(180 * (degrees === 90 || degrees === 270 ? 0.5 : 512 / 1023));
    expect(region.u).toBe(normalized.u); expect(region.v).toBe(normalized.v);
    expect(other.x).toBe(320); expect(other.width).toBe(240);
  });
});

const frames = new Map<number, FrameRequestCallback>();
let sequence = 0;
const directors: BackgroundDirector[] = [];

function frame(timestamp: number) {
  const callbacks = [...frames.values()]; frames.clear();
  callbacks.forEach((callback) => callback(timestamp));
}

function fakeScene(): BackgroundScene {
  return { layers: 5, textureBytes: 1024, draw: vi.fn(), dispose: vi.fn() };
}

function setup(guests?: RoamingLayer) {
  const graphics = { isContextLost: vi.fn(() => false), getExtension: vi.fn(() => ({ loseContext: vi.fn() })) };
  const canvas = Object.assign(new EventTarget(), { width: 1, height: 1, style: { opacity: '0' }, getContext: vi.fn(() => graphics) }) as unknown as HTMLCanvasElement;
  const previous = Object.assign(new EventTarget(), { width: 1, height: 1, hidden: true, style: { opacity: '0' }, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }) as unknown as HTMLCanvasElement;
  const status = vi.fn();
  const scene = fakeScene();
  const load = vi.fn<typeof import('../src/game/backgrounds/scene').createBackgroundScene>().mockResolvedValue(scene);
  const present = vi.fn();
  const director = new BackgroundDirector(canvas, previous, status, load, present, guests);
  directors.push(director);
  director.resize(1440, 900, 2);
  return { director, canvas, previous, status, scene, load, graphics, present };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); }

beforeEach(() => {
  vi.useFakeTimers(); frames.clear(); sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle));
});
afterEach(() => {
  directors.splice(0).forEach((director) => director.dispose());
  expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('单背景画布与生命周期', () => {
  it('F 恢复原生循环，没有随机兰那罗时也持续推进背景和来访时钟', async () => {
    const guests = { visible: false, invalidate: undefined as (() => void) | undefined };
    const context = setup(guests as unknown as RoamingLayer);
    context.director.setScene(BACKGROUND_ASSETS.festival); await settle();
    frame(0); vi.advanceTimersByTime(900);
    expect(frames.size).toBe(1); const count = vi.mocked(context.scene.draw).mock.calls.length;
    frame(1000); expect(vi.mocked(context.scene.draw).mock.calls.length).toBeGreaterThan(count);
    expect(context.present).toHaveBeenLastCalledWith(BACKGROUND_ASSETS.festival, 0.1);
    guests.visible = true; guests.invalidate?.(); expect(frames.size).toBe(1);
    frame(2000); expect(vi.mocked(context.scene.draw).mock.calls.length).toBeGreaterThan(count);
    guests.visible = false; frame(2100); expect(frames.size).toBe(1);
    context.director.setPaused(true); expect(frames.size).toBe(0);
  });
  it('地面与树共用实际绘制的活动时间，慢加载不提前移动，静态回退一致落到终态', async () => {
    const context = setup();
    context.director.setScene(BACKGROUND_ASSETS.forest);
    expect(context.present).toHaveBeenLastCalledWith(BACKGROUND_ASSETS.forest, 0);
    await settle(); frame(0); frame(100);
    expect(context.present).toHaveBeenLastCalledWith(BACKGROUND_ASSETS.forest, 0.1);
    context.director.setPaused(true); frame(8000);
    expect(context.present).toHaveBeenLastCalledWith(BACKGROUND_ASSETS.forest, 0.1);
    context.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(context.present).toHaveBeenLastCalledWith(BACKGROUND_ASSETS.forest, Infinity);
  });
  it('入场只按活动帧推进，窗口、质量和上下文恢复不从头播放', async () => {
    const context = setup();
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle(); frame(0); frame(100);
    expect(context.scene.draw).toHaveBeenLastCalledWith(0.1, 1440, 900, 0.1);
    context.director.setPaused(true); frame(5000);
    context.director.setPaused(false); frame(10000);
    expect(context.scene.draw).toHaveBeenLastCalledWith(0, 1440, 900, 0.1);
    const mobile = fakeScene(); context.load.mockResolvedValue(mobile);
    context.director.resize(844, 390, 1); await settle();
    expect(mobile.draw).toHaveBeenLastCalledWith(0, 844, 390, 0.1);
    context.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    const restored = fakeScene(); context.load.mockResolvedValue(restored);
    context.canvas.dispatchEvent(new Event('webglcontextrestored')); await settle();
    expect(restored.draw).toHaveBeenLastCalledWith(0, 844, 390, Infinity);
  });

  it('减少动态跳过入场且不下载，恢复动态保持终态，再次真正进入才重播', async () => {
    const context = setup();
    context.director.setScene(BACKGROUND_ASSETS.forest, false, true); await settle();
    expect(context.load).not.toHaveBeenCalled(); expect(context.canvas.width).toBe(1);
    context.director.resize(1280, 800, 1);
    expect(context.canvas.width).toBe(1); expect(context.load).not.toHaveBeenCalled();
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle();
    expect(context.scene.draw).toHaveBeenLastCalledWith(0, 1280, 800, Infinity);
    context.director.setScene(BACKGROUND_ASSETS.dunes); await settle();
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle();
    expect(context.scene.draw).toHaveBeenLastCalledWith(0, 1280, 800, 0);
  });

  it('同一背景不重复创建，普通窗口变化只重画不下载', async () => {
    const context = setup();
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle();
    context.director.setScene(BACKGROUND_ASSETS.forest);
    context.director.resize(1280, 800, 2);
    expect(context.load).toHaveBeenCalledTimes(1);
    expect(context.canvas.width).toBe(1600);
    expect(context.status).toHaveBeenLastCalledWith('ready', { layers: 5, textureBytes: 1024 });
    expect(context.scene.draw).toHaveBeenCalledWith(0, 1280, 800, 0);
  });

  it('切换前保留二维快照并释放旧 GPU 资源，复用同一 WebGL 上下文', async () => {
    const context = setup();
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle(); frame(0);
    const next = fakeScene(); context.load.mockResolvedValue(next);
    context.director.setScene(BACKGROUND_ASSETS.dunes);
    expect(context.previous.hidden).toBe(false); expect(context.previous.style.opacity).toBe('1');
    expect(context.scene.dispose).toHaveBeenCalledTimes(1);
    await settle(); frame(20);
    expect(context.canvas.getContext).toHaveBeenCalledTimes(1);
    expect(context.previous.style.opacity).toBe('0');
    await vi.advanceTimersByTimeAsync(900);
    expect(context.previous.hidden).toBe(true); expect(context.previous.width).toBe(1);
  });

  it('快速切换取消旧下载，晚到场景只能释放，不能覆盖新场景', async () => {
    const context = setup();
    let finish!: (scene: BackgroundScene) => void;
    context.load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    context.director.setScene(BACKGROUND_ASSETS.forest);
    const oldSignal = context.load.mock.calls[0][4];
    context.director.setScene(BACKGROUND_ASSETS.canopy); await settle();
    expect(oldSignal.aborted).toBe(true);
    const old = fakeScene(); finish(old); await settle();
    expect(old.dispose).toHaveBeenCalledTimes(1); expect(old.draw).not.toHaveBeenCalled();
    expect(context.status.mock.calls.filter(([status]) => status === 'ready')).toHaveLength(1);
  });

  it('暂停不绘制、不重建资源，恢复后不会补算整段后台时长', async () => {
    const context = setup();
    context.director.setPaused(true);
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle(); frame(0);
    expect(context.scene.draw).toHaveBeenCalledTimes(1);
    frame(10000); expect(context.scene.draw).toHaveBeenCalledTimes(1);
    context.director.setPaused(false); frame(20000);
    expect(context.scene.draw).toHaveBeenLastCalledWith(0, 1440, 900, 0);
    context.director.setPaused(true); frame(50000);
    expect(context.load).toHaveBeenCalledTimes(1);
  });

  it('桌面限制 30 FPS，横屏切换后重载简化层与 1024 纹理', async () => {
    const context = setup();
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle(); frame(0);
    vi.mocked(context.scene.draw).mockClear(); frame(16); frame(32); frame(40);
    expect(context.scene.draw).toHaveBeenCalledTimes(1);
    context.load.mockResolvedValue(fakeScene()); context.director.resize(844, 390, 3); await settle();
    expect(context.load.mock.calls[1][3]).toMatchObject({ compact: true, density: 1, textureSize: 1024, fps: 20 });
    expect(context.canvas.width).toBe(844); expect(context.scene.dispose).toHaveBeenCalledTimes(1);
  });

  it('退出指定阶段后释放重资源，保留快照淡出且没有后台动画', async () => {
    const context = setup();
    context.director.setScene(BACKGROUND_ASSETS.sanctuary); await settle();
    context.director.setScene(null); frame(0);
    expect(context.scene.dispose).toHaveBeenCalledTimes(1);
    expect(context.canvas.width).toBe(1); expect(context.canvas.height).toBe(1);
    expect(context.status).toHaveBeenLastCalledWith('static');
    await vi.advanceTimersByTimeAsync(900);
    expect(frames.size).toBe(0);
  });

  it('资源失败和 WebGL 丢失均回退，恢复事件只重载当前背景', async () => {
    const context = setup();
    context.load.mockRejectedValueOnce(new Error('missing'));
    context.director.setScene(BACKGROUND_ASSETS.forest); await settle();
    expect(context.status).toHaveBeenLastCalledWith('fallback');
    context.director.setScene(BACKGROUND_ASSETS.dunes); await settle();
    const event = new Event('webglcontextlost', { cancelable: true }); context.canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(context.scene.dispose).toHaveBeenCalledTimes(1);
    expect(context.status).toHaveBeenLastCalledWith('fallback');
    context.load.mockResolvedValue(fakeScene()); context.canvas.dispatchEvent(new Event('webglcontextrestored')); await settle();
    expect(context.load).toHaveBeenCalledTimes(3); expect(context.load.mock.calls[2][2].id).toBe('dunes');
  });

  it('卸载取消下载与所有回调，晚到对象释放，重复清理无副作用', async () => {
    const context = setup();
    let finish!: (scene: BackgroundScene) => void;
    context.load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    context.director.setScene(BACKGROUND_ASSETS.canopy);
    const signal = context.load.mock.calls[0][4];
    context.director.dispose(); context.director.dispose();
    expect(signal.aborted).toBe(true);
    finish(context.scene); await settle();
    expect(context.scene.dispose).toHaveBeenCalledTimes(1);
    expect(context.scene.draw).not.toHaveBeenCalled();
    expect(context.status.mock.calls.filter(([status]) => status === 'ready')).toHaveLength(0);
    expect(context.graphics.getExtension).toHaveBeenCalledTimes(1);
  });

  it('二十秒总超时也覆盖运行时导入，晚到场景不会覆盖静态回退', async () => {
    const context = setup();
    let finish!: (scene: BackgroundScene) => void;
    context.load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    context.director.setScene(BACKGROUND_ASSETS.canopy);
    await vi.advanceTimersByTimeAsync(20000);
    expect(context.load.mock.calls[0][4].aborted).toBe(true);
    expect(context.status).toHaveBeenLastCalledWith('fallback');
    finish(context.scene); await settle();
    expect(context.scene.dispose).toHaveBeenCalledTimes(1); expect(context.scene.draw).not.toHaveBeenCalled();
  });
});
