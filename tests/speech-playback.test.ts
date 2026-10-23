import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIALOGUE_ENTRIES } from '../src/data/dialogues';
import { DIALOGUE_LAYOUT } from '../src/data/dialogueLayout';
import { dialogueTiming, PRESENTATION_RULES, segmentTiming } from '../src/data/presentation';
import { SpeechDirector } from '../src/game/dialogue/SpeechDirector';
import { revealTimeline, revealedCharacters, splitDialogue, textUnits } from '../src/game/dialogue/textPlayback';
import type { DialogueEntry, SpeechPlayback } from '../src/types/game';

const entry: DialogueEntry = { id: 'example', speaker: '梦中的世界树？', text: '风，还在吗？我听见了。' };
const directors: SpeechDirector[] = [];
function setup(reducedMotion = false) {
  const state: { playback: SpeechPlayback | null } = { playback: null };
  const read = vi.fn(); const finished = vi.fn(); const blessing = vi.fn();
  const director = new SpeechDirector({
    options: () => ({ textSpeed: 35, reducedMotion }),
    speech: (playback) => { state.playback = playback; }, companion: vi.fn(), read, canBless: () => true, blessing,
  }, () => 0.5);
  directors.push(director);
  return { director, state, read, finished, blessing };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { directors.splice(0).forEach((director) => director.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('长句自适应分段', () => {
  it('短句保留，完整句号 / 问号 / 叹号边界最多拆成均衡的两段', () => {
    expect(splitDialogue('不用拆开。')).toEqual(['不用拆开。']);
    const fits = (text: string) => text.length <= 12;
    expect(splitDialogue('风从这里吹过。树叶也在倾听。', fits)).toEqual(['风从这里吹过。', '树叶也在倾听。']);
    const source = '第一片树叶醒了。第二片树叶醒了！第三片树叶呢？';
    expect(splitDialogue(source, fits)).toEqual([source]);
    expect(splitDialogue(source)).toEqual(['第一片树叶醒了。', '第二片树叶醒了！第三片树叶呢？']);
    expect(splitDialogue('好。树叶还在这里认真倾听你的愿望。')).toEqual(['好。树叶还在这里认真倾听你的愿望。']);
  });
  it('保留闭合引号，不把破折号 / 省略号当作句间边界', () => {
    const source = '“风吹过来了……树叶想说话——你能听见吗？”“我一直在这里等你。”';
    const parts = splitDialogue(source);
    expect(parts).toEqual(['“风吹过来了……树叶想说话——你能听见吗？”', '“我一直在这里等你。”']); expect(parts.join('')).toBe(source);
    expect(splitDialogue('风吹过来......树叶也想和你说话。')).toEqual(['风吹过来......树叶也想和你说话。']);
  });
  it('无完整句间边界时不擅自切逗号或字符，不改原文', () => {
    const line = '风拂过枝叶，梦越过山林，树记住了你';
    expect(splitDialogue(line, (text) => text.length <= 12)).toEqual([line]);
    const source = '🍃'.repeat(30); const parts = splitDialogue(source, (text) => Array.from(text).length <= 10);
    expect(parts).toEqual([source]);
  });
  it('全部原文最多两段，每段符合新宽度预算，之前误列的长句均能拆开', () => {
    for (const line of Object.values(DIALOGUE_ENTRIES)) {
      const parts = splitDialogue(line.text);
      expect(parts.length, line.id).toBeLessThanOrEqual(2); expect(parts.join(''), line.id).toBe(line.text);
      expect(parts.every((part) => textUnits(part) <= DIALOGUE_LAYOUT.capacityUnits), line.id).toBe(true);
    }
    for (const id of ['A27', 'A1N', 'A3N', 'B1N', 'D27', 'D4Q', 'E5N', 'F2N', 'F3N', 'F5N', 'N05', 'N08', 'N09', 'N10', 'G5N']) expect(splitDialogue(DIALOGUE_ENTRIES[id].text), id).toHaveLength(2);
    expect(splitDialogue(DIALOGUE_ENTRIES.E6N.text)[0]).toBe(DIALOGUE_LAYOUT.reference);
  });
});

describe('逐字播放及自然停顿', () => {
  it.each([['，', 144], [',', 144], ['；', 261], [';', 261], ['：', 225], [':', 225], ['、', 72]] as const)('%s 使用对应的分级呼吸停顿，段尾不叠加', (punctuation, pause) => {
    const reveal = revealTimeline(`甲${punctuation}乙`, 41.3, 180, 360);
    expect(Math.abs(reveal[2].at - reveal[1].at - 41.3 - pause)).toBeLessThan(1);
    expect(revealTimeline(`甲${punctuation}`, 41.3, 180, 360).at(-1)?.at).toBe(reveal[1].at);
  });
  it.each([['。', 360], ['？', 414], ['！', 414], ['?', 414], ['!', 414], ['——', 450], ['……', 612], ['...', 612], ['？！', 414], ['，……', 612]] as const)('%s 整组显示且只停一次，尾部不加长停顿', (punctuation, pause) => {
    const reveal = revealTimeline(`甲${punctuation}乙`, 41.3, 180, 360);
    expect(reveal).toHaveLength(3); expect(reveal[1].end).toBe(1 + punctuation.length);
    expect(Math.abs(reveal[2].at - reveal[1].at - 41.3 - pause)).toBeLessThan(1);
    const ending = revealTimeline(`甲${punctuation}”`, 41.3, 180, 360);
    expect(ending).toHaveLength(2); expect(ending.at(-1)?.at).toBe(reveal[1].at);
  });
  it('停顿前两字轻缓收束，逗号随语意长度呼吸，不把短句切得过碎', () => {
    const reveal = revealTimeline('风吹过树叶，继续', 41.3, 180, 360);
    expect(reveal[4].at - reveal[3].at).toBeGreaterThan(reveal[1].at - reveal[0].at);
    for (const [length, pause] of [[3, 144], [8, 180], [16, 198]]) {
      const steps = revealTimeline(`${'叶'.repeat(length)}，听`, 41.3, 180, 360);
      expect(Math.abs(steps.at(-1)!.at - steps.at(-2)!.at - 41.3 - pause)).toBeLessThan(1);
    }
  });
  it('语速设置按比例改变呼吸但限制极端长停，小数点不停顿 / 不当句号分段', () => {
    const source = '在3.6公里之外，仍有树叶。';
    const reveal = revealTimeline(source, 41.3, 180, 360); const point = source.indexOf('.');
    expect(reveal[point + 1].at - reveal[point].at).toBeLessThan(45);
    expect(splitDialogue('走了3.6公里。树叶还在等你。', (part) => part.length <= 10)).toEqual(['走了3.6公里。', '树叶还在等你。']);
    const quick = revealTimeline('你好呀，请坐', 20.65, 180, 360); const slow = revealTimeline('你好呀，请坐', 82.6, 180, 360);
    expect(slow[4].at - slow[3].at).toBeGreaterThan(quick[4].at - quick[3].at);
    expect(slow[4].at - slow[3].at).toBeLessThan(300);
  });
  it('停顿在闭合引号之后，时间线不依赖随机数', () => {
    const source = '“你来了……”树叶轻轻晃动。';
    const first = revealTimeline(source, 41.3, 180, 360);
    expect(first.find((step) => source.slice(0, step.end).endsWith('……”'))).toBeTruthy();
    expect(first.some((step) => source.slice(0, step.end).endsWith('…'))).toBe(false);
    expect(revealTimeline(source, 41.3, 180, 360)).toEqual(first);
  });
  it('时间线准确处理字节边界、半毫秒速度、减少动态与整体降速', () => {
    const reveal = revealTimeline('🍃甲', 41.3, 110, 280);
    expect(revealedCharacters(reveal, 40)).toBe(0); expect(revealedCharacters(reveal, 41)).toBe(2);
    expect(revealedCharacters(reveal, 83)).toBe(3); expect(reveal.at(-1)?.at).toBe(83);
    expect(segmentTiming('甲乙', 35, 35, false).typingMs).toBeGreaterThan(70);
    expect(segmentTiming('甲乙', 35, 35, true)).toEqual({ typingMs: 0, reveal: [] });
  });
});

describe('分段、悬停、淡出与事务完成', () => {
  it('完整打字后停留 1400 ms，淡出 450 ms 后才完成序列', () => {
    const { director, state, read, finished } = setup(); director.start([entry], 'tree', finished);
    const typing = state.playback!.typingMs; vi.advanceTimersByTime(typing - 1); expect(state.playback?.phase).toBe('speaking');
    vi.advanceTimersByTime(1); expect(state.playback?.phase).toBe('holding'); expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PRESENTATION_RULES.minimumHoldMs - 1); expect(state.playback?.phase).toBe('holding'); vi.advanceTimersByTime(1);
    expect(state.playback?.phase).toBe('fading'); expect(read).toHaveBeenCalledExactlyOnceWith(entry); expect(finished).not.toHaveBeenCalled();
    vi.advanceTimersByTime(449); expect(finished).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(finished).toHaveBeenCalledOnce(); expect(state.playback).toBeNull();
  });
  it('中间段停留后直接换字，最后一段结束前不记已读或触发祝福', () => {
    const { director, state, read, finished, blessing } = setup(true);
    const line = { ...entry, text: '风吹过这里。树还在倾听。' }; const parts = ['风吹过这里。', '树还在倾听。'];
    director.start([line], 'nahida', finished, true); vi.advanceTimersByTime(PRESENTATION_RULES.arrivalMs);
    director.setSegments(state.playback!.sequence, parts); const sequence = state.playback!.sequence;
    expect(state.playback?.text).toBe(parts[0]); vi.advanceTimersByTime(PRESENTATION_RULES.segmentHoldMs - 1); expect(state.playback?.sequence).toBe(sequence);
    vi.advanceTimersByTime(1); expect(state.playback?.text).toBe(parts[1]); expect(state.playback?.entry.id).toBe(line.id);
    expect(read).not.toHaveBeenCalled(); expect(blessing).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PRESENTATION_RULES.minimumHoldMs); expect(read).toHaveBeenCalledOnce(); expect(blessing).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450); expect(blessing).toHaveBeenCalledExactlyOnceWith('channel'); expect(finished).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2400); expect(finished).toHaveBeenCalledOnce(); expect(blessing.mock.calls.map(([phase]) => phase)).toEqual(['channel', 'bloom', 'end']);
  });
  it('悬停不打断打字，停留不倒数；移开重新计满时间而非只补剩余', () => {
    const { director, state, finished } = setup(); director.start([entry], 'tree', finished);
    const sequence = state.playback!.sequence; director.setHovered(sequence, true);
    vi.advanceTimersByTime(state.playback!.typingMs + 20000); expect(state.playback?.phase).toBe('holding');
    director.setHovered(sequence, false); vi.advanceTimersByTime(1000); director.setHovered(sequence, true); vi.advanceTimersByTime(20000);
    director.setHovered(sequence, false); vi.advanceTimersByTime(PRESENTATION_RULES.minimumHoldMs - 1); expect(state.playback?.phase).toBe('holding');
    vi.advanceTimersByTime(1); expect(state.playback?.phase).toBe('fading'); vi.advanceTimersByTime(450); expect(finished).toHaveBeenCalledOnce();
  });
  it('淡出中悬停恢复可读状态，不重复记已读，也不提前完成', () => {
    const { director, state, read, finished } = setup(true); director.start([entry], 'tree', finished);
    const sequence = state.playback!.sequence; vi.advanceTimersByTime(PRESENTATION_RULES.minimumHoldMs + 100); expect(state.playback?.phase).toBe('fading');
    director.setHovered(sequence, true); vi.advanceTimersByTime(20000); expect(state.playback?.phase).toBe('holding'); expect(finished).not.toHaveBeenCalled();
    director.setHovered(sequence, false); vi.advanceTimersByTime(PRESENTATION_RULES.minimumHoldMs + PRESENTATION_RULES.fadeMs); expect(read).toHaveBeenCalledOnce(); expect(finished).toHaveBeenCalledOnce();
  });
  it('全局暂停保持打字与停留余量，悬停离开后的新倒数同样暂停', () => {
    const { director, state, finished } = setup(); director.start([entry], 'tree', finished);
    const typing = state.playback!.typingMs; vi.advanceTimersByTime(100); director.setPaused(true); vi.advanceTimersByTime(20000);
    director.setPaused(false); vi.advanceTimersByTime(typing - 100); expect(state.playback?.phase).toBe('holding');
    const sequence = state.playback!.sequence; vi.advanceTimersByTime(1000); director.setHovered(sequence, true); director.setPaused(true);
    director.setHovered(sequence, false); vi.advanceTimersByTime(20000); expect(state.playback?.phase).toBe('holding');
    director.setPaused(false); vi.advanceTimersByTime(PRESENTATION_RULES.minimumHoldMs + PRESENTATION_RULES.fadeMs - 1); expect(finished).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(finished).toHaveBeenCalledOnce();
  });
  it('布局校验拒绝串句 / 空段 / 超两段，重复测量不重播，旧悬停不影响新段', () => {
    const { director, state, read } = setup(true); director.start([entry], 'tree', vi.fn()); const sequence = state.playback!.sequence;
    for (const parts of [['别的句子'], ['', entry.text], ['甲', '乙', '丙', '丁'], [entry.text]]) director.setSegments(sequence, parts);
    expect(state.playback?.sequence).toBe(sequence);
    const parts = ['风，还在吗？', '我听见了。']; director.setSegments(sequence, parts); const first = state.playback!.sequence;
    director.setSegments(first, parts); expect(state.playback?.sequence).toBe(first);
    vi.advanceTimersByTime(PRESENTATION_RULES.segmentHoldMs); director.setHovered(first, true); vi.advanceTimersByTime(PRESENTATION_RULES.minimumHoldMs);
    expect(state.playback?.phase).toBe('fading'); expect(read).toHaveBeenCalledOnce();
  });
  it('取消、停止与重播当前段不遗留定时器或提前记读', () => {
    const { director, state, read, finished } = setup(); director.start([entry], 'tree', finished);
    vi.advanceTimersByTime(100); const sequence = state.playback!.sequence; director.restartLine(); expect(state.playback!.sequence).toBeGreaterThan(sequence);
    director.stop(); vi.advanceTimersByTime(20000); expect(state.playback).toBeNull(); expect(read).not.toHaveBeenCalled(); expect(finished).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(dialogueTiming(entry, 35, false).durationMs).toBe(segmentTiming(entry.text, 35, 35, false).typingMs + PRESENTATION_RULES.minimumHoldMs);
  });
});
