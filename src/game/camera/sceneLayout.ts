import { CHARACTER_ASSETS } from '../../data/assets';
import type { CharacterVariant } from '../../data/assets';
import { VISIT_EMITTERS, VISIT_PLACEMENTS } from '../../data/visits';
import { dialogueWidth } from '../../data/dialogueLayout';
import type { DreamStageId } from '../../types/game';

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function dreamLayout(width: number, height: number, scale: number, treeHeight: number, cameraOffset: number, groundRoot = height - 40 - 100 * scale, variant: CharacterVariant = 'dream', visitStage: DreamStageId = 'A', position: 0 | 1 = 0) {
  const center = width / 2;
  const root = groundRoot + cameraOffset;
  const crown = root - treeHeight * scale;
  const compact = height <= 600;
  const ratio = CHARACTER_ASSETS[variant].bounds.width / CHARACTER_ASSETS[variant].bounds.height;
  const hanging = variant === 'nahida_swing'; const dreaming = variant === 'nahida_dream';
  const characterHeight = variant === 'dream' ? compact ? clamp(height * 0.39, 132, 210) : clamp(height * 0.34, 220, 320)
    : compact ? clamp(height * (hanging ? 0.64 : 0.49), 160, hanging ? 250 : 210) : clamp(height * (hanging ? 0.60 : 0.41), 300, hanging ? 500 : 390);
  const characterWidth = characterHeight * ratio;
  const placement = VISIT_PLACEMENTS[visitStage][position];
  const emitter = VISIT_EMITTERS[visitStage];
  const characterLeft = placement.side === 'right' ? clamp(center + width * 0.05, 20, width - characterWidth - (compact ? 50 : 82)) : Math.max(20, center - characterWidth * 0.65 - clamp(width * 0.12, 90, 180) - width * (placement.inset ?? 0));
  const baseTop = hanging ? clamp(crown + 50, 92, height - characterHeight - 20)
    : dreaming ? clamp(root - characterHeight - 45, compact ? 100 : 120, height - characterHeight - 35)
    : compact ? height - characterHeight - 20 : clamp(root - characterHeight - 28, 100, height - characterHeight - 70);
  const characterTop = placement.side === 'left' ? clamp(baseTop - height * placement.elevation, 92, height - characterHeight - 20) : clamp(baseTop - height * placement.elevation, 92, height - characterHeight - (compact ? 62 : 75));
  const treeBubbleWidth = dialogueWidth(width, height);
  const treeBubbleLeft = clamp(center + 44 * scale + 30, 20, width - treeBubbleWidth - 65);
  const characterBubbleWidth = treeBubbleWidth;
  const beside = variant !== 'dream';
  const bubbleRight = beside && placement.side === 'left' && (compact || characterLeft < characterBubbleWidth + 24);
  return {
    character: { left: characterLeft, top: characterTop, width: characterWidth, height: characterHeight },
    characterEmission: { ...emitter },
    treeBubble: { left: treeBubbleLeft, top: clamp(crown + 65 * scale, 100, height - 190), width: treeBubbleWidth },
    characterBubble: {
      left: beside ? bubbleRight ? clamp(characterLeft + characterWidth * 0.85 + 8, 20, width - characterBubbleWidth - 60) : Math.max(20, characterLeft + characterWidth * 0.1 - characterBubbleWidth - 8) : compact ? clamp(characterLeft + characterWidth * 0.52 - characterBubbleWidth / 2, 20, width - characterBubbleWidth - 20) : Math.max(20, characterLeft + characterWidth * 0.42 - characterBubbleWidth - 8),
      top: compact && !beside ? Math.max(86, characterTop - 100) : clamp(characterTop + characterHeight * (hanging ? 0.48 : 0.12), 100, height - 150), width: characterBubbleWidth,
    },
    characterBubbleSide: beside ? bubbleRight ? 'left' as const : 'right' as const : compact ? 'bottom' as const : 'right' as const,
  };
}

export function realityLayout(width: number, height: number) {
  const compact = height <= 600;
  const narrow = compact && width <= 700;
  const bubbleWidth = dialogueWidth(width, height);
  const characterReserve = compact ? clamp(width * 0.26, 208, 224) : clamp(width * 0.27, 360, 400);
  const ratio = CHARACTER_ASSETS.reality.bounds.width / CHARACTER_ASSETS.reality.bounds.height;
  const characterWidth = Math.min((compact ? height - 80 : Math.min(680, height * 0.73)) * ratio, width * 0.39);
  const characterHeight = characterWidth / ratio;
  const left = narrow ? width * 0.49 : Math.max(20, Math.min(width * 0.47, width - characterWidth - Math.max(characterReserve, bubbleWidth) - 35));
  const top = compact ? height - characterHeight - 20 : height * 0.91 - characterHeight;
  const bubbleLeft = left + characterWidth * 0.86 + 6;
  return {
    character: { left, top, width: characterWidth, height: characterHeight },
    bubble: narrow ? { left: clamp(left + characterWidth * 0.12 - bubbleWidth - 6, 24, width - bubbleWidth - 20), top: 132, width: bubbleWidth } : { left: bubbleLeft, top: clamp(top + 70, 94, height - 180), width: bubbleWidth },
    bubbleSide: narrow ? 'right' as const : 'left' as const,
    userBubble: { left: Math.min(width * 0.38, width - bubbleWidth - 24), bottom: compact ? 18 : 26, width: bubbleWidth },
  };
}
