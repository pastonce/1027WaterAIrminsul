import type { SecretCommand } from '../types/game';

export const SECRETS: SecretCommand[] = [
  { id: 'forest', phrase: '兰那罗', effect: 'forest', unlockStage: 'A', feedback: '草叶后面，探出两顶小小的帽子。森林里的朋友来听故事了。' },
  { id: 'moon', phrase: '月亮', effect: 'moon', unlockStage: 'A', feedback: '你替梦境，轻轻点亮了一弯月亮。再次输入可收起月光。' },
  { id: 'memory', phrase: '回忆', effect: 'memory', unlockStage: 'B', feedback: '旧日的轮廓，像水纹一样从树影里经过。' },
  { id: 'petals', phrase: '花神诞祭', effect: 'petals', unlockStage: 'C', feedback: '花瓣为这个小小的愿望，提前排练了一场雨。' },
  { id: 'birthday', phrase: '1027', effect: 'birthday', unlockStage: 'A', feedback: '这是梦里珍藏的数字。愿慧梦成真。' },
];
