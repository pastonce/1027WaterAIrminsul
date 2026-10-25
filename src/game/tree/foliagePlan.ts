import type { TreeArtId } from '../../data/treeArt';
import { FOLIAGE_BRANCHES } from './foliageLayout';

export interface FoliageSite {
  birth: number; leafAt?: number; width: number; cluster: TreeArtId; angle: number; side: 'left' | 'right';
}

export const foliageLeafStep = (site: FoliageSite) => site.leafAt ?? site.birth + 1;

const births = [36, 44, 42, 45, 39, 47, 37, 40, 38, 43, 41, 46];
const widths = [145, 160, 125, 170, 190, 205, 225, 200, 155, 145, 155, 140];
const clusters: TreeArtId[] = ['leafbunch3', 'leafbunch2', 'leafbunch1', 'leafbunch2', 'leafbunch1', 'leafbunch2', 'leafbunch1', 'leafbunch2', 'leafbunch1', 'leafbunch2', 'leafbunch1', 'leafbunch3'];
const outer = births.map((birth, index): FoliageSite => ({ birth, width: widths[index], cluster: clusters[index], angle: index < 6 ? -8 : 8, side: index < 6 ? 'left' : 'right' }));
const innerBirths = [39, 37, 43, 46, 42, 40, 38, 36, 41, 37, 46, 39, 36, 41, 45, 43, 46, 40, 44, 40, 41, 38, 37, 42, 39, 47, 45, 47, 44, 44, 45, 43, 36, 38, 42, 47];
const innerWidths = [150, 165, 180, 175, 150, 195, 205, 190, 175, 165, 150, 205, 220, 190, 175, 210, 230, 220, 190, 205, 220, 190, 165, 150, 225, 215, 180, 195, 175, 160, 145, 165, 150, 225, 220, 200];
const inner = innerBirths.map((birth, index): FoliageSite => ({
  birth, width: innerWidths[index], cluster: index % 5 === 0 ? 'leafbunch3' : index % 3 === 0 ? 'leafbunch2' : 'leafbunch1',
  angle: [-15, 6, -4, 13, -9, 3][index % 6], side: FOLIAGE_BRANCHES[50][27 + index][0] < .5 ? 'left' : 'right',
}));

const terminalWidths = [
  85, 95, 90, 85, 100, 80, 75, 85,
  105, 95, 90, 85, 100, 80, 75, 85,
  100, 90, 85, 95, 80, 85,
  100, 85, 85, 95, 80, 85,
  110, 100, 115, 95, 105, 90,
  110, 100, 115, 95, 105, 90,
  85, 90, 80, 95, 85, 90, 80, 95,
];
const terminalLeafBatches = [
  [3, 8, 28, 34], [22, 29, 30, 35], [0, 9, 36, 46], [1, 23, 31, 37],
  [10, 32, 38, 47], [2, 24, 33, 39], [11, 19, 40, 44], [16, 25, 41, 45],
  [4, 12, 17, 20], [5, 13, 26, 42], [6, 14, 18, 21], [7, 15, 27, 43],
];
const terminalLeafSteps = Array<number>(48);
terminalLeafBatches.forEach((batch, round) => {
  for (const index of batch) terminalLeafSteps[index] = 37 + round;
});
const terminals = terminalWidths.map((width, index): FoliageSite => ({
  birth: 36, leafAt: terminalLeafSteps[index], width,
  cluster: index % 6 === 0 ? 'leafbunch3' : index % 3 === 0 ? 'leafbunch2' : 'leafbunch1',
  angle: [-12, 7, -5, 11, -8, 4][index % 6], side: FOLIAGE_BRANCHES[50][63 + index][0] < .5 ? 'left' : 'right',
}));

export const FOLIAGE_SITES = [...outer, ...inner, ...terminals];
