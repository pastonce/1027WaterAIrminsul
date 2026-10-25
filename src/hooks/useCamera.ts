import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { CameraController } from '../game/camera/CameraController';
import type { StageId } from '../types/game';

export function useCamera(treeHeight: number, stage: StageId, revision: number, locked: boolean, reduced: boolean, paused = false) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const model = useRef(new CameraController());
  const animation = useRef<gsap.core.Tween | null>(null);
  const pauseState = useRef(paused); pauseState.current = paused;
  const drag = useRef<{ pointer: number; startX: number; startY: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState({ width: 1200, height: 800, scale: 1 });

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width, height, scale: Math.min(1, Math.max(0.35, (height - 170) / 510)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    model.current.locked = locked;
    model.current.resize(viewport.width, viewport.height, treeHeight * viewport.scale, viewport.scale);
    setOffset(model.current.position);
  }, [treeHeight, viewport, locked]);

  const goTo = useCallback((target: 'root' | 'crown', cinematic = false) => {
    const camera = model.current;
    if (camera.locked && !cinematic) return;
    animation.current?.kill();
    camera.target = target === 'root' ? 0 : camera.maximum;
    animation.current = gsap.to(camera, {
      position: camera.target, duration: reduced ? 0.08 : cinematic ? 2.4 : 1.2, ease: 'power2.inOut', paused: pauseState.current,
      onUpdate: () => { camera.position = camera.clamp(camera.position); setOffset(camera.position); },
    });
  }, [reduced]);

  useEffect(() => {
    goTo(treeHeight * viewport.scale > viewport.height - 250 ? 'crown' : 'root', true);
    return () => { animation.current?.kill(); };
  }, [revision, stage, viewport, goTo]);
  useEffect(() => { animation.current?.paused(paused); }, [paused]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (model.current.locked) return;
      animation.current?.kill();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
      setOffset(model.current.move(-event.deltaY * multiplier));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [viewport.height]);

  useEffect(() => () => { animation.current?.kill(); }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (model.current.locked || event.button !== 0 || (event.target as Element).closest('button, input, dialog, [data-no-drag]')) return;
    animation.current?.kill();
    suppressClick.current = false;
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, y: event.clientY, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId || model.current.locked) return;
    if (!drag.current.moved && Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) < 6) return;
    drag.current.moved = true;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    const distance = event.clientY - drag.current.y;
    drag.current.y = event.clientY;
    setOffset(model.current.move(distance));
  };

  const endDrag = () => { if (drag.current) suppressClick.current = drag.current.moved; drag.current = null; };
  const consumeDragClick = () => { const suppressed = suppressClick.current || drag.current?.moved === true; suppressClick.current = false; return suppressed; };
  return { viewportRef, viewport, offset, maximum: model.current.maximum, scale: viewport.scale, goTo, consumeDragClick,
    bindings: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: (event: React.PointerEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) endDrag(); } } };
}
