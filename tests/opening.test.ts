import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { openingBounces, openingGeometry, openingTracks, openingTravel, OPENING_RULES } from '../src/game/opening/choreography';
import pattern from '../src/data/eSkillPattern.generated.json' with { type: 'json' };
import { startScene, testGame } from './support';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('每次打开网页的技能揭幕', () => {
  it.each([{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 640, height: 360 }, { width: 390, height: 844 }, { width: 3440, height: 1440 }])('$width × $height 中等比扩框，四角的最内沿最终都在屏幕外', ({ width, height }) => {
    const geometry = openingGeometry(width, height);
    expect(geometry.edge).toBeLessThan(Math.min(width, height));
    expect(geometry.edge).toBe(Math.min(480, Math.min(width, height) * 0.62) * 0.8);
    expect(geometry.artSize / pattern.viewBox[2]).toBeCloseTo(geometry.edge / pattern.openingWindow.size);
    expect(geometry.zoom * geometry.edge).toBe(geometry.expandedEdge);
    expect(geometry.expandedEdge * (0.5 - 90 / pattern.openingWindow.size)).toBeGreaterThan(Math.max(width, height) / 2);
    const tracks = openingTracks(width, height);
    expect(tracks).toHaveLength(12);
    for (const track of tracks) {
      const offsets = track.frames.map((frame) => frame.offset as number);
      expect(offsets).toEqual([...offsets].sort((first, second) => first - second));
      expect(offsets[0]).toBe(0); expect(offsets.at(-1)).toBe(1);
    }
    const content = tracks.find((track) => track.selector === '.opening-content')!;
    const frame = tracks.find((track) => track.selector === '.opening-frame')!;
    for (const milliseconds of [OPENING_RULES.expandMs, OPENING_RULES.expandedMs]) {
      const progress = milliseconds / OPENING_RULES.durationMs;
      expect(content.frames.find((entry) => entry.offset === progress)?.easing).toBe(frame.frames.find((entry) => entry.offset === progress)?.easing);
    }
  });

  it('原中心单独用于开场，祝福外围仍为 16 块；方形窗口来自真实边线骨骼', () => {
    expect(pattern.openingCenter.name).toBe('center_emblem');
    expect(pattern.pieces).toHaveLength(16); expect(pattern.omitted).toEqual(['center_emblem']);
    expect(pattern.openingWindow).toEqual({ left: -260.5, top: -261.5, size: 522 });
    const input = JSON.parse(readFileSync('asserts/E技能素材/e_skill_frame.json', 'utf8'));
    const frame = input.bones.find((bone: { name: string }) => bone.name === 'line_left');
    expect(pattern.openingWindow.left).toBe(frame.x);
  });

  it('上层暂停先于游戏 start，不偷播待访、生成梦露或发放祝福；解锁后原队列继续', () => {
    vi.useFakeTimers();
    const { game } = testGame({ pendingVisits: ['visit-A'], visitPositions: { 'visit-A': 1 } });
    game.setSuspended(true); startScene(game); vi.advanceTimersByTime(OPENING_RULES.durationMs + 4000);
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().companion).toBeNull();
    expect(game.getSnapshot().dewParticles).toEqual([]); expect(game.getSnapshot().save.blessedVisits).toEqual([]);
    expect(game.getSnapshot().save.pendingVisits).toEqual(['visit-A']); expect(game.water()).toBe(false);
    game.setSuspended(false); expect(game.getSnapshot().speech?.entry.id).toBe('R01'); vi.advanceTimersByTime(10000);
    expect(game.getSnapshot().companion).not.toBeNull(); expect(game.getSnapshot().companionPosition).toBe(1);
    game.stop();
  });

  it('短演出与有界素材等待；真实内容只裁切，不缩放、截图或追加画布 / RAF', () => {
    expect(OPENING_RULES.durationMs).toBeLessThanOrEqual(6000);
    expect(OPENING_RULES.fallbackMs).toBeLessThanOrEqual(250); expect(OPENING_RULES.assetWaitMs).toBeLessThanOrEqual(1000);
    const content = openingTracks(844, 390).find((track) => track.selector === '.opening-content')!;
    expect(content.frames.every((frame) => !('transform' in frame))).toBe(true);
    const source = readFileSync('src/components/OpeningReveal.tsx', 'utf8');
    expect(source).not.toMatch(/requestAnimationFrame|<canvas|toDataURL|cloneNode|localStorage|sessionStorage/);
    expect(source).toContain('inert={active}'); expect(source).toContain('aria-hidden={active || undefined}');
  });

  it('单印弹跳后滚动至中央；横向、弹跳、旋转独立，全程不缩放或透视压扁', () => {
    expect(OPENING_RULES.arriveMs).toBe(2850);
    expect(OPENING_RULES.holdMs).toBe(600);
    expect(OPENING_RULES.splitMs - OPENING_RULES.arriveMs).toBe(OPENING_RULES.holdMs);
    const tracks = openingTracks(844, 390);
    for (const selector of ['.opening-flight', '.opening-flight-travel', '.opening-flight-bounce']) {
      const track = tracks.find((entry) => entry.selector === selector)!;
      expect(track.frames.every((frame) => !/scale|rotateY|rotateX|perspective|skew/.test(String(frame.transform)))).toBe(true);
    }
    const geometry = openingGeometry(844, 390);
    expect(geometry.leafSize / 180).toBeCloseTo(geometry.artSize / pattern.viewBox[2]);
  });

  it('单印在左半屏沿页面中线触底，之后仅水平滚向中央并停顿', () => {
    for (const { width, height } of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 640, height: 360 }, { width: 390, height: 844 }]) {
      const tracks = openingTracks(width, height);
      const radius = openingGeometry(width, height).leafSize / Math.sqrt(2);
      const horizontal = tracks.find((track) => track.selector === '.opening-flight-travel')!.frames;
      expect(width / 2 + Number(String(horizontal[0].transform).match(/-?[\d.]+/)![0]) + radius).toBeLessThan(0);
      for (const frame of horizontal.filter((entry) => Number(entry.offset) >= OPENING_RULES.firstBounceMs / OPENING_RULES.durationMs && Number(entry.offset) <= OPENING_RULES.rollMs / OPENING_RULES.durationMs)) {
        const center = width / 2 + Number(String(frame.transform).match(/-?[\d.]+/)![0]);
        expect(center - radius).toBeGreaterThan(0); expect(center).toBeLessThan(width / 2);
      }
      expect(horizontal.find((frame) => frame.offset === OPENING_RULES.rollMs / OPENING_RULES.durationMs)?.easing).not.toBe('ease-in-out');
      const vertical = tracks.find((track) => track.selector === '.opening-flight-bounce')!.frames;
      for (const frame of vertical) expect(Number(String(frame.transform).match(/-?[\d.]+/)![0])).toBeLessThanOrEqual(0);
      for (const milliseconds of [OPENING_RULES.firstBounceMs, ...openingBounces().map((arc) => arc.endMs), OPENING_RULES.rollMs, OPENING_RULES.arriveMs]) {
        expect(vertical.find((frame) => frame.offset === milliseconds / OPENING_RULES.durationMs)?.transform).toBe('translateY(0px)');
      }
      expect(vertical.filter((frame) => Number(frame.offset) >= OPENING_RULES.rollMs / OPENING_RULES.durationMs).every((frame) => frame.transform === 'translateY(0px)')).toBe(true);
      const firstBounce = tracks.find((track) => track.selector === '.opening-flight-travel')!.frames.find((frame) => frame.offset === OPENING_RULES.firstBounceMs / OPENING_RULES.durationMs)!;
      expect(Number(String(firstBounce.transform).match(/-?[\d.]+/)![0])).toBeCloseTo(-width * 0.34);
    }
    const tracks = openingTracks(1440, 900);
    for (const selector of ['.opening-flight-travel', '.opening-flight-bounce', '.opening-flight']) {
      const frames = tracks.find((track) => track.selector === selector)!.frames;
      const arrived = frames.find((frame) => frame.offset === OPENING_RULES.arriveMs / OPENING_RULES.durationMs)!;
      expect(frames.filter((frame) => Number(frame.offset) > Number(arrived.offset)).every((frame) => frame.transform === arrived.transform)).toBe(true);
    }
  });

  it('抛物线共用重力，回弹速度保留 55%，第三次触底后再有三次递减微弹才滚动', () => {
    const arcs = openingBounces();
    expect(arcs).toHaveLength(5);
    const dropMs = OPENING_RULES.firstBounceMs - OPENING_RULES.dropStartMs;
    const acceleration = 2 * OPENING_RULES.dropHeight / dropMs ** 2;
    let previousFallMs = dropMs;
    let previousHeight: number = OPENING_RULES.dropHeight;
    for (const arc of arcs) {
      const ascentMs = arc.peakMs - arc.startMs;
      expect(ascentMs).toBeCloseTo(arc.endMs - arc.peakMs);
      expect(ascentMs / previousFallMs).toBeCloseTo(0.55);
      expect(arc.heightRatio / previousHeight).toBeCloseTo(0.55 ** 2);
      expect(2 * arc.heightRatio / ascentMs ** 2).toBeCloseTo(acceleration, 12);
      previousFallMs = ascentMs;
      previousHeight = arc.heightRatio;
    }
    expect(arcs[2].startMs).toBeCloseTo(1452.5);
    expect(arcs.slice(2).every((arc) => arc.heightRatio < 0.01)).toBe(true);
    expect(arcs.at(-1)!.endMs).toBe(OPENING_RULES.rollMs);
    const frames = openingTracks(1440, 900).find((track) => track.selector === '.opening-flight-bounce')!.frames;
    for (const arc of arcs) {
      expect(frames.find((frame) => frame.offset === arc.startMs / OPENING_RULES.durationMs)?.easing).toBe('cubic-bezier(.3333333333,.6666666667,.6666666667,1)');
      expect(frames.find((frame) => frame.offset === arc.peakMs / OPENING_RULES.durationMs)?.easing).toBe('cubic-bezier(.3333333333,0,.6666666667,.3333333333)');
    }
  });

  it('单印直接取右上角素材，从屏外带上抛速度进入，三处主落点不变', () => {
    const source = readFileSync('src/components/OpeningReveal.tsx', 'utf8');
    expect(source).toContain("piece.name === 'corner_tr'");
    expect(pattern.pieces.find((piece) => piece.name === 'corner_tr')!.region).toEqual([620, 4, 180, 180]);
    const bounces = openingBounces();
    for (const { width, height } of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      const points = openingTravel(width, height);
      const radius = openingGeometry(width, height).leafSize / Math.sqrt(2);
      expect(points[0].position + width / 2 + radius).toBeLessThan(0);
      for (const [timeMs, position] of [[600, 0.16], [bounces[0].endMs, 0.27], [bounces[1].endMs, 0.34]]) {
        expect(points.find((point) => point.timeMs === timeMs)!.position / width + 0.5).toBeCloseTo(position);
      }
      const tracks = openingTracks(width, height);
      expect(tracks.find((track) => track.selector === '.opening-flight')!.frames[0].opacity).toBe(1);
      const vertical = tracks.find((track) => track.selector === '.opening-flight-bounce')!.frames;
      expect(Number(String(vertical[0].transform).match(/-?[\d.]+/)![0])).toBeGreaterThan(Number(String(vertical[1].transform).match(/-?[\d.]+/)![0]));
      const acceleration = 2 * OPENING_RULES.dropHeight / (600 - OPENING_RULES.dropStartMs) ** 2;
      const initialHeight = Number(String(vertical[0].transform).match(/-?[\d.]+/)![0]) / height;
      expect((initialHeight + OPENING_RULES.dropHeight) * 2 / OPENING_RULES.dropStartMs ** 2).toBeCloseTo(acceleration, 12);
    }
  });

  it('横移与角速度在触底 / 微弹 / 滚动交接处连续，微弹后保留动量并减速停在中央', () => {
    for (const { width, height } of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      const points = openingTravel(width, height);
      const tracks = openingTracks(width, height);
      const horizontal = tracks.find((track) => track.selector === '.opening-flight-travel')!.frames;
      const rotation = tracks.find((track) => track.selector === '.opening-flight')!.frames;
      const rollingRadius = openingGeometry(width, height).rollingRadius;
      for (const [index, point] of points.entries()) {
        expect(point.velocity).toBeGreaterThanOrEqual(0);
        if (index < points.length - 1) expect(point.velocity).toBeGreaterThan(0);
        const frame = horizontal[index];
        if (index !== points.length - 2) expect(rotation[index].easing).toBe(frame.easing);
        if (index === points.length - 1) break;
        const next = points[index + 1];
        const duration = next.timeMs - point.timeMs;
        const distance = next.position - point.position;
        const controls = String(frame.easing).match(/cubic-bezier\(([^)]+)\)/)![1].split(',').map(Number);
        expect(controls[1]).toBeGreaterThanOrEqual(0); expect(controls[2]).toBeCloseTo(2 / 3);
        expect(controls[3]).toBeLessThanOrEqual(1);
        expect(3 * controls[1] * distance / duration).toBeCloseTo(point.velocity, 8);
        expect(3 * (1 - controls[3]) * distance / duration).toBeCloseTo(next.velocity, 8);
        const angle = Number(String(rotation[index].transform).match(/-?[\d.]+/)![0]);
        const nextAngle = Number(String(rotation[index + 1].transform).match(/-?[\d.]+/)![0]);
        expect((nextAngle - angle) / distance).toBeCloseTo(180 / Math.PI / rollingRadius, 8);
      }
      const glide = points.slice(3);
      for (let index = 1; index < glide.length; index++) {
        const previous = glide[index - 1];
        const point = glide[index];
        expect(point.velocity).toBeLessThan(previous.velocity);
        expect(point.position - previous.position).toBeCloseTo((point.velocity + previous.velocity) / 2 * (point.timeMs - previous.timeMs), 8);
      }
      expect(points.at(-1)).toEqual({ timeMs: OPENING_RULES.arriveMs, position: -0, velocity: 0 });
    }
  });
});
