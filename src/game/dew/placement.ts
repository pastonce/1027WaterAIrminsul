import type { DewParticle } from '../../types/game';

export interface DewObstacle { left: number; top: number; width: number; height: number }
export interface DewViewport { width: number; height: number; scale: number; blocked?: readonly DewObstacle[] }
export interface DewPosition { x: number; y: number }
interface SpawnRegion { left: number; right: number; top: number; bottom: number }

export const TREE_BODY_HALF_WIDTH = 330;
export const DEW_RADIUS = 26;
const PARTICLE_SPACING = 60;
export const DEFAULT_DEW_VIEWPORT: DewViewport = { width: 1200, height: 800, scale: 1 };

export function dewSpawnRegions(viewport: DewViewport, range: [number, number], reward = false): SpawnRegion[] {
  const { width, height, scale } = viewport;
  const radius = reward ? 22 : DEW_RADIUS;
  const edge = radius + 16;
  const clearance = TREE_BODY_HALF_WIDTH * scale + radius + 12;
  const top = Math.max(reward ? 100 : height <= 600 ? 124 : 152, height * range[0] / 100);
  const bottom = Math.min(height - (reward ? 88 : 104), height * range[1] / 100);
  if (bottom < top) return [];
  return [
    { left: edge, right: width / 2 - clearance, top, bottom },
    { left: width / 2 + clearance, right: width * 0.96 - 82, top, bottom },
  ].filter((region) => region.right >= region.left);
}

function spacing(reward: boolean, particle: DewParticle) { return particle.kind === 'rainstorm' ? 38 : reward && particle.kind === 'reward' ? 48 : reward || particle.kind === 'reward' ? 56 : PARTICLE_SPACING; }
function avoidsObstacles(horizontal: number, vertical: number, viewport: DewViewport, reward: boolean) {
  const clearance = (reward ? 22 : DEW_RADIUS) + 8;
  return (viewport.blocked ?? []).every((area) => horizontal + clearance <= area.left || horizontal - clearance >= area.left + area.width || vertical + clearance <= area.top || vertical - clearance >= area.top + area.height);
}

export function isDewPositionSafe(position: DewPosition, viewport: DewViewport, range: [number, number], occupied: DewParticle[] = [], reward = false) {
  const horizontal = position.x * viewport.width / 100;
  const vertical = position.y * viewport.height / 100;
  return dewSpawnRegions(viewport, range, reward).some((region) => horizontal >= region.left - 0.001 && horizontal <= region.right + 0.001 && vertical >= region.top - 0.001 && vertical <= region.bottom + 0.001)
    && avoidsObstacles(horizontal, vertical, viewport, reward)
    && occupied.every((particle) => particle.collected || Math.hypot(horizontal - particle.x * viewport.width / 100, vertical - particle.y * viewport.height / 100) >= spacing(reward, particle) - 0.001);
}

export function placeDew(viewport: DewViewport, range: [number, number], occupied: DewParticle[], random: () => number, reward = false): DewPosition | null {
  const regions = dewSpawnRegions(viewport, range, reward);
  if (!regions.length) return null;
  const available = (horizontal: number, vertical: number) => avoidsObstacles(horizontal, vertical, viewport, reward) && occupied.every((particle) => particle.collected || Math.hypot(horizontal - particle.x * viewport.width / 100, vertical - particle.y * viewport.height / 100) >= spacing(reward, particle));
  const position = (horizontal: number, vertical: number) => ({ x: horizontal / viewport.width * 100, y: vertical / viewport.height * 100 });
  const totalWidth = regions.reduce((total, region) => total + region.right - region.left, 0);
  for (let attempt = 0; attempt < 16; attempt++) {
    let horizontal = random() * totalWidth;
    let region = regions[regions.length - 1];
    for (const candidate of regions) {
      region = candidate;
      if (horizontal <= candidate.right - candidate.left) break;
      horizontal -= candidate.right - candidate.left;
    }
    horizontal += region.left;
    const vertical = region.top + random() * (region.bottom - region.top);
    if (available(horizontal, vertical)) return position(horizontal, vertical);
  }
  for (const region of regions) {
    const gap = reward ? 48 : PARTICLE_SPACING;
    const columns = Math.floor((region.right - region.left) / gap) + 1;
    const rows = Math.floor((region.bottom - region.top) / gap) + 1;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const horizontal = region.left + (region.right - region.left) * (columns === 1 ? 0.5 : column / (columns - 1));
        const vertical = region.top + (region.bottom - region.top) * (rows === 1 ? 0.5 : row / (rows - 1));
        if (available(horizontal, vertical)) return position(horizontal, vertical);
      }
    }
  }
  return null;
}

export function placeRewardDew(viewport: DewViewport, origin: DewPosition, occupied: DewParticle[], random: () => number, index: number) {
  const angle = index * 2.399963 + random() * 0.8;
  for (let ring = 0; ring < 6; ring++) {
    const radius = 72 + Math.sqrt(index + 1) * 32 + ring * 42;
    for (let turn = 0; turn < 8; turn++) {
      const direction = angle + turn * Math.PI / 4;
      const point = { x: origin.x + Math.cos(direction) * radius / viewport.width * 100, y: origin.y + Math.sin(direction) * radius * 0.78 / viewport.height * 100 };
      if (isDewPositionSafe(point, viewport, [0, 100], occupied, true)) return point;
    }
  }
  const candidates: DewPosition[] = [];
  for (const region of dewSpawnRegions(viewport, [0, 100], true)) for (let vertical = region.top; vertical <= region.bottom; vertical += 48) for (let horizontal = region.left; horizontal <= region.right; horizontal += 48) {
    const point = { x: horizontal / viewport.width * 100, y: vertical / viewport.height * 100 };
    if (isDewPositionSafe(point, viewport, [0, 100], occupied, true)) candidates.push(point);
  }
  candidates.sort((first, second) => Math.hypot((first.x - origin.x) * viewport.width, (first.y - origin.y) * viewport.height) - Math.hypot((second.x - origin.x) * viewport.width, (second.y - origin.y) * viewport.height));
  return candidates[0] ?? placeDew(viewport, [0, 100], occupied, random, true);
}
