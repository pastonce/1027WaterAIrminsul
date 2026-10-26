# 工程文档索引

当前基线为 [阶段性交接](PHASE_HANDOFF.md)（2026-10-26）。项目任务书保留原始需求，后续修订优先；本索引把实际操作与历史记录分开，测试通过数只以TEST_PLAN对应轮次为准。

## 维护与发布

| 文档 | 用途 |
| --- | --- |
| [PHASE_HANDOFF](PHASE_HANDOFF.md) | 当前规则、F/G 13:27开放、2026贺图补入、交付边界 |
| [DEPLOYMENT](DEPLOYMENT.md) | 本地构建、GitHub筛选、校时Function与手动部署 |
| [RELEASE_RESOURCES](RELEASE_RESOURCES.md) | 发布 / 本地源稿 / 校准资源边界、清理记录与审计 |
| [ASSET_GUIDE](ASSET_GUIDE.md) | 各素材来源与生成入口 |
| [NOTICE](NOTICE.md) | 手动编辑公告、署名、标语 |
| [TODO](TODO.md) | 尚需补图、线上及真机确认的事项 |
| [TEST_PLAN](TEST_PLAN.md) | 当前验证与按日期保留的历史结果 |

## 实现专题

| 领域 | 说明 |
| --- | --- |
| 架构 / 游戏规则 | [ARCHITECTURE](ARCHITECTURE.md)、[GAME_DESIGN](GAME_DESIGN.md) |
| 种子与固定地面 | [SEED_PLANTING](SEED_PLANTING.md)、[FIXED_TREE_VIEW](FIXED_TREE_VIEW.md)、[TREE_GROUNDING](TREE_GROUNDING.md) |
| 原树 / 生长路线 / 程序化彩蛋 | [TREE_SYSTEM](TREE_SYSTEM.md)、[TREE_SEQUENCE_REVIEW](TREE_SEQUENCE_REVIEW.md)、[PROCEDURAL_TREE](PROCEDURAL_TREE.md) |
| 对白 / 两行 / 五主题 / 表情 | [DIALOGUE_SYSTEM](DIALOGUE_SYSTEM.md)、[DIALOGUE_RELEASE](DIALOGUE_RELEASE.md)、[DIALOGUE_LAYOUT_AUDIT](DIALOGUE_LAYOUT_AUDIT.md)、[DIALOGUE_THEMES](DIALOGUE_THEMES.md)、[EXPRESSION_SYSTEM](EXPRESSION_SYSTEM.md) |
| 角色 / 小生物 / 祝福 | [NAHIDA_BLESSING](NAHIDA_BLESSING.md)、[INHABITANTS](INHABITANTS.md)、[PLAYER_EXTRACTED](PLAYER_EXTRACTED.md) |
| 背景 / 转场 / 预载 | [BACKGROUND_FIDELITY](BACKGROUND_FIDELITY.md)、[STAGE_LOADING](STAGE_LOADING.md)、[PAGE_ASSETS](PAGE_ASSETS.md)、[STARTUP_ASSETS](STARTUP_ASSETS.md) |
| 平板加载 / 梦露 / 气泡 | [TABLET_LAYOUT](TABLET_LAYOUT.md) |
| 开屏 / E技能 | [OPENING_ANIMATION](OPENING_ANIMATION.md)、[E_SKILL_CLEAN](E_SKILL_CLEAN.md)、[E_SKILL_PATTERN](E_SKILL_PATTERN.md) |
| 现实祝福 / 来信 | [REALITY_CELEBRATION](REALITY_CELEBRATION.md)、[BIRTHDAY_MAIL](BIRTHDAY_MAIL.md) |
| BGM / 字体 / 音效 / 指针 | [AUDIO_AND_FONTS](AUDIO_AND_FONTS.md)、[INTERACTION_AUDIO](INTERACTION_AUDIO.md)、[CURSORS](CURSORS.md) |
| 彩蛋 / Past隔离测试 | [EASTER_EGGS](EASTER_EGGS.md) |

## 记录与清单

`DEVELOPMENT_PLAN.md` 为迭代历史；专题中带日期的旧记录只解释演变，不覆盖当前基线。原始 `project_prompt.md` 不删历史条目，末尾修订记录最新要求。

`*.manifest.json` 和各子目录JSON为素材哈希 / 来源 / 校准记录，部分被测试或导出工具读取，保留在仓库。`docs/screenshots/`、`artifacts/` 是本地验证输出，`.gitignore`排除上传。
