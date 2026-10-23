export const DREAM_STAGES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type DreamStageId = (typeof DREAM_STAGES)[number];
export type StageId = DreamStageId | 'G';
export type GameMode = 'intro' | 'idle' | 'watering' | 'growing' | 'ending' | 'journal' | 'settings' | 'notice' | 'mail' | 'loading' | 'waking';
export type SecretEffect = 'forest' | 'moon' | 'memory' | 'petals' | 'birthday';
export type CharacterAction = 'idle' | 'arrive' | 'observe' | 'happy' | 'leave';
export type SpeechAnchor = 'tree' | 'nahida' | 'user';
export type ExpressionMode = 'before' | 'middle' | 'after';
export interface ExpressionMarker { mode: ExpressionMode; offset: number; choices: number[] }
export interface ExpressionChoice { asset: number; mode: ExpressionMode; offset: number }
export interface ExpressionPlayback { id: number; asset: number; anchor: 'tree' | 'nahida'; angle: number; ready: boolean }

export interface DialogueEntry {
  id: string;
  speaker: string;
  text: string;
  color?: string;
  speed?: number;
  box?: 'dream' | 'warm';
  audioAsset?: string;
  anchor?: SpeechAnchor;
  expressions?: ExpressionMarker[];
}

export interface VisitEvent {
  id: string;
  chance: number;
  dialogue: DialogueEntry[];
  returnDialogue: DialogueEntry[];
  interaction: string;
}

export interface StoryEvent {
  id: string;
  title: string;
  text: string;
  action: string;
  interaction: 'continue' | 'sunlight' | 'loop' | 'seals' | 'choice' | 'celebration' | 'night';
  beats: string[];
}

export interface StageConfig {
  id: StageId;
  name: string;
  subtitle: string;
  description: string;
  history: string;
  growth: { start: number; end: number };
  height: { start: number; end: number };
  theme: string;
  treeForm: string;
  environment: string[];
  unlockAt: string | null;
  dew: { color: string; region: [number, number] };
  dialogue: DialogueEntry[];
  transition: DialogueEntry;
  visit: VisitEvent;
  ending: StoryEvent;
}

export interface PendingWatering {
  id: number;
  stage: DreamStageId;
  dialogueId: string;
  category?: 'normal' | 'story' | 'mechanism' | 'limit';
}

export type PendingDialogueKind = 'opening' | 'welcome' | 'idle' | 'transition' | 'wish' | 'reality' | 'night';
export interface PendingDialogue {
  id: number;
  stage: StageId;
  kind: PendingDialogueKind;
  lines: string[];
  cursor: number;
  from?: DreamStageId;
  celebrationComplete?: boolean;
}

export interface SecretCommand {
  id: string;
  phrase: string;
  effect: SecretEffect;
  unlockStage: StageId;
  feedback: string;
}

export interface GameSave {
  sceneStage?: StageId;
  loadingArtChoices: Partial<Record<StageId, string>>;
  version: 2;
  growth: number;
  dew: number;
  seed: number;
  introSeen: boolean;
  completedStages: DreamStageId[];
  completedVisits: string[];
  pendingVisits: string[];
  visitPositions: Partial<Record<string, 0 | 1>>;
  guaranteedVisits: string[];
  blessedVisits: string[];
  pendingWaterings: PendingWatering[];
  dialogueDecks: Record<string, string[]>;
  dialogueCounts: Partial<Record<DreamStageId, { story: number; mechanism: number }>>;
  dialogueSequence: number;
  pendingDialogues: PendingDialogue[];
  visitLines: Record<string, { dialogueId: string; read: boolean; followup?: { dialogueId: string; expression: number; read: boolean } }>;
  watchedStories: string[];
  unlockedSecrets: string[];
  playedDialogues: string[];
  wateringCounts: Partial<Record<DreamStageId, number>>;
  claimedAranara: string[];
  endingComplete: boolean;
  nightComplete: boolean;
  settings: { sound: boolean; soundVolume: number; music: boolean; musicVolume: number; reducedMotion: boolean; textSpeed: number };
  updatedAt: number;
}

export interface DewParticle {
  id: number;
  x: number;
  y: number;
  value: number;
  collected: boolean;
  expiring?: boolean;
  kind?: 'reward' | 'rainstorm';
  portions?: Array<{ batch: number; value: number }>;
  launch?: { x: number; y: number };
}

export interface ForestEncounter { id: number; asset: string; slot: number; phase: 'arriving' | 'watching' | 'leaving'; celebrated?: boolean }
export interface RewardBurst { id: number; x: number; y: number }

export interface StageLoading { id: number; from: StageId; to: StageId; artId?: string; phase: 'cover' | 'loading' | 'revealing'; progress: number }

export type WakingPhase = 'black' | 'first-opening' | 'first-hold' | 'first-closing' | 'first-closed' | 'second-opening' | 'second-hold' | 'second-closing' | 'second-closed' | 'final-opening' | 'settling';
export interface WakingPlayback { id: number; phase: WakingPhase; durationMs: number; reduced: boolean }
export interface BirthdayPlayback { id: number; phase: 'gifting' | 'shower'; reduced: boolean }

export type QueuedEvent = {
  id: string;
  type: 'transition' | 'visit' | 'night' | 'dialogue';
  stage: StageId;
} | {
  id: string;
  type: 'watering';
  stage: DreamStageId;
  dialogue: DialogueEntry;
} | {
  id: string;
  type: 'secret-visit';
  stage: DreamStageId;
  dialogue: DialogueEntry;
  position: 0 | 1;
} | {
  id: string;
  type: 'visit-followup';
  stage: DreamStageId;
  visitId: string;
  dialogue: DialogueEntry;
  expression: number;
};

export interface GameSnapshot {
  stageLoading: StageLoading | null;
  waking: WakingPlayback | null;
  birthday: BirthdayPlayback | null;
  save: GameSave;
  mode: GameMode;
  stage: StageId;
  growth: number;
  now: number;
  dewParticles: DewParticle[];
  event: QueuedEvent | null;
  speech: SpeechPlayback | null;
  expression: ExpressionPlayback | null;
  companion: CharacterAction | null;
  companionCanTalk: boolean;
  companionStage: DreamStageId | null;
  companionPosition: 0 | 1;
  nahidaPlaceholder: boolean;
  blessing: { id: string; stage: DreamStageId; phase: 'channel' | 'bloom' } | null;
  encounters: ForestEncounter[];
  rewardBursts: RewardBurst[];
  presentationPaused: boolean;
  dewFeedback: 'insufficient' | 'full' | null;
  dewFeedbackRevision: number;
  message: string;
  effects: SecretEffect[];
  reviewStage: DreamStageId | null;
  growthRevision: number;
  saveStatus: string;
}

export interface SpeechPlayback {
  entry: DialogueEntry;
  anchor: SpeechAnchor;
  sequence: number;
  phase: 'speaking' | 'holding' | 'fading';
  startedAt: number;
  elapsedMs: number;
  typingMs: number;
  text?: string;
  segment?: number;
  segments?: number;
  reveal?: Array<{ at: number; end: number }>;
  expression?: ExpressionChoice;
}
