import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BackgroundAsset } from '../data/assets';
import { BackgroundDirector } from '../game/backgrounds/BackgroundDirector';
import type { BackgroundStats, BackgroundStatus } from '../game/backgrounds/BackgroundDirector';
import { BACKGROUND_RULES, backgroundParallax } from '../game/backgrounds/policy';
import { BackgroundBase } from './BackgroundBase';
import { STAGE_LOADING_RULES } from '../data/stageLoading';
import type { RoamingLayer } from '../game/encounters/RoamingLayer';

export function SpineBackground({ asset, offset, paused, reduced, onFrame, onReady, inhabitants }: { asset: BackgroundAsset | null; offset: number; paused: boolean; reduced: boolean; onFrame?: (asset: BackgroundAsset | null, time: number) => void; onReady?: (asset: BackgroundAsset | null) => void; inhabitants?: RoamingLayer }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<HTMLCanvasElement>(null);
  const director = useRef<BackgroundDirector | null>(null);
  const present = useRef(onFrame);
  useLayoutEffect(() => { present.current = onFrame; }, [onFrame]);
  const [status, setStatus] = useState<BackgroundStatus>(asset && !reduced ? 'loading' : 'static');
  const [renderedAsset, setRenderedAsset] = useState<BackgroundAsset | null>(null);
  const [posterReady, setPosterReady] = useState<string | null>(null);
  const [stats, setStats] = useState<BackgroundStats>({ layers: 0, textureBytes: 0 });
  const [height, setHeight] = useState(0);
  const poster = asset?.poster ?? asset?.base.src;
  const entranceBackdrop = asset?.baseEntrance && !reduced && status !== 'fallback';

  useEffect(() => {
    if (!host.current || !canvas.current || !previous.current) return;
    const instance = new BackgroundDirector(canvas.current, previous.current, (value, stats) => { setStatus(value); setRenderedAsset(instance.asset); setStats(stats ?? { layers: 0, textureBytes: 0 }); }, undefined, (asset, time) => present.current?.(asset, time), inhabitants);
    director.current = instance;
    const resize = () => {
      const bounds = host.current?.getBoundingClientRect();
      if (bounds) { setHeight(bounds.height); instance.resize(bounds.width, bounds.height, window.devicePixelRatio || 1); }
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    return () => { observer.disconnect(); instance.dispose(); director.current = null; };
  }, []);

  useEffect(() => { director.current?.setScene(asset, false, reduced); }, [asset, reduced]);
  useEffect(() => { director.current?.setPaused(paused || reduced); }, [paused, reduced]);
  useEffect(() => {
    const image = host.current?.querySelector<HTMLImageElement>('.background-poster');
    if (!image || !poster) return;
    image.hidden = false;
    if (image.complete && image.naturalWidth > 0) setPosterReady(poster);
    const timeout = setTimeout(() => { if (!image.complete || image.naturalWidth === 0) { image.hidden = true; setPosterReady(poster); } }, STAGE_LOADING_RULES.imageTimeoutMs);
    return () => clearTimeout(timeout);
  }, [poster]);
  useEffect(() => {
    if (renderedAsset === asset && (status === 'ready' || (status === 'static' || status === 'fallback') && (!poster || posterReady === poster))) onReady?.(asset);
  }, [asset, renderedAsset, status, poster, posterReady, onReady]);

  return <div ref={host} className={`background-scenery ${asset ? 'is-authored' : 'is-prototype'}`} data-renderer={reduced ? 'static' : status} data-paused={paused || reduced} data-layer-count={stats.layers} data-texture-bytes={stats.textureBytes}>
    <div className="background-parallax" style={{ transform: `translateY(${reduced ? 0 : backgroundParallax(offset, height)}px) scale(${BACKGROUND_RULES.overscan})` }}>
      {entranceBackdrop && <BackgroundBase asset={asset}/>}
      {poster && <img key={poster} className="background-poster" src={poster} alt="" draggable="false" style={{ opacity: entranceBackdrop ? 0 : 1 }} onLoad={() => setPosterReady(poster)} onError={(event) => { if (asset && event.currentTarget.src !== new URL(asset.base.src, window.location.href).href) event.currentTarget.src = asset.base.src; else { event.currentTarget.hidden = true; setPosterReady(poster); } }}/>}
      <canvas className="background-canvas" ref={canvas} style={{ transition: asset?.baseEntrance ? 'none' : undefined }}/>
      <canvas className="background-previous" ref={previous} hidden/>
    </div>
  </div>;
}
