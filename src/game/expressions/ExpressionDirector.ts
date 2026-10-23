import { EXPRESSION_ASSETS, EXPRESSION_RULES, pickExpression, TREE_EXPRESSIONS } from '../../data/expressions';
import type { ExpressionPlayback, StageId } from '../../types/game';
import { PausableTimer } from '../core/PausableTimer';

export class ExpressionDirector {
  private idle = new PausableTimer();
  private display = new PausableTimer();
  private growth = new PausableTimer();
  private settling = false;
  private stage: StageId | null = null;
  private eligible = false;
  private playback: ExpressionPlayback | null = null;
  private sequence = 0;

  constructor(private readonly publish: (playback: ExpressionPlayback | null) => void, private readonly random = Math.random) {}

  configure(stage: StageId | null, eligible: boolean, paused: boolean, interruptTree: boolean) {
    this.eligible = eligible;
    this.idle.setPaused(!eligible || this.settling);
    this.display.setPaused(paused);
    this.growth.setPaused(paused);
    if (stage !== this.stage) {
      this.idle.clear(); this.growth.clear(); this.settling = false; this.stage = stage; this.dismiss();
      this.idle.setPaused(!eligible);
      if (stage && stage !== 'G' && TREE_EXPRESSIONS[stage]?.length) this.armIdle();
    } else if (interruptTree && this.playback?.anchor === 'tree') this.dismiss();
  }

  grew() {
    if (!this.stage || this.stage === 'G') return;
    this.settling = true; this.idle.setPaused(true);
    if (this.playback?.anchor === 'tree') this.dismiss();
    this.growth.schedule(() => { this.settling = false; this.idle.setPaused(!this.eligible); }, 1200);
  }

  private armIdle() {
    this.idle.schedule(() => {
      const stage = this.stage;
      if (!stage || stage === 'G') return;
      if (this.eligible && this.random() < EXPRESSION_RULES.chance) {
        const asset = pickExpression(TREE_EXPRESSIONS[stage] ?? [], this.random);
        if (asset !== undefined) this.show(asset, 'tree');
      }
      this.armIdle();
    }, EXPRESSION_RULES.idleMs);
  }

  show(asset: number, anchor: ExpressionPlayback['anchor']) {
    if (!this.stage || !EXPRESSION_ASSETS[asset] || anchor === 'nahida' && this.stage !== 'G' || anchor === 'tree' && this.stage === 'G') return;
    this.display.clear();
    this.playback = { id: ++this.sequence, asset, anchor, angle: EXPRESSION_RULES.angleMin + this.random() * (EXPRESSION_RULES.angleMax - EXPRESSION_RULES.angleMin), ready: false };
    this.publish(this.playback);
    this.display.schedule(() => this.dismiss(), EXPRESSION_RULES.assetWaitMs);
  }

  ready(id: number) {
    if (this.playback?.id !== id || this.playback.ready) return;
    this.playback = { ...this.playback, ready: true };
    this.publish(this.playback);
    this.display.schedule(() => this.dismiss(), EXPRESSION_RULES.visibleMs);
  }

  dismiss(id = this.playback?.id) {
    if (!this.playback || id !== this.playback.id) return;
    this.display.clear(); this.playback = null; this.publish(null);
  }

  reset() { this.stage = null; this.eligible = false; this.settling = false; this.idle.clear(); this.growth.clear(); this.dismiss(); }
}
