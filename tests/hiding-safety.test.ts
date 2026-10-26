import { describe, expect, it } from 'vitest';
import { availableHidingSlots, hidingActorSafe } from '../src/game/encounters/hidingSafety';
import { creatureLayout } from '../src/game/encounters/layout';
import { HIDING_PLACES, ROAMING_ARANARA } from '../src/data/inhabitants';
import { sceneScale } from '../src/hooks/useSceneViewport';
import { sceneRoot } from '../src/game/tree/scenePlacement';
import type { DreamStageId } from '../src/types/game';

describe('十个藏点按实际树体 / 界面选择，保留真实屏缘热点', () => {
  for (const [stage, growth] of [['A', 140], ['C', 500], ['D', 660], ['E', 820], ['F', 1020]] as const) {
    it.each([[1440, 900], [1024, 768], [844, 390], [640, 360]])(`${stage} %s×%s不再被旧330全高走廊限制到单个藏点`, (width, height) => {
      const scale = sceneScale(height);
      const viewport = { width, height, scale, offset: 0, root: sceneRoot(height, scale), treeHeight: 0, growth, seed: 1027 };
      const blocked = [{ left: width - 190, top: height - 110, width: 190, height: 110 }];
      const available = availableHidingSlots(stage, viewport, blocked);
      expect(available).toContain(6); expect(available).toContain(7);
      for (const slot of available) {
        const actors = creatureLayout(stage, (HIDING_PLACES[stage]![slot].allowed ?? ROAMING_ARANARA).map((asset) => ({ id: slot, slot, asset, phase: 'watching' })), viewport, []);
        for (const actor of actors.filter((entry) => entry.kind === 'roaming')) {
          expect(actor.hit!.left).toBeGreaterThanOrEqual(0);
          expect(actor.hit!.left + actor.hit!.width).toBeLessThanOrEqual(width);
          expect(actor.hit!.top).toBeGreaterThanOrEqual(0);
          expect(actor.hit!.top + actor.hit!.height).toBeLessThanOrEqual(height);
        }
      }
    });
  }

  it('左侧1px和右侧1px的44px热点有效，实际UI / 树附件重叠才排除', () => {
    const viewport = { width: 1024, height: 768, scale: 1, offset: 0, root: 586, treeHeight: 0, growth: 0, seed: 1027 };
    for (const slot of [6, 7]) {
      const actor = creatureLayout('A', [{ id: slot, slot, asset: 'aranara_01', phase: 'watching' }], viewport, [])[0];
      expect(hidingActorSafe(actor, viewport, [], [])).toBe(true);
      expect(hidingActorSafe(actor, viewport, [actor.hit!], [])).toBe(false);
      expect(hidingActorSafe(actor, viewport, [], [actor.hit!])).toBe(false);
    }
  });

  it('世界物件被cover裁出视口时不会把假热点夹回屏内', () => {
    const viewport = { width: 1024, height: 768, scale: 1, offset: 0, root: 586, treeHeight: 0, growth: 0, seed: 1027 };
    for (const stage of ['D', 'E'] as DreamStageId[]) {
      const slots = availableHidingSlots(stage, viewport);
      expect(slots).not.toContain(0); expect(slots).not.toContain(1); expect(slots).not.toContain(4); expect(slots).not.toContain(5);
    }
  });

  it.each(['D', 'E'] as DreamStageId[])('%s6在裁切边缘只选择已验证姿态，热点仍覆盖画幅内露出的身体', (stage) => {
    const viewport = { width: 1440, height: 900, scale: 1, offset: 0, root: 718, treeHeight: 0, growth: 0, seed: 1027 };
    const allowed = HIDING_PLACES[stage]![5].allowed!;
    expect(allowed).toEqual(['aranara_01', 'aranara_03', 'aranara_04', 'aranara_05']);
    const actors = creatureLayout(stage, allowed.map((asset, id) => ({ id, slot: 5, asset, phase: 'watching' })), viewport, []);
    for (const actor of actors.filter((entry) => entry.kind === 'roaming')) {
      expect(actor.hit!.left).toBeGreaterThanOrEqual(0); expect(actor.hit!.left + 44).toBeLessThanOrEqual(viewport.width);
      expect(actor.hit!.left).toBeLessThan(actor.left + actor.width); expect(actor.hit!.left + 44).toBeGreaterThan(actor.left);
    }
    expect(availableHidingSlots(stage, viewport)).toContain(5);
  });
});
