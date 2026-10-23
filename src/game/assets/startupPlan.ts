import catalog from '../../data/startupAssets.generated.json' with { type: 'json' };
import { BACKGROUND_ASSETS } from '../../data/backgrounds';
import { CHARACTER_ASSETS, ASSETS, FONT_ASSETS, DENDRO_ICON, E_SKILL_PATTERN, MUSIC_ASSETS, NAHIDA_DIALOGUE_BACKGROUND } from '../../data/assets';
import { INHABITANT_ASSETS } from '../../data/inhabitants';
import { EXPRESSION_ASSETS } from '../../data/expressions';
import { getLoadingArt, loadingArtSource, LOADING_ICON } from '../../data/stageLoading';
import type { GameSave } from '../../types/game';
import { backgroundQuality } from '../backgrounds/policy';
import soundAssets from '../../data/sounds.generated.json' with { type: 'json' };

export interface StartupAsset { url: string; bytes: number }
export interface StartupPlan { id: string; files: StartupAsset[]; dynamic: boolean; characterRuntime?: boolean; bytes: number }

export function startupPlan(choices: GameSave['loadingArtChoices'], width: number, height: number, density: number, reduced: boolean): StartupPlan {
  const compact = backgroundQuality(width, height, density).compact;
  const urls = new Set<string>([ASSETS.dreamBackground.src, ASSETS.realityBackground.src, ASSETS.nahida.src, ASSETS.icon.src, FONT_ASSETS.common, DENDRO_ICON.src, E_SKILL_PATTERN.texture, NAHIDA_DIALOGUE_BACKGROUND, MUSIC_ASSETS.button, LOADING_ICON, '/asserts/gifts/date-candy.png', '/asserts/gifts/halvamazd.png', ...Object.values(EXPRESSION_ASSETS), ...Object.values(soundAssets).map((asset) => asset.src)]);
  for (const asset of Object.values(CHARACTER_ASSETS)) {
    if (asset.poster) urls.add(asset.poster);
    [asset.json, asset.atlas, asset.texture].forEach((url) => urls.add(url));
  }
  for (const asset of Object.values(INHABITANT_ASSETS)) {
    urls.add(asset.poster);
    if (!reduced) [asset.json, asset.atlas, asset.texture].forEach((url) => urls.add(url));
  }
  for (const asset of Object.values(BACKGROUND_ASSETS)) {
    urls.add(asset.base.src);
    if (asset.poster) urls.add(asset.poster);
    if (asset.hiding) {
      for (let band = 1; band <= asset.hiding.cuts.length; band++) urls.add(asset.hiding.foreground.replace('hiding-foreground.webp', `hiding-band-${band}.webp`));
      asset.hiding.lightBands?.forEach((band) => urls.add(asset.hiding!.foreground.replace('hiding-foreground.webp', `hiding-light-${band}.webp`)));
    }
    if (reduced) continue;
    for (const layer of asset.layers.filter((layer) => !compact || !layer.optional)) [layer.json.src, layer.atlas.src, ...layer.textures.map((texture) => texture.src)].forEach((url) => urls.add(url));
    for (const plane of (asset.planes ?? []).filter((plane) => !compact || !plane.optional)) {
      urls.add(plane.texture.src);
      if (plane.noise) urls.add(plane.noise.src);
      if (plane.mesh) urls.add(plane.mesh.geometry.src);
    }
  }
  for (const stage of ['B', 'C', 'D', 'E', 'F', 'G'] as const) {
    const art = getLoadingArt(stage, choices[stage]);
    if (art) urls.add(loadingArtSource(art, width, height, density));
  }
  const sizes: Record<string, number> = catalog.files;
  const files = [...urls].sort().map((url) => {
    if (!sizes[url]) throw new Error(`startup-asset-missing:${url}`);
    return { url, bytes: sizes[url] };
  });
  return { id: `${catalog.revision}:${reduced ? 'static' : compact ? 'compact' : 'full'}:${files.map((file) => file.url).join('|')}`, files, dynamic: !reduced, characterRuntime: true, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}
