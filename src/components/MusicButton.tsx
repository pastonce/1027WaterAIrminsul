import assets from '../data/music.generated.json' with { type: 'json' };
import type { MusicState } from '../game/audio/MusicManager';

export function MusicButton({ enabled, available, state, onToggle }: { enabled: boolean; available: boolean; state: MusicState; onToggle(): void }) {
  const label = !available ? '此处暂无背景音乐' : state.phase === 'error' ? '重试背景音乐' : enabled && state.phase !== 'blocked' ? '暂停背景音乐' : '播放背景音乐';
  const pending = available && enabled;
  const hint = pending && ['waiting', 'loading', 'buffering'].includes(state.phase) ? '兰那罗们正在练嗓...' : label;
  return <button className="icon-button music-button" onClick={onToggle} disabled={!available} aria-label={label} title={hint} aria-description={hint} aria-busy={pending && ['loading', 'buffering'].includes(state.phase)} aria-pressed={available && enabled && state.phase !== 'blocked'} data-playing={state.playing} data-music-phase={state.phase}>
    <svg className="music-image-filter" aria-hidden="true" focusable="false"><defs><filter id="music-button-ink" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="18"/></feComponentTransfer></filter></defs></svg>
    <img src={assets.button} alt="" aria-hidden="true" draggable={false}/><span className="music-button-mark" aria-hidden="true"/>
  </button>;
}
