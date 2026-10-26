import { useState } from 'react';
import { flushSync } from 'react-dom';
import { GAME_RULES, SCHEDULE } from '../data/schedule';
import { STAGES } from '../data/stages';
import { HIDING_PLACES } from '../data/inhabitants';
import { DREAM_STAGES } from '../types/game';
import type { GameSnapshot, StageId } from '../types/game';
import type { GameController } from '../game/core/GameController';
import type { Clock } from '../game/time/TimeGateService';
import { formatBeijing } from '../game/time/TimeGateService';
import { DevelopmentClock } from './DevelopmentClock';
import { stageFixture } from './fixtures';

export default function DebugPanel({ game, state, clock, ephemeral = false }: { game: GameController; state: GameSnapshot; clock: Clock; ephemeral?: boolean }) {
  const [date, setDate] = useState(() => new Date(clock.now() + 8 * 3600000).toISOString().slice(0, 16));
  const [hidingSlot, setHidingSlot] = useState(0);
  const [expression, setExpression] = useState(-1);
  if (!(clock instanceof DevelopmentClock)) return null;
  const selectStage = (stage: StageId) => {
    clock.set(Date.parse(SCHEDULE[stage === 'G' ? 5 : DREAM_STAGES.indexOf(stage)].at) + 1000);
    game.restore(stageFixture(stage, clock.now()));
    setDate(new Date(clock.now() + 8 * 3600000).toISOString().slice(0, 16));
  };
  return <details className="debug-panel" data-no-drag><summary>✧ 开发调试</summary><div className="debug-content">
    <strong>{ephemeral ? '本页测试 · 内存存档，刷新后退出' : '仅开发环境 · 独立测试存档'}</strong>
    <p>{clock.simulated ? '模拟时间' : '设备时间'}：{formatBeijing(state.now)}（北京时间）</p>
    <label>模拟日期时间<input aria-label="模拟日期时间" type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)}/></label>
    <div className="debug-row"><button onClick={() => { clock.set(Date.parse(`${date}:00+08:00`)); game.tick(); }}>应用时间</button><button onClick={() => { clock.system(); game.tick(); }}>设备时间</button><button onClick={() => selectStage('A')}>从 A 开始</button></div>
    <div className="debug-stages">{([...DREAM_STAGES, 'G'] as StageId[]).map((stage) => <button key={stage} onClick={() => selectStage(stage)} aria-label={`调试切换到${stage}阶段`}>{stage}</button>)}</div>
    <label>成长值<input aria-label="调试成长值" type="number" step="0.1" min="0" max="1027" value={state.save.growth} onChange={(event) => game.restore({ ...state.save, growth: Number(event.target.value), introSeen: true })}/></label>
    <label>梦露<input aria-label="调试梦露" type="number" min="0" max={GAME_RULES.dewCapacity} value={state.save.dew} onChange={(event) => game.restore({ ...state.save, dew: Number(event.target.value), introSeen: true })}/></label>
    <div className="debug-row"><button onClick={() => { game.restore({ ...state.save, dew: GAME_RULES.dewCapacity }); game.water(); }}>补满并浇灌</button></div>
    <div className="debug-row"><button disabled={state.stage === 'G'} onClick={() => { const visit = STAGES[state.stage].visit; game.restore({ ...state.save, completedVisits: state.save.completedVisits.filter((id) => id !== visit.id), playedDialogues: state.save.playedDialogues.filter((id) => !visit.dialogue.some((entry) => entry.id === id)) }); game.requestVisit(); }}>触发纳西妲来访</button><button onClick={() => { if (state.stage !== 'G') game.restore({ ...state.save, growth: STAGES[state.stage].growth.end }); }}>推进到当前上限</button></div>
    <div className="debug-row"><label>表情包<select aria-label="调试表情包" value={expression} onChange={(event) => setExpression(Number(event.target.value))}><option value={-1}>随机</option>{Array.from({ length: 10 }, (_, asset) => <option key={asset} value={asset}>{asset}</option>)}</select></label><button disabled={state.mode !== 'idle' || !state.save.seedPlanted || Boolean(state.speech || state.blessing || state.reviewStage)} onClick={() => game.previewExpression(expression < 0 ? undefined : expression)}>触发表情包</button></div>
    <div className="debug-row"><button onClick={() => game.spawnAranara()}>召来一只兰那罗</button><button onClick={() => { game.spawnAranara(8); game.spawnAranara(0); game.spawnAranara(6); }}>查看三个藏身点</button></div>
    {state.stage !== 'G' && HIDING_PLACES[state.stage] && <div className="debug-row"><label>藏身点<select aria-label="调试藏身点" value={hidingSlot} onChange={(event) => setHidingSlot(Number(event.target.value))}>{HIDING_PLACES[state.stage]!.map((place, slot) => <option key={slot} value={slot}>{slot + 1} · {place.name}</option>)}</select></label><button onClick={() => { flushSync(() => game.restore({ ...game.getSnapshot().save })); game.spawnAranara(hidingSlot); }}>查看指定藏身点</button></div>}
    <div className="debug-row"><button onClick={() => { selectStage('F'); game.restore({ ...game.getSnapshot().save, growth: 1020 }); }}>准备 F→G 最后浇灌</button><button onClick={() => { clock.set(Date.parse(SCHEDULE[0].at) - 1); game.tick(); }}>入梦开放前</button></div>
    <button className="debug-reset" onClick={() => game.reset()}>重置测试存档</button><p>阶段：<span data-testid="debug-stage">{state.stage}</span> · 状态：{state.mode}<br/>队列事件：{state.event?.id ?? '无'}<br/>{ephemeral ? '不修改服务器时间或正式存档，刷新退出。' : '正式页面仅主动开启测试模式后显示本面板。'}</p>
  </div></details>;
}
