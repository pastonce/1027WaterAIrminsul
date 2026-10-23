import type { BackgroundAsset } from '../../data/backgrounds';
import { entrancePose } from './entrance';
import { backgroundView } from './policy';

export function backgroundProjection(width: number, height: number, view: BackgroundAsset['view'], overscan = 1) {
  return width / (backgroundView(width, height, view).width * overscan);
}

export function backgroundBasePlane(asset: BackgroundAsset, width: number, height: number, time: number, overscan = 1) {
  if (!asset.baseBounds) return null;
  const scale = backgroundProjection(width, height, asset.view, overscan);
  const bounds = asset.baseBounds;
  const pose = entrancePose(asset.baseEntrance, time);
  return {
    left: width / 2 + (bounds.horizontal - bounds.width / 2 - asset.view.horizontal) * scale,
    top: height / 2 - (bounds.vertical + bounds.height / 2 + pose.vertical - asset.view.vertical) * scale,
    width: bounds.width * scale, height: bounds.height * scale,
  };
}

export function forestGround(asset: BackgroundAsset | null, width: number, height: number, time = Infinity) {
  if (asset?.id !== 'forest') return null;
  const scale = backgroundProjection(width, height, asset.view);
  const foreground = asset.layers.find((layer) => layer.json.src.endsWith('/qianjin.json'));
  return { root: height / 2 + 360 * scale, entrance: Math.max(0, -entrancePose(foreground?.entrance, time).vertical * scale) };
}
