import { useEffect, useRef } from 'react';
import { CodeSequence } from '../game/secrets/codes';
import type { EasterCode } from '../game/secrets/codes';

export function useSecretKeyboard(redeem: (code: EasterCode) => Promise<boolean>, blocked: boolean) {
  const handler = useRef(redeem); const locked = useRef(blocked); const sequence = useRef(new CodeSequence());
  handler.current = redeem; locked.current = blocked;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (locked.current) { sequence.current.clear(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]')) { sequence.current.clear(); return; }
      const code = sequence.current.key(event.key);
      if (code) void handler.current(code);
    };
    const reset = () => sequence.current.clear();
    window.addEventListener('keydown', key, true); window.addEventListener('blur', reset);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', reset); };
  }, []);
}
