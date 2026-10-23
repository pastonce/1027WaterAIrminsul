import { E_SKILL_PATTERN as pattern } from '../data/assets';

export type ESkillPatternPiece = typeof pattern.pieces[number];

export function ESkillPiece({ piece }: { piece: ESkillPatternPiece }) {
  return <svg width={piece.region[2]} height={piece.region[3]} viewBox={piece.region.join(' ')} overflow="hidden"><image href={pattern.texture} width={pattern.textureSize[0]} height={pattern.textureSize[1]}/></svg>;
}
