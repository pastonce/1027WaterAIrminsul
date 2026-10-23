import type { CSSProperties } from 'react';

export type IconName = 'leaf' | 'dew' | 'book' | 'settings' | 'notice' | 'up' | 'down' | 'sound' | 'close' | 'moon' | 'sun' | 'spark' | 'arrow' | 'fullscreen';

export function Icon({ name, size = 22, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  const paths: Record<IconName, React.ReactNode> = {
    leaf: <><path d="M5 19C0 7 11 2 20 4c2 12-5 18-13 14"/><path d="m3 22 13-13m-7 8v-5m4 1h5"/></>,
    dew: <path d="M12 2S4 10 4 15a8 8 0 0 0 16 0c0-5-8-13-8-13ZM8 15q0 4 4 4"/>,
    book: <><path d="M12 5v16M3 3q5-1 9 2 4-3 9-2v16q-5-1-9 2-4-3-9-2Z"/><path d="m6 8 3 1m6 0 3-1"/></>,
    settings: <><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/></>,
    notice: <><path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4ZM10 20h4M12 2v2"/><circle cx="18" cy="5" r="2.2" fill="currentColor" stroke="none"/></>,
    up: <><path d="m6 14 6-6 6 6"/><path d="M12 8v13M7 3h10"/></>,
    down: <><path d="m6 10 6 6 6-6"/><path d="M12 16V3M7 21h10"/></>,
    sound: <><path d="M3 9h4l5-5v16l-5-5H3ZM16 8q5 4 0 8m3-11q7 7 0 14"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    moon: <path d="M20 15A9 9 0 0 1 9 3 9 9 0 1 0 20 15Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
    spark: <><path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><path d="m20 1 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></>,
    arrow: <path d="M3 12h17m-6-6 6 6-6 6"/>,
    fullscreen: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
