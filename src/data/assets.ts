export interface AssetEntry { src: string; kind: 'image' | 'audio' | 'video'; fallback: 'gradient' | 'silhouette' | 'silent'; source: string; placeholder: boolean }
import pageAssets from './pageAssets.generated.json' with { type: 'json' };
import characterPosters from './characterPosters.generated.json' with { type: 'json' };
export type AssetManifest = Record<'dreamBackground' | 'realityBackground' | 'nahida' | 'icon', AssetEntry>;

export const ASSETS: AssetManifest = {
  dreamBackground: { src: '/asserts/backgrounds/dream.jpg', kind: 'image', fallback: 'gradient', source: '用户提供：asserts/3.0/_other_resources/loading_bg.29f573d9.jpg', placeholder: false },
  realityBackground: { src: pageAssets.realityBackground, kind: 'image', fallback: 'gradient', source: 'asserts/background.png，等比压缩静态底图', placeholder: false },
  nahida: { src: '/asserts/characters/nahida-placeholder.svg', kind: 'image', fallback: 'silhouette', source: '仅供Nidaha彩蛋显式启用的临时角色SVG，不作加载或失败回退', placeholder: true },
  icon: { src: pageAssets.icon, kind: 'image', fallback: 'silhouette', source: 'asserts/icon.png，等比缩小并透明补边', placeholder: false },
};
export const NAHIDA_DIALOGUE_BACKGROUND = pageAssets.dialogue;
export { default as MUSIC_ASSETS } from './music.generated.json' with { type: 'json' };
export { default as FONT_ASSETS } from './fonts.generated.json' with { type: 'json' };

export const DENDRO_ICON = { src: '/asserts/effects/dendro.png', source: 'asserts/reference-supplements/nahida/UI_Buff_Element_Grass.png', sha256: '98afa8d2a553ef3beaa67c15436af8cb0ad675bf93055cbc7ece2dd4d28b8f1d' } as const;
export { default as E_SKILL_PATTERN } from './eSkillPattern.generated.json' with { type: 'json' };

import { INHABITANT_ASSETS } from './inhabitants';
import type { NahidaForm } from './inhabitants';

export type CharacterVariant = 'dream' | 'reality' | NahidaForm;
export interface CharacterAsset {
  json: string; atlas: string; texture: string; atlasTexture: string; runtime: string; animation: string; arrival: string | null;
  premultipliedAlpha: boolean; bounds: { x: number; y: number; width: number; height: number }; source: string; poster: string; fixedBounds?: boolean;
}
export { BACKGROUND_ASSETS, backgroundFiles, getStageBackground } from './backgrounds';
export type { BackgroundAsset, BackgroundId, BackgroundLayer } from './backgrounds';
const extractedCharacter = (form: NahidaForm): CharacterAsset => {
  const asset = INHABITANT_ASSETS[form];
  return { ...asset, atlasTexture: asset.texture, runtime: '4.0', arrival: null, premultipliedAlpha: false, fixedBounds: true };
};
export const CHARACTER_ASSETS: Record<CharacterVariant, CharacterAsset> = {
  nahida_dream: extractedCharacter('nahida_dream'),
  nahida_wave: extractedCharacter('nahida_wave'),
  nahida_bouquet: extractedCharacter('nahida_bouquet'),
  nahida_swing: extractedCharacter('nahida_swing'),
  dream: {
    json: '/asserts/characters/dream/shouye_caoshen.json', atlas: '/asserts/characters/dream/shouye_caoshen.atlas',
    texture: '/asserts/characters/dream/shouye_caoshen.png',
    atlasTexture: '/asserts/characters/dream/shouye_caoshen.png',
    runtime: '4.0', animation: 'loop', arrival: 'in',
    premultipliedAlpha: false,
    bounds: { x: -479.83, y: -364.36, width: 924, height: 507.18 },
    source: 'asserts/caoshen/shouye_caoshen.json',
    poster: characterPosters.dream,
  },
  reality: {
    json: '/asserts/characters/reality/naxida.json', atlas: '/asserts/characters/reality/naxida.atlas',
    texture: '/asserts/characters/reality/naxida.3807ce40.png',
    atlasTexture: '/asserts/characters/reality/naxida.png',
    runtime: '4.0', animation: 'animation', arrival: null,
    premultipliedAlpha: false,
    bounds: { x: -386.93, y: -610.88, width: 802.43, height: 997.66 },
    source: '用户原地替换：public/asserts/characters/reality/naxida.json',
    poster: characterPosters.reality,
  },
} as const;
