import { useSyncExternalStore } from 'react';
import type { ServerClock } from '../game/time/ServerClock';

export function TimeSyncStatus({ clock }: { clock: ServerClock }) {
  const state = useSyncExternalStore(clock.subscribe, clock.getSnapshot);
  const checking = state.status === 'checking';
  const note = state.status !== 'offline' ? '联网后自动校准，不使用设备日期解锁。' : state.verifiedAt === null ? '暂时无法校时，可先观赏；联网后自动恢复。' : '暂时离线，已开放的内容仍可继续。';
  return <div className="setting-row time-sync-setting">
    <span role="status">{checking ? '正在校准梦境时间' : state.status === 'synced' ? '时间已校准' : '等待重新连接'}<small>{note}</small></span>
    <button className="small-button" onClick={() => void clock.synchronize()} disabled={checking}>重新校时</button>
  </div>;
}
