import type { BackgroundAsset } from '../data/assets';
import { useViewportSize } from '../hooks/useViewportSize';
import { backgroundBasePlane } from '../game/backgrounds/projection';
import { BACKGROUND_RULES } from '../game/backgrounds/policy';

export function BackgroundBase({ asset, intro = false }: { asset: BackgroundAsset; intro?: boolean }) {
  const viewport = useViewportSize();
  const plane = backgroundBasePlane(asset, viewport.width, viewport.height, 0, BACKGROUND_RULES.overscan);
  const failed = (event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.hidden = true; };
  return <>
    <img className={`background-base ${intro ? 'intro-landscape' : ''}`} src={asset.base.src} alt="" draggable="false" onError={failed}/>
    {plane && <img className="background-base-plane" src={asset.base.src} alt="" draggable="false" style={plane} onError={failed}/>}
  </>;
}
