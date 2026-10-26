import { GAME_RULES } from '../../data/schedule';
import { STAGES } from '../../data/stages';
import { PRESENTATION_RULES } from '../../data/presentation';
import { SECRETS } from '../../data/secrets';
import { DREAM_STAGES } from '../../types/game';
import type { DialogueEntry, DreamStageId, GameSave, GameSnapshot, PendingDialogueKind, QueuedEvent, StageId } from '../../types/game';
import { calculateWatering, getActiveStage, getSceneStage, stageOrder } from '../growth/GrowthSystem';
import { StageLoadingDirector } from '../loading/StageLoadingDirector';
import { completeLoadingArtChoices, getLoadingArt } from '../../data/stageLoading';
import { createSave, SaveManager, validateSave } from '../save/SaveManager';
import { TimeGateService } from '../time/TimeGateService';
import { SpeechDirector } from '../dialogue/SpeechDirector';
import { PausableTimer } from './PausableTimer';
import { DEFAULT_DEW_VIEWPORT, isDewPositionSafe, placeDew, placeRewardDew } from '../dew/placement';
import type { DewObstacle, DewViewport } from '../dew/placement';
import { EncounterDirector } from '../encounters/EncounterDirector';
import { ENCOUNTER_RULES, FESTIVAL_ARANARA } from '../../data/inhabitants';
import { stageVisitIds, visitGrowth, visitGrowthCap } from '../../data/visits';
import { treeGrowthDuration } from '../tree/growth';
import { randomDewValue } from '../dew/value';
import { DIALOGUE_RULES, dialogueEntry, transitionDialoguePool } from '../../data/dialogues';
import { drawDialogue, drawUnplayedDialogue, dreamDialogueCategory } from '../dialogue/DialogueSystem';
import { ExpressionDirector } from '../expressions/ExpressionDirector';
import { EXPRESSION_ASSETS, pickExpression, REALITY_EXPRESSION_IDS, TREE_EXPRESSIONS, VISIT_EXPRESSION_CHOICES } from '../../data/expressions';
import { WakingDirector } from '../awakening/WakingDirector';
import { needsWakingReveal, WAKING_REDUCED_MS, WAKING_SEQUENCE } from '../awakening/choreography';
import { BirthdayDirector } from '../awakening/BirthdayDirector';
import type { InteractionSound } from '../../data/sounds';
import { easterCode, EASTER_RULES } from '../secrets/codes';
import { placeRainstorm } from '../dew/rainstorm';
import { SEED_RULES } from '../../data/seed';

export class GameController {
  private snapshot: GameSnapshot;
  private listeners = new Set<() => void>();
  private soundListeners = new Set<(kind: InteractionSound) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private queue: QueuedEvent[] = [];
  private particleSequence = 0;
  private dewLifetimes = new Map<number, PausableTimer>();
  private rewardLifetimes = new Map<number, PausableTimer>();
  private dewFlights = new Map<number, PausableTimer>();
  private burstLifetimes = new Map<number, PausableTimer>();
  private rewardSequence = 0;
  private encounters: EncounterDirector;
  private suspended = false;
  private restoringScene = true;
  private active = false;
  private speech: SpeechDirector;
  private expressions: ExpressionDirector;
  private awakening = new PausableTimer();
  private cultivation = new PausableTimer();
  private planting = new PausableTimer();
  private panelResumeMode: 'idle' | 'watering' | 'growing' = 'idle';
  private dialogueIdle = new PausableTimer();
  private idleStage: StageId | null = null;
  private welcomed = false;
  private firstEntry = false;
  private resumeAfterUnlock = false;
  private forestEntered = false;
  private loading: StageLoadingDirector;
  private waking: WakingDirector;
  private birthday: BirthdayDirector;
  private systemReducedMotion = false;
  private loadingSequence = 0;
  private loadingSceneReady = false;
  private loadingArtworkReady = false;
  private dewViewport = DEFAULT_DEW_VIEWPORT;
  private dewObstacles: readonly DewObstacle[] = [];
  private secretVisitSequence = 0;
  private secretBlessed = new Set<string>();
  private summonedAranara: DreamStageId | null = null;
  private pendingRainSound = false;
  private openingAssetsPrepared = false;
  private companionVisit: { id: string; stage: DreamStageId; position: 0 | 1 } | null = null;

  constructor(readonly time: TimeGateService, private readonly saves: SaveManager, private readonly random = Math.random) {
    const save = saves.load();
    this.firstEntry = !saves.hasLoadedSave;
    this.resumeAfterUnlock = save.introSeen && !time.isOpen('A');
    const wishing = save.pendingDialogues.some((entry) => entry.kind === 'wish');
    save.pendingDialogues = save.pendingDialogues.filter((entry) => entry.kind !== 'opening' && !(wishing && entry.kind === 'idle' && entry.stage === 'G'));
    this.snapshot = {
      save, stage: getSceneStage(save, time), growth: 0, now: time.now(), mode: save.introSeen && time.isOpen('A') ? 'idle' : 'intro', stageLoading: null, waking: null, birthday: null, seedPhase: save.seedPlanted ? null : 'arriving',
      dewParticles: [], event: null, speech: null, expression: null, companion: null, companionCanTalk: false, companionStage: null, companionPosition: 0, nahidaPlaceholder: false, proceduralTree: false, blessing: null, encounters: [], rewardBursts: [], presentationPaused: false,
      dewFeedback: null, dewFeedbackRevision: 0, message: '', effects: [], reviewStage: null, growthRevision: 0, saveStatus: saves.status,
    };
    this.expressions = new ExpressionDirector((expression) => this.update({ expression }), random);
    this.birthday = new BirthdayDirector((birthday) => this.update({ birthday }));
    this.speech = new SpeechDirector({
      options: () => this.snapshot.save.settings,
      speech: (speech) => this.update({ speech }),
      companion: (companion) => {
        const arriving = companion === 'arrive' && this.snapshot.companion !== 'arrive';
        if (!companion) { this.companionVisit = null; if (this.snapshot.expression?.anchor === 'nahida') this.expressions.dismiss(); }
        this.update({ companion, companionStage: companion ? this.companionVisit?.stage ?? this.snapshot.companionStage : null });
        if (arriving) this.emitSound('nahida-arrive');
      },
      interactable: (enabled) => this.update({ companionCanTalk: enabled && !this.snapshot.save.visitLines[this.companionVisit?.id ?? '']?.followup }),
      read: (entry) => this.markRead(entry),
      prepare: (entry, start) => this.prepareSpeech(entry, start),
      available: () => this.reconcile(),
      canBless: () => this.snapshot.event?.type === 'secret-visit' ? !this.secretBlessed.has(this.snapshot.event.id) : this.snapshot.event?.type === 'visit' && !this.snapshot.save.blessedVisits.includes(this.snapshot.event.id),
      blessing: (phase) => this.bless(phase),
      expressionAllowed: (entry) => this.snapshot.stage === 'G' && !this.snapshot.reviewStage && REALITY_EXPRESSION_IDS.has(entry.id),
      expression: (choice) => this.expressions.show(choice.asset, 'nahida'),
    }, random);
    this.encounters = new EncounterDirector((encounters) => this.update({ encounters }), random, (kind) => this.emitSound(kind));
    this.loading = new StageLoadingDirector((patch) => {
      if (this.snapshot.stageLoading) this.update({ stageLoading: { ...this.snapshot.stageLoading, ...patch } });
    }, () => this.coveredStage(), () => this.finishStageLoading());
    this.waking = new WakingDirector((waking) => this.update({ waking }), () => this.finishWaking());
    this.refreshProgress();
  }

  getSnapshot = () => this.snapshot;
  prepareBirthdayPreview() {
    if (this.active || this.snapshot.stage !== 'F' || getActiveStage(this.snapshot.save, this.time) !== 'G') return;
    this.welcomed = true;
    this.beginStageLoading('G');
  }
  prepareOpeningAssets() {
    if (this.openingAssetsPrepared) return;
    this.openingAssetsPrepared = true;
    this.commit({ loadingArtChoices: completeLoadingArtChoices({}, this.random) });
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeSound = (listener: (kind: InteractionSound) => void) => { this.soundListeners.add(listener); return () => { this.soundListeners.delete(listener); }; };

  private emitSound(kind: InteractionSound) {
    if (!this.active || this.suspended || this.snapshot.presentationPaused || this.snapshot.reviewStage) return;
    for (const listener of this.soundListeners) { try { listener(kind); } catch { } }
  }

  private update(patch: Partial<GameSnapshot>) {
    if (patch.stage && patch.stage !== this.snapshot.stage) {
      this.pendingRainSound = false;
      this.summonedAranara = null;
      this.queue = this.queue.filter((event) => event.type !== 'secret-visit');
      patch.dewParticles ??= this.snapshot.dewParticles.filter((particle) => particle.kind !== 'rainstorm');
    }
    if (patch.dewParticles) {
      const retained = new Set(patch.dewParticles.map((particle) => particle.id));
      for (const [id, timer] of this.dewFlights) if (!retained.has(id)) { timer.clear(); this.dewFlights.delete(id); }
      for (const [id, timer] of this.dewLifetimes) {
        if (!retained.has(id)) { timer.clear(); this.dewLifetimes.delete(id); }
      }
      const batches = new Set(patch.dewParticles.flatMap((particle) => particle.portions?.map((portion) => portion.batch) ?? []));
      for (const [batch, timer] of this.rewardLifetimes) if (!batches.has(batch)) { timer.clear(); this.rewardLifetimes.delete(batch); }
    }
    const growthMs = patch.growth === undefined ? 0 : treeGrowthDuration(this.snapshot.growth, patch.growth);
    this.snapshot = { ...this.snapshot, ...patch };
    if (!('expression' in patch)) {
      this.syncExpressions();
      if (growthMs && this.active) this.expressions.grew(growthMs);
    }
    this.listeners.forEach((listener) => listener());
  }

  private syncExpressions() {
    const state = this.snapshot;
    const inactive = !this.active || !state.save.introSeen || !state.save.seedPlanted || Boolean(state.reviewStage) || ['intro', 'ending', 'loading', 'waking'].includes(state.mode) || state.stage === 'A' && !this.forestEntered;
    const paused = this.suspended || state.presentationPaused || ['journal', 'settings', 'notice', 'mail'].includes(state.mode);
    this.expressions?.configure(inactive ? null : state.stage, !inactive && !paused && state.mode === 'idle' && !state.speech && !state.blessing, inactive || paused, Boolean(state.speech || state.blessing || ['watering', 'growing'].includes(state.mode)));
  }

  private commit(patch: Partial<GameSave>) {
    const save = { ...this.snapshot.save, ...patch, updatedAt: this.time.now() };
    this.saves.write(save);
    this.update({ save, saveStatus: this.saves.status });
  }

  private markRead(entry: DialogueEntry) {
    const event = this.snapshot.event;
    const save = this.snapshot.save;
    this.commit({
      playedDialogues: [...new Set([...save.playedDialogues, entry.id])],
      pendingWaterings: event?.type === 'watering' ? save.pendingWaterings.filter((pending) => `watering-${pending.id}` !== event.id) : save.pendingWaterings,
      pendingDialogues: event?.type === 'dialogue' ? save.pendingDialogues.map((pending) => `dialogue-${pending.id}` === event.id && pending.lines[pending.cursor] === entry.id ? { ...pending, cursor: pending.cursor + 1 } : pending) : save.pendingDialogues,
      visitLines: event?.type === 'visit' && save.visitLines[event.id]?.dialogueId === entry.id ? { ...save.visitLines, [event.id]: { ...save.visitLines[event.id], read: true } } : event?.type === 'visit-followup' && save.visitLines[event.visitId]?.followup?.dialogueId === entry.id ? { ...save.visitLines, [event.visitId]: { ...save.visitLines[event.visitId], followup: { ...save.visitLines[event.visitId].followup!, read: true } } } : save.visitLines,
    });
  }

  private prepareSpeech(entry: DialogueEntry, start: () => void) {
    const event = this.snapshot.event;
    const pending = event?.type === 'dialogue' ? this.snapshot.save.pendingDialogues.find((item) => `dialogue-${item.id}` === event.id) : undefined;
    if (pending?.kind !== 'wish' || this.snapshot.stage !== 'G' || this.snapshot.reviewStage) { start(); return; }
    const reduced = this.systemReducedMotion || this.snapshot.save.settings.reducedMotion;
    const completed = () => {
      if (this.snapshot.event?.id !== event?.id) return;
      this.commit({ pendingDialogues: this.snapshot.save.pendingDialogues.map((item) => item.id === pending.id ? { ...item, celebrationComplete: true } : item) });
    };
    if (entry.id === pending.lines[0]) {
      if (!pending.celebrationComplete) this.birthday.start(pending.id, 'gifting', reduced, completed);
    } else if (!pending.celebrationComplete) {
      if (!this.birthday.wait(pending.id, start)) this.birthday.start(pending.id, 'shower', reduced, () => { completed(); start(); });
      return;
    }
    start();
  }

  private later(callback: () => void, delay: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (this.active) callback(); }, delay);
    this.timers.add(timer);
  }

  private cancelTimers() {
    this.pendingRainSound = false;
    this.summonedAranara = null; this.secretBlessed.clear();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.speech.stop();
    this.birthday.stop();
    this.expressions.reset();
    this.update({ blessing: null });
    this.awakening.clear();
    this.waking.stop(); this.update({ waking: null });
    this.cultivation.clear(); this.panelResumeMode = 'idle';
    this.planting.clear(); this.update({ seedPhase: this.snapshot.save.seedPlanted ? null : 'arriving' });
    this.dialogueIdle.clear(); this.idleStage = null;
    this.loading.stop(); this.update({ stageLoading: null });
    this.loadingSceneReady = false; this.loadingArtworkReady = false;
    this.dewLifetimes.forEach((timer) => timer.clear()); this.dewLifetimes.clear();
    this.rewardLifetimes.forEach((timer) => timer.clear()); this.rewardLifetimes.clear();
    this.dewFlights.forEach((timer) => timer.clear()); this.dewFlights.clear();
    this.burstLifetimes.forEach((timer) => timer.clear()); this.burstLifetimes.clear();
    this.encounters.clear();
  }

  start() {
    if (this.active) return;
    this.active = true;
    if (this.snapshot.stageLoading?.phase === 'cover') this.emitSound('transition');
    if (!this.suspended) this.restoringScene = false;
    this.heartbeat = setInterval(() => this.tick(), 1000);
    this.syncPresentationPause();
    this.scheduleDew();
    this.reconcile();
  }

  stop() {
    this.active = false;
    this.forestEntered = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.cancelTimers();
    this.queue = [];
    this.update({ event: null, dewParticles: [], rewardBursts: [], mode: ['watering', 'growing', 'ending', 'loading', 'waking', 'mail'].includes(this.snapshot.mode) ? 'idle' : this.snapshot.mode });
    this.refreshProgress(true);
  }

  private syncPresentationPause() {
    const presentationPaused = this.suspended || ['intro', 'journal', 'settings', 'notice', 'mail', 'loading', 'waking'].includes(this.snapshot.mode);
    this.loading.setPaused(!this.active || this.suspended);
    this.waking.setPaused(!this.active || this.suspended);
    this.birthday.setPaused(!this.active || presentationPaused);
    this.speech.setPaused(presentationPaused);
    this.awakening.setPaused(presentationPaused);
    this.cultivation.setPaused(!this.active || presentationPaused);
    this.planting.setPaused(!this.active || presentationPaused);
    this.dewLifetimes.forEach((timer) => timer.setPaused(!this.active || presentationPaused));
    this.rewardLifetimes.forEach((timer) => timer.setPaused(!this.active || presentationPaused));
    this.dewFlights.forEach((timer) => timer.setPaused(!this.active || presentationPaused));
    this.burstLifetimes.forEach((timer) => timer.setPaused(!this.active || presentationPaused));
    this.update({ presentationPaused });
    this.syncEncounters();
    this.syncDialogueIdle();
  }

  private syncEncounters() {
    this.encounters.configure(this.active && this.snapshot.save.introSeen && !this.snapshot.reviewStage && !['intro', 'ending', 'waking'].includes(this.snapshot.mode) && (this.snapshot.stage !== 'A' || this.forestEntered) ? this.snapshot.stage : null, !this.canExplore());
  }

  setSuspended(suspended: boolean) {
    if (suspended) this.pendingRainSound = false;
    this.suspended = suspended;
    if (this.active && !suspended) this.restoringScene = false;
    this.syncPresentationPause();
    if (!suspended) this.tick();
  }

  private refreshProgress(restore = false) {
    const eligible = getActiveStage(this.snapshot.save, this.time);
    const restoreScene = restore || this.restoringScene && this.suspended && !this.snapshot.stageLoading;
    const stage = restoreScene ? getSceneStage(this.snapshot.save, this.time) : stageOrder(eligible) < stageOrder(this.snapshot.stage) ? eligible : this.snapshot.stage;
    const allowedGrowth = Math.min(this.snapshot.save.growth, this.time.getGate().cap, STAGES[stage].growth.end);
    const growth = this.snapshot.mode === 'watering' && !restoreScene ? Math.min(this.snapshot.growth, allowedGrowth) : allowedGrowth;
    this.update({ stage, growth, now: this.time.now() });
    this.syncEncounters();
    this.syncDialogueIdle();
  }

  tick() {
    if (!this.time.isOpen('A')) {
      if (this.snapshot.mode !== 'intro') {
        this.resumeAfterUnlock = this.snapshot.save.introSeen;
        this.cancelTimers(); this.queue = []; this.welcomed = false; this.forestEntered = false;
        this.update({ mode: 'intro', event: null, reviewStage: null, dewParticles: [], rewardBursts: [] });
        this.syncPresentationPause();
        if (this.active) this.scheduleDew();
      }
      this.refreshProgress();
      return;
    }
    if (this.snapshot.mode === 'intro' && this.resumeAfterUnlock) {
      this.resumeAfterUnlock = false;
      this.refreshProgress(true);
      this.update({ mode: 'idle', message: '' });
      this.syncPresentationPause();
    }
    const previousGrowth = this.snapshot.growth;
    this.refreshProgress();
    const event = this.snapshot.event;
    const invalidEvent = event && !this.eventOpen(event);
    const invalidLoading = this.snapshot.stageLoading && stageOrder(getActiveStage(this.snapshot.save, this.time)) < stageOrder(this.snapshot.stageLoading.to);
    const invalidWaking = this.snapshot.waking && getActiveStage(this.snapshot.save, this.time) !== 'G';
    if ((previousGrowth > this.snapshot.growth || invalidEvent || invalidLoading || invalidWaking) && this.snapshot.mode !== 'intro') {
      this.cancelTimers();
      this.queue = [];
      this.update({ mode: ['journal', 'settings', 'notice'].includes(this.snapshot.mode) ? this.snapshot.mode : 'idle', event: null, reviewStage: null, dewParticles: [] });
      this.refreshProgress(true);
      this.syncPresentationPause();
      if (this.active) this.scheduleDew();
    }
    this.reconcile();
  }

  enterDream() {
    if (this.snapshot.mode !== 'intro') return false;
    if (!this.time.isOpen('A')) { this.notify('梦境尚未开启，请稍后再来。'); return false; }
    this.resumeAfterUnlock = false;
    this.commit({ introSeen: true });
    this.update({ mode: 'idle', message: '' });
    this.syncPresentationPause();
    this.reconcile();
    return true;
  }

  sceneEntranceReady(stage: StageId) {
    if (!this.active || stage !== 'A' || this.snapshot.stage !== stage || this.snapshot.mode === 'intro' || this.forestEntered) return;
    this.forestEntered = true;
    if (!this.snapshot.save.seedPlanted) this.update({ seedPhase: 'waiting' });
    this.reconcile();
  }

  plantSeed() {
    if (!this.active || this.suspended || this.snapshot.mode !== 'idle' || this.snapshot.stage !== 'A' || !this.time.isOpen('A') || !this.forestEntered || this.snapshot.save.seedPlanted || this.snapshot.seedPhase !== 'waiting') return false;
    this.activity(); this.update({ seedPhase: 'falling' });
    const reduced = this.systemReducedMotion || this.snapshot.save.settings.reducedMotion;
    this.schedulePlanting(reduced);
    return true;
  }

  private schedulePlanting(reduced: boolean) {
    this.planting.schedule(() => {
      if (!this.active || !this.time.isOpen('A') || this.snapshot.stage !== 'A' || this.snapshot.save.seedPlanted) return;
      this.commit({ seedPlanted: true }); this.update({ seedPhase: null });
      this.syncEncounters(); this.syncDialogueIdle(); this.reconcile();
    }, reduced ? SEED_RULES.reducedFallMs : SEED_RULES.fallMs);
  }

  notify(message: string) { this.update({ message }); }

  presentGrowth() {
    if (this.snapshot.mode !== 'idle') return;
    this.update({ mode: 'growing', growthRevision: this.snapshot.growthRevision + 1 });
    this.cultivation.schedule(() => { this.update({ mode: 'idle' }); this.reconcile(); }, this.duration(GAME_RULES.growingMs));
  }

  requestVisit() {
    const stage = this.snapshot.stage;
    if (stage === 'G' || !this.snapshot.save.seedPlanted || !this.time.isOpen(stage)) return;
    this.scheduleVisit(stage);
    this.reconcile();
  }

  talkToCompanion() {
    const visit = this.companionVisit;
    if (!visit || !this.canExplore() || this.snapshot.reviewStage || !this.snapshot.companionCanTalk || visit.stage !== this.snapshot.stage) return false;
    const save = this.snapshot.save;
    const reserved = Object.values(save.visitLines).flatMap((line) => [line.dialogueId, ...(line.followup ? [line.followup.dialogueId] : [])]);
    const queued = [...this.queue, ...(this.snapshot.event ? [this.snapshot.event] : [])].flatMap((event) => event.type === 'secret-visit' || event.type === 'visit-followup' ? [event.dialogue.id] : []);
    const selected = drawUnplayedDialogue(save.dialogueDecks, `${visit.stage}/nahida`, [...save.playedDialogues, ...reserved, ...queued], this.random);
    const expression = pickExpression(VISIT_EXPRESSION_CHOICES, this.random);
    if (!selected || expression === undefined || !this.speech.reserveFollowup()) return false;
    const line = save.visitLines[visit.id];
    this.commit({ dialogueDecks: selected.decks, ...(line ? { visitLines: { ...save.visitLines, [visit.id]: { ...line, followup: { dialogueId: selected.entry.id, expression, read: false } } } } : {}) });
    this.enqueue({ id: `${visit.id}-followup`, type: 'visit-followup', stage: visit.stage, visitId: visit.id, dialogue: selected.entry, expression });
    this.activity();
    this.reconcile();
    return true;
  }

  private scheduleVisit(stage: DreamStageId, guaranteed = false, watering: Partial<GameSave> = {}) {
    const id = stageVisitIds(stage).find((id) => !this.snapshot.save.completedVisits.includes(id) && !this.snapshot.save.pendingVisits.includes(id) && this.snapshot.event?.id !== id);
    if (!id) return false;
    const selected = drawDialogue(this.snapshot.save.dialogueDecks, `${stage}/nahida`, this.random);
    this.commit({ ...watering, dialogueDecks: selected.decks, visitLines: { ...this.snapshot.save.visitLines, [id]: { dialogueId: selected.entry.id, read: false } }, pendingVisits: [...this.snapshot.save.pendingVisits, id], visitPositions: { ...this.snapshot.save.visitPositions, [id]: this.random() < 0.5 ? 0 : 1 }, guaranteedVisits: guaranteed ? [...this.snapshot.save.guaranteedVisits, id] : this.snapshot.save.guaranteedVisits });
    this.enqueue({ id, type: 'visit', stage });
    return true;
  }

  private atGrowthCap(stage: DreamStageId, growth: number) {
    const next = DREAM_STAGES[DREAM_STAGES.indexOf(stage) + 1];
    return Boolean(next && !this.time.isOpen(next) && growth >= STAGES[stage].growth.end);
  }

  private nextDialogueId() {
    const occupied = new Set([...this.snapshot.save.pendingWaterings, ...this.snapshot.save.pendingDialogues].map((entry) => entry.id));
    let id = this.snapshot.save.dialogueSequence >= Number.MAX_SAFE_INTEGER ? 1 : this.snapshot.save.dialogueSequence + 1;
    while (occupied.has(id)) id = id >= Number.MAX_SAFE_INTEGER ? 1 : id + 1;
    return id;
  }

  private respondDream(stage: DreamStageId, watering: Partial<GameSave> = {}, clicked = false) {
    const save = this.snapshot.save;
    const growth = watering.growth ?? save.growth;
    const capped = this.atGrowthCap(stage, growth);
    const ids = stageVisitIds(stage);
    const seen = ids.some((id) => save.completedVisits.includes(id) || save.pendingVisits.includes(id));
    const counts = save.dialogueCounts[stage] ?? { story: 0, mechanism: 0 };
    const remaining = visitGrowthCap(stage, this.time.getGate().cap) - growth;
    const guaranteed = !seen && remaining > 0 && remaining <= GAME_RULES.growthPerWatering;
    const visitAllowed = !clicked && !capped && remaining > 0 && this.time.isOpen(stage) && ids.some((id) => !save.completedVisits.includes(id) && !save.pendingVisits.includes(id));
    let category = dreamDialogueCategory(this.random(), { visitAllowed, guaranteed, capped, ...counts });
    if (category === 'visit' && this.scheduleVisit(stage, guaranteed, watering)) return;
    if (category === 'visit') category = 'normal';
    const selected = drawDialogue(save.dialogueDecks, `${category === 'normal' || category === 'story' ? stage : 'shared'}/${category}`, this.random);
    const id = this.nextDialogueId();
    this.commit({ ...watering, dialogueDecks: selected.decks, dialogueSequence: id, dialogueCounts: category === 'story' || category === 'mechanism' ? { ...save.dialogueCounts, [stage]: { ...counts, [category]: counts[category] + 1 } } : save.dialogueCounts, pendingWaterings: [...save.pendingWaterings, { id, stage, dialogueId: selected.entry.id, category }] });
    this.enqueueWaterings();
  }

  private queueDialogue(stage: StageId, kind: PendingDialogueKind, keys: string[], from?: DreamStageId) {
    const save = this.snapshot.save;
    let decks = save.dialogueDecks;
    const lines = keys.map((key) => { const selected = drawDialogue(decks, key, this.random); decks = selected.decks; return selected.entry.id; });
    const id = this.nextDialogueId();
    const pendingDialogues = save.pendingDialogues.filter((entry) => kind !== 'wish' || entry.kind !== 'idle' || this.snapshot.event?.id === `dialogue-${entry.id}`);
    this.commit({ dialogueDecks: decks, dialogueSequence: id, pendingDialogues: [...pendingDialogues, { id, stage, kind, lines, cursor: 0, ...(from ? { from } : {}) }] });
  }

  activity() {
    if (!this.active || !this.canExplore() || this.snapshot.reviewStage) return;
    this.armDialogueIdle();
  }

  setSpeechSegments = (sequence: number, parts: string[]) => this.speech.setSegments(sequence, parts);
  revealExpression = (sequence: number, visible: number) => this.speech.revealExpression(sequence, visible);
  previewExpression(asset?: number) {
    const state = this.snapshot;
    if (!this.active || !this.canExplore() || state.mode !== 'idle' || state.reviewStage || state.speech || state.blessing || state.stage === 'A' && !this.forestEntered) return false;
    const selected = asset ?? pickExpression(state.stage === 'G' ? VISIT_EXPRESSION_CHOICES : TREE_EXPRESSIONS[state.stage] ?? [], this.random);
    if (selected === undefined || !EXPRESSION_ASSETS[selected]) return false;
    this.expressions.show(selected, state.stage === 'G' ? 'nahida' : 'tree');
    return true;
  }

  expressionReady = (id: number) => this.expressions.ready(id);
  dismissExpression = (id: number) => this.expressions.dismiss(id);
  hoverSpeech = (sequence: number, hovered: boolean) => { if (!hovered || this.canExplore()) this.speech.setHovered(sequence, hovered); };

  private armDialogueIdle() {
    if (this.snapshot.stage === 'G' && this.snapshot.save.pendingDialogues.some((entry) => entry.kind === 'wish')) {
      this.dialogueIdle.clear(); this.idleStage = null;
      return;
    }
    this.idleStage = this.snapshot.stage;
    this.dialogueIdle.schedule(() => {
      if (!this.active || this.snapshot.reviewStage) return;
      const stage = this.snapshot.stage;
      if (!this.snapshot.save.pendingDialogues.some((entry) => entry.kind === 'idle')) this.queueDialogue(stage, 'idle', [stage === 'G' ? 'G/nahida' : 'shared/idle']);
      this.armDialogueIdle();
      this.reconcile();
    }, this.snapshot.stage === 'G' ? DIALOGUE_RULES.realityIdleMs : DIALOGUE_RULES.dreamIdleMs);
  }

  private syncDialogueIdle() {
    if (!this.active || !this.snapshot.save.introSeen || !this.snapshot.save.seedPlanted || this.snapshot.reviewStage || ['intro', 'ending', 'waking'].includes(this.snapshot.mode) || this.snapshot.stage === 'A' && !this.forestEntered) {
      this.dialogueIdle.clear(); this.idleStage = null;
      return;
    }
    if (this.idleStage !== this.snapshot.stage) this.armDialogueIdle();
    this.dialogueIdle.setPaused(this.snapshot.presentationPaused || this.suspended);
  }

  private ensureVisitLine(stage: DreamStageId, id: string) {
    if (this.snapshot.save.visitLines[id]) return;
    const selected = drawDialogue(this.snapshot.save.dialogueDecks, `${stage}/nahida`, this.random);
    const legacy = [0, 1].map((index) => `nahida-${stage}-${id.endsWith('-2') ? 'return-' : ''}${index}`);
    this.commit({ dialogueDecks: selected.decks, visitLines: { ...this.snapshot.save.visitLines, [id]: { dialogueId: selected.entry.id, read: legacy.every((line) => this.snapshot.save.playedDialogues.includes(line)) } } });
  }

  private bless(phase: 'channel' | 'bloom' | 'end') {
    const event = this.snapshot.event;
    if (phase === 'end') { this.update({ blessing: null }); return; }
    if (event?.type !== 'visit' && event?.type !== 'secret-visit' || event.stage === 'G' || !this.time.isOpen(event.stage)) return;
    const extra = event.type === 'secret-visit';
    if (phase === 'bloom' && !(extra ? this.secretBlessed.has(event.id) : this.snapshot.save.blessedVisits.includes(event.id))) {
      const save = this.snapshot.save;
      if (extra) this.secretBlessed.add(event.id);
      const growth = visitGrowth(event.stage, save.growth, this.time.getGate().cap);
      const animated = treeGrowthDuration(this.snapshot.growth, growth) > 0;
      this.commit({ growth, ...this.boundaryPatch(event.stage, growth), blessedVisits: extra ? save.blessedVisits : [...save.blessedVisits, event.id] });
      this.refreshProgress();
      if (animated) this.update({ growthRevision: this.snapshot.growthRevision + 1 });
    }
    this.update({ blessing: { id: event.id, stage: event.stage, phase } });
  }

  private canExplore() { return !this.suspended && this.snapshot.save.seedPlanted && this.time.isOpen('A') && ['idle', 'watering', 'growing'].includes(this.snapshot.mode); }

  private enqueueWaterings() {
    for (const pending of this.snapshot.save.pendingWaterings) {
      const dialogue = dialogueEntry(pending.dialogueId);
      if (dialogue) this.enqueue({ id: `watering-${pending.id}`, type: 'watering', stage: pending.stage, dialogue });
    }
  }

  private interruptTreeReplies() {
    const save = this.snapshot.save;
    const skippedDialogues = save.pendingDialogues.filter((pending) => pending.stage !== 'G' && (pending.kind === 'welcome' || pending.kind === 'idle'));
    const skipped = new Set([...save.pendingWaterings.map((pending) => `watering-${pending.id}`), ...skippedDialogues.map((pending) => `dialogue-${pending.id}`)]);
    if (this.snapshot.event && skipped.has(this.snapshot.event.id) && this.speech.interruptTree()) this.update({ event: null });
    this.queue = this.queue.filter((event) => !skipped.has(event.id));
    if (skipped.size) this.commit({ pendingWaterings: [], pendingDialogues: save.pendingDialogues.filter((pending) => !skipped.has(`dialogue-${pending.id}`)) });
  }

  private interruptRealityReplies() {
    const save = this.snapshot.save;
    const skipped = new Set(save.pendingDialogues.filter((pending) => pending.stage === 'G' && (pending.kind === 'reality' || pending.kind === 'idle')).map((pending) => `dialogue-${pending.id}`));
    if (this.snapshot.event && skipped.has(this.snapshot.event.id) && this.speech.interrupt('nahida')) {
      if (this.snapshot.expression?.anchor === 'nahida') this.expressions.dismiss();
      this.update({ event: null });
    }
    this.queue = this.queue.filter((event) => !skipped.has(event.id));
    if (skipped.size) this.commit({ pendingDialogues: save.pendingDialogues.filter((pending) => !skipped.has(`dialogue-${pending.id}`)) });
  }

  private playWateringReply() {
    if (this.snapshot.event || this.speech.busy) return;
    const index = this.queue.findIndex((event) => event.type === 'watering' && event.stage === this.snapshot.stage);
    const event = index < 0 ? undefined : this.queue.splice(index, 1)[0];
    if (event?.type !== 'watering') return;
    this.update({ event });
    this.speech.start([event.dialogue], 'tree', () => this.completeEvent(event.id));
  }

  private scheduleDew() {
    this.later(() => { this.spawnDew(); this.scheduleDew(); }, GAME_RULES.spawnMin + this.random() * (GAME_RULES.spawnMax - GAME_RULES.spawnMin));
  }

  setDewObstacles(blocked: readonly DewObstacle[]) {
    if (JSON.stringify(this.dewObstacles) === JSON.stringify(blocked)) return;
    this.dewObstacles = blocked; this.setDewViewport(this.dewViewport, true);
  }

  setDewViewport(viewport: DewViewport, force = false) {
    if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || !Number.isFinite(viewport.scale) || viewport.width <= 0 || viewport.height <= 0 || viewport.scale <= 0) return;
    if (!force && Object.keys(viewport).every((key) => viewport[key as keyof DewViewport] === this.dewViewport[key as keyof DewViewport])) return;
    this.dewViewport = { ...viewport, blocked: this.dewObstacles }; viewport = this.dewViewport;
    if (viewport.width <= 900 && viewport.height > viewport.width) return;
    const range = STAGES[this.snapshot.stage].dew.region;
    const particles: GameSnapshot['dewParticles'] = [];
    const storm = this.snapshot.dewParticles.filter((particle) => particle.kind === 'rainstorm' && !particle.collected);
    for (const particle of this.snapshot.dewParticles.filter((entry) => entry.kind !== 'rainstorm')) {
      const reward = particle.kind === 'reward'; const region: [number, number] = reward ? [0, 100] : range;
      const position = particle.collected || isDewPositionSafe(particle, viewport, region, particles, reward) ? particle : placeDew(viewport, region, particles, this.random, reward);
      if (position) particles.push({ ...particle, x: position.x, y: position.y });
      else if (reward) {
        const target = particles.find((entry) => entry.kind === 'reward' && !entry.collected && !entry.expiring);
        if (target) { target.portions = [...(target.portions ?? []), ...(particle.portions ?? [])]; target.value += particle.value; }
        else particles.push({ ...particle, portions: particle.portions?.slice() });
      }
    }
    const positions = storm.length ? placeRainstorm(viewport, particles, this.random) : [];
    storm.forEach((particle, index) => particles.push({ ...particle, ...(positions[index] ?? { x: particle.x, y: particle.y }) }));
    this.update({ dewParticles: particles });
  }

  spawnDew() {
    if (!this.canExplore() || this.snapshot.stage === 'G' || this.snapshot.reviewStage) return;
    if (this.snapshot.dewParticles.filter((particle) => !particle.kind).length >= GAME_RULES.maxParticles) return;
    const region = STAGES[this.snapshot.stage].dew.region;
    const position = placeDew(this.dewViewport, region, this.snapshot.dewParticles, this.random);
    if (!position) return;
    const particle = {
      id: ++this.particleSequence, ...position,
      value: randomDewValue(this.random), collected: false,
    };
    this.update({ dewParticles: [...this.snapshot.dewParticles, particle] });
    const timer = new PausableTimer();
    timer.setPaused(!this.active || this.snapshot.presentationPaused);
    this.dewLifetimes.set(particle.id, timer);
    timer.schedule(() => {
      this.update({ dewParticles: this.snapshot.dewParticles.map((entry) => entry.id === particle.id ? { ...entry, expiring: true } : entry) });
      timer.schedule(() => this.update({ dewParticles: this.snapshot.dewParticles.filter((entry) => entry.id !== particle.id) }), GAME_RULES.dewFadeMs);
    }, GAME_RULES.dewLifetimeMs);
  }

  private signalDew(reason: 'insufficient' | 'full') {
    this.update({ dewFeedback: reason, dewFeedbackRevision: this.snapshot.dewFeedbackRevision + 1 });
  }

  spawnAranara(slot?: number) { return this.canExplore() && !this.snapshot.reviewStage && this.encounters.spawn(slot); }
  setAranaraSlots(slots: readonly number[] | null) { this.encounters.setAvailable(slots); }

  interactAranara(id: number | string, position: { x: number; y: number }) {
    if (!this.canExplore() || this.snapshot.reviewStage || this.snapshot.stage === 'G' || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
    const fixed = typeof id === 'string';
    if (fixed ? this.snapshot.stage !== 'F' || !FESTIVAL_ARANARA.includes(id as typeof FESTIVAL_ARANARA[number]) || this.snapshot.save.claimedAranara.includes(id) : !this.encounters.has(id)) return false;
    if (!this.rewardDew(position)) return false;
    if (fixed) this.commit({ claimedAranara: [...this.snapshot.save.claimedAranara, id] });
    else this.encounters.leave(id, true);
    this.emitSound('aranara-jump');
    return true;
  }

  private rewardDew(position: { x: number; y: number }) {
    const batch = ++this.rewardSequence;
    const particles = this.snapshot.dewParticles.slice();
    const added: GameSnapshot['dewParticles'] = [];
    for (let index = 0; index < ENCOUNTER_RULES.rewardParticles; index++) {
      const point = placeRewardDew(this.dewViewport, position, [...particles, ...added], this.random, index);
      if (!point) break;
      added.push({ id: ++this.particleSequence, ...point, kind: 'reward', value: 0, portions: [], collected: false, launch: { ...position } });
    }
    const targets = added.length ? added : particles.filter((particle) => particle.kind === 'reward' && !particle.collected && !particle.expiring).map((particle) => ({ ...particle, portions: particle.portions?.slice() }));
    if (!targets.length) return false;
    const values = targets.map(() => 0);
    for (let index = 0; index < ENCOUNTER_RULES.rewardParticles; index++) values[index % targets.length] += randomDewValue(this.random);
    for (let index = 0; index < targets.length; index++) {
      const value = values[index];
      targets[index].value += value; targets[index].portions = [...(targets[index].portions ?? []), { batch, value }];
    }
    const merged = added.length ? [...particles, ...targets] : particles.map((particle) => targets.find((target) => target.id === particle.id) ?? particle);
    this.update({ dewParticles: merged, rewardBursts: [...this.snapshot.rewardBursts, { id: batch, x: Math.max(0, Math.min(100, position.x)), y: Math.max(0, Math.min(100, position.y)) }] });
    for (const particle of added) {
      const flight = new PausableTimer(); this.dewFlights.set(particle.id, flight); flight.setPaused(this.snapshot.presentationPaused);
      flight.schedule(() => { this.dewFlights.delete(particle.id); this.update({ dewParticles: this.snapshot.dewParticles.map((entry) => entry.id === particle.id ? { ...entry, launch: undefined } : entry) }); }, ENCOUNTER_RULES.flightMs);
    }
    const timer = new PausableTimer(); timer.setPaused(this.snapshot.presentationPaused); this.rewardLifetimes.set(batch, timer);
    timer.schedule(() => {
      this.rewardLifetimes.delete(batch);
      this.update({ dewParticles: this.snapshot.dewParticles.map((particle) => {
        if (!particle.portions?.some((portion) => portion.batch === batch)) return particle;
        const portions = particle.portions.filter((portion) => portion.batch !== batch); const value = portions.reduce((total, portion) => total + portion.value, 0);
        if (!value) {
          const fade = new PausableTimer(); this.dewLifetimes.set(particle.id, fade);
          fade.schedule(() => this.update({ dewParticles: this.snapshot.dewParticles.filter((entry) => entry.id !== particle.id) }), GAME_RULES.dewFadeMs);
        }
        return { ...particle, portions, value, expiring: value === 0 };
      }) });
    }, ENCOUNTER_RULES.rewardLifetimeMs);
    const burst = new PausableTimer(); this.burstLifetimes.set(batch, burst);
    burst.schedule(() => { this.burstLifetimes.delete(batch); this.update({ rewardBursts: this.snapshot.rewardBursts.filter((entry) => entry.id !== batch) }); }, 1300);
    return true;
  }

  collectDew(id: number) {
    if (!this.canExplore() || this.snapshot.reviewStage || this.snapshot.stage === 'G') return false;
    this.activity();
    const particle = this.snapshot.dewParticles.find((entry) => entry.id === id && !entry.collected && !entry.expiring && !entry.launch);
    if (!particle) return false;
    if (this.snapshot.save.dew >= GAME_RULES.dewCapacity) { this.signalDew('full'); return false; }
    const amount = Math.min(GAME_RULES.dewCapacity - this.snapshot.save.dew, particle.value);
    let remaining = particle.kind === 'reward' ? amount : particle.value;
    const portions = particle.portions?.map((portion) => { const consumed = Math.min(remaining, portion.value); remaining -= consumed; return { ...portion, value: portion.value - consumed }; }).filter((portion) => portion.value > 0);
    const value = particle.kind ? particle.value - amount : 0;
    if (!value) { this.dewLifetimes.get(id)?.clear(); this.dewLifetimes.delete(id); }
    this.commit({ dew: this.snapshot.save.dew + amount });
    this.update({ dewFeedback: null, dewParticles: this.snapshot.dewParticles.map((entry) => entry.id === id ? { ...entry, value, portions, collected: value === 0 } : entry) });
    this.emitSound('dew');
    if (!value) this.later(() => this.update({ dewParticles: this.snapshot.dewParticles.filter((entry) => entry.id !== id) }), 500);
    return true;
  }

  water() {
    if (this.snapshot.mode !== 'idle' || this.suspended || this.snapshot.reviewStage || this.snapshot.stage === 'G' || !this.snapshot.save.seedPlanted) return false;
    this.activity();
    const stage = this.snapshot.stage;
    if (getActiveStage(this.snapshot.save, this.time) !== stage) return false;
    const next = DREAM_STAGES[DREAM_STAGES.indexOf(stage) + 1];
    const advanceOnly = this.snapshot.growth >= STAGES[stage].growth.end && (!next || this.time.isOpen(next));
    const result = calculateWatering(this.snapshot.growth, this.snapshot.save.dew, Math.min(STAGES[stage].growth.end, this.time.getGate().cap), advanceOnly);
    if (!result.ok) {
      if (result.reason === 'insufficient') this.signalDew('insufficient');
      else {
        this.interruptTreeReplies();
        this.update({ mode: 'watering' });
        this.emitSound('water');
        this.respondDream(stage);
        this.enqueueWaterings();
        this.playWateringReply();
        this.cultivation.schedule(() => { this.update({ mode: 'idle' }); this.reconcile(); }, this.duration(GAME_RULES.wateringMs));
      }
      return false;
    }
    this.interruptTreeReplies();
    this.update({ mode: 'watering', message: '', dewFeedback: null });
    this.emitSound('water');
    const growingMs = treeGrowthDuration(this.snapshot.growth, result.growth);
    const animated = growingMs > 0;
    const count = (this.snapshot.save.wateringCounts[stage] ?? 0) + 1;
    const watering = { growth: result.growth, dew: result.dew, wateringCounts: { ...this.snapshot.save.wateringCounts, [stage]: count }, ...this.boundaryPatch(stage, result.growth, true) };
    this.respondDream(stage, watering);
    this.enqueueWaterings();
    this.playWateringReply();
    this.refreshProgress();
    this.cultivation.schedule(() => {
      this.update({ mode: animated ? 'growing' : 'idle', ...(animated ? { growthRevision: this.snapshot.growthRevision + 1 } : {}) });
      this.refreshProgress();
      if (animated) this.cultivation.schedule(() => { this.update({ mode: 'idle' }); this.reconcile(); }, this.duration(growingMs));
      else this.reconcile();
    }, this.duration(GAME_RULES.wateringMs));
    return true;
  }

  private duration(milliseconds: number) { return this.snapshot.save.settings.reducedMotion ? Math.min(milliseconds, 100) : milliseconds; }

  private isDone(event: QueuedEvent) {
    if (event.type === 'secret-visit') return false;
    if (event.type === 'visit-followup') return this.snapshot.save.visitLines[event.visitId]?.followup?.read === true;
    if (event.type === 'dialogue') return !this.snapshot.save.pendingDialogues.some((pending) => `dialogue-${pending.id}` === event.id && pending.kind !== 'night');
    if (event.type === 'visit') return this.snapshot.save.completedVisits.includes(event.id);
    if (event.type === 'transition') return this.snapshot.save.playedDialogues.includes(event.id);
    if (event.type === 'watering') return !this.snapshot.save.pendingWaterings.some((pending) => `watering-${pending.id}` === event.id);
    return true;
  }

  private eventOpen(event: QueuedEvent) {
    if (event.type === 'secret-visit' || event.type === 'visit-followup') return event.stage === this.snapshot.stage && this.time.isOpen(event.stage);
    if (event.type === 'dialogue') {
      const pending = this.snapshot.save.pendingDialogues.find((entry) => `dialogue-${entry.id}` === event.id);
      if (!pending) return false;
      if (pending.kind === 'transition') return pending.stage === this.snapshot.stage && stageOrder(this.snapshot.save.sceneStage ?? 'A') >= stageOrder(pending.stage);
      if (pending.kind === 'night') return false;
      if (pending.stage === 'G') return this.snapshot.stage === 'G';
      return pending.stage === 'A' || this.time.isOpen(pending.stage);
    }
    return event.type !== 'night' && (event.stage === 'G' || this.time.isOpen(event.stage));
  }

  private enqueue(event: QueuedEvent) {
    if (!this.isDone(event) && this.snapshot.event?.id !== event.id && !this.queue.some((entry) => entry.id === event.id)) this.queue.push(event);
  }

  private boundaryPatch(stage: DreamStageId, growth: number, watered = false): Partial<GameSave> {
    const next = DREAM_STAGES[DREAM_STAGES.indexOf(stage) + 1];
    if (growth < STAGES[stage].growth.end || (next ? !this.time.isOpen(next) : !watered)) return {};
    const save = this.snapshot.save;
    return {
      completedStages: [...new Set([...save.completedStages, stage])],
      watchedStories: stage === 'F' ? save.watchedStories : [...new Set([...save.watchedStories, STAGES[stage].ending.id])],
    };
  }

  private advanceBoundaries() {
    const save = this.snapshot.save;
    const completed = DREAM_STAGES.filter((stage) => stage !== 'F' && this.time.isOpen(stage) && save.growth > STAGES[stage].growth.end);
    const completedStages = [...new Set([...save.completedStages, ...completed])];
    const watchedStories = [...new Set([...save.watchedStories, ...completed.map((stage) => STAGES[stage].ending.id)])];
    if (completedStages.length !== save.completedStages.length || watchedStories.length !== save.watchedStories.length) this.commit({ completedStages, watchedStories });
    this.refreshProgress();
  }

  private reconcile() {
    if (this.summonedAranara === this.snapshot.stage && this.active && this.canExplore() && (this.snapshot.stage !== 'A' || this.forestEntered) && this.encounters.spawn()) this.summonedAranara = null;
    if (!this.active || !this.snapshot.save.seedPlanted || this.snapshot.mode !== 'idle' || this.snapshot.reviewStage || this.suspended || !this.time.isOpen('A') || this.snapshot.stage === 'A' && !this.forestEntered) return;
    const choices = completeLoadingArtChoices(this.snapshot.save.loadingArtChoices);
    if (JSON.stringify(choices) !== JSON.stringify(this.snapshot.save.loadingArtChoices)) this.commit({ loadingArtChoices: choices });
    this.advanceBoundaries();
    if (!this.welcomed) {
      this.welcomed = true;
      if (this.snapshot.stage !== 'G' && !this.snapshot.save.pendingDialogues.some((entry) => ['opening', 'welcome'].includes(entry.kind) && entry.cursor < entry.lines.length)) {
        const initial = this.firstEntry && this.snapshot.stage === 'A';
        this.queueDialogue(this.snapshot.stage, initial ? 'opening' : 'welcome', [initial ? 'A/transition' : 'shared/welcome']);
      }
    }
    const save = this.snapshot.save;
    this.enqueueWaterings();
    const restoredScene = getSceneStage(save, this.time);
    for (const pending of save.pendingDialogues) this.enqueue({ id: `dialogue-${pending.id}`, type: 'dialogue', stage: pending.stage });
    if (this.snapshot.stage !== 'G') {
      for (const stage of this.time.getGate().available) {
        if (stageOrder(stage) > stageOrder(this.snapshot.stage)) continue;
        const ids = stageVisitIds(stage);
        ids.filter((id) => this.snapshot.save.pendingVisits.includes(id)).forEach((id) => { this.ensureVisitLine(stage, id); this.enqueue({ id, type: 'visit', stage }); });
        if (stage === this.snapshot.stage) for (const id of ids) {
          const extra = this.snapshot.save.visitLines[id]?.followup;
          const entry = extra && dialogueEntry(extra.dialogueId);
          if (extra && entry && !extra.read && this.snapshot.save.completedVisits.includes(id)) this.enqueue({ id: `${id}-followup`, type: 'visit-followup', stage, visitId: id, dialogue: entry, expression: extra.expression });
        }
      }
    }
    this.queue = this.queue.filter((entry) => !this.isDone(entry) && this.eventOpen(entry));
    const priority = (event: QueuedEvent) => {
      if (event.type !== 'dialogue') return { watering: 2, visit: 3, 'secret-visit': 3, 'visit-followup': 1.5, transition: 4, night: 4 }[event.type];
      const kind = this.snapshot.save.pendingDialogues.find((entry) => `dialogue-${entry.id}` === event.id)?.kind;
      return kind === 'transition' ? 0 : kind === 'welcome' || kind === 'opening' ? 1 : kind === 'idle' ? 5 : 2;
    };
    this.queue.sort((first, second) => priority(first) - priority(second));
    if (this.speech.busy || this.snapshot.event) return;
    const next = this.queue.findIndex((entry) => entry.type === 'visit-followup' ? this.speech.canVisit || this.companionVisit?.id === entry.visitId && this.snapshot.companion !== 'leave' : entry.type !== 'visit' && entry.type !== 'secret-visit' || this.speech.canVisit);
    const event = next < 0 ? undefined : this.queue.splice(next, 1)[0];
    if (event) {
      const visiting = event.type === 'visit' || event.type === 'secret-visit';
      if (visiting || event.type === 'visit-followup') {
        const position = event.type === 'secret-visit' ? event.position : event.type === 'visit-followup' && this.companionVisit?.id === event.visitId ? this.companionVisit.position : this.snapshot.save.visitPositions[event.type === 'visit-followup' ? event.visitId : event.id] ?? 0;
        this.companionVisit = { id: event.type === 'visit-followup' ? event.visitId : event.id, stage: event.stage as DreamStageId, position };
        this.update({ event, companionPosition: position });
      } else this.update({ event });
      if (event.type === 'visit-followup') {
        this.speech.startFollowup(event.dialogue, event.expression, () => this.completeEvent(event.id));
        return;
      }
      const config = STAGES[event.stage];
      const pending = event.type === 'dialogue' ? this.snapshot.save.pendingDialogues.find((entry) => `dialogue-${entry.id}` === event.id) : undefined;
      const visit = this.snapshot.save.visitLines[event.id];
      const lines = event.type === 'dialogue' ? (pending?.lines.slice(pending.cursor) ?? []).map(dialogueEntry).filter(Boolean) : event.type === 'visit' ? visit && !visit.read ? [dialogueEntry(visit.dialogueId)] : [] : event.type === 'watering' || event.type === 'secret-visit' ? [event.dialogue] : [config.transition];
      this.speech.start(lines, visiting || event.stage === 'G' ? 'nahida' : 'tree', () => this.completeEvent(event.id), visiting);
      return;
    }
    const eligible = getActiveStage(this.snapshot.save, this.time);
    if (stageOrder(eligible) > stageOrder(this.snapshot.stage) && this.speech.canVisit && !this.queue.length) {
      const target = stageOrder(restoredScene) > stageOrder(this.snapshot.stage) ? restoredScene : ([...DREAM_STAGES, 'G'] as const)[stageOrder(this.snapshot.stage) + 1];
      this.beginStageLoading(target);
      return;
    }
    if (this.snapshot.stage === 'F' && this.snapshot.growth >= STAGES.F.growth.end && this.snapshot.save.completedStages.includes('F') && this.time.isOpen('F') && this.speech.canVisit && !this.queue.length) this.beginAwakening();
  }

  private beginStageLoading(to: StageId) {
    this.loadingSceneReady = false; this.loadingArtworkReady = false;
    const from = this.snapshot.stage;
    if (from !== 'G' && !this.snapshot.save.pendingDialogues.some((entry) => entry.kind === 'transition' && entry.from === from && entry.stage === to)) this.queueDialogue(to, 'transition', [transitionDialoguePool(to)], from);
    const artId = getLoadingArt(to, this.snapshot.save.loadingArtChoices[to])?.id;
    this.update({ mode: 'loading', stageLoading: { id: ++this.loadingSequence, from: this.snapshot.stage, to, artId, phase: 'cover', progress: 0 } });
    this.emitSound('transition');
    this.syncPresentationPause();
    this.loading.start(this.snapshot.save.settings.reducedMotion);
  }

  private coveredStage() {
    const loading = this.snapshot.stageLoading;
    if (!loading || stageOrder(getActiveStage(this.snapshot.save, this.time)) < stageOrder(loading.to)) { this.tick(); return; }
    this.update({ stage: loading.to });
    this.refreshProgress();
    this.setDewViewport(this.dewViewport, true);
  }

  stageSceneReady(id: number, stage: StageId) {
    const loading = this.snapshot.stageLoading;
    if (loading?.id === id && loading.to === stage && this.snapshot.stage === stage && loading.phase === 'loading') { this.loadingSceneReady = true; this.tryLoadingReady(); }
  }

  stageArtworkReady(id: number, artId?: string) {
    const loading = this.snapshot.stageLoading;
    if (loading?.id === id && loading.artId === artId) { this.loadingArtworkReady = true; this.tryLoadingReady(); }
  }

  private tryLoadingReady() {
    if (this.loadingSceneReady && this.loadingArtworkReady && this.snapshot.stageLoading?.phase === 'loading') this.loading.sceneReady();
  }

  private finishStageLoading() {
    const loading = this.snapshot.stageLoading;
    if (!loading) return;
    if (stageOrder(getActiveStage(this.snapshot.save, this.time)) < stageOrder(loading.to)) { this.tick(); return; }
    if (needsWakingReveal(loading.from, loading.to, this.snapshot.save.sceneStage)) {
      const reduced = this.systemReducedMotion || this.snapshot.save.settings.reducedMotion;
      const frame = reduced ? { phase: 'final-opening' as const, durationMs: WAKING_REDUCED_MS } : WAKING_SEQUENCE[0];
      this.update({ mode: 'waking', stageLoading: null, waking: { id: loading.id, ...frame, reduced } });
      this.syncPresentationPause();
      this.waking.start(loading.id, reduced);
      return;
    }
    this.commit({ sceneStage: stageOrder(this.snapshot.save.sceneStage ?? loading.to) > stageOrder(loading.to) ? this.snapshot.save.sceneStage : loading.to });
    this.update({ mode: 'idle', stageLoading: null });
    this.syncPresentationPause();
    this.reconcile();
  }

  private finishWaking() {
    if (!this.active || !this.snapshot.waking) return;
    if (getActiveStage(this.snapshot.save, this.time) !== 'G') { this.tick(); return; }
    this.commit({ sceneStage: 'G' });
    this.update({ mode: 'idle', waking: null });
    this.syncPresentationPause();
    this.reconcile();
  }

  setSystemReducedMotion(reduced: boolean) {
    this.systemReducedMotion = reduced;
    if (reduced && this.snapshot.seedPhase === 'falling') this.schedulePlanting(true);
    if (reduced && this.snapshot.waking && !this.snapshot.waking.reduced) this.waking.reduce();
    if (reduced) this.birthday.reduce();
  }

  private completeEvent(id: string) {
    const event = this.snapshot.event;
    if (!event || event.id !== id) return;
    if (!this.eventOpen(event)) { this.tick(); return; }
    const save = this.snapshot.save;
    const pending = event.type === 'dialogue' ? save.pendingDialogues.find((entry) => `dialogue-${entry.id}` === id) : undefined;
    if (event.type === 'dialogue') this.commit({ pendingDialogues: save.pendingDialogues.filter((entry) => `dialogue-${entry.id}` !== id) });
    if (event.type === 'visit') this.commit({ completedVisits: [...new Set([...save.completedVisits, id])], pendingVisits: save.pendingVisits.filter((entry) => entry !== id) });
    this.update({ event: null });
    if (pending?.kind === 'wish') this.activity();
    this.reconcile();
  }

  private beginAwakening() {
    this.update({ mode: 'ending', dewParticles: [] });
    this.syncDialogueIdle();
    this.syncEncounters();
    this.awakening.schedule(() => {
      if (!this.time.isOpen('F')) { this.update({ mode: 'idle' }); this.tick(); return; }
      const save = this.snapshot.save;
      this.commit({ completedStages: [...new Set([...save.completedStages, 'F' as const])], watchedStories: [...new Set([...save.watchedStories, STAGES.F.ending.id])], endingComplete: true });
      this.update({ mode: 'idle' });
      this.refreshProgress();
      this.reconcile();
    }, this.duration(PRESENTATION_RULES.awakeningMs));
  }

  talk() {
    if (!this.canExplore()) return;
    this.activity();
    const stage = this.snapshot.reviewStage ?? this.snapshot.stage;
    if (stage === 'G') {
      this.interruptRealityReplies();
      this.queueDialogue(stage, 'reality', ['G/nahida']);
    }
    else if (this.snapshot.reviewStage) {
      this.speech.interruptTree();
      if (this.speech.busy) return;
      const selected = drawDialogue(this.snapshot.save.dialogueDecks, `${stage}/normal`, this.random);
      this.commit({ dialogueDecks: selected.decks });
      this.speech.start([selected.entry], 'tree', () => this.reconcile());
      return;
    } else {
      this.interruptTreeReplies();
      this.respondDream(stage, {}, true);
    }
    this.reconcile();
  }

  sendWish() {
    if (!this.canExplore() || this.snapshot.stage !== 'G' || this.snapshot.reviewStage) return;
    this.activity();
    if (this.snapshot.save.pendingDialogues.some((entry) => entry.kind === 'wish')) return;
    this.queueDialogue('G', 'wish', ['G/wish', 'G/reply']);
    this.syncDialogueIdle();
    this.reconcile();
  }

  openBirthdayMail() {
    const state = this.snapshot;
    if (!this.active || this.suspended || state.stage !== 'G' || state.reviewStage || state.mode !== 'idle' || state.stageLoading || state.waking || state.birthday || state.save.pendingDialogues.some((entry) => entry.kind === 'wish')) return false;
    this.update({ mode: 'mail', message: '' });
    this.syncPresentationPause();
    return true;
  }

  openPanel(panel: 'journal' | 'settings' | 'notice') {
    const mode = this.snapshot.mode;
    if (!['idle', 'watering', 'growing', 'journal', 'settings', 'notice'].includes(mode)) return;
    if (mode === 'idle' || mode === 'watering' || mode === 'growing') this.panelResumeMode = mode;
    this.activity();
    this.update({ mode: panel, message: '' });
    this.syncPresentationPause();
  }

  closePanel() {
    if (!['journal', 'settings', 'notice', 'mail'].includes(this.snapshot.mode)) return;
    const rainSound = this.pendingRainSound; this.pendingRainSound = false;
    this.update({ mode: this.panelResumeMode, message: '' });
    this.panelResumeMode = 'idle';
    this.syncPresentationPause();
    this.activity();
    if (rainSound) this.emitSound('rainstorm');
    this.reconcile();
  }

  setSettings(settings: Partial<GameSave['settings']>) {
    this.commit({ settings: validateSave({ ...this.snapshot.save, settings: { ...this.snapshot.save.settings, ...settings } }).settings });
    if (settings.textSpeed !== undefined || settings.reducedMotion !== undefined) this.speech.restartLine();
    if (settings.reducedMotion && this.snapshot.waking && !this.snapshot.waking.reduced) this.waking.reduce();
    if (settings.reducedMotion) this.birthday.reduce();
    if (settings.reducedMotion && this.snapshot.seedPhase === 'falling') this.schedulePlanting(true);
  }

  secret(phrase: string) {
    if (this.snapshot.mode !== 'journal') return;
    const command = SECRETS.find((entry) => entry.phrase === phrase.trim());
    if (!command) { this.notify('风还没听懂这句话。'); return; }
    const order = [...DREAM_STAGES, 'G'];
    if (order.indexOf(this.snapshot.stage) < order.indexOf(command.unlockStage) || (command.unlockStage !== 'G' && !this.time.isOpen(command.unlockStage))) { this.notify('回声还没有抵达这里。'); return; }
    this.commit({ unlockedSecrets: [...new Set([...this.snapshot.save.unlockedSecrets, command.id])] });
    this.update({ effects: this.snapshot.effects.includes(command.effect) ? this.snapshot.effects.filter((effect) => effect !== command.effect) : [...this.snapshot.effects, command.effect], message: command.feedback });
  }

  easterEgg(phrase: string): string | null {
    if (!this.active || this.suspended) return null;
    const code = easterCode(phrase);
    if (code === 'nidaha') {
      this.update({ nahidaPlaceholder: !this.snapshot.nahidaPlaceholder });
      return this.snapshot.nahidaPlaceholder ? '她换了一副模样。' : '熟悉的身影回来了。';
    }
    const stage = this.snapshot.stage;
    if (stage === 'G' || this.snapshot.reviewStage || !this.time.isOpen(stage) || !['idle', 'watering', 'growing', 'journal', 'settings', 'notice'].includes(this.snapshot.mode)) return null;
    if (code === 'irminsul') {
      if (!this.snapshot.save.seedPlanted) return null;
      this.update({ proceduralTree: !this.snapshot.proceduralTree });
      return this.snapshot.proceduralTree ? '禁忌的枝叶，在梦中悄悄舒展。' : '世界树恢复了熟悉的模样。';
    }
    if (code === 'aranara') {
      if (stage === 'B' || this.snapshot.encounters.length >= ENCOUNTER_RULES.maximum || this.summonedAranara) return null;
      if (!this.spawnAranara()) this.summonedAranara = stage;
      return '草叶后，传来了窸窣声。';
    }
    if (code === 'nahida') {
      if (this.queue.filter((event) => event.type === 'secret-visit').length >= EASTER_RULES.maximumQueuedVisits) return null;
      const selected = drawDialogue(this.snapshot.save.dialogueDecks, `${stage}/nahida`, this.random);
      this.commit({ dialogueDecks: selected.decks });
      this.enqueue({ id: `secret-visit-${++this.secretVisitSequence}`, type: 'secret-visit', stage, dialogue: selected.entry, position: this.random() < 0.5 ? 0 : 1 });
      this.reconcile();
      return '熟悉的脚步声正在靠近。';
    }
    if (code === 'rainstorm') {
      const retained = this.snapshot.dewParticles.filter((particle) => particle.kind !== 'rainstorm');
      const positions = placeRainstorm(this.dewViewport, retained, this.random);
      if (positions.length !== EASTER_RULES.rainCount) return null;
      const particles = positions.map((position) => ({ id: ++this.particleSequence, ...position, value: randomDewValue(this.random), collected: false, kind: 'rainstorm' as const }));
      this.update({ dewParticles: [...retained, ...particles] });
      if (this.snapshot.presentationPaused) this.pendingRainSound = true;
      else this.emitSound('rainstorm');
      for (const particle of particles) {
        const timer = new PausableTimer(); this.dewLifetimes.set(particle.id, timer); timer.setPaused(this.snapshot.presentationPaused);
        timer.schedule(() => {
          this.update({ dewParticles: this.snapshot.dewParticles.map((entry) => entry.id === particle.id ? { ...entry, expiring: true } : entry) });
          timer.schedule(() => this.update({ dewParticles: this.snapshot.dewParticles.filter((entry) => entry.id !== particle.id) }), GAME_RULES.dewFadeMs);
        }, EASTER_RULES.rainLifetimeMs);
      }
      return '梦露落成了一场细雨。';
    }
    return null;
  }

  review(stage: DreamStageId | null) {
    if (!['journal', 'idle'].includes(this.snapshot.mode)) return;
    if (stage && (!this.snapshot.save.completedStages.includes(stage) || !this.time.isOpen(stage))) return;
    this.speech.stop();
    this.birthday.stop();
    this.queue = [];
    this.update({ reviewStage: stage, mode: 'idle', event: null, blessing: null, dewParticles: [], rewardBursts: [], message: '' });
    this.syncPresentationPause();
    if (!stage) this.reconcile();
  }

  restore(save: GameSave) {
    this.cancelTimers();
    this.queue = [];
    const validated = validateSave(save);
    this.forestEntered = false;
    this.resumeAfterUnlock = validated.introSeen && !this.time.isOpen('A');
    this.commit(validated);
    this.update({ mode: validated.introSeen && this.time.isOpen('A') ? 'idle' : 'intro', event: null, dewParticles: [], rewardBursts: [], effects: [], reviewStage: null, growthRevision: this.snapshot.growthRevision + 1, message: '', dewFeedback: null, seedPhase: validated.seedPlanted ? null : 'arriving' });
    this.refreshProgress(true);
    this.syncPresentationPause();
    if (this.active) this.scheduleDew();
    this.reconcile();
  }

  reset() { this.welcomed = false; this.firstEntry = true; this.update({ nahidaPlaceholder: false, proceduralTree: false }); this.restore(createSave(this.time.now())); }
}
