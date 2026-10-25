import { PRESENTATION_RULES } from '../src/data/presentation';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDialogueDocument, parseDialogueSource } from '../src/data/dialogueSource';
import { chooseDialogueExpression, EXPRESSION_ASSETS, EXPRESSION_RULES, pickExpression, TREE_EXPRESSIONS } from '../src/data/expressions';
import { DIALOGUE_ENTRIES } from '../src/data/dialogues';
import { ExpressionDirector } from '../src/game/expressions/ExpressionDirector';
import { SpeechDirector } from '../src/game/dialogue/SpeechDirector';
import { expressionOutline, expressionPosition, nahidaExpressionAnchor, treeExpressionAnchor } from '../src/game/expressions/placement';
import { realityLayout } from '../src/game/camera/sceneLayout';
import type { DialogueEntry, ExpressionMarker, ExpressionPlayback, SpeechPlayback } from '../src/types/game';
import manifest from '../docs/expression-assets.manifest.json';

const cleanups: Array<() => void> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

function expressionScene(random = () => 0) {
  const state: { playback: ExpressionPlayback | null } = { playback: null };
  const director = new ExpressionDirector((playback) => { state.playback = playback; }, random);
  cleanups.push(() => director.reset()); return { director, state };
}

const text = '第一片树叶醒了。第二片树叶也在倾听。';
const first = '第一片树叶醒了。';
function speaking(markers: ExpressionMarker[], reducedMotion = false) {
  const state: { playback: SpeechPlayback | null } = { playback: null };
  const expression = vi.fn(); const read = vi.fn(); const finished = vi.fn(); const random = vi.fn(() => 0);
  const director = new SpeechDirector({ options: () => ({ textSpeed: 35, reducedMotion }), speech: (playback) => { state.playback = playback; }, companion: vi.fn(), read, expressionAllowed: (entry) => entry.id === 'N-test', expression }, random);
  cleanups.push(() => director.stop());
  const entry: DialogueEntry = { id: 'N-test', speaker: '纳西妲', anchor: 'nahida', text, expressions: markers };
  director.start([entry], 'nahida', finished);
  return { director, state, expression, read, finished, random };
}

describe('表情资源与原稿标记', () => {
  it('十张 340px 透明图片逐字节登记，按需地址不修改原文件', () => {
    expect(Object.keys(EXPRESSION_ASSETS)).toHaveLength(10); expect(manifest.publishedBytes).toBe(1288382);
    for (const file of manifest.files) {
      const source = readFileSync(file.source); const published = readFileSync(file.file);
      expect(source.equals(published)).toBe(true); expect(createHash('sha256').update(source).digest('hex')).toBe(file.sha256);
      expect(source.readUInt32BE(16)).toBe(340); expect(source.readUInt32BE(20)).toBe(340); expect(EXPRESSION_ASSETS[file.asset]).toBe(file.src);
    }
  });
  it('标题按每位数字生成候选，句首 / 中 / 尾标记保留去标记后的 UTF16 位置', () => {
    expect(TREE_EXPRESSIONS).toEqual({ A: [1, 3, 4, 5, 6], B: [1, 3, 4, 5, 6], C: [0, 2, 3, 4, 7], D: [1, 2, 5, 6, 7], E: [0, 1, 2, 3, 8], F: [1, 2, 5, 7, 9] });
    const source = readFileSync('asserts/对白整合.md', 'utf8').replace(/\[\d+\]/gu, '');
    const entry = parseDialogueSource(source.replace('咦，雨停了吗？', '[09]咦，[12]雨停了吗？[34]'))['A/normal'][0];
    expect(entry.text).toBe(DIALOGUE_ENTRIES.A01.text);
    expect(entry.expressions).toEqual([{ mode: 'before', offset: 0, choices: [0, 9] }, { mode: 'middle', offset: 2, choices: [1, 2] }, { mode: 'middle', offset: 7, choices: [3, 4] }]);
    expect(DIALOGUE_ENTRIES.N05.expressions?.map((marker) => marker.mode)).toEqual(['before', 'middle', 'after']);
    expect(parseDialogueDocument(source).treeExpressions).toEqual({});
  });
  it.each([0, .34, .67])('先均匀抽已有模式再抽该组图片，模式权重不被候选数量影响：%s', (roll) => {
    const random = vi.fn().mockReturnValueOnce(roll).mockReturnValueOnce(0.99);
    const markers: ExpressionMarker[] = [{ mode: 'before', offset: 0, choices: [0, 1, 2, 3] }, { mode: 'middle', offset: 5, choices: [4] }, { mode: 'after', offset: 10, choices: [5, 9] }];
    const choice = chooseDialogueExpression(markers, random)!;
    expect(choice.mode).toBe(roll < 1 / 3 ? 'before' : roll < 2 / 3 ? 'middle' : 'after');
    expect(choice.asset).toBe(roll < 1 / 3 ? 3 : roll < 2 / 3 ? 4 : 9); expect(random).toHaveBeenCalledTimes(2);
  });
  it('无标记不播放，重复候选去重、无效编号忽略，边界随机值不越界', () => {
    expect(chooseDialogueExpression()).toBeUndefined(); expect(pickExpression([-1, 20])).toBeUndefined();
    expect(pickExpression([0, 0, 9], () => 1)).toBe(9);
    expect(chooseDialogueExpression([{ mode: 'middle', offset: 2, choices: [90] }])).toBeUndefined();
  });
});

describe('树的十秒累积与弹出生命周期', () => {
  it('累计满十秒仅抽一次、成功后从该阶段候选选择，读图后显示 2.8 秒', () => {
    const { director, state } = expressionScene(); director.configure('A', true, false, false);
    vi.advanceTimersByTime(9999); expect(state.playback).toBeNull(); vi.advanceTimersByTime(1);
    expect(state.playback).toMatchObject({ asset: 1, anchor: 'tree', angle: -60, ready: false });
    const id = state.playback!.id; director.ready(id); vi.advanceTimersByTime(2799); expect(state.playback?.ready).toBe(true);
    vi.advanceTimersByTime(1); expect(state.playback).toBeNull(); vi.advanceTimersByTime(7200); expect(state.playback!.id).toBeGreaterThan(id);
  });
  it('0.5 边界不触发，失败也从零重新累计十秒', () => {
    const random = vi.fn(() => .5); const { director, state } = expressionScene(random); director.configure('B', true, false, false);
    vi.advanceTimersByTime(19999); expect(random).toHaveBeenCalledOnce(); expect(state.playback).toBeNull();
    vi.advanceTimersByTime(1); expect(random).toHaveBeenCalledTimes(2);
  });
  it('对白 / 面板中暂停累计而非清零，恢复只补余量；显示时间同样可暂停', () => {
    const { director, state } = expressionScene(); director.configure('C', true, false, false); vi.advanceTimersByTime(6000);
    director.configure('C', false, true, false); vi.advanceTimersByTime(30000); expect(state.playback).toBeNull();
    director.configure('C', true, false, false); vi.advanceTimersByTime(3999); expect(state.playback).toBeNull(); vi.advanceTimersByTime(1);
    director.ready(state.playback!.id); vi.advanceTimersByTime(1000); director.configure('C', false, true, false); vi.advanceTimersByTime(20000);
    expect(state.playback?.ready).toBe(true); director.configure('C', true, false, false); vi.advanceTimersByTime(1800); expect(state.playback).toBeNull();
  });
  it('树高动画真实收尾前不累计，开始生长或对白打断树表情', () => {
    const { director, state } = expressionScene(); director.configure('D', true, false, false); vi.advanceTimersByTime(9000); director.grew();
    director.configure('D', true, false, false); vi.advanceTimersByTime(2199); expect(state.playback).toBeNull(); vi.advanceTimersByTime(1);
    expect(state.playback).not.toBeNull(); director.configure('D', false, false, true); expect(state.playback).toBeNull();
  });
  it('换场 / 重置撤销旧候选与读图回调，G 不运行十秒随机', () => {
    const random = vi.fn(() => 0); const { director, state } = expressionScene(random); director.configure('A', true, false, false);
    vi.advanceTimersByTime(10000); const old = state.playback!.id; director.configure('F', true, false, false); director.ready(old); expect(state.playback).toBeNull();
    director.configure('G', true, false, false); random.mockClear(); vi.advanceTimersByTime(60000); expect(random).not.toHaveBeenCalled();
    director.show(3, 'tree'); expect(state.playback).toBeNull(); director.show(3, 'nahida'); expect(state.playback?.asset).toBe(3);
    director.reset(); expect(state.playback).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it('缺图 / 解码超时有界退出，旧失败不能撤销更新的表情', () => {
    const { director, state } = expressionScene(); director.configure('G', true, false, false); director.show(0, 'nahida');
    const old = state.playback!.id; director.show(9, 'nahida'); director.dismiss(old); expect(state.playback?.asset).toBe(9);
    vi.advanceTimersByTime(EXPRESSION_RULES.assetWaitMs); expect(state.playback).toBeNull();
  });
});

describe('G 对白播放位置与单句一次表情', () => {
  it('句前立即触发，换段、布局重测与重播不重复抽取或播放', () => {
    const { director, state, expression, random } = speaking([{ mode: 'before', offset: 0, choices: [3] }]);
    expect(expression).toHaveBeenCalledOnce(); const calls = random.mock.calls.length;
    director.setSegments(state.playback!.sequence, [first, text.slice(first.length)]); director.restartLine();
    vi.advanceTimersByTime(20000); expect(expression).toHaveBeenCalledOnce(); expect(random).toHaveBeenCalledTimes(calls);
  });
  it('句中在对应字符实际显示时触发，跨显示段包含段间阅读停留', () => {
    const { state, expression } = speaking([{ mode: 'middle', offset: first.length + 3, choices: [4] }]);
    vi.advanceTimersByTime(state.playback!.typingMs + PRESENTATION_RULES.segmentHoldMs); expect(state.playback?.segment).toBe(1); expect(expression).not.toHaveBeenCalled();
    const target = state.playback!.reveal!.find((step) => step.end >= 3)!.at;
    vi.advanceTimersByTime(target - 1); expect(expression).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(expression).toHaveBeenCalledOnce();
  });
  it('段间边界处的句中标记在前段结束触发，不推迟到下一段', () => {
    const { state, expression } = speaking([{ mode: 'middle', offset: first.length, choices: [4] }]);
    vi.advanceTimersByTime(state.playback!.typingMs - 1); expect(expression).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(expression).toHaveBeenCalledOnce();
  });
  it('句后在末段最后两字前触发，不等读完 / 淡出，也不提前到首段', () => {
    const { state, expression, read } = speaking([{ mode: 'after', offset: text.length, choices: [7] }]);
    vi.advanceTimersByTime(state.playback!.typingMs + PRESENTATION_RULES.segmentHoldMs); expect(expression).not.toHaveBeenCalled();
    const target = text.length - 2 - first.length; const at = state.playback!.reveal!.find((step) => step.end >= target)!.at;
    vi.advanceTimersByTime(at); expect(expression).toHaveBeenCalledOnce(); expect(read).not.toHaveBeenCalled(); expect(state.playback?.phase).toBe('speaking');
  });
  it('暂停保留剩余时刻，旧序号 / 停止不触发；瞬时显示进度也只结算一次', () => {
    const { director, state, expression } = speaking([{ mode: 'middle', offset: 4, choices: [2] }]);
    const sequence = state.playback!.sequence; director.setPaused(true); vi.advanceTimersByTime(10000); director.revealExpression(sequence, text.length); expect(expression).not.toHaveBeenCalled();
    director.setPaused(false); director.revealExpression(sequence - 1, text.length); expect(expression).not.toHaveBeenCalled();
    director.revealExpression(sequence, first.length); director.revealExpression(sequence, first.length); vi.advanceTimersByTime(10000); expect(expression).toHaveBeenCalledOnce();
    director.stop(); vi.advanceTimersByTime(10000); expect(expression).toHaveBeenCalledOnce();
  });
  it('减少动态保持段落顺序，不因整句瞬时文字把末段表情提前到首段', () => {
    const { state, expression } = speaking([{ mode: 'after', offset: text.length, choices: [1] }], true);
    expect(expression).not.toHaveBeenCalled(); vi.advanceTimersByTime(PRESENTATION_RULES.segmentHoldMs); expect(expression).toHaveBeenCalledOnce(); expect(state.playback?.segment).toBe(1);
  });
});

describe('树顶 / 头部的十点至十三点气泡', () => {
  it.each([{ width: 1440, height: 900, scale: 1 }, { width: 844, height: 390, scale: .43 }, { width: 640, height: 360, scale: .37 }])('$width × $height 跟随真实树顶，保留间距且不夹回可见树干', ({ width, height, scale }) => {
    for (const growth of [20, 180, 1027]) {
      const initial = treeExpressionAnchor(width, 0, growth, scale);
      const root = height * .6 - initial.y;
      const anchor = treeExpressionAnchor(width, root, growth, scale);
      expect(anchor.y).toBeCloseTo(height * .6);
      for (const angle of [-60, -15, 30]) {
        const frame = expressionPosition(anchor, width, height, angle);
        expect(frame.visible).toBe(true); expect(frame.width).toBe(height <= 600 ? 70 : 96); expect(frame.width).toBe(frame.height);
        expect(frame.left).toBeGreaterThanOrEqual(24); expect(frame.left + frame.width).toBeLessThanOrEqual(width - 24);
        expect(frame.top).toBeGreaterThanOrEqual(24); expect(frame.top + frame.height).toBeLessThanOrEqual(height - 24);
        const offset = { x: frame.left + frame.width / 2 - anchor.x, y: frame.top + frame.height / 2 - anchor.y };
        const clock = Math.atan2(offset.x, -offset.y) * 180 / Math.PI;
        expect(clock).toBeGreaterThanOrEqual(-60.001); expect(clock).toBeLessThanOrEqual(30.001);
        const distance = Math.hypot(offset.x, offset.y);
        const extent = Math.hypot(anchor.radiusX * offset.x / distance, anchor.radiusY * offset.y / distance);
        expect(distance - extent - frame.width * .7).toBeCloseTo(height <= 600 ? 16 : 22);
      }
      const hidden = treeExpressionAnchor(width, -4000, growth, scale);
      expect(hidden.y).toBeLessThan(0); expect(expressionPosition(hidden, width, height, 0).visible).toBe(false);
    }
  });
  it('头部上方空间不足时仅重选合法角度，不挪圆心或压在脸上，并避开正文', () => {
    const anchor = { x: 430, y: 138, radiusX: 58, radiusY: 42 };
    const obstacle = { left: 590, top: 100, width: 236, height: 83 };
    const frames = [-60, 0, 30].map((angle) => expressionPosition(anchor, 844, 390, angle, [obstacle]));
    expect(new Set(frames.map((frame) => frame.angle)).size).toBe(3);
    for (const frame of frames) {
      expect(frame.visible).toBe(true); expect(frame.top).toBeGreaterThanOrEqual(24);
      expect(frame.left + frame.width).toBeLessThan(obstacle.left); expect(frame.top + frame.height).toBeLessThan(anchor.y);
    }
  });
  it('真实桌面与两档横屏角色布局均以头部中心留距，不因尾尖放大而完全隐藏', () => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 640, height: 360 }]) {
      const layout = realityLayout(viewport.width, viewport.height);
      const anchor = nahidaExpressionAnchor(layout.character);
      const obstacle = { ...layout.bubble, height: viewport.height <= 600 ? 83 : 128 };
      expect(anchor.y).toBe(layout.character.top + layout.character.height * .25);
      for (const angle of [-60, -15, 30]) {
        const frame = expressionPosition(anchor, viewport.width, viewport.height, angle, [obstacle]);
        expect(frame.visible).toBe(true); expect(frame.top).toBeGreaterThanOrEqual(24);
        expect(frame.top + frame.height).toBeLessThan(anchor.y);
      }
    }
  });
  it('一个连续轮廓包含圆弧和指向主体的小三角，不绘制穿过三角的内边线', () => {
    const outline = expressionOutline(Math.PI / 2);
    expect(outline).toMatch(/^M .+ A 48 48 0 1 1 .+ L 50(?:\.\d+)? 114 Z$/u);
    expect(outline.match(/M /gu)).toHaveLength(1);
  });
});
