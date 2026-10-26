import { HIDING_PLACES, ROAMING_ARANARA } from '../../data/inhabitants';
import type { DreamStageId } from '../../types/game';
import { creatureLayout } from './layout';
import type { CreatureActor, CreatureViewport } from './layout';
import { treeDewObstacles } from '../dew/treeSpace';

export interface HidingObstacle { left: number; top: number; width: number; height: number }

function overlaps(first: HidingObstacle, second: HidingObstacle, gap = 0) {
  return first.left < second.left + second.width + gap && first.left + first.width > second.left - gap
    && first.top < second.top + second.height + gap && first.top + first.height > second.top - gap;
}

export function hidingActorSafe(actor: CreatureActor, viewport: CreatureViewport, tree: readonly HidingObstacle[], blocked: readonly HidingObstacle[]) {
  const hit = actor.hit;
  if (!hit || hit.left < 0 || hit.top < 0 || hit.left + hit.width > viewport.width || hit.top + hit.height > viewport.height) return false;
  return !tree.some((part) => overlaps(hit, part)) && !blocked.some((part) => overlaps(hit, part, 4));
}

export function availableHidingSlots(stage: DreamStageId, viewport: CreatureViewport, blocked: readonly HidingObstacle[] = []) {
  const probes = creatureLayout(stage, (HIDING_PLACES[stage] ?? []).flatMap((anchor, slot) => (anchor.allowed ?? ROAMING_ARANARA).map((asset) => ({ id: slot, slot, asset, phase: 'watching' }))), viewport, []);
  const tree = treeDewObstacles(viewport.growth ?? 0, viewport.width, viewport.root + viewport.offset, viewport.scale, false, viewport.procedural, viewport.seed);
  const excluded = [...blocked, ...probes.filter((actor) => actor.kind === 'fixed')];
  return (HIDING_PLACES[stage] ?? []).flatMap((_, slot) => probes.filter((actor) => actor.encounter === slot).every((actor) => hidingActorSafe(actor, viewport, tree, excluded)) ? [slot] : []);
}
