# 正式素材替换指南

当前阶段已于2026-10-26收尾；最新日期、Past入口与清理边界以 [PHASE_HANDOFF](PHASE_HANDOFF.md) / [RELEASE_RESOURCES](RELEASE_RESOURCES.md) 为准。以下带日期的记录保留实现演变，不覆盖当前基线。

本轮根部复核不重绘或替换位图：实际root前景为既有tree_overlay世界树重绘WebP，异常来自独立根颈和主干自带根直接叠接。现用原SVG内单个局部mask柔化上沿；早期树苗与叶片下移由model承担，源素材、注册元数据、31原稿 / 62发布副本保持。三处引导使用代码SVG，不新增图片，详见TREE_GROUNDING.md。

种子来自asserts/seed.png（原图不改）；内置image_gen仅去除白底和背景角标，透明原稿保存在asserts/seed-cutout/seed.png。npm run assets:seed离线裁透明边并生成256×372、21644B单份WebP，发布路径由src/data/seedAssets.generated.json登记，精确提示词 / 来源及输出哈希见seed-assets.manifest.json。首次加载仅取压缩副本，不下载原大图，详见SEED_PLANTING.md。

本轮不更换或缩放树素材；根部固定、允许冠出屏，现有111枝叶 / alpha及原设备比例保持。机制18句按唯一原稿发布，原字体分包与startup按新增字符重生，原始asserts与TTF不改。树气泡 / 表情 / 技能位置调整由scenePlacement统一计算，不新增位图或纹理。

本轮将部分E/F演出前移：浇灌次数 / 每次20点 / 日期上限不变，C九浇终点为grow30、D八浇为grow41；E八浇结束于grow45成簇拍，F十浇仍完成grow51及最后7点无动画。原51条木质轨各完整一次，grow42～48分成芽 / 舒叶拍与0.25秒独立成簇拍，共58拍，不停住半次回弹。 本轮仅重排原演出，不改111枝位 / 美术、原31稿 / 62WebP与24张设备单档，不新增下载或存档；实际验证见TEST_PLAN.md。

## 世界树重绘

枝叶继续复用原部件：原17～34校正叶柄、15继承叶＋96新枝共111稳定site，原63UV / 原48排程与新增48 leafAt不动。实际grow34 / D580启用连续层；42～48各拆舒叶与成簇完整拍，新增点仍按原grow36 cut带芽 / 37～48舒叶，不能把原编号误作浇水次数。growthRoute / presentation控制路线与实际附件，foliagePlan / foliageLayout控制原形态与UV，逐浇 / 实测见TREE_SEQUENCE_REVIEW.md / TEST_PLAN.md。

原24部件、旧长干及五张完整补绘均保留。为独立连续展叶，内置image_gen另从完整tree9生成去叶不改根干风格的tree9-growth.png（1,936,276B），原图不覆盖；提示词 / 输入 / 输出在tree-completion-generation.json，原稿及发布SHA在tree-assets.manifest.json。共31原稿 / 62份哈希WebP（4,551,386B），当前预载仍24张单档（桌面1,870,506B / 横屏1,131,772B），无叶成熟变体替代烘焙冠、其他叶图复用，不下载新旧两图。六份E/F透明变体共9,829,350B；本地assets:tree派生压缩、alpha / 中心线及根部注册，assets:tree-growth仅提取原轨迹，不加入云端prebuild，见TREE_SYSTEM.md。

当前开场统一下载本设备所需压缩资源与六张已选转场图，不预先创建未来场景实例；仅当前BGM压缩预载、其余曲目和扩展字体按需。`assets:startup` 生成大小 / 哈希清单，`release:audit` 检查发布包。全部原始 asserts/ 保留，GitHub 需要自动对白与生日来信两份 Markdown 及 public/ 派生资源；见 STARTUP_ASSETS.md、DEPLOYMENT.md。

## 生日来信

`asserts/生日贺图/信与回复.md` 经 assets:birthday-mail 独立解析，build 自动执行；不合入自动对白编号池。assets:birthday-art 离线派生三张贺图双档、3.0 原书底和四个导航态，11 文件共 1,452,328 B；源文件均不改，2026 0 字节图片与空正文保留占位。仅选中年插入 img，G 原背景不变，替换和补取 URL / 哈希见 BIRTHDAY_MAIL.md、birthday-mail-assets.manifest.json。

## 全流程对白

唯一正文来源 `asserts/对白整合.md`，原文件不改；`npm run assets:dialogues` 解析原编号生成 `src/data/dialogues.generated.json`，prebuild 自动执行。当前 371 ID / 31 范围，保留正文 / 标点，正文去 Markdown 加粗与 `[数字]` 标记，标题候选 / 句中位置另存表情元数据；源稿不改、数字不显示 / 读屏，不据数字切换 Spine 动作 / 配音；机制 X01～X18 已按当前原稿完整发布，X11为最终13:27开放说明。后续修改原稿再生成，不在 stages.ts 维护副本。源哈希、池数量、测试专用编号、概率 / 配额和恢复见 [DIALOGUE_SYSTEM.md](DIALOGUE_SYSTEM.md)。A～F 音乐 / 按钮和全站字体已另行接入，不改 Spine / 背景或新增运行时外链。

## 当前资源清单

桌面指针新增六份32px原CUR哈希副本与原版权说明，共26,110B，来源SAM TOKI STUDIO / 用户asserts/cursor；仅精细鼠标悬停设备按语义使用，不预载给触屏、不改热点，公告署名 / 许可链接同步，见CURSORS.md与cursor-assets.manifest.json。`npm run assets:cursors`可重新复制及生成CSS，原源文件不改。

最新：G 远 / 近树影 SVG 不再挂载，不删除 A～F 回退代码；祝福复用两张甜点图各 3 / 4 份，不增加下载 URL。新增来访竖琴与短雨声源 / 哈希 / 许可见 sfx-assets.manifest.json；本轮仅编码与更新清单，不作验证通过声明。

两张甜点由 image_gen 去蓝底，原图不改，透明派生在 public/asserts/gifts/，哈希 / 提示词见 gift-assets.manifest.json，开场只下载压缩文件、G送礼才解码展示；原 6 秒梦醒与彩雨不增画布 / GL / RAF。最新同字形 WOFF2 为常用 208,828 B / 扩展 3,313,096 B，仅当前两包；当前发布 371 句 / 两行量尺不变。七份音效为 AAC 150,375 B / JSON 发布包 200,687 B，源声 / 署名 / 授权与双哈希见 sfx-assets.manifest.json；传送社区素材上线前须确认许可。细节见 REALITY_CELEBRATION.md、INTERACTION_AUDIO.md，验证见 TEST_PLAN.md。

| 资源 | 已使用路径 | 来源 / 状态 |
| --- | --- | --- |
| A～D 动态背景 | `public/asserts/backgrounds/forest/`、`dunes/`、`canopy/`、`sanctuary/` | 对应用户指定的 3.0 / 3.1 / 3.6 / 3.2，按需复制完整分层与图集 |
| E 背景 | 复用 `sanctuary/`，`embers/poster.webp` | 背景专用调色 / 做旧 / 烟雾 / 余烬，不额外复制 D 图集 |
| F 背景 | `backgrounds/festival/` | image_2 无 Role 派生、十四页环境图集、40 秒 loop 与真实花叶遮挡 |
| 背景静态回退 | 六个目录的 `poster.webp` | 从当前管线生成，不含主树 / 独立角色 / UI；F 为无 Role 环境 |
| 藏身静态分带 | A / C / D / E / F 的 `hiding-band-*`、A 的 `hiding-light-1.webp` | 从真实背景槽位导出，完整姿态交错绘制；43 条记录中22张为运行时分带 / poster、21张在本地校准目录，清单在 `docs/inhabitants/hiding-layers.json` |
| 整理后的 Unity 壁纸 | `asserts/player/image_1/`～`image_4/` | 完整保留；image_2 无 Role 派生用于 F，见 PLAYER_SPINE.md |
| 独立可移用角色 | `asserts/player-extracted/` | 四种纳西妲、十只兰那罗、三只晶蝶，共 17 套独立 JSON / atlas / PNG，含网页 / TS 示例 |
| 旧 Unity 导出备份 | `asserts/player-source/` | 已按用户明确要求清空，保留空目录；完整成品及参考仍在 player/ |
| 官方补取背景 | `asserts/reference-supplements/` 与对应发布副本 | A 光照、B 红色流图、C 舞台 / 地形与 D 雾噪声，共八份；来源与固定 SHA-256 有独立 manifest |
| 开场及通用底图 | `public/asserts/backgrounds/dream.jpg` | 原 `asserts/3.0/_other_resources/loading_bg.29f573d9.jpg`；E / F 已另行接入 |
| 现实背景 | `public/asserts/backgrounds/reality/` | `asserts/background.png` 压缩静态副本，不改角色 / 装饰 / 交互 |
| 阶段加载图标 | `public/asserts/loading/seven-elements.webp` | 用户提供的 CodePen 引用图，实际 WebP 1024×128、50168 B；源另存 reference-supplements/loading，固定哈希、亮度遮罩七色填充，无运行时外链 |
| 阶段加载插图 | `public/asserts/loading/art/`、STAGE_LOADING_ART | AB～EF 每组两张、FG 单张，1280 / 1920 每次仅取已选单规格，CD2 左裁 580 px，其余完整等比，见 PAGE_ASSETS.md |
| 梦境纳西妲 | `public/asserts/inhabitants/nahida/`；B / E 为 `characters/dream/` | A / C / D / F 新四姿态 4.0.17，旧 shouye_caoshen 4.0.33 |
| 兰那罗与晶蝶 | `public/asserts/inhabitants/aranara/`、`crystalfly/` | 用户当前十只兰那罗 / 三只晶蝶原样复制，另生成透明 poster |
| 现实纳西妲 | `public/asserts/characters/reality/` | 用户原地替换的 naxida，Spine 4.0.33 |
| E 技能取景框图案 | `asserts/E技能素材/`、`public/asserts/effects/e-skill-frame-clean-7e78729b722f.png` | 已接入祝福外围与每次打开网页的揭幕；匹配 4.0 真实几何，normal 混合，clean-v2角花 / 光线独立、原世界几何与时序保留 |
| 角色回退 | 新角色 / 小生物各自的同名 `.webp`；旧角色 `characters/nahida-placeholder.svg` | 按当前姿态透明回退，不把图集整体显示 |
| 网站 / 按钮图标 | `ui/icon-128.*.png`、`ui/music-button-*.png`、Icon.tsx | favicon 来自 asserts/icon.png；音乐按钮来自 asserts/bgm/button.png 原字节，其他按钮保留矢量 |
| 纳西妲草纹气泡底图 | `ui/dialogue-840.*.jpg` | dialog.jpg 原字节，约 66%～74% 浅层 / 墨绿字，仅草纹主题；G 用户 / 回复采用庆典框 |
| 五套气泡装饰 | `DialogueOrnament.tsx`、`dialogue-themes.css` | 草元素徽记复用既有 effects/dendro.png，其余含糖果 / 缎带 / 花为小型静态 SVG，无新增图片 / 原稿改写 |
| 十张表情气泡 | `public/asserts/expressions/`、expressionAssets.generated.json | asserts/表情包 0～9.png 原字节哈希副本，340px 透明图，合计 1,288,382 B，单次只请求选中单图；assets:expressions 再生成，独立 expression-assets.manifest.json |
| 生长树 | `public/asserts/tree/`、`growthRoute.ts`、`presentation.ts`及原timeline / foliage / Renderer | 51条木质轨完整一次、58拍路线；C/D部分一浇两轨，42～48叶 / 簇分拍，111稳定枝位与24张单档保持，真实alpha按当前呈现附件命中，见TREE_SYSTEM.md |
| 森林轮廓、梦露、花瓣 | React / CSS / Canvas | 自绘占位；小生物现用登记的真实素材 |
| 树冠装饰 | 原智慧树叶 / 簇附件、原叶柄校正与111语义枝位 | 实际grow34 / D580起接续15原叶及96新枝，原0.5秒叶 / 0.25秒簇完整，42～48簇独立一拍，沿枝延伸、单site单附件，无程序花朵或长期叠图 |
| 交互音效 | `public/asserts/sfx/*-*.json`、sounds.generated.json、SoundManager.ts | 七份 AAC-LC / MP4、96 kb/s / 48 kHz 单声道，以 JSON / base64 兼容 IDM，约 196 KiB；水滴 / 浇水 / 叶声 / 弹跳 / 传送 / 来访竖琴 / 短暴雨，按动作请求，共用 BGM 上下文；来源 / 授权 / 双哈希见 sfx-assets.manifest.json，署名随 CREDITS.txt 发布 |
| A～G 音乐 | `public/asserts/music/*.m4a`、music.generated.json | 同名 MP3 派生 AAC-LC 192 kb/s / 48 kHz 双声道，七首约 19.20 MB，仅当前场景流式加载；music-assets.manifest.json 登记哈希 |
| 全站字体 | `public/asserts/fonts/*.woff2`、fonts.generated.json、fonts.css | 选择 asserts/字体/原神0.87.ttf，常用 208,828 B、其余输入按需；完整覆盖源映射，font-assets.manifest.json 登记 |

背景与梦境角色从原始目录复制，现实角色直接使用用户在发布目录替换的 JSON / atlas / 打包纹理。没有复制 MP4、Spine 工程或散件图目录，没有引用远程资源站。此前原始目录保留；player 的旧 Unity 备份已按用户后续明确要求清空，完整成品 `asserts/player/` 保持哈希不变，另从中提取独立角色。

当前已恢复 F 无 Role Spine，重新匹配原花叶切点并生成 43 份背景分带 / poster、180 姿态校准；G 仅更换静态底图，十七套用户源和服务器权限不改。C4 / C6 小轮跳测仅为历史，当前执行结果见 TEST_PLAN.md；发布仍需 Function，不能用静态 JSON 替代校时。

## Unity 壁纸套件

`asserts/player/image_1/`～`image_4/` 各自只有同名 `.json`、`.atlas` 与图集 PNG，播放新增的 `loop` 可显示完整分层动画；51 条原动画按层名保留。五张参考图留在 `asserts/player/images/`。旧网页文件已随 player-source 清空，旧生成器不再保留；验证与预览改为直接读取完整成品。

四套完整壁纸均为 4.0.17，原文件 / 哈希不变，按 skeleton 边界取景。F 已恢复 image_2 无角色派生；background.png 只用于 G 静态底图，不改变 G 角色和布局。整理 / 提取见 PLAYER_SPINE.md。

`asserts/player-extracted/` 为此前移用交付、用户后续分类整理的当前输入：image_1 提取纳西妲 / 六只兰那罗 / 三只晶蝶，image_2 与 image_3 分别为完整角色层，image_4 提取纳西妲与四只兰那罗。每个角色三件套自给，PNG 只含所选区域，第一组含 image_1_11 的必要碎片。648 区域像素对照属于原提取历史；当前 51 份发布副本按用户当前实际文件重新登记，不回滚 atlas 或重跑提取。网页 / TypeScript 方法见 [PLAYER_EXTRACTED.md](PLAYER_EXTRACTED.md)，本次游戏映射 / 奖励 / 运行预算见 [INHABITANTS.md](INHABITANTS.md)。

## E 技能取景框图案

`asserts/E技能素材/` 是从用户给出的取景框截图转换的纯图案 Spine 4.0.33 三件套（JSON / atlas / PNG），按后续要求只保留图案，去除外发光和宽幅光晕。17 个槽全部使用 normal 混合；`idle`（4.0 s 循环）/ `show`（0.7 s）/ `hide`（0.45 s）已就绪。当前通过匹配的 4.0 解析器导出真实 setup 世界变换 / UV：祝福只画 16 块外围、中心仍用草元素图标；开场另外使用原 center_emblem、四叶印与源边线方窗。clean-v2派生PNG按新哈希复制到 `public/asserts/effects/e-skill-frame-clean-7e78729b722f.png`，页面预载后共用，不新增图片或 Spine 实例；SVG / CSS / Web Animations 编排不等于运行原生三段动画。发光只在运行时小范围另叠，不将图集改成 additive。来源与真实解析 / 像素验证见 [E_SKILL_PATTERN.md](E_SKILL_PATTERN.md)，揭幕见 [OPENING_ANIMATION.md](OPENING_ANIMATION.md)。

## 替换步骤

1. 处理、裁切、压缩自己准备使用的素材；背景建议使用 WebP / AVIF 或适量压缩 JPG，角色使用透明 WebP / PNG。
2. 只复制实际需要的资源到 `public/asserts/` 下，保留 backgrounds / characters / trees / ui / audio / video 等职责目录。
3. 修改 `src/data/assets.ts` 的统一导出，背景实际配置在 `src/data/backgrounds.ts`。资源地址均以 `/asserts/` 开头且必须存在；背景与角色分别核对导出主次版本，不混用运行时。
4. 动态背景失败使用合成静态图，再失败使用原底图 / 渐变；角色先预检 JSON、atlas 和纹理，新四形象回退各自透明 poster，旧角色保留 SVG；小生物用共享渲染器和各自透明图，失败不丢热点。新增音视频延用回退策略。
5. 用开发面板走 A～G，再运行测试和构建；重点检查宽高比、树旁角色、自动气泡、手机横屏与高树视角。阶段和数值仅在开发面板中查看，不能为验收重新放回玩家界面。

## A～F 分层背景

`BACKGROUND_ASSETS` 登记运行时、来源、取景、顺序与 treatment。E 复用 D，F 恢复无 Role Spine 原生循环，G 返回空并沿用静态 img，仅底图地址改为压缩 background.png；不再用 PNG 透明装饰框或 still / foregroundMotion 特例。图片生成、哈希与预取策略见 PAGE_ASSETS.md。

| 背景 | 当前采用的 Spine 层 | 参考 |
| --- | --- | --- |
| A / forest | yhuanjing、zhongjing2、zhongjing1、qianjin、qianjintm；另有光照与飘叶 | [3.0 参考页](https://webstatic.mihoyo.com/ys/event/e20220814prev/index.html) |
| B / dunes | 七套 L / M / R 地台；sand、red、chiwang_ding、L_steps_1、五条风沙、顶光、倾斜光晕；红色流图层复用 red | [3.1 参考页](https://webstatic.mihoyo.com/ys/event/e20220917prev/index.html) |
| C / canopy | full_cloads、full_building2、full_tree2、full_tree、full_building、full_NPC 的地面槽、medium_box、medium_flag、close_flower、Close_butterfly、close_bottle | [3.6 参考页](https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/index.html) |
| D / sanctuary | shouye_sky、moutain、clouds、tree、floor、effect_immobilized、light、leaf；前景雾和飘叶 | [3.2 参考页](https://webstatic.mihoyo.com/ys/event/e20221024prev/index.html) |
| E / embers | 共用 D 八套 Spine 和雾 / 叶片，背景内部调色、做旧、烟雾 / 余烬 / 灰屑 | 用户两张青蓝 / 燃烧树颜色参考 |
| F / festival | 无 Role image_2 派生、十四页环境图集与原生循环 | asserts/background-derived/festival，源 asserts/player/image_2 |

四站已在本机 Chrome 实开主场景并核对原始配置与间隔画面，不把原站脚本、角色、Logo、按钮或远程依赖搬入游戏。此前 A / B 的失败请求涉及站点分析服务，不应误认为背景素材不可访问。统一采用 2500×1080 设计取景，修复错误缩放和人为位移；完整差异、截图和补取清单见 BACKGROUND_FIDELITY.md。

- A 图集的 `zhongjing2_3.png` 实际对应本地 `_other_resources/33291.png`，尺寸 1102×527，已复制为图集页名。其他哈希 PNG 同样只将发布副本命名为 atlas 引用名，原文件不改写。
- B 的 `BG.json / BG.atlas` 缺少对应 `BG.png`，但官方配置表明它属于 scene_mon_0，并非首页缺层；当前不使用或请求。主景七套地台和新增静态层均来自本地，不拿含赛诺的 ps_bg 代替纯背景。
- 新增的 A `index_light.jpg`、C `full_NPC.json / atlas / png` 与 `ground.png / ground.geometry.json` 来自官方公开脚本 / 图片，另存 `asserts/reference-supplements/`，源文件与发布副本校验一致。执行 `npm run assets:background-supplements` 可重新补取；哈希变化先人工审核。C 图集包含人物碎片，但配置只放行地面槽 `2`；独立地形保留原网格并投影绘制，不以色块掩盖穿空。详情与直接来源链接见 BACKGROUND_FIDELITY.md。
- B 新增 `abd_smoke_diffuse.jpg`（155995 字节），供 `red-flow` 使用；原有 `mainview_caihong.png` 直接复制到发布目录。D 新增 `loading_flowMap.jpg`（14115 字节，官方首页模块 77323 内嵌），供 `mist` 使用。两张新流图同样固定哈希、保留来源副本；没有缺少且需要用户手动下载的文件。
- `BackgroundPlane.noise` 登记第二纹理，`rotation / tilt / depth` 登记原方向和投影，`speed / range` 控制流速和幅度；五条飞沙引用相同 mainview_sha，加载 / 解码 / 上传按资源去重。B 所有图片效果与 A 光照在横屏档保留，不能为省装饰而删掉本轮指定效果。
- A 的 `baseEntrance` / 分层 `entrance` 以原纵向起点、帧数及缓动适配约 3.39 秒自动下移；取消 Z 轴缩放，各层保持终态大小。开场与加载使用同一 BackgroundBase / projection 几何，树苗锚定设计坐标 `(0, -360)` 并与 qianjin 共用位移 / 活动时间；不改原 JSON。改变取景或倒木位置时同步校准锚点和首帧像素。普通重建保持进度，静态降级时树与背景一起进入终态；D 仍应用 in 终态接 loop。
- A / B / D 均为 4.0.33，复用角色的 4.0 模块。C 为 4.1.17，新增固定的 `spine-webgl-4-1`（官方 4.1.56）按需模块。只共用稳定的低层绘制接口，不让 4.0 解析器读取 4.1 数据。[Spine 官方版本约定](https://en.esotericsoftware.com/spine-versioning)
- 背景不使用一层一个 SpinePlayer；骨骼与图片按 order 在同一 WebGL 画布中绘制。移动视口只省略 optional 装饰，不删除主要地形、建筑、旗帜与雾光。D 先应用 in 的终态再接 loop，不播放全屏长入场；关键帧之外显式处理 extra 风摆、位移与蝴蝶随动，不能因 animation 为空就判定素材没有动态。
- 移动端解码纹理最长边 1024，桌面 2048；同时缩放内存中的 atlas 页、裁切偏移、原始尺寸和旋转区域的像素元数据，保持归一化 UV 与附件几何一致，原 atlas / JSON / PNG 不修改。只缩 PNG 而不修正元数据会出现矩形错贴，已补真实解析器回归。
- 纹理采用直通 alpha 与 Linear 采样，关闭 atlas 中的 MipMap 最小化过滤，避免 NPOT 缩纹理在 WebGL1 下变黑。ImageBitmap 与 GLTexture 随场景释放，不将已关闭的 bitmap 留给运行时读取尺寸。

### 重新生成静态图

先运行 `npm run dev`，另开终端运行 `npm run assets:background-posters`。脚本顺序渲染 A～F 后释放上下文；`draw(0, width, height)` 默认入场终态，不经过养成。A～E 为 2000×864，F 为 2000×1125；A～D 字节仍为 208452 / 93310 / 227954 / 184644，本轮 E / F 为 152300 / 139632。图中不包含可生长主树 / 独立角色 / UI。A 加载先显示相同天空几何，回退 / 减少动态使用完整终态；E poster 含处理，F 不含内嵌纳西妲。PowerShell 可用 `$env:BACKGROUND_STAGES='EF'` 仅重生成这两套，运行后 `Remove-Item Env:BACKGROUND_STAGES`。

该脚本只重写六个 poster.webp，不改原始素材，正式运行不保留绘图缓冲。分层 / 取景变化后先重生成、检查图，再构建及回归；不要把整张图集拼图当成场景。

### 藏身分带与姿态校准

背景分层变化后，开发服务运行时依次执行 `npm run assets:hiding-layers`、`npm run assets:hiding-calibration`；仅改藏点坐标时只执行后者。第一项按 `backgrounds.ts` 的实际槽位生成 A / C / D / E / F 的背景分带、累积前景 / 背板、A 加色光和同管线 poster，43 份输出字节数 / SHA-256 记入 `docs/inhabitants/hiding-layers.json`。A 光单独导出并 plus-lighter 合成，不能把 JPEG 加色光的矩形 alpha 当成遮挡。第二项只调整 30 处世界点 × 六姿态的少量平移和热点，输出 `src/data/hiding.generated.json`、180 条校准记录和五套十点总览；本轮 F 花叶恢复后已重跑，静态抽样可见比例 12.75%～46.04%，不裁角色、不补画叶沿、不改原骨骼。

每套另有真实屏幕上 / 下 / 左 / 右四点，不需用世界点模拟；上缘倒挂限定 01 / 02，须补偿 export_root 原平移。随机出现只选当前画幅安全点，不能用窄屏 clamp 把多处物件挤堆。动态通过背景原 GL 按槽位穿插 4.0 角色，C 原景保持 4.1；静态用真实分带与完整透明姿态交错，不能在完整 poster 上重复覆盖半透明前景。分层变动后两命令都重跑，再做桌面 / 横屏动态、缺图 / 无 GL 和释放回归。

逐点 `arrival / departure / travel` 在 `src/data/inhabitants.ts` 配置，不烘入 Spine 或重新提取源图：A1 / A2、C3 / C4 / C6 入场原地渐显，C3 / C4 向下退至屏幕外，C6 保留原退场；D / E 的 1 / 2 / 6 三成位移并柔和淡化，左右屏缘领奖跳出后直接横向离开。C4 / C6 沿用左旗柱下沿 / 右阶台面内沿的真实中景遮挡和既有姿态校准。本次只改动效配置及镜头控件 CSS，不重新校准 / 导出资源，按用户要求不运行验证；更换演员包络或取景时仍应复验，详见 INHABITANTS.md。

### F 派生与 E 氛围维护

`npm run assets:festival-background` 从完整 image_2 另存 `asserts/background-derived/festival/festival.json / atlas`，复制发布副本和原 01～14 页。整层移除 Role 的 404 骨 / 184 槽、约束、动画 / 变形，以及含纳西妲、秋千、绳索和配饰的专用 15 页；保留其他层的世界位置、网格权重、UV 和 40 秒 loop。manifest 登记所有输入 / 输出哈希，单元对照原素材多个循环相位的真实顶点。不得用旧 player-source 重新覆盖完整素材或 17 套独立角色。

F 保留源 2400×1350 设计，相机中心 `(0, 0)`，14 张纹理未重压；窄天空页以 16:9 逻辑比例铺底防露边。E 复用 D 源文件，色彩参考不直接贴入截图。`treatment.ts` 复用同一受限 RGBA 目标；无随机角色时整景一次处理，有角色时分段合成背景、穿插未染色角色，不染 UI、不新增纹理下载，目标计入 textureBytes。更改后重生成 E poster / 分带，并检查桌面 / 横屏与回退。

## 树木美术接口

来访当前按轮廓草光 → 花叶流 → 树侧用户 E 技能图案 / 草图标与扫描 → 成长播放，不使用角色侧小框 / 小图标或数据电路。外围由 npm run assets:e-skill-pattern 用匹配 4.0 解析器从 asserts/E技能素材 导出 16 块真实 setup 几何 / UV / 渐入延迟，排除 center_emblem；E_SKILL_PATTERN 登记三份固定哈希与导出数据。84838 B clean-v2 PNG复制为 public/asserts/effects/e-skill-frame-clean-7e78729b722f.png，正常 alpha，来访时预载；SVG / CSS 不增 GL / RAF，不播放原生完整 idle / show / hide。中心仍是 DENDRO_ICON 登记的 2164 B 真实草图标，镜像 / 权属见 NAHIDA_BLESSING.md；用户原三件套 / 角色 / poster / 背景 / 校准不改。接入与重生成说明见 E_SKILL_PATTERN.md。 最新落点 / 发射点：全部角色原向，不翻转 Spine / poster；A / C / F 原左右位置保持，B / D / E 两处均在树左侧、第二处更靠左且略高。VISIT_EMITTERS 原向躯干锚点不反算 x；花叶按实际 NahidaAvatar 包络与既有背景时钟更新，不从透明边缘发射，无新 RAF。

不要用一张完整巨树图片在每个阶段缩小替换。保留真实高度、旧枝条 ID、历史印记和镜头关系，可把树干分段、枝叶簇与树冠改成手绘 SVG 或透明贴图。

主树木质仍由treeGrowth.generated.json原57骨骼 / 56槽位和51条完整轨控制；growthRoute.ts组织58拍，presentation.ts统一同一grow的leaves / clusters真实模型，不能直接用raw终态代替叶拍。原leafAnchors校正及111点foliageLayout / 96新枝foliagePlan形态序列不改；实际grow34 / D580接管。芽grow25 / leaf4_1、叶grow35 / leaf1_3、簇grow37 / bunch1_3、grow38 / bunch2、grow46 / bunch3_1保持完整0.5 / 0.25秒；full / leaves按max(body,delay+clip)，clusters木质终态稳定仅对应簇0.25秒。命中 / 高度 / 施法 / 表情和晶蝶均读高层presentation，唯一GSAP / 暂停 / 最后7点不变。换图才assets:tree、原骨架变化才assets:tree-growth；本轮不需新资源 / 存档，详见TREE_SYSTEM.md。

命中仅使用当前绘制的树干 / 根 / 枝叶 / 花朵，跟随动画高度；SVG 空白、光晕和未显现叶片穿透。替换美术时同步适配可见几何命中，不恢复全高矩形或加宽透明路径，不以缩裁视口改变树的视觉变换原点；保留键盘与轻扫误触保护，固定树根视角。

梦露运行时由game/dew/treeSpace.ts投影当前presentation附件包络，生长合并前一浇及沿途采样；程序化树按实际根干冠避让。data/treeArt.ts的480半宽仅供缺少几何信息时保守回退，保留触摸间隔。替换枝叶 / 树冠或增加横向摆动后同步校准当前包络，复验桌面 / 平板 / 手机横屏；详见TABLET_LAYOUT.md。

可供后续生图的提示词：

> 横屏幻想森林梦境，须弥草木与植物纹饰，青绿色薄雾、柔和淡金光束、暖白萤火，细腻手绘二次元游戏背景，画面中心留白放置可生长的小树，前景两侧深色草叶与树干框景，宁静温柔，层次清楚，无人物、无文字、无标志，16:9。

当前树不再用旧浅金树皮 / 黄绿叶占位提示词；准确执行的逐件银白木质 / 青蓝叶簇 / 粉白高光提示词与输入角色见tree-art-prompts.json，不用完整背景或假透明底代替部件。

这些只是提示词；本轮未生成或假装接入外部生图文件。

## 当前角色 Spine

已从本地 JSON 的 skeleton 元数据读取：

- `asserts/caoshen/shouye_caoshen.json`：Spine **4.0.33**，图集与 PNG 在同目录。
- `public/asserts/characters/reality/naxida.json`：用户替换的 Spine **4.0.33**，动画为 `animation`。

A / C / D / F 现分别使用 nahida_dream / nahida_wave / nahida_bouquet / nahida_swing；B / E 继续 shouye_caoshen，G 使用用户当前 reality 文件。四新素材 4.0.17、旧两配置 4.0.33，统一匹配官方 4.0.31；4.1 仍仅用于 C 背景。新素材直接复制用户当前 player-extracted，不重跑旧提取，不以旧目录或旧哈希覆盖；原始三件套不改。

| 发布文件 | 原始来源 |
| --- | --- |
| `inhabitants/nahida/` 四姿态三件套；`inhabitants/aranara/` 十套与 `crystalfly/` 三套 | 当前 `asserts/player-extracted/` 对应分类 / 同名目录，51 份原字节，登记在 docs/inhabitants/manifest.json |
| 同目录各 `*.webp` | 同一 CreatureRenderer 渲染的 17 个透明静态姿态，不复制含背景的旧总览 |
| `characters/dream/shouye_caoshen.json`、`.atlas` | `asserts/caoshen/` 同名文件，直接复制 |
| `characters/dream/shouye_caoshen.png` | `asserts/caoshen/shouye_caoshen.455b1581.png`，仅将副本改为 atlas 引用的文件名 |
| `characters/reality/naxida.json`、`naxida.atlas` | 用户直接在发布目录替换，保留原文件内容 |
| `characters/reality/naxida.3807ce40.png` | 用户提供的新纹理，保留哈希文件名，通过纹理页映射满足 atlas 的 `naxida.png` 引用 |

B / E 的旧梦境骨骼继续 in 末尾 650 ms 接 loop，现实继续 animation；四新姿态播放各自 loop，完整原动画保留在副本，没有伪造骨骼动作名。观察 / 出入主要通过原循环与 CSS / 局部位移适配，角色形象和四种外框不同，详见 INHABITANTS.md。

`CharacterAdapter` 支持 play / setPaused / dispose，动作变化不重建，暂停 / 卸载清理规则保留。旧两配置用原自动包络；新四种用 JSON 完整动画包络，比例、poster 与文件来自生成登记。小生物不逐只用该播放器，而共用透明 SceneRenderer，减少动态用 poster，失败仍可点击。

更新当前 17 套素材后先运行 `npm run assets:inhabitants`，开发服务运行时执行 `npm run assets:inhabitant-posters`，再构建 / 验收。新 manifest 记录实际输入 SHA-256，不修改旧移用包的历史 manifest；完整说明和每种姿态映射见 INHABITANTS.md。保留原文件名，尤其用户已修正的 atlas PNG 页名。

当前两份纹理采用直通 alpha，配置显式使用 `premultipliedAlpha: false`。放大后若出现白边 / 黑边，先核对导出的 alpha 方式与该配置，不要用描边、强烈发光或额外阴影遮盖拼接错误。纹理有哈希文件名时，更新 `texture` 与 `atlasTexture` 的映射，不需要修改 atlas 本身。

运行时与素材均随本地构建提供，没有第三方 CDN 请求。当前角色许可原文在 `public/licenses/spine-4.0.txt`，C 背景新增运行时的许可在 `public/licenses/spine-4.1.txt`。正式对外发布前由负责人确认 Spine Editor / Runtime 和素材使用条件，本轮不代替用户完成授权或发布。

此前六份文件的来源一致性记录对应替换前版本。当前现实三份文件直接来自用户在 reality/ 的原地替换，本轮没有改写或重新覆盖；测试直接校验正在使用的文件与路径。

官方参考：[Spine Web Player](https://esotericsoftware.com/spine-player)（版本匹配、图集路径与生命周期）、[Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license)。

## 正式音视频

用户已有《生日快乐》《无垠无忧》与《花与美梦》等 MP4。当前不使用每阶段 StoryEvent 转场弹层；配置里的历史叙事元数据保留作后续文案参考，最终梦醒是简短自动光效。未来按事件接入音视频时，仍须遵守用户交互后的播放限制，提供跳过、失败回退与统一清理，不得把普通成长重新改成确认式演出。

背景、角色和音视频来源沿用用户提供的信息，正式对外发布前由企划方完成最终素材取舍与来源登记。
