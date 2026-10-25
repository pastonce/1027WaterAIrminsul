import { TREE_ART, treeArtVariant } from '../../data/treeArt';
import type { TreeArtId } from '../../data/treeArt';
import { boundedTreeStep, multiplyTreeMatrix, transformTreePoint, TREE_ANIMATIONS, treeAnimationPose } from './timeline';
import type { TreeMatrix, TreeSlot } from './timeline';
import { FOLIAGE_BRANCHES } from './foliageLayout';
import { applyLeafMotion } from './leafMotion';
import type { LeafMotionKind } from './leafMotion';
import { anchorTreeLeaves, LEAF_ATTACHMENTS } from './leafAnchors';
import { FOLIAGE_SITES, foliageLeafStep } from './foliagePlan';
import { foliageEventDelay, foliageStepDuration, leafMotionProgress } from './foliageTiming';
import type { LeafMotionEvent } from './foliageTiming';

export const FOLIAGE_START_STEP = 34;
export const FOLIAGE_MIN_SECONDS = .25;
export function foliageDuration(step: number) {
  const frame = boundedTreeStep(step);
  if (frame < FOLIAGE_START_STEP) return TREE_ANIMATIONS[frame].duration;
  const events: LeafMotionEvent[] = frame === 35 ? [{ kind: 'leaf', delay: 0 }] : [];
  FOLIAGE_SITES.forEach((site) => {
    if (frame === site.birth) events.push({ kind: 'bud' });
    if (frame === foliageLeafStep(site)) events.push({ kind: 'leaf' });
    if (frame === foliageLeafStep(site) + 1) events.push({ kind: clusterMotion(site.cluster) });
  });
  return foliageStepDuration(frame, events);
}
export type FoliagePhase = 'bud' | 'leaf' | 'cluster';
export interface FoliageSlot extends TreeSlot {
  foliage?: 'retained' | 'extension'; site?: string; phase?: FoliagePhase; motion?: LeafMotionKind;
}

export const FOLIAGE_ATTACHMENTS = LEAF_ATTACHMENTS;
const cutovers = [36, 42, 45, 50] as const;
const seeds = anchorTreeLeaves(FOLIAGE_START_STEP, treeAnimationPose(FOLIAGE_START_STEP)).filter((part) => part.asset.startsWith('leaf'));
const matureBud = treeAnimationPose(35).find((part) => part.id === 'leaf1_3')!;
const bodies = new Map([34, ...cutovers].map((step) => [step, treeAnimationPose(step).find((part) => /^tree(?:01|[1-9])$/.test(part.asset))!]));
const initial = seeds.map((seed) => {
  const matrix = multiplyTreeMatrix(seed.matrix, TREE_ART[treeArtVariant(seed.asset, true)].registration as TreeMatrix);
  return transformTreePoint(matrix, ...FOLIAGE_ATTACHMENTS[seed.asset]);
});
const clusterMotion = (asset: TreeArtId): LeafMotionKind => asset === 'leafbunch3' ? 'cluster3' : asset === 'leafbunch2' ? 'cluster2' : 'cluster1';

function inverseMatrix(matrix: TreeMatrix): TreeMatrix {
  const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = matrix;
  const determinant = scaleX * scaleY - skewX * skewY;
  return [scaleY / determinant, -skewY / determinant, -skewX / determinant, scaleX / determinant, (skewX * offsetY - scaleY * offsetX) / determinant, (skewY * offsetX - scaleX * offsetY) / determinant];
}

const bodyMatrix = (body: TreeSlot) => multiplyTreeMatrix(body.matrix, TREE_ART[treeArtVariant(body.asset, true)].registration as TreeMatrix);
function visibleBody(source: TreeSlot[]) {
  const body = source.find((part) => /^tree(?:01|[1-9])$/.test(part.asset))!;
  const [step, baseline] = [...bodies.entries()].find(([, part]) => part.id === body.id)!;
  return { body, step, baseline };
}

function branchPoint(index: number, source: TreeSlot[]) {
  const { body, step, baseline } = visibleBody(source);
  if (step === FOLIAGE_START_STEP) {
    const point = initial[index];
    return transformTreePoint(multiplyTreeMatrix(bodyMatrix(body), inverseMatrix(bodyMatrix(baseline))), point.x, point.y);
  }
  const [horizontal, vertical] = FOLIAGE_BRANCHES[step as typeof cutovers[number]][index];
  return transformTreePoint(bodyMatrix(body), horizontal * 1000, vertical * 1000);
}

function registered(asset: TreeArtId, matrix: TreeMatrix) {
  return multiplyTreeMatrix(matrix, inverseMatrix(TREE_ART[treeArtVariant(asset, true)].registration as TreeMatrix));
}

function retainedMatrix(seed: TreeSlot, point: { x: number; y: number }): TreeMatrix {
  const art = TREE_ART[treeArtVariant(seed.asset, true)];
  const matrix = multiplyTreeMatrix(seed.matrix, art.registration as TreeMatrix);
  const [horizontal, vertical] = FOLIAGE_ATTACHMENTS[seed.asset];
  matrix[4] = point.x - matrix[0] * horizontal - matrix[2] * vertical;
  matrix[5] = point.y - matrix[1] * horizontal - matrix[3] * vertical;
  return registered(seed.asset, matrix);
}

function artwork(asset: TreeArtId, point: { x: number; y: number }, width: number, angle: number): TreeMatrix {
  const art = TREE_ART[treeArtVariant(asset, true)];
  const height = width / art.aspect; const radians = angle * Math.PI / 180;
  const [horizontal, vertical] = FOLIAGE_ATTACHMENTS[asset];
  const matrix: TreeMatrix = [Math.cos(radians) * width / 1000, Math.sin(radians) * width / 1000, -Math.sin(radians) * height / 1000, Math.cos(radians) * height / 1000, 0, 0];
  matrix[4] = point.x - matrix[0] * horizontal - matrix[2] * vertical;
  matrix[5] = point.y - matrix[1] * horizontal - matrix[3] * vertical;
  return registered(asset, matrix);
}

function leafAngle(index: number, source: TreeSlot[], asset: TreeArtId) {
  const reference = visibleBody(source).step as typeof cutovers[number];
  const [horizontal, vertical] = FOLIAGE_BRANCHES[reference][index];
  const outward = Math.atan2((vertical - .65) * 1.1, horizontal - .5) * 180 / Math.PI;
  const canonical = asset === 'leaf1' ? -44 : asset === 'leaf4' ? -129 : -130;
  return outward - canonical;
}

function extension(index: number, frame: number, elapsed: number, source: TreeSlot[]): FoliageSlot | undefined {
  const site = FOLIAGE_SITES[index]; const birth = site.birth; const leafStep = foliageLeafStep(site);
  if (frame < birth) return;
  let phase: FoliagePhase = frame >= leafStep + 1 ? 'cluster' : frame >= leafStep ? 'leaf' : 'bud';
  let event = phase === 'cluster' ? leafStep + 1 : phase === 'leaf' ? leafStep : birth;
  const delay = foliageEventDelay(frame);
  if (frame === event && elapsed < delay) {
    if (phase === 'bud') return;
    phase = phase === 'cluster' ? 'leaf' : 'bud'; event = phase === 'leaf' ? leafStep : birth;
  }
  const asset = phase === 'cluster' ? site.cluster : phase === 'bud' ? 'leaf4' : site.side === 'left' ? index % 2 ? 'leaf2' : 'leaf3' : 'leaf1';
  const kind: LeafMotionKind = phase === 'bud' ? 'bud' : phase === 'leaf' ? 'leaf' : clusterMotion(asset);
  const width = phase === 'bud' ? Math.min(Math.max(site.width * .12, 16), 22) : phase === 'leaf' ? Math.min(Math.max(site.width * .3, 36), 54) : site.width;
  const point = branchPoint(seeds.length + index, source);
  const angle = phase === 'cluster' ? site.angle : leafAngle(seeds.length + index, source, asset);
  const settled = artwork(asset, point, width, angle);
  const motion = frame === event ? kind : undefined;
  const progress = leafMotionProgress(kind, elapsed, delay);
  return { id: `crown-growth-${index}`, asset, matrix: motion ? applyLeafMotion(motion, progress, settled) : settled, foliage: 'extension', site: `crown-growth-${index}`, phase, motion };
}

export function continuousFoliage(step: number, time: number | undefined, source: TreeSlot[]): FoliageSlot[] {
  const frame = boundedTreeStep(step);
  if (frame < FOLIAGE_START_STEP) return source;
  const duration = foliageDuration(frame);
  const elapsed = time === undefined ? duration : Math.max(0, Math.min(duration, Number.isFinite(time) ? time : 0));
  const leaves: FoliageSlot[] = seeds.map((seed, index) => {
    const opened = seed.asset === 'leaf4' && frame >= 35;
    const current = opened ? { ...matureBud, id: seed.id } : seed;
    const settled = retainedMatrix(current, branchPoint(index, source));
    const motion = opened && frame === 35 ? 'leaf' as const : undefined;
    return { ...current, matrix: motion ? applyLeafMotion(motion, leafMotionProgress(motion, elapsed), settled) : settled, foliage: 'retained', site: seed.id, phase: current.asset.startsWith('leafbunch') ? 'cluster' : current.asset === 'leaf4' ? 'bud' : 'leaf', motion };
  });
  FOLIAGE_SITES.forEach((_, index) => { const part = extension(index, frame, elapsed, source); if (part) leaves.push(part); });
  const wood = source.filter((part) => !part.asset.startsWith('leaf'));
  const ground = wood.findIndex((part) => part.id === 'grass');
  return [...wood.slice(0, ground < 0 ? wood.length : ground), ...leaves, ...(ground < 0 ? [] : wood.slice(ground))];
}
