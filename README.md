# 浇灌一棵世界树

最新修复：手机开场必须等所选素材完整下载，失败可重试；纳西妲正常回退使用各自透明姿态，彩蛋形象仅由Nidaha开启。平板技能框 / 黑区共用实际视口，兰那罗藏点按真实树形和UI筛选。维护说明见[加载机制](docs/STARTUP_ASSETS.md)、[角色回退](docs/CHARACTER_LOADING.md)与[藏点检查](docs/INHABITANTS.md)。

纳西妲生日主题的非商业同人网页互动企划。当前为阶段性公测版本，2026-10-26 收尾；尚未代为上传或部署。

种下种子、收集梦露并浇灌，经历六段梦境后醒来，为纳西妲送上祝福、阅读四年的生日来信。保留动态场景、角色来访、兰那罗、晶蝶、分主题自动对白、表情、音乐与交互音效。

## 快速开始

使用 Node.js 24（最低22.12）。

```sh
npm ci
npm run dev
```

```sh
npm test -- --maxWorkers=4
npm run build
npm run release:assets
npm run release:audit
npm run preview
```

开发模式使用独立开发存档与模拟时钟；生产模式依赖同域 `/api/time` 的服务器校时。生产部署必须包含根目录 `functions/` 及其引用的源码，不能只复制静态页面。详见 [部署说明](docs/DEPLOYMENT.md)。

最新交互优化：连续点击树 / G纳西妲改播最新普通对白，树表情每累计7秒判定；手机开屏完整保留徽记与种子，A～D施法图案缩小。公告 / 设置 / 读信继续播放BGM，游戏演出仍暂停。平板加载期黑底完整覆盖，梦露按当前树形避让以释放中部空地，B/E宽幅来访气泡避开脸部，见 [平板适配](docs/TABLET_LAYOUT.md)。

## 当前开放表

以下均为北京时间，权限只取服务器确认时间。日期开放后仍须按成长与对白流程逐段体验。

| 阶段 | 开启时间 | 成长上限 |
| --- | --- | --- |
| A / B / C | 2026-10-25 10:27:00 | 180 / 340 / 520 |
| D / E | 2026-10-26 10:27:00 | 680 / 840 |
| F / G | **2026-10-27 13:27:00** | F为1027；G在F完成并梦醒后进入 |

每次浇灌消耗20梦露、增加20成长，最后7点只结算、不再长树。锁日期满额后仍须在开放后补浇一次；旧存档保留。界面不向普通玩家展示阶段与成长值。完整58拍、111枝位和各项门控见 [当前阶段交接](docs/PHASE_HANDOFF.md)。

## 测试与彩蛋

测试入口改为 **`Past`**，不区分大小写；旧 `test` 不再生效。桌面直接键入，手机在设置中的无提示输入框输入。测试会话只使用本页内存，再次输入Past或刷新均回到原进度；测试修改不写回正式存档。

其他代码为 `Aranara`、`Nidaha`、`Rainstorm`、`Nahida`、`Birthday`、`Irminsul`，范围和保护规则见 [彩蛋说明](docs/EASTER_EGGS.md)。`Irminsul`可在已种植的A～F切换同等成长的程序化树，再次输入或刷新还原。

当前保留 `VITE_PUBLIC_TESTING=true` 的公测入口；只有进入Past内存测试后才显示「开发测试中」，普通页面隐藏。以后需要关闭公开入口时，设为false再构建；不影响其他彩蛋。

## 修改内容

| 内容 | 唯一编辑入口 / 本地生成命令 |
| --- | --- |
| 开启日期、成长与梦露规则 | `src/data/schedule.ts` |
| 自动对白正文（含N01、X11） | `asserts/对白整合.md` → `npm run assets:dialogues` |
| 公告、署名与底部标语 | `src/content/notice.md`；末尾 `> ` 为单行标语 |
| 四年生日来信正文 | `asserts/生日贺图/信与回复.md` → `npm run assets:birthday-mail` |
| 生日贺图 | `asserts/生日贺图/23.png`～`26.png` → `npm run assets:birthday-art` |
| 其他素材、音乐、字体 | [素材维护](docs/ASSET_GUIDE.md)、[音频与字体](docs/AUDIO_AND_FONTS.md) |

**2026贺图仍占位。** 你将新图放到 `asserts/生日贺图/26.png` 后，按 [交接清单](docs/PHASE_HANDOFF.md) 的步骤生成压缩发布图；只放入原图不会改变线上版本。正文新增字符还需执行 `npm run assets:fonts`，再重建启动目录与生产包。

## 目录与资源边界

- `src/`：页面、交互、游戏逻辑与当前资源登记。
- `public/`：实际发布资源、许可及路由配置。保留当前哈希副本与回退图。
- `asserts/`：原稿、源美术和本地重制输入；除两份MD正文外不上传。校准辅助图已移入 `asserts/calibration/`。
- `functions/`、`server/`：服务器校时入口与实现，随源码发布。
- `scripts/`、`tests/`、`e2e/`：资源工具与验证；云端普通构建无需原大图、Python或FFmpeg。
- `docs/`：从 [文档索引](docs/README.md) 阅读；[阶段交接](docs/PHASE_HANDOFF.md) 是当前基线，[测试记录](docs/TEST_PLAN.md) 分轮留档。

弃用发布副本已清理；删除、迁移路径与SHA见 `docs/cleanup.manifest.json`。仍用于素材重制的E技能源图、透明四叶印稿、树原稿和原音频保留在本地。`npm run release:assets` 只检查、不删除文件，覆盖所有阶段、插图选择、设备档与静态回退。

存档只保存在浏览器本地，没有账号、云端存档或跨设备同步；历史轮回与本页预览不改服务器时间。实际验证范围、后续真机事项见 [待办](docs/TODO.md)。
