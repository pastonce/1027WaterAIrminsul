import { TREE_ART } from '../../data/treeArt';
import { boundedTreeStep, multiplyTreeMatrix, transformTreePoint } from './timeline';
import type { TreeMatrix, TreeSlot } from './timeline';

type BranchPoint = readonly [number, number];
export type CalibratedTreeBody = 'tree3' | 'tree4' | 'tree5';

export const LEAF_ATTACHMENTS: Record<string, [number, number]> = {
  leaf1: [180, 800], leaf2: [760, 880], leaf3: [750, 910], leaf4: [620, 670],
  leafbunch1: [490, 480], leafbunch2: [420, 490], leafbunch3: [500, 250],
};

export const CD_BRANCHES: Record<CalibratedTreeBody, Readonly<Record<string, BranchPoint>>> = {
  tree3: {
    leaf3: [.17152, .50088], leaf3_1: [.51780, .04302], leaf1_1: [.72816, .26400],
    leaf4_1: [.17907, .43076], leaf4: [.48652, .02004], leaf1_2: [.48652, .02004],
    leaf1_3: [.39374, .13318], bunch3: [.72708, .50442],
  },
  tree4: {
    leaf1: [.85749, .26332], leaf2: [.11179, .31298], leaf3_2: [.03317, .48267],
    leaf4: [.62776, .07812], leaf4_5: [.52826, .02018], leaf3_6: [.35258, .20331],
    leaf1_5: [.90541, .39524], leaf1_1: [.83907, .41024], leaf3_4: [.83907, .41024],
    leaf4_1: [.74816, .25504], leaf2_1: [.74816, .25504],
  },
  tree5: {
    leaf3_1: [.92097, .37138], leaf1_2: [.44127, .02781], leaf3_5: [.36553, .16976],
    bunch3: [.85071, .23812], bunch3_1: [.06915, .21900], bunch3_2: [.11965, .40614],
    bunch1: [.79693, .04693], bunch1_1: [.77278, .19351], bunch1_2: [.65642, .32793],
    leaf4: [.65203, .24623], leaf1_1: [.65203, .24623],
    leaf4_1: [.20527, .19525], leaf3_3: [.20527, .19525],
    leaf4_2: [.04501, .30127], leaf1_3: [.04501, .30127],
    leaf4_3: [.15477, .42932], leaf1_4: [.15477, .42932],
    leaf4_4: [.20307, .47335], leaf2_2: [.20307, .47335],
    leaf4_5: [.88694, .43511], leaf3_6: [.88694, .43511],
  },
};

export function anchorTreeLeaves(step: number, source: TreeSlot[]): TreeSlot[] {
  const frame = boundedTreeStep(step);
  if (frame < 17 || frame > 34) return source;
  const body = source.find((part) => part.asset === 'tree3' || part.asset === 'tree4' || part.asset === 'tree5');
  if (!body) return source;
  const branches = CD_BRANCHES[body.asset as CalibratedTreeBody];
  const bodyMatrix = multiplyTreeMatrix(body.matrix, TREE_ART[body.asset].registration as TreeMatrix);
  return source.map((part) => {
    const branch = branches[part.id];
    const attachment = LEAF_ATTACHMENTS[part.asset];
    if (!branch || !attachment) return part;
    const point = transformTreePoint(bodyMatrix, branch[0] * 1000, branch[1] * 1000);
    const matrix = [...part.matrix] as TreeMatrix;
    const origin = transformTreePoint(multiplyTreeMatrix(matrix, TREE_ART[part.asset].registration as TreeMatrix), ...attachment);
    matrix[4] += point.x - origin.x;
    matrix[5] += point.y - origin.y;
    return { ...part, matrix };
  });
}
