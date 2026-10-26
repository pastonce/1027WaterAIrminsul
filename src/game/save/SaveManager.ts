import { GAME_RULES } from '../../data/schedule';
import { LEGACY_NIGHT_STORY_ID, STAGES } from '../../data/stages';
import { SECRETS } from '../../data/secrets';
import { DREAM_STAGES } from '../../types/game';
import { stageVisitIds } from '../../data/visits';
import { FESTIVAL_ARANARA } from '../../data/inhabitants';
import { validateLoadingArtChoices } from '../../data/stageLoading';
import { DIALOGUE_ENTRIES, DIALOGUE_POOLS, DIALOGUE_RULES, dialoguePool, transitionDialoguePool } from '../../data/dialogues';
import { SOUND_RULES } from '../../data/sounds';
import { VISIT_EXPRESSION_CHOICES } from '../../data/expressions';
import type { DreamStageId, GameSave, PendingDialogueKind, StageId } from '../../types/game';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEYS = { player: 'irminsul.player.v2', development: 'irminsul.development.v2' };

export function createSave(now = Date.now()): GameSave {
  return {
    version: 2, growthRulesVersion: 2, growth: 0, dew: 0, seed: 1027, introSeen: false, seedPlanted: false, sceneStage: 'A', loadingArtChoices: {},
    completedStages: [], completedVisits: [], pendingVisits: [], visitPositions: {}, guaranteedVisits: [], blessedVisits: [], pendingWaterings: [], watchedStories: [], unlockedSecrets: [], playedDialogues: [], wateringCounts: {}, claimedAranara: [],
    dialogueDecks: {}, dialogueCounts: {}, dialogueSequence: 0, pendingDialogues: [], visitLines: {},
    endingComplete: false, nightComplete: false,
    settings: { sound: true, soundVolume: SOUND_RULES.defaultVolume, music: true, musicVolume: 0.45, reducedMotion: false, textSpeed: 35 }, updatedAt: now,
  };
}

const record = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const bounded = (value: unknown, maximum: number, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.floor(Math.max(0, Math.min(maximum, value))) : fallback;
const validList = (value: unknown, allowed: string[]) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))] : [];

export function validateSave(input: unknown): GameSave {
  const source = record(input);
  if (typeof source.version === 'number' && source.version > 2) throw new Error('future-version');
  const fresh = createSave();
  let growth = typeof source.growth === 'number' && Number.isFinite(source.growth) ? Math.round(Math.max(0, Math.min(STAGES.F.growth.end, source.growth)) * 10) / 10 : 0;
  const legacyCaps = [210, 313, 520, 725, 814, 1027];
  const claimed = validList(source.completedStages, [...DREAM_STAGES]);
  const completedStages: GameSave['completedStages'] = [];
  for (const stage of DREAM_STAGES) {
    const cap = source.growthRulesVersion === 2 ? STAGES[stage].growth.end : Math.min(STAGES[stage].growth.end, legacyCaps[DREAM_STAGES.indexOf(stage)]);
    if (!claimed.includes(stage) || growth < cap) break;
    growth = Math.max(growth, STAGES[stage].growth.end);
    completedStages.push(stage);
  }
  const settings = record(source.settings);
  const musicVolume = typeof settings.musicVolume === 'number' && Number.isFinite(settings.musicVolume) ? Math.max(0, Math.min(1, settings.musicVolume)) : fresh.settings.musicVolume;
  const soundVolume = typeof settings.soundVolume === 'number' && Number.isFinite(settings.soundVolume) ? Math.max(0, Math.min(1, settings.soundVolume)) : fresh.settings.soundVolume;
  const counts = record(source.wateringCounts);
  const watchedStories = validList(source.watchedStories, [...DREAM_STAGES.map((stage) => STAGES[stage].ending.id), LEGACY_NIGHT_STORY_ID]);
  const endingComplete = completedStages.length === 6 && growth >= STAGES.F.growth.end && watchedStories.includes(STAGES.F.ending.id);
  const legacyDialogueIds = DREAM_STAGES.flatMap((stage) => [`milestone-${stage}`, ...Array.from({ length: 4 }, (_, index) => `tree-${stage}-${index}`), ...Array.from({ length: 2 }, (_, index) => [`nahida-${stage}-${index}`, `nahida-${stage}-return-${index}`]).flat()]);
  const dialogueIds = [...Object.keys(DIALOGUE_ENTRIES), ...legacyDialogueIds, 'transition-G', 'reality-0', 'reality-1', 'night-dialogue-0', 'night-dialogue-1', 'night-dialogue-2'];
  const visitIds = DREAM_STAGES.flatMap(stageVisitIds);
  const completedVisits = validList(source.completedVisits, visitIds);
  const pendingVisits = validList(source.pendingVisits, visitIds).filter((id) => !completedVisits.includes(id));
  const positions = record(source.visitPositions);
  const visitPositions = Object.fromEntries([...completedVisits, ...pendingVisits].map((id) => [id, positions[id] === 1 ? 1 as const : 0 as const]));
  const pendingWaterings: GameSave['pendingWaterings'] = [];
  if (Array.isArray(source.pendingWaterings)) {
    for (const value of source.pendingWaterings) {
      const entry = record(value);
      const stage = entry.stage as DreamStageId;
      if (!DREAM_STAGES.includes(stage) || typeof entry.id !== 'number' || !Number.isSafeInteger(entry.id) || entry.id < 1 || pendingWaterings.some((pending) => pending.id === entry.id)) continue;
      if (typeof entry.dialogueId !== 'string') continue;
      const legacy = new RegExp(`^tree-${stage}-(\\d+)$`).exec(entry.dialogueId);
      const dialogueId = legacy ? STAGES[stage].dialogue[Number(legacy[1]) % STAGES[stage].dialogue.length].id : entry.dialogueId;
      const categories = ['normal', 'story', 'mechanism', 'limit'] as const;
      const category = categories.find((name) => dialoguePool(`${name === 'normal' || name === 'story' ? stage : 'shared'}/${name}`).some((line) => line.id === dialogueId));
      if (!category) continue;
      pendingWaterings.push({ id: entry.id, stage, dialogueId, category });
    }
  }
  const decks = record(source.dialogueDecks);
  const dialogueDecks = Object.fromEntries(Object.entries(decks).filter(([key, value]) => Boolean(DIALOGUE_POOLS[key]) && Array.isArray(value)).map(([key, value]) => [key, validList(value, DIALOGUE_POOLS[key].map((entry) => entry.id))]));
  const counters = record(source.dialogueCounts);
  const dialogueCounts = Object.fromEntries(DREAM_STAGES.filter((stage) => counters[stage] !== undefined).map((stage) => {
    const counter = record(counters[stage]);
    return [stage, { story: bounded(counter.story, DIALOGUE_RULES.storyMaximum), mechanism: bounded(counter.mechanism, DIALOGUE_RULES.mechanismMaximum) }];
  }));
  const visitLines = Object.fromEntries(Object.entries(record(source.visitLines)).flatMap(([id, value]) => {
    if (!completedVisits.includes(id) && !pendingVisits.includes(id)) return [];
    const stage = DREAM_STAGES.find((stage) => stageVisitIds(stage).includes(id));
    const entry = record(value);
    if (!stage || typeof entry.dialogueId !== 'string' || !dialoguePool(`${stage}/nahida`).some((line) => line.id === entry.dialogueId)) return [];
    const extra = record(entry.followup);
    const followup = typeof extra.dialogueId === 'string' && extra.dialogueId !== entry.dialogueId && dialoguePool(`${stage}/nahida`).some((line) => line.id === extra.dialogueId) && VISIT_EXPRESSION_CHOICES.some((asset) => asset === extra.expression) ? { dialogueId: extra.dialogueId, expression: extra.expression as number, read: extra.read === true } : undefined;
    return [[id, { dialogueId: entry.dialogueId, read: entry.read === true, ...(followup ? { followup } : {}) }]];
  }));
  const pendingDialogues: GameSave['pendingDialogues'] = [];
  if (Array.isArray(source.pendingDialogues)) for (const value of source.pendingDialogues) {
    const entry = record(value);
    const stage = entry.stage as StageId;
    const kind = entry.kind as PendingDialogueKind;
    const from = entry.from as DreamStageId;
    if (![...DREAM_STAGES, 'G'].includes(stage) || !['opening', 'welcome', 'idle', 'transition', 'wish', 'reality', 'night'].includes(kind)) continue;
    if (typeof entry.id !== 'number' || !Number.isSafeInteger(entry.id) || entry.id < 1 || pendingDialogues.some((pending) => pending.id === entry.id)) continue;
    if (['wish', 'reality', 'night'].includes(kind) && stage !== 'G' || kind === 'welcome' && stage === 'G' || kind === 'opening' && stage !== 'A') continue;
    if (kind === 'transition' && (!DREAM_STAGES.includes(from) || [...DREAM_STAGES, 'G'].indexOf(stage) <= DREAM_STAGES.indexOf(from))) continue;
    const keys = kind === 'transition' ? [transitionDialoguePool(stage), `${from}/transition`] : kind === 'opening' ? ['A/transition'] : kind === 'wish' ? ['G/wish', 'G/reply'] : kind === 'welcome' ? ['shared/welcome'] : kind === 'idle' && stage !== 'G' ? ['shared/idle'] : ['G/nahida'];
    const lines = validList(entry.lines, keys.flatMap((key) => dialoguePool(key).map((line) => line.id)));
    if (!lines.length || kind === 'wish' && (lines.length !== 2 || !dialoguePool('G/wish').some((line) => line.id === lines[0]) || !dialoguePool('G/reply').some((line) => line.id === lines[1]))) continue;
    pendingDialogues.push({ id: entry.id, stage, kind, lines, cursor: bounded(entry.cursor, lines.length), ...(kind === 'transition' ? { from } : {}), ...(kind === 'wish' && entry.celebrationComplete === true ? { celebrationComplete: true } : {}) });
  }
  return {
    ...fresh, growth, dew: bounded(source.dew ?? source.resources, GAME_RULES.dewCapacity),
    sceneStage: [...DREAM_STAGES, 'G'].includes(source.sceneStage as StageId) ? source.sceneStage as StageId : undefined,
    loadingArtChoices: validateLoadingArtChoices(source.loadingArtChoices),
    seed: bounded(source.seed, 2147483647, 1027), introSeen: source.introSeen === true,
    seedPlanted: growth > 0 || completedStages.length > 0 || source.seedPlanted === true || source.seedPlanted === undefined && source.introSeen === true,
    completedStages, completedVisits,
    pendingVisits, visitPositions,
    guaranteedVisits: validList(source.guaranteedVisits, visitIds).filter((id) => completedVisits.includes(id) || pendingVisits.includes(id)),
    blessedVisits: source.blessedVisits === undefined ? completedVisits : validList(source.blessedVisits, visitIds).filter((id) => completedVisits.includes(id) || pendingVisits.includes(id)),
    pendingWaterings,
    dialogueDecks, dialogueCounts, visitLines, pendingDialogues,
    dialogueSequence: Math.max(bounded(source.dialogueSequence, Number.MAX_SAFE_INTEGER - 1), ...pendingWaterings.map((entry) => entry.id), ...pendingDialogues.map((entry) => entry.id)),
    watchedStories, unlockedSecrets: validList(source.unlockedSecrets, SECRETS.map((secret) => secret.id)),
    playedDialogues: validList(source.playedDialogues, dialogueIds),
    wateringCounts: Object.fromEntries(DREAM_STAGES.map((stage) => [stage, bounded(counts[stage], 10000)])),
    claimedAranara: validList(source.claimedAranara, [...FESTIVAL_ARANARA]),
    endingComplete, nightComplete: endingComplete && watchedStories.includes(LEGACY_NIGHT_STORY_ID),
    settings: { sound: settings.sound !== false && soundVolume > 0, soundVolume, music: settings.music !== false && musicVolume > 0, musicVolume, reducedMotion: settings.reducedMotion === true, textSpeed: Math.max(10, bounded(settings.textSpeed, 100, 35)) },
    updatedAt: bounded(source.updatedAt, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

export class SaveManager {
  status = '';
  hasLoadedSave = false;
  private writable = true;

  constructor(private readonly storage: StorageLike | null, readonly key = SAVE_KEYS.player) {}

  load() {
    this.hasLoadedSave = false;
    if (!this.storage) {
      this.status = '浏览器未允许本地存档，本次梦境保存在内存中。';
      return createSave();
    }
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
      if (!raw) return createSave();
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-save');
      const save = validateSave(parsed);
      this.hasLoadedSave = true;
      return save;
    } catch (error) {
      if (error instanceof Error && error.message === 'future-version') {
        this.writable = false;
        this.status = '发现更高版本存档，已保护原档；本次使用临时梦境。';
      } else {
        this.status = '存档暂时无法读取；已尝试保留原档，开启新的梦境。';
        try { if (raw) this.storage.setItem(`${this.key}.recovery`, raw); } catch { this.writable = false; }
      }
      return createSave();
    }
  }

  write(save: GameSave) {
    if (!this.storage || !this.writable) return false;
    try {
      this.storage.setItem(this.key, JSON.stringify(save));
      this.status = '';
      return true;
    } catch {
      this.status = '存档空间不足或访问受限；当前进度仍保留在页面中。';
      return false;
    }
  }
}

export function browserStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }
}
