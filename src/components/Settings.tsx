import { useState } from 'react';
import type { GameSnapshot } from '../types/game';
import type { GameController } from '../game/core/GameController';
import { Modal } from './Modal';
import { TimeSyncStatus } from './TimeSyncStatus';
import type { ServerClock } from '../game/time/ServerClock';
import { SecretInput } from './SecretInput';
import type { EasterCode } from '../game/secrets/codes';

export function Settings({ game, state, timeSync, testing = false, redeem, onClose }: { game: GameController; state: GameSnapshot; timeSync?: ServerClock; testing?: boolean; redeem?: (code: EasterCode) => Promise<boolean>; onClose?: () => void }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const close = onClose ?? (() => game.closePanel());
  const musicPercent = state.save.settings.music ? Math.round(state.save.settings.musicVolume * 100) : 0;
  const soundPercent = state.save.settings.sound ? Math.round(state.save.settings.soundVolume * 100) : 0;
  return <Modal title="设置" subtitle={null} className="settings-modal" reduced={state.save.settings.reducedMotion} onClose={close}>
    <label className="setting-row"><span>背景音乐音量<small>{musicPercent === 0 ? '静音' : `${musicPercent}%`} · 调至 0 关闭音乐</small></span><input aria-label="背景音乐音量" type="range" min="0" max="100" value={musicPercent} aria-valuetext={musicPercent === 0 ? '静音' : `${musicPercent}%`} onChange={(event) => { const volume = Number(event.target.value) / 100; game.setSettings(volume === 0 ? { music: false } : { music: true, musicVolume: volume }); }}/></label>
    <label className="setting-row"><span>交互音效音量<small>{soundPercent === 0 ? '静音' : `${soundPercent}%`} · 调至 0 关闭音效</small></span><input aria-label="交互音效音量" type="range" min="0" max="100" value={soundPercent} aria-valuetext={soundPercent === 0 ? '静音' : `${soundPercent}%`} onChange={(event) => { const volume = Number(event.target.value) / 100; game.setSettings(volume === 0 ? { sound: false } : { sound: true, soundVolume: volume }); }}/></label>
    <label className="setting-row"><span>减少动态效果<small>减少粒子并缩短过渡，兼容系统设置</small></span><input type="checkbox" checked={state.save.settings.reducedMotion} onChange={(event) => game.setSettings({ reducedMotion: event.target.checked })}/></label>
    <label className="setting-row"><span>文字播放间隔<small>{state.save.settings.textSpeed} 毫秒，数值越小越快</small></span><input type="range" min="10" max="100" value={state.save.settings.textSpeed} onChange={(event) => game.setSettings({ textSpeed: Number(event.target.value) })}/></label>
    {timeSync && <TimeSyncStatus clock={timeSync}/>}
    {redeem && <SecretInput redeem={redeem}/>}
    <p className="save-note">{testing ? '当前为本页临时测试，刷新后退出；正式存档不会被覆盖。' : state.saveStatus || '进度会自动保存在此浏览器中。清理浏览器数据会移除本地存档。'}</p>
    <button className="text-button reset-button dream-reset-button" onClick={() => { if (confirmReset) { game.reset(); close(); } else setConfirmReset(true); }}>{confirmReset ? '再次点击，清除当前存档并重新入梦' : '开始下一轮梦的轮回'}</button>
  </Modal>;
}
