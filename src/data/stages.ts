import { SCHEDULE } from './schedule';
import { dialoguePool, DIALOGUE_RULES } from './dialogues';
import { treeHeightAtGrowth } from '../game/tree/growth';
import type { DreamStageId, StageConfig, StageId, StoryEvent } from '../types/game';


interface StageDraft {
  id: DreamStageId;
  name: string;
  subtitle: string;
  description: string;
  history: string;
  theme: string;
  treeForm: string;
  environment: string[];
  interaction: string;
  ending: Omit<StoryEvent, 'id'>;
}

const drafts: StageDraft[] = [
  {
    id: 'A', name: '初生', subtitle: '被遗忘的种子',
    description: '风把一颗种子，留在了梦的起点。', history: '大慈树王消逝，纳西妲诞生。',
    theme: 'seed', treeForm: '发光幼苗、初生嫩叶', environment: ['soft-light', 'ancient-shadow'],
    interaction: '一起轻触第一片嫩叶',
    ending: { title: '第一片叶子的方向', text: '小树把刚刚学会的绿色，伸向一束没有名字的光。', action: '把这束光留给它', interaction: 'continue', beats: ['嫩叶舒展开来。', '远处掠过一道巨大的树影，转眼又不见了。'] },
  },
  {
    id: 'B', name: '幽禁', subtitle: '看不见天空的树',
    description: '看不见天空的时候，也可以想象风。', history: '净善宫中的幽禁，通过梦境与虚空观察外界。',
    theme: 'dome', treeForm: '受穹顶遮挡的弯枝', environment: ['dome', 'dim-light'],
    interaction: '与她一起接住一束阳光',
    ending: { title: '给天空留一扇窗', text: '穹顶没有消失。但有人把微弱的光，认真地送到了叶片上。', action: '把阳光引向嫩叶', interaction: 'sunlight', beats: ['光沿着手心落下。', '弯曲的枝条，第一次有了自己的方向。'] },
  },
  {
    id: 'C', name: '轮回', subtitle: '不会结束的庆典',
    description: '这朵花，是不是曾在昨天盛开？', history: '花神诞祭的梦境轮回。',
    theme: 'loop', treeForm: '反复开合的花朵', environment: ['loop-flowers', 'dream-echo'],
    interaction: '与她一起记住这朵花',
    ending: { title: '再一次，花开了', text: '同一片花瓣走过相同的轨迹。只有你，记得它落下过。', action: '记住这一瞬', interaction: 'loop', beats: ['花开。花落。', '花开。花落。', '这一次，梦里多了一声回应。'] },
  },
  {
    id: 'D', name: '破晓', subtitle: '有人听见了树的声音',
    description: '伸出枝条吧，风已经在等你了。', history: '旅行者与须弥的伙伴们营救纳西妲。',
    theme: 'dawn', treeForm: '向天空延伸的自由枝条', environment: ['sunbeams', 'broken-seals'],
    interaction: '和她一起碰响自由的枝叶',
    ending: { title: '有人回应了', text: '三枚旧日的纹样开始松动。那些回应，来自你，也来自很多不曾放弃的人。', action: '让风穿过枝条', interaction: 'seals', beats: ['第一声：我在听。', '第二声：你并不孤单。', '第三声：一起去看看天空。'] },
  },
  {
    id: 'E', name: '守护', subtitle: '燃烧的世界树',
    description: '有些光，是为了让明天继续生长。', history: '「月之七」《虚空劫灰往世书》：博士污染并利用世界树，借火神之心焚毁世界树阻止灾难，阿如承接部分权责。此处不是 3.2 的记忆清除。',
    theme: 'embers', treeForm: '留有火光记忆的树干', environment: ['embers', 'shadow'],
    interaction: '安静地陪她看一会儿远处的光',
    ending: { title: '把明天交给新的枝叶', text: '遥远的树影被危机笼罩。她借火神之心作出抉择，让火光阻止灾难，让阿如承接延续的职责。眼前的梦树只记下这份重量。', action: '陪伴她作出守护的抉择', interaction: 'choice', beats: ['这场火光，是一个沉重的决定。', '告别旧日的道路，也守住所有人的明天。', '新的枝叶，会记得这份托付。'] },
  },
  {
    id: 'F', name: '花神诞祭', subtitle: '长梦中的鲜花',
    description: '愿所有温柔的梦，都有盛开的那天。', history: '梦境重组的生日庆典记忆。参考 2022 角色 PV 与 2024 庆典；不是 E 之后的新历史事件。',
    theme: 'festival', treeForm: '盛放的青蓝粉白树冠', environment: ['petals', 'golden-light'],
    interaction: '一起为树冠系上一朵生日花',
    ending: { title: '长梦中的花神诞祭', text: '那些不按时间排列的温柔记忆，在树冠相遇。花车、笑声与祝福，汇成了一场终于不会重来的庆典。', action: '循着花香，醒来', interaction: 'celebration', beats: ['镜头越过记着旧日的枝干。', '梦里的鲜花，为她一同盛开。', '你终于明白，这棵树陪你走过的是谁的岁月。', '现在，该亲口告诉她了。'] },
  },
];

export const STAGES: Record<StageId, StageConfig> = Object.fromEntries(drafts.map((draft, index) => {
  const schedule = SCHEDULE[index];
  return [draft.id, {
    id: draft.id, name: draft.name, subtitle: draft.subtitle, description: draft.description, history: draft.history,
    growth: { start: index === 0 ? 0 : SCHEDULE[index - 1].cap, end: schedule.cap },
    height: { start: treeHeightAtGrowth(index === 0 ? 0 : SCHEDULE[index - 1].cap, draft.id === 'E' || draft.id === 'F'), end: treeHeightAtGrowth(schedule.cap, draft.id === 'E' || draft.id === 'F') },
    theme: draft.theme, treeForm: draft.treeForm, environment: draft.environment, unlockAt: schedule.at,
    dew: { color: '#d3f6a1', region: [22, 66] },
    dialogue: dialoguePool(`${draft.id}/normal`),
    transition: dialoguePool(`${draft.id}/transition`)[0],
    visit: { id: `visit-${draft.id}`, chance: DIALOGUE_RULES.visitChance, interaction: draft.interaction,
      dialogue: dialoguePool(`${draft.id}/nahida`),
      returnDialogue: dialoguePool(`${draft.id}/nahida`),
    },
    ending: { ...draft.ending, id: `story-${draft.id}` },
  } satisfies StageConfig];
})) as Record<StageId, StageConfig>;

STAGES.G = {
  ...STAGES.F,
  id: 'G', name: '梦醒', subtitle: '生日快乐，纳西妲', theme: 'reality',
  description: '长梦散去，陪伴仍在。今天，把祝福亲口说给她听。',
  history: '梦醒后，现实中的须弥庆典。', unlockAt: null,
  transition: dialoguePool('G/nahida')[0],
  dialogue: dialoguePool('G/nahida'),
};

export const LEGACY_NIGHT_STORY_ID = 'night-1027';
