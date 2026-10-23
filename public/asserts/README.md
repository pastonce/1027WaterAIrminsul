# 发布资源登记

页面启动揭幕复用 effects/e-skill-frame.png（1024×640、122861 B，源 PNG / public / dist SHA-256 均为 98bb9de5b3471e2d6720f023ed01aaf35ae760a1fb787a14f90ec611f9029648）。assets:e-skill-pattern 在原 16 块祝福外围之外单独导出原 center_emblem 与 522 px 方窗，原 JSON / atlas / PNG 不改；页面预载同一 URL，开场与祝福共用，不添加纹理、画布 / GL / RAF。5.8 秒开场、单印 2.85 秒恒定尺寸使用右上角四叶印从左屏外抛入，沿页面中线阻尼弹跳，第三次主触底后微弹三次再水平滚到中央、横竖对齐后在中央静停 600 ms 再分裂，SVG / Web Animations 揭示真实页面而不运行原生完整动画。祝福仍排除原中心、继续草元素图标 / 扫描，后文“排除 center_emblem”仅指祝福，见 docs/OPENING_ANIMATION.md、E_SKILL_PATTERN.md。 横移 / 旋转共用一阶连续曲线，保留屏宽 16% / 27% / 34% 三处主落点；微弹期间保留水平动量，落稳直接滚动，不停车再加速。

背景和梦境角色的原始素材位于项目根目录 asserts/，用户原有文件未改写。新增官方补取资源另存 asserts/reference-supplements/，带固定哈希与来源 manifest。现实角色直接使用用户在此目录原地替换的版本。

- backgrounds/dream.jpg：3.0/_other_resources/loading_bg.29f573d9.jpg。
- backgrounds/celebration.jpg：3.2/_other_resources/main_bg.971baf45.jpg。
- backgrounds/forest/：A，3.0 的 yhuanjing、zhongjing2、zhongjing1、qianjin、qianjintm 骨骼与完整图集页；zhongjing2_3.png 对应原 _other_resources/33291.png。index_light.jpg 来自官方首页脚本内嵌资源，loading_leaf_small.png 来自本地同名哈希文件。分层入场仅修改运行时位置 / 比例，原素材不改；横屏也保留光照。
- backgrounds/dunes/：B，3.1 的七套 L / M / R 地台骨骼与图集，以及 scene_mainview/ 下的 sand、red、chiwang_ding、L_steps_1、mainview_sha、mainview_light_top、mainview_caihong 图片；五条分方向飞沙共用一份 mainview_sha，重复红树底层共用一份 red。abd_smoke_diffuse.jpg 为本轮官方补取的原流图，来自 images/abd_smoke_diffuse_jpg.14529b29..jpg，源副本在 reference-supplements/3.1/。BG 属于原站怪物页，不是首页缺层，当前不使用。
- backgrounds/canopy/：C，3.6 的 full_cloads、full_building2、full_tree2、full_tree、full_building、medium_box、medium_flag、close_flower、Close_butterfly、close_bottle 及 bg.png；full_NPC.json / atlas / png 为官方补取，只允许地面槽 2 绘制，不显示 NPC。ground.png 与 ground.geometry.json 同样来自官方公开场景，保留原地形拓扑并投影绘制，不用色块填空。所有原骨骼 / atlas / 图片保持字节内容。
- backgrounds/sanctuary/：D，3.2 的 shouye_sky、moutain、clouds、tree、floor、effect_immobilized、light、leaf；loop 层先应用 in 终态，不播放长入场。main_cloud.png 来自 main_cloud_w2820.88113652.png，main_leaf_particle.png 来自原 _other_resources/33985.png。新增 loading_flowMap.jpg 来自官方首页脚本模块 77323 的内嵌 JPEG，源副本在 reference-supplements/3.2/，用于下方雾气流动。
- backgrounds/embers/poster.webp：E 复用 sanctuary 的全部源资源，不复制第二套大图集；仅在背景目标内做青蓝灰 / 锈橙调色、斑驳做旧、烟雾 / 余烬 / 灰屑。静态图由相同渲染管线生成，主树、独立角色和 UI 不染色。
- backgrounds/festival/：F 恢复 festival.json / atlas / image_2_01～14.png（无 Role 派生、原生 40 秒循环），十五页专用角色图仍排除；poster / hiding-* 已恢复真实花叶分带并重校藏点。独立秋千、四常驻、十七套角色不改；旧 festival-frame/ 图片派生已撤销。
- 六个背景的 poster.webp：A～E 为 2000×864，F 为 2000×1125，静动等比取景；通过 npm run assets:background-posters 重生成。A 使用入场终态，E 含指定调色 / 特效；均不含可生长主树、独立来访角色或 UI，F 保留原环境中的远处人群。G 不改。全 UI 不加压暗遮罩或降饱和滤镜。
- forest / canopy / sanctuary / embers / festival 的 hiding-band-*.webp：真实背景槽位分带，A 四带、其余各三带；A 的 hiding-light-1.webp 为独立加色光，用 plus-lighter 合成。另有 hiding-back、hiding-foreground、hiding-after-* 累积层用于姿态校准。连同五张 poster 共 43 份，大小 / SHA-256 在 docs/inhabitants/hiding-layers.json；由 assets:hiding-layers 实际导出，随后 assets:hiding-calibration 校准 180 种物件 / 姿态。均不含独立角色，不裁身体或补画遮挡。
- characters/dream/shouye_caoshen.json、shouye_caoshen.atlas：caoshen/ 同名文件；shouye_caoshen.png 来自 shouye_caoshen.455b1581.png，仅副本重命名。
- characters/reality/naxida.json、naxida.atlas、naxida.3807ce40.png：用户在此目录原地替换的新素材，均不改写；atlas 中的 naxida.png 页名通过运行时映射到哈希纹理。
- characters/nahida-placeholder.svg：本项目自绘，仅作加载与失败回退。
- inhabitants/nahida/：A nahida_dream、C nahida_wave、D nahida_bouquet、F nahida_swing，从用户当前 asserts/player-extracted/nahida/ 原样复制；每套同名 JSON / atlas / PNG 和生成的同名透明 WebP。按 JSON 完整动画包络取景，B / E 继续 characters/dream，G 继续 characters/reality。
- inhabitants/aranara/：aranara_01～06 在 A / C / D / E / F 的固定藏身点随机探头；aranara_07～10 在 F 常驻。每套三件套来自用户当前同名目录，透明 poster 为静态回退，不使用整张图集充当形象。
- inhabitants/crystalfly/：crystalfly_01～03，复制当前三件套；成长 100 才出现第一只，之后按种子随机树高逐只增添，枝叶世界锚点不重排。与 F 常驻共用一个额外透明画布；随机兰那罗用匹配 4.0 渲染器共享原背景 GL、在真实层次间绘制。减少动态使用各自 poster 与真实静态背景分带。
- ui/leaf.svg：本项目自绘图标。

旧梦境 / 现实角色为 4.0.33，新 17 套为 4.0.17，均匹配 4.0 运行时；六种来访 / 常驻配置、纹理映射与直通 alpha 登记在 src/data/assets.ts，新素材注册在 src/data/inhabitants.generated.json。51 个当前输入及发布副本 SHA-256 在 docs/inhabitants/manifest.json；npm run assets:inhabitants 只复制当前源，不重提取或覆盖用户目录。运行开发服务后，npm run assets:inhabitant-posters 通过真实渲染器生成 17 张透明 WebP。不拿 asserts/纳西妲/ 下旧版覆盖现实角色。

背景来源在 src/data/backgrounds.ts：C 为 4.1.17，单独使用 4.1 WebGL；A / B / D / E 为 4.0.33，F 为 4.0.17，共用匹配的 4.0。第三方许可原文在 public/licenses/spine-4.0.txt 与 spine-4.1.txt，发布前确认使用条件。完整说明见 docs/ASSET_GUIDE.md 与 docs/INHABITANTS.md。

来访规则保持 0.1 / 最多两次 / 倒数第二浇保底补满，普通赠阶段总需求 1/10、双位置保存。最新祝福为角色 alpha 轮廓草光 → 花叶 → 树侧素材大框 / 中心单草图标扫描 → 成长，没有角色小框 / 小图标或数据电路。effects/e-skill-frame.png 为用户 asserts/E技能素材/e_skill_frame.png 的逐字节副本（1024×640、122861 B）；npm run assets:e-skill-pattern 用匹配 4.0 解析器导出 16 块 setup 变换 / UV / 渐入延迟，排除 center_emblem、保留源文件。E_SKILL_PATTERN 登记来源 / 固定哈希；SVG / CSS 正常 alpha，不增 GL / RAF，来访时预载，不播放原生完整 idle / show / hide。中心 effects/dendro.png 仍是 UI_Buff_Element_Grass（64×64、2164 B），Enka.Network 游戏资源镜像非官方托管，来源 / SHA-256 见 asserts/reference-supplements/nahida/manifest.json，运行时仅本地资源，发布前确认权属。详细接入、减少动态、失败路径与验证见 docs/E_SKILL_PATTERN.md / NAHIDA_BLESSING.md。 最新落点 / 发射点：全部角色原向，不翻转 Spine / poster；A / C / F 原左右位置保持，B / D / E 两处均在树左侧、第二处更靠左且略高。VISIT_EMITTERS 原向躯干锚点不反算 x；花叶按实际 NahidaAvatar 包络与既有背景时钟更新，不从透明边缘发射，无新 RAF。

背景同时使用原生关键帧、extra 扩展风摆 / 漂移及原站流图方程，图片层 / 效果程序与骨骼共用一个背景画布。补取资源累计八份，固定来源、字节数和 SHA-256 见 asserts/reference-supplements/manifest.json；脚本为 npm run assets:background-supplements，不在玩家运行时联网执行。详细公开来源、主景差异与截图见 docs/BACKGROUND_FIDELITY.md。

入梦共用底图几何，A 自动下移只做纵向分层；树苗、晶蝶及祝福落点与前景共享时钟。既有五套分带 / poster、原背景、17 套角色及现实替换未改，180 姿态校准沿用。藏点保持六物件 + 四屏缘；A1 / A2、C3 / C4 / C6 原地渐显，C3 / C4 下方离屏，D / E 指定点短程，左右屏缘领奖腾空直出，镜头控件右上移且热点优先。中心散露、树命中、普通五秒 / 奖励六十秒、祝福计入对白后总共 3～7 秒均为程序交互，不烘入背景。2026-10-17 小轮跳测属历史；本轮恢复验证，最新结果见 docs/TEST_PLAN.md。
阶段加载图标 loading/seven-elements.webp 保持原字节 / 来源 / 哈希（1024×128、50168 B、7f68bbea38f5fed758c29074f60470c117eeaa185c58f6cf774d7816cafcf65d）。七色大跳、末枚实际中点 966.5 的唯一一次 1100 ms 长停不变；转场已接入用户插图，不再全部白底，插图和新景均就绪后释放。

2026-10-20 最新修订：loading/art/ 十一图双档保持、CD2 左裁 580 px；展示改 cover 全屏 / CD2 右对齐，七元素原位叠图。backgrounds/reality/realitybackground-1067.*.webp 来自 background.png，仅替换 G 静态底图；ui/icon-128.*.png 与原字节 dialogue-840.*.jpg 保持，气泡降低提亮遮盖。十四张输入 40705323 B、二十五项活跃发布图片 3405767 B，不含整站 / F Spine；尺寸 / 哈希见 docs/page-assets.manifest.json，无外链或音乐下载。

