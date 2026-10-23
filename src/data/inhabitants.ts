import extracted from './inhabitants.generated.json' with { type: 'json' };
import type { DreamStageId, StageId } from '../types/game';

export const INHABITANT_ASSETS = extracted;
export type InhabitantId = keyof typeof INHABITANT_ASSETS;
export type NahidaForm = 'nahida_dream' | 'nahida_wave' | 'nahida_bouquet' | 'nahida_swing';
export const VISIT_FORMS: Partial<Record<StageId, NahidaForm>> = { A: 'nahida_dream', C: 'nahida_wave', D: 'nahida_bouquet', F: 'nahida_swing' };
export const ROAMING_ARANARA = Array.from({ length: 6 }, (_, index) => `aranara_0${index + 1}` as InhabitantId);
export const FESTIVAL_ARANARA = ['aranara_07', 'aranara_08', 'aranara_09', 'aranara_10'] as const;
export const CRYSTALFLIES = ['crystalfly_01', 'crystalfly_02', 'crystalfly_03'] as const;
export const ENCOUNTER_RULES = { spawnMinMs: 15000, spawnMaxMs: 45000, lifetimeMs: 30000, arriveMs: 750, leaveMs: 700, celebrationMs: 1350, flightMs: 850, maximum: 3, rewardValue: 24, rewardParticles: 12, rewardLifetimeMs: 60000 };

export interface HidingMotion { arrival?: 'fade'; departure?: 'bottom'; travel?: number }
export interface HidingPlace extends HidingMotion { x: number; y: number; name: string; depth?: 'middle' | 'log' | 'near'; edge?: 'left' | 'right' | 'top' | 'bottom'; burrow?: -1 | 1; allowed?: readonly InhabitantId[] }
export const HIDING_PLACES: Partial<Record<DreamStageId, readonly HidingPlace[]>> = {
  A: [
    { x: -800, y: 225, name: '左高花叶', arrival: 'fade' }, { x: 740, y: 204, name: '右侧高花', arrival: 'fade' },
    { x: -480, y: -260, name: '倒木左苔沿', depth: 'log' }, { x: 480, y: -428, name: '倒木右断口', depth: 'log' },
    { x: -740, y: -333, name: '左树根圆叶', depth: 'near' }, { x: 860, y: -329, name: '右侧木栅栏', depth: 'near' },
    { x: 0, y: 0.46, name: '左边缘', edge: 'left' }, { x: 1, y: 0.38, name: '右边缘', edge: 'right' },
    { x: 0.44, y: 0, name: '上缘倒挂', edge: 'top', allowed: ['aranara_01', 'aranara_02'] }, { x: 0.22, y: 1, name: '下缘探头', edge: 'bottom' },
  ],
  C: [
    { x: -860, y: -154, name: '左木箱薰衣草' }, { x: 800, y: -83, name: '右侧灯笼花箱' },
    { x: -350, y: 240, name: '左上旗杆侧缘', burrow: 1, arrival: 'fade', departure: 'bottom' }, { x: -420, y: -60, name: '左旗柱下沿', burrow: 1, arrival: 'fade', departure: 'bottom' },
    { x: -650, y: -420, name: '左前黄花', depth: 'near' }, { x: 560, y: -190, name: '右阶台面内沿', arrival: 'fade' },
    { x: 0, y: 0.38, name: '左边缘', edge: 'left' }, { x: 1, y: 0.52, name: '右边缘', edge: 'right' },
    { x: 0.53, y: 0, name: '上缘倒挂', edge: 'top', allowed: ['aranara_01', 'aranara_02'] }, { x: 0.76, y: 1, name: '下缘探头', edge: 'bottom' },
  ],
  D: [
    { x: -781, y: 30, name: '左门柱侧面', burrow: 1, travel: 0.3 }, { x: 753, y: 130, name: '右门柱上缘', burrow: -1, travel: 0.3 },
    { x: -520, y: -430, name: '左阶梯折角', depth: 'near' }, { x: 520, y: -380, name: '右阶梯折角', depth: 'near' },
    { x: -907, y: -270, name: '左侧栏尾', burrow: 1 }, { x: 857, y: -174, name: '右栏流叶', travel: 0.3 },
    { x: 0, y: 0.34, name: '左边缘', edge: 'left' }, { x: 1, y: 0.58, name: '右边缘', edge: 'right' },
    { x: 0.47, y: 0, name: '上缘倒挂', edge: 'top', allowed: ['aranara_01', 'aranara_02'] }, { x: 0.23, y: 1, name: '下缘探头', edge: 'bottom' },
  ],
  E: [
    { x: -781, y: 30, name: '左铜柱侧面', burrow: 1, travel: 0.3 }, { x: 753, y: 130, name: '右铜柱上缘', burrow: -1, travel: 0.3 },
    { x: -520, y: -430, name: '左锈阶折角', depth: 'near' }, { x: 520, y: -380, name: '右锈阶折角', depth: 'near' },
    { x: -907, y: -270, name: '左青灰栏尾', burrow: 1 }, { x: 857, y: -174, name: '右青灰栏叶', travel: 0.3 },
    { x: 0, y: 0.56, name: '左边缘', edge: 'left' }, { x: 1, y: 0.32, name: '右边缘', edge: 'right' },
    { x: 0.55, y: 0, name: '上缘倒挂', edge: 'top', allowed: ['aranara_01', 'aranara_02'] }, { x: 0.21, y: 1, name: '下缘探头', edge: 'bottom' },
  ],
  F: [
    { x: -800, y: 149, name: '左高金叶' }, { x: 1000, y: -255, name: '右红花' },
    { x: -560, y: -13, name: '左花茎' }, { x: 560, y: -497, name: '右金瓣' },
    { x: -740, y: -198, name: '左前巨叶', depth: 'near' }, { x: 680, y: -409, name: '右前绿叶', depth: 'near' },
    { x: 0, y: 0.48, name: '左边缘', edge: 'left' }, { x: 1, y: 0.38, name: '右边缘', edge: 'right' },
    { x: 0.45, y: 0, name: '上缘倒挂', edge: 'top', allowed: ['aranara_01', 'aranara_02'] }, { x: 0.24, y: 1, name: '下缘探头', edge: 'bottom' },
  ],
};
