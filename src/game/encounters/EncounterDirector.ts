import { ENCOUNTER_RULES, HIDING_PLACES, ROAMING_ARANARA } from '../../data/inhabitants';
import type { DreamStageId, ForestEncounter, StageId } from '../../types/game';
import { PausableTimer } from '../core/PausableTimer';

export class EncounterDirector {
  private stage: DreamStageId | null = null;
  private paused = false;
  private sequence = 0;
  private entries: ForestEncounter[] = [];
  private spawnTimer = new PausableTimer();
  private lifetimes = new Map<number, PausableTimer>();
  private arrivals = new Map<number, PausableTimer>();
  private available: readonly number[] | null = null;

  constructor(private readonly changed: (entries: ForestEncounter[]) => void, private readonly random = Math.random, private readonly sound: (kind: 'aranara-appear' | 'aranara-disappear') => void = () => undefined) {}
  setAvailable(slots: readonly number[] | null) { this.available = slots; }

  configure(stage: StageId | null, paused: boolean) {
    const selected = stage && stage !== 'G' && HIDING_PLACES[stage] ? stage : null;
    if (selected !== this.stage) {
      this.clear(); this.stage = selected;
      if (selected) this.schedule();
    }
    this.paused = paused; this.spawnTimer.setPaused(paused);
    for (const timer of [...this.lifetimes.values(), ...this.arrivals.values()]) timer.setPaused(paused);
  }

  private publish(entries: ForestEncounter[]) { this.entries = entries; this.changed(entries); }
  private schedule() {
    this.spawnTimer.schedule(() => { this.spawn(); this.schedule(); }, ENCOUNTER_RULES.spawnMinMs + this.random() * (ENCOUNTER_RULES.spawnMaxMs - ENCOUNTER_RULES.spawnMinMs));
  }

  spawn(slot?: number) {
    if (!this.stage || this.paused || this.entries.length >= ENCOUNTER_RULES.maximum) return false;
    const freeAssets = ROAMING_ARANARA.filter((asset) => !this.entries.some((entry) => entry.asset === asset));
    const places = HIDING_PLACES[this.stage]!.map((_, index) => index).filter((index) => {
      const allowed = HIDING_PLACES[this.stage!]![index].allowed;
      return !this.entries.some((entry) => entry.slot === index) && (slot !== undefined || !this.available || this.available.includes(index)) && freeAssets.some((asset) => !allowed || allowed.includes(asset));
    });
    const selected = slot === undefined ? places[Math.min(places.length - 1, Math.floor(this.random() * places.length))] : slot;
    const allowed = HIDING_PLACES[this.stage]![selected]?.allowed;
    const assets = freeAssets.filter((asset) => !allowed || allowed.includes(asset));
    if (!assets.length || !places.includes(selected)) return false;
    const entry: ForestEncounter = { id: ++this.sequence, asset: assets[Math.min(assets.length - 1, Math.floor(this.random() * assets.length))], slot: selected, phase: 'arriving' };
    this.publish([...this.entries, entry]);
    this.sound('aranara-appear');
    const arrival = new PausableTimer(); this.arrivals.set(entry.id, arrival);
    arrival.schedule(() => { this.arrivals.delete(entry.id); this.publish(this.entries.map((current) => current.id === entry.id ? { ...current, phase: 'watching' } : current)); }, ENCOUNTER_RULES.arriveMs);
    const lifetime = new PausableTimer(); this.lifetimes.set(entry.id, lifetime);
    lifetime.schedule(() => this.leave(entry.id), ENCOUNTER_RULES.lifetimeMs);
    return true;
  }

  has(id: number) { return this.entries.some((entry) => entry.id === id && entry.phase !== 'leaving'); }

  leave(id: number, celebrated = false) {
    if (!this.has(id)) return false;
    this.arrivals.get(id)?.clear(); this.arrivals.delete(id);
    this.publish(this.entries.map((entry) => entry.id === id ? { ...entry, phase: 'leaving', celebrated } : entry));
    if (!celebrated) this.sound('aranara-disappear');
    const lifetime = this.lifetimes.get(id)!;
    lifetime.schedule(() => { this.lifetimes.delete(id); this.publish(this.entries.filter((entry) => entry.id !== id)); }, celebrated ? ENCOUNTER_RULES.celebrationMs : ENCOUNTER_RULES.leaveMs);
    return true;
  }

  clear() {
    this.spawnTimer.clear(); this.lifetimes.forEach((timer) => timer.clear()); this.arrivals.forEach((timer) => timer.clear());
    this.lifetimes.clear(); this.arrivals.clear(); this.stage = null;
    if (this.entries.length) this.publish([]);
  }
}
