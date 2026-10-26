import { useLayoutEffect, useRef, useState } from 'react';

export const sceneScale = (height: number) => Math.min(1, Math.max(.35, (height - 170) / 510));

export function useSceneViewport(locked: boolean) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [viewport, setViewport] = useState({ width: 1200, height: 800, scale: 1 });
  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width, height, scale: sceneScale(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0 || (event.target as Element).closest('button, input, dialog, [data-no-drag]')) return;
    suppressClick.current = false;
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer === event.pointerId && Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) >= 6) drag.current.moved = true;
  };
  const endDrag = () => { if (drag.current) suppressClick.current = drag.current.moved; drag.current = null; };
  const consumeDragClick = () => { const suppressed = suppressClick.current || drag.current?.moved === true; suppressClick.current = false; return suppressed; };
  return { viewportRef, viewport, scale: viewport.scale, offset: 0, consumeDragClick,
    bindings: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag } };
}
