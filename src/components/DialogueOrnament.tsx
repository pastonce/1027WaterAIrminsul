import type { DialogueTheme } from '../game/dialogue/dialogueTheme';
import { DENDRO_ICON } from '../data/assets';

export function DialogueOrnament({ theme }: { theme: DialogueTheme }) {
  return <span className="bubble-decoration" aria-hidden="true">
    <svg className="bubble-seal" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path className="bubble-seal-rim" d="m16 1.5 14.5 14.5L16 30.5 1.5 16Z"/>
      {theme === 'forest' && <><path d="M16 25V12m0 8-7-6m7 3 6-6M7 14c-1-5 3-8 6-7 0 5-2 8-6 7Zm12-1c-1-5 2-8 6-7 0 4-2 7-6 7ZM10 24q6-3 12 0"/><path d="M16 15c-4-4-4-7 0-10 4 3 4 6 0 10Z"/></>}
      {theme === 'story' && <><path d="m16 5 3.3 7.7L27 16l-7.7 3.3L16 27l-3.3-7.7L5 16l7.7-3.3Z"/><path d="m16 11 5 5-5 5-5-5Zm-8-3 2 2m12 12 2 2M8 24l2-2M22 10l2-2"/></>}
      {theme === 'mechanism' && <><path d="m16 7 8 4.5v9L16 25l-8-4.5v-9Zm-8 4.5 8 5 8-5m-8 5V25M11 5H5v6m16 16h6v-6"/><circle cx="16" cy="16.5" r="2"/><path d="M12 4h2m6 24h-2"/></>}
      {theme === 'nahida' && <image className="bubble-dendro" href={DENDRO_ICON.src} x="6" y="6" width="20" height="20"/>}
      {theme === 'celebration' && <><path className="seal-petal-mint" d="m9 12-6-2 1 6-1 6 6-2m14-8 6-2-1 6 1 6-6-2"/><circle className="seal-petal-rose" cx="16" cy="16" r="8"/><path className="seal-petal-gold" d="M11 10c9-3 15 9 7 13M9 14c7-5 15 5 10 8"/><path d="m16 3 1 3m-7 19-1 3m15-4 2 2"/></>}
    </svg>
    <svg className="bubble-flourish" viewBox="0 0 108 48" fill="none" stroke="currentColor" strokeWidth=".85" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      {theme === 'forest' || theme === 'nahida' ? <><path d="M4 43c32 0 53-11 88-35M40 36c-15-15-10-23-3-24 7 3 10 13 3 24Zm18-9c5-17 15-24 22-22-1 10-8 19-22 22Zm-1 2c15 0 26-3 34-10 0 11-13 18-34 10ZM20 41c-9-6-12-13-8-17 7-1 13 7 8 17Z"/><path d="m89 8 8-7 6 7-6 6Z"/></> : theme === 'story' ? <><path d="M6 39h36l13-13h24l19-19M52 39h30l15-15m-32-8 6-6 6 6-6 6Z"/><path d="m94 6 3-6 3 6 6 3-6 3-3 6-3-6-6-3Zm-62 7 3-6 3 6 6 3-6 3-3 6-3-6-6-3Z"/></> : theme === 'mechanism' ? <><path d="M5 41h34l13-13h26l20-20M23 33h14l14-14h22l9-9M86 4h18v18M54 38h18l17-17"/><path d="M48 16h6v6h-6Zm28 9h6v6h-6ZM4 38h6v6H4Z"/></> : <><path className="celebration-ribbon" d="M3 40C31 8 45 53 74 23S93 6 105 10M8 44C37 13 47 57 78 27S96 12 106 14"/><path className="seal-petal-rose" d="M82 21c-14 1-13-10-7-9 6 1 7 9 7 9Zm0 0c-3-14 9-15 9-9-1 6-9 9-9 9Z"/><path className="seal-petal-mint" d="M53 35c-9 2-10-6-6-7 4 0 6 7 6 7Zm0 0c-2-9 6-10 7-6 0 4-7 6-7 6Z"/><path className="seal-petal-lilac" d="m25 25 3-4 3 4-3 4Zm66 12 3-4 3 4-3 4Z"/><path className="seal-petal-gold" d="m67 9 2-4 2 4 4 2-4 2-2 4-2-4-4-2Z"/></>}
    </svg>
    {theme === 'celebration' && <svg className="celebration-bow" viewBox="0 0 64 32" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path className="seal-petal-rose" d="M31 16C5 20 8-3 20 7c7 5 11 9 11 9Zm2 0C59 20 56-3 44 7c-7 5-11 9-11 9Z"/><path className="seal-petal-lilac" d="m29 17-9 12-1-7-7 1 15-9m8 3 9 12 1-7 7 1-15-9"/><path className="seal-petal-gold" d="m32 11 5 5-5 5-5-5Z"/><path className="seal-petal-mint" d="M4 25h4m-2-2v4m48-23h4m-2-2v4"/></svg>}
  </span>;
}
