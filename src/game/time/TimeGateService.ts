import { SCHEDULE } from '../../data/schedule';
import type { DreamStageId } from '../../types/game';

export interface Clock { now(): number; permissionNow?(): number }

export class SystemClock implements Clock {
  now() { return Date.now(); }
}

export class TimeGateService {
  constructor(private readonly clock: Clock) {}

  now() { return this.clock.now(); }

  getGate(now = this.clock.permissionNow?.() ?? this.now()) {
    const available = SCHEDULE.filter((entry) => now >= Date.parse(entry.at));
    const latest = available.at(-1);
    const next = SCHEDULE.find((entry) => now < Date.parse(entry.at)) ?? null;
    return {
      cap: latest ? latest.cap + (next ? 0 : 1) : 0,
      available: available.map((entry) => entry.stage),
      next,
    };
  }

  isOpen(stage: DreamStageId, now?: number) {
    return this.getGate(now).available.includes(stage);
  }
}

export function formatBeijing(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(timestamp);
}

export function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainingSeconds = seconds % 60;
  return `${days ? `${days} 天 ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}
