import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { useViewportSize } from '../hooks/useViewportSize';

export function Modal({ title, subtitle, onClose, children, className = '', reduced = false }: { title: string; subtitle?: string | null; onClose: () => void; children: ReactNode; className?: string; reduced?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewport = useViewportSize();
  const portrait = viewport.width <= 900 && viewport.height > viewport.width;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    if (!element || portrait) return;
    element.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !element) return;
      const focusable = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element || document.activeElement?.classList.contains('modal'))) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === element || document.activeElement?.classList.contains('modal'))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      const target = previous?.isConnected && previous.matches('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]') ? previous : document.querySelector<HTMLElement>('[data-panel-opener]:not(:disabled)');
      queueMicrotask(() => { if (target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true }); });
    };
  }, [portrait]);
  if (portrait) return null;
  return createPortal(<div className={`modal-backdrop ${reduced ? 'reduced-motion' : ''}`} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }} data-modal-portal data-no-drag>
    <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="关闭"><Icon name="close"/></button>
      {subtitle !== null && <div className="eyebrow">{subtitle ?? 'A LITTLE NOTE FROM THE DREAM'}</div>}
      <h2>{title}</h2>
      {children}
    </div>
  </div>, document.body);
}
