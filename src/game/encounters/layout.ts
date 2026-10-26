import { FESTIVAL_ARANARA, HIDING_PLACES, INHABITANT_ASSETS } from '../../data/inhabitants';
import type { HidingMotion, InhabitantId } from '../../data/inhabitants';
import { getStageBackground } from '../../data/backgrounds';
import { backgroundProjection } from '../backgrounds/projection';
import { backgroundParallax } from '../backgrounds/policy';
import { crystalPerches } from './crystalflies';
import calibrated from '../../data/hiding.generated.json' with { type: 'json' };
import type { DreamStageId, ForestEncounter } from '../../types/game';

export interface CreatureActor extends HidingMotion {
  id: string; asset: InhabitantId; kind: 'roaming' | 'fixed' | 'crystal' | 'poster';
  left: number; top: number; width: number; height: number;
  hit?: { left: number; top: number; width: number; height: number };
  phase?: ForestEncounter['phase'];
  encounter?: number; claimed?: boolean;
  celebrated?: boolean; animationPhase?: number; burrow?: -1 | 1; depth?: string; edge?: 'left' | 'right' | 'top' | 'bottom';
  exitDistance?: number;
}
export interface CreatureViewport { width: number; height: number; scale: number; offset: number; root: number; treeHeight: number; seed: number; growth?: number; procedural?: boolean }
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function creatureLayout(stage: DreamStageId, entries: ForestEncounter[], viewport: CreatureViewport, claimed: string[]): CreatureActor[] {
  const { width, height, scale, offset } = viewport;
  const background = getStageBackground(stage)!;
  const projection = backgroundProjection(width, height, background.view);
  const parallax = backgroundParallax(offset, height);
  const compact = height <= 600;
  const actors: CreatureActor[] = [];
  const place = (asset: InhabitantId, horizontalPosition: number, verticalPosition: number, size: number) => {
    const bounds = INHABITANT_ASSETS[asset].bounds;
    const actorHeight = size; const actorWidth = size * bounds.width / bounds.height;
    const side = horizontalPosition < width / 2 ? -1 : 1;
    const clearance = 330 * scale + actorWidth / 2 + 16;
    const horizontal = side < 0 ? Math.min(horizontalPosition, width / 2 - clearance) : Math.max(horizontalPosition, width / 2 + clearance);
    return { left: clamp(horizontal - actorWidth / 2, 8, width - actorWidth - 110), top: clamp(verticalPosition - actorHeight, 100, height - actorHeight - 92), width: actorWidth, height: actorHeight };
  };
  for (const entry of entries) {
    const placeData = HIDING_PLACES[stage]?.[entry.slot]; if (!placeData) continue;
    const asset = entry.asset as InhabitantId;
    const bounds = INHABITANT_ASSETS[asset].bounds;
    if (placeData.edge) {
      const actorHeight = compact ? 106 : 142; const actorWidth = actorHeight * bounds.width / bounds.height;
      const horizontal = clamp(width * placeData.x, 240, width - 280);
      const bottomHorizontal = width < 700 && placeData.x > 0.5 ? width * 0.23 : width * placeData.x;
      const left = placeData.edge === 'left' ? -actorWidth * 0.53 : placeData.edge === 'right' ? width - actorWidth * 0.47 : (placeData.edge === 'top' ? horizontal : bottomHorizontal) - actorWidth / 2;
      const top = placeData.edge === 'top' ? -actorHeight * 0.4 : placeData.edge === 'bottom' ? height - actorHeight * 0.56 : clamp(height * placeData.y - actorHeight / 2, 112, height - 150);
      const hit = { left: placeData.edge === 'left' ? 1 : placeData.edge === 'right' ? width - 45 : left + actorWidth / 2 - 22, top: placeData.edge === 'top' ? 1 : placeData.edge === 'bottom' ? height - 45 : top + actorHeight * 0.3, width: 44, height: 44 };
      actors.push({ id: `roaming-${entry.id}`, asset, kind: 'roaming', phase: entry.phase, encounter: entry.id, celebrated: entry.celebrated, left, top, width: actorWidth, height: actorHeight, hit, depth: 'edge', edge: placeData.edge });
      continue;
    }
    const actorHeight = (asset === 'aranara_04' ? 270 : 220) * projection;
    const actorWidth = actorHeight * bounds.width / bounds.height;
    const fit = (calibrated as Record<string, Partial<Record<InhabitantId, { horizontal: number; vertical: number; hitX: number; hitY: number }>>>)[`${stage}-${entry.slot}`]?.[asset];
    const left = width / 2 + (placeData.x + (fit?.horizontal ?? 0)) * projection - actorWidth * (placeData.burrow === 1 ? 0.4 : placeData.burrow === -1 ? 0.6 : 0.5);
    const top = height / 2 - (placeData.y + (fit?.vertical ?? 0)) * projection - actorHeight * (placeData.burrow ? 0.55 : 0.4) + parallax;
    const hit = { left: left + actorWidth * (fit?.hitX ?? 0.5) - 22, top: top + actorHeight * (fit?.hitY ?? 0.2) - 22, width: 44, height: 44 };
    actors.push({ id: `roaming-${entry.id}`, asset, kind: 'roaming', phase: entry.phase, encounter: entry.id, celebrated: entry.celebrated, left, top, width: actorWidth, height: actorHeight, hit, burrow: placeData.burrow, depth: placeData.depth ?? 'middle', arrival: placeData.arrival, departure: placeData.departure, travel: placeData.travel, exitDistance: placeData.departure === 'bottom' ? Math.max(1.2, (height + actorHeight + 48 - top) / actorHeight) : undefined });
  }
  if (stage === 'F') {
    const positions = [[-940, -45, 0.93], [-710, -370, 1.08], [690, -340, 1.07], [980, -60, 0.68]];
    FESTIVAL_ARANARA.forEach((asset, index) => {
      const [horizontal, vertical, factor] = positions[index];
      const box = place(asset, width / 2 + horizontal * projection, height / 2 - vertical * projection + parallax, (compact ? 82 : 122) * factor);
      actors.push({ ...box, id: asset, asset, kind: 'fixed', claimed: claimed.includes(asset) });
    });
  }
  if ((viewport.growth ?? 0) >= 100) for (const perch of crystalPerches(viewport.seed, viewport.growth ?? 0, undefined, viewport.procedural)) {
    if ((viewport.growth ?? 0) < perch.threshold) continue;
    const bounds = INHABITANT_ASSETS[perch.asset].bounds;
    const actorWidth = Math.max(30, perch.width * scale); const actorHeight = actorWidth * bounds.height / bounds.width;
    actors.push({ id: perch.id, asset: perch.asset, kind: 'crystal', animationPhase: perch.phase, left: width / 2 + perch.horizontal * scale - actorWidth / 2, top: viewport.root + offset - perch.elevation * scale - actorHeight / 2, width: actorWidth, height: actorHeight });
  }
  return actors;
}
