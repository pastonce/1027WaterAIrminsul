import assets from './treeAssets.generated.json' with { type: 'json' };

export type TreeArtId = keyof typeof assets;
export const TREE_ART = assets;
export const TREE_MAX_HALF_WIDTH = 480;
export const COMPLETED_TREE_ART = { tree6: 'tree6_complete', tree7: 'tree7_complete', tree8: 'tree8_complete', tree9: 'tree9_growth', leafbunch3: 'leafbunch3_complete' } as const;
export const treeArtVariant = (asset: TreeArtId, complete: boolean): TreeArtId => complete && asset in COMPLETED_TREE_ART ? COMPLETED_TREE_ART[asset as keyof typeof COMPLETED_TREE_ART] : asset;
export const treeArtSource = (asset: TreeArtId, compact: boolean) => assets[asset][compact ? 'compact' : 'full'];
export const treeArtSources = (compact: boolean) => Object.keys(assets).filter((name) => name !== 'trunk_column' && name !== 'tree9_growth' && !name.endsWith('_complete')).map((name) => treeArtSource(treeArtVariant(name as TreeArtId, true), compact));
