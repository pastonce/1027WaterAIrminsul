import { dewSpawnRegions } from './placement';
import type { DewPosition, DewViewport } from './placement';
import type { DewParticle } from '../../types/game';
import { EASTER_RULES } from '../secrets/codes';

export function placeRainstorm(viewport: DewViewport, occupied: DewParticle[], random = Math.random): DewPosition[] {
  const regions = dewSpawnRegions(viewport, [0, 100], true);
  const radius = 10;
  for (const gap of [42, 32, 24, 18, 14]) {
    const points: DewPosition[] = [];
    for (const region of regions) {
      const columns = Math.max(1, Math.floor((region.right - region.left) / gap) + 1);
      const rows = Math.max(1, Math.floor((region.bottom - region.top) / gap) + 1);
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const horizontal = region.left + (region.right - region.left) * (columns === 1 ? 0.5 : column / (columns - 1));
        const vertical = region.top + (region.bottom - region.top) * (rows === 1 ? 0.5 : row / (rows - 1));
        if ([...(viewport.tree ?? []), ...(viewport.blocked ?? [])].some((area) => horizontal + radius > area.left && horizontal - radius < area.left + area.width && vertical + radius > area.top && vertical - radius < area.top + area.height)) continue;
        if (occupied.some((particle) => !particle.collected && !particle.expiring && Math.hypot(horizontal - particle.x * viewport.width / 100, vertical - particle.y * viewport.height / 100) < 28)) continue;
        points.push({ x: horizontal / viewport.width * 100, y: vertical / viewport.height * 100 });
      }
    }
    if (points.length < EASTER_RULES.rainCount) continue;
    for (let index = points.length - 1; index > 0; index--) {
      const selected = Math.max(0, Math.min(index, Math.floor(random() * (index + 1))));
      [points[index], points[selected]] = [points[selected], points[index]];
    }
    return points.slice(0, EASTER_RULES.rainCount);
  }
  return [];
}
