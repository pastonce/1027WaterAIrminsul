import type { CSSProperties } from 'react';

export function InteractionCue({ className, label, paused, reduced, style }: { className: string; label: string; paused: boolean; reduced: boolean; style?: CSSProperties }) {
  return <span className={`interaction-cue ${className}`} data-paused={paused} data-reduced={reduced} style={style}>
    <span className="sr-only" role="status">{label}</span>
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className="cue-wave" cx="46" cy="44" r="27"/>
      <circle className="cue-wave cue-wave-late" cx="46" cy="44" r="27"/>
      <path className="cue-orbit" d="M23 28a28 28 0 0 1 35-9M71 56a28 28 0 0 1-33 15"/>
      <path className="cue-leaf" d="M64 18q11-3 12-12-10 1-12 12m0 0 7-7"/>
      <g className="cue-touch"><path d="M65 81 53 67q-3-5 1-6 3-1 7 4l2 2V49q0-5 4-5t4 5v13l3-2q3-1 5 2 4-1 6 3 6 0 6 6l-1 9q-1 8-7 12H72q-4-4-7-11Z"/><path className="cue-touch-ray" d="m61 39-3-4m13 3 1-5m5 10 5-2"/></g>
    </svg>
  </span>;
}
