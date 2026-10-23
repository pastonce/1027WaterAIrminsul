import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { getLoadingArt, loadingArtSource, LOADING_COLORS, LOADING_ICON, LOADING_ICON_CENTERS, STAGE_LOADING_RULES } from '../data/stageLoading';
import type { StageLoading } from '../types/game';

export function StageLoadingScreen({ loading, paused, reduced, portrait, onArtReady }: { loading: StageLoading; paused: boolean; reduced: boolean; portrait: boolean; onArtReady?: (id: number, artId?: string) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [failedIcon, setFailedIcon] = useState(false);
  const [failedArt, setFailedArt] = useState(false);
  const artwork = getLoadingArt(loading.to, loading.artId);
  const [art] = useState(() => artwork ? loadingArtSource(artwork, typeof window === 'undefined' ? 1920 : window.innerWidth, typeof window === 'undefined' ? 1080 : window.innerHeight, typeof window === 'undefined' ? 1 : window.devicePixelRatio) : undefined);
  const ready = useRef(false);
  const notify = useRef(onArtReady);
  useLayoutEffect(() => { notify.current = onArtReady; }, [onArtReady]);
  const report = () => { if (!ready.current) { ready.current = true; notify.current?.(loading.id, loading.artId); } };
  useEffect(() => {
    if (!art) { report(); return; }
    const timeout = setTimeout(() => { if (!ready.current) { setFailedArt(true); report(); } }, STAGE_LOADING_RULES.imageTimeoutMs);
    return () => clearTimeout(timeout);
  }, [art]);
  const unique = useId();
  const mask = `${unique}-elements`;
  const clip = `${unique}-progress`;
  const gradient = `${unique}-palette`;
  useLayoutEffect(() => {
    const element = panel.current;
    const preventWheel = (event: WheelEvent) => event.preventDefault();
    element?.addEventListener('wheel', preventWheel, { passive: false });
    return () => element?.removeEventListener('wheel', preventWheel);
  }, []);
  useLayoutEffect(() => {
    if (portrait) return;
    const previous = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => { queueMicrotask(() => { if (previous instanceof HTMLElement && previous.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true }); }); };
  }, [portrait]);
  return <div ref={panel} className="stage-loading-screen" data-testid="stage-loading" data-phase={loading.phase} data-paused={paused} data-reduced={reduced} data-art={loading.to} tabIndex={-1} role="status" aria-label="梦境正在展开" aria-busy="true">
    {art && !failedArt && <div className="stage-loading-artwork"><img className="stage-loading-art" data-illustration={artwork?.id} src={art} alt="" decoding="async" fetchPriority="high" onLoad={(event) => { void event.currentTarget.decode().catch(() => {}).then(report); }} onError={() => { setFailedArt(true); report(); }}/></div>}
    <svg className="element-loading-bar" viewBox="0 0 1024 128" data-progress={loading.progress.toFixed(4)} role="presentation" aria-hidden="true">
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="128" style={{ maskType: 'luminance' }}>{failedIcon ? LOADING_ICON_CENTERS.map((center) => <circle key={center} cx={center} cy="64" r="20" fill="#fff"/>) : <image href={LOADING_ICON} width="1024" height="128" onError={() => setFailedIcon(true)}/>}</mask>
        <clipPath id={clip}><rect className="element-loading-progress" width={1024 * loading.progress} style={{ width: 1024 * loading.progress }} height="128"/></clipPath>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" x2="1024" y1="0" y2="0">{LOADING_COLORS.flatMap((color, index) => [<stop key={`${index}-start`} offset={`${index / 7 * 100}%`} stopColor={color}/>, <stop key={`${index}-end`} offset={`${(index + 1) / 7 * 100}%`} stopColor={color}/>])}</linearGradient>
      </defs>
      <g mask={`url(#${mask})`}><rect width="1024" height="128" fill="#e1e3e6"/><rect className="element-loading-fill" width="1024" height="128" fill={`url(#${gradient})`} clipPath={`url(#${clip})`}/></g>
    </svg>
  </div>;
}
