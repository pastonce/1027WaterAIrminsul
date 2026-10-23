# 背景还原度与 E / F 氛围制作 · 更新至 2026-10-22

本轮重新读取 3.6 官方页面及公开场景配置（只读文本，不执行原站脚本），对照已有 1600×900 / 844×390 官方参考截图，将 C 下方 ground 深绿网格整体上移 40 世界单位：mesh.vertical 从 -268.5352 改为 -228.5352。保留 28 顶点 / 26 三角面、原 UV、0.11973 倾角、39.8897 局部偏移及其余舞台 / 旗柱 / 花丛位置；不移动兰那罗遮挡槽或热点。重导真实分带 / poster 和两档纯景审查图，原素材不改；仍是本项目取景适配，不宣称原站逐像素一致。

此前修订已恢复 F 的 image_2 无 Role 原生循环、真实花叶切点和静态回退分带；background.png 仅用于 G 静态底图，不改现实角色、装饰 / 布局或交互。原壁纸 / 十七套角色不改。已重导分带、180 姿态及 F 桌面 / 横屏预算；转场现为全屏 cover、七元素叠图，详见 PAGE_ASSETS.md。以下原站还原与 E 着色结论保持，旧验证不当作本轮。

## 复核结论

2026-10-18 新增来访双位置与对白后草元素祝福，仅涉及业务、角色布局和局部透明 SVG / CSS，不改背景取景 / 原生动态 / 分层 / E 调色，也不重生成分带或 poster。无全屏色罩，不下载远程美术或执行原站脚本；角色、主树与 UI 不被背景调色。本轮恢复单元 / 构建 / 浏览器验证，结果见 NAHIDA_BLESSING.md、TEST_PLAN.md，不冒称重新复核原站。

最新祝福已按用户要求改为角色 alpha 轮廓光 → 花叶流 → 树侧素材扫描框 / 单枚草图标 → 成长，移除角色侧小框和数据连结。外围从用户 E 技能三件套导出 16 块真实 4.0 setup 几何 / UV，122861 B 图集逐字节复制，原中心排除；不改背景、原角色或原站还原结论，不增加背景 GL 纹理 / 上下文 / RAF，无运行时外链。具体限制见 E_SKILL_PATTERN.md。

历史记录：最新补调让 C4 同 C3 原地渐显 / 下方离屏，C6 原地渐显；镜头控件进一步右上移，轨道穿透、兰那罗热点优先。均为程序配置 / CSS 调整，背景、藏点坐标、分带 / poster 与校准记录不变；按用户要求本次不重新验收或测试，以下还原复核 / 像素记录仍属此前结果。

历史记录：此前已实开四个官方主场景，核对原始配置、扩展字段与图集，修复风摆、取景、缺层和静动比例；随后完善入场、飞沙 / 光晕 / 红色流动、流雾及 E / F，并导出真实藏身分带。上一轮调整逐点进退、C4 / C6 位置及树体命中并重跑校准；本次只补调动效 / 镜头控件，不改坐标或重新生成资源，43 份分带 / poster 与原背景不变，不宣称重新复核原站。

目前 A～D 保留主体构图、原生关键帧、扩展风摆与指定流图方程，仍是轻量复现，不声明逐像素 / 逐帧一致；不移入这些原站的主角、NPC、Logo、宣传 UI 和滚动章节。最新 E / F 按以下要求制作，覆盖旧「暂时保留原图」约定，G 不改。

## E / F 新背景

- E：直接复用 D 的树林 / 庭院、相机、八套 Spine、流雾和原生 / extra 动态，不复制第二套大图集。以用户第一张青蓝 / 深青遗迹为底色参考，结合第二张燃烧树的锈红、暖橙与余烬；当前采用冷青蓝灰底、铜锈橙发光边缘、表面斑驳细粒、低频烟雾、上升余烬与灰屑，不将参考图人物或整图贴入场景。不是原站火焰模拟或对参考截图的逐像素还原。
- E 处理只发生在同一 GL 的背景 RGBA 目标；无随机兰那罗时整景一次合成，有角色时按护栏 / 楼梯分段复用同一目标，角色插在已调色背景段之间，不染主树 / 小生物 / 来访 / 气泡 / UI，无全屏 DOM 遮罩。保留 D 相同地标和约 900 ms 衔接；处理、风摆和流雾共用活动时间，暂停 / 零 delta 不推进。目标限最长边 2048 / 1024，重配与释放保持。
- F：恢复 image_2 无 Role 派生包，329 骨 / 158 槽 / 十四页环境图集 / 原生 40 秒 loop；专用 Role 与第十五页不加载。真实花瓣 / 近叶槽位之间绘制随机兰那罗，不裁身体、不补画遮挡，撤销 PNG 装饰框。
- F 保持 2400×1350 世界取景与等比 cover，独立秋千、四常驻 / 晶蝶 / 奖励保持。六物件点重新匹配原花叶、四屏缘不变，原活动时钟持续驱动背景并跟踪花叶发射点，无新的 RAF。G 仅换 background.png 静态底图，原角色 / 拱廊保持，夜间彩蛋已按新需求取消；派生数据哈希见 asserts/background-derived/festival/manifest.json。
- 静态回退 / 真实分带从当前渲染管线生成，F 新 poster 为 2000×1125、62102 B，不含独立人物。43 份产物与哈希在 inhabitants/hiding-layers.json；本轮 F 上传纹理为桌面 7682400 B / 横屏 7077888 B，不是整页峰值内存。

| 新背景 | 桌面纯景 1600×900 | 横屏纯景 844×390 | 游戏桌面 / 横屏 |
| --- | --- | --- | --- |
| E | [纯景](screenshots/background-E-clean-reference-size.png) | [纯景](screenshots/background-E-clean-mobile-landscape.png) | [桌面](screenshots/background-E-desktop.png) / [横屏](screenshots/background-E-mobile-landscape.png) |
| F | [纯景，无内嵌角色](screenshots/background-F-clean-reference-size.png) | [纯景](screenshots/background-F-clean-mobile-landscape.png) | [桌面](screenshots/background-F-desktop.png) / [横屏](screenshots/background-F-mobile-landscape.png) |

生产来访截图为 `background-E/F-production*.png`，四姿态与常驻另见 `inhabitants-*-production*.png`。随机兰那罗现在共享背景原 GL，C 背景自己用 4.1 / 角色自己用 4.0，并在原绘制槽间穿插；额外透明画布只绘常驻 / 晶蝶，不改变单动态背景约束。

## 最新藏身分层

五套各六个物件后点 + 上下左右四屏缘点，跨不同高度 / 景深。A 使用花叶 / 倒木 / 前景三个切点，C 使用花箱 / 近花两个切点，D / E 使用同一地面骨骼的护栏 / 楼梯槽，F 使用原花瓣 / 近叶槽。分段绘后恢复 drawOrder，不删主要物件，不裁身体或添加假叶沿。

减少动态 / 无 GL 使用同一管线导出的真实静态分带；A 加色光另导出并 plus-lighter 合成，防止把带光 JPEG 的矩形 alpha 当作遮挡。E 透明段保留对应调色，F 背景仍不含 Role。`assets:hiding-layers`、`assets:hiding-calibration` 与原 poster / audit 命令配合维护，原素材不改；43 份输出哈希和 180 姿态校准见 `docs/inhabitants/`。五套十点工程图及真实 GL 合成见 `docs/screenshots/hiding/`；完整验收见 TEST_PLAN.md，不能将工程同时展示十点当作同屏上限改变。

当前 A1 / A2、C3 / C4 / C6 原地渐显，C3 / C4 向下离屏，C6 原退场不变；D / E 的 1 / 2 / 6 短程柔和进退，左右屏缘领奖跳出后直接移出两侧。C4 / C6 沿用左旗柱下沿 / 右阶台面内沿，镜头控件右上移并让兰那罗热点优先，不改背景动效、取景或切点。当前静态校准为 12.75%～46.04%；既有 54 组合像素记录属补调前，详见 INHABITANTS.md 与 TEST_PLAN.md，无新增缺失素材。

## 逐套对照

| 内部映射 | 原站与发现的问题 | 本轮处理 |
| --- | --- | --- |
| A / 3.0 | [千朵玫瑰带来的黎明](https://webstatic.mihoyo.com/ys/event/e20220814prev/index.html)：远景被误放大 3 倍并移位；藤蔓、花叶的 extra 动画未播放；光照层遗漏 | 恢复远景原点和比例，采用原站主景取景；读取 69 份扩展绑定；补取内嵌 index_light，恢复轻量光照与飘叶 |
| B / 3.1 | [赤土之王与三朝圣者](https://webstatic.mihoyo.com/ys/event/e20220917prev/index.html)：多组地台位移、缩放偏离原配置；没有赤王陵顶部、红树和左前景；植被扩展风摆遗漏 | 按原站地台坐标恢复层次与绘制顺序，补齐本地已有的静态层与风沙 / 顶光；七套 Spine 均保留在横屏档，不再删除地形结构 |
| C / 3.6 | [盛典与慧业](https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/index.html)：误将其他场景的 flower / butterfly1 代替主景前景；缺少远树、前花、瓶子、舞台地面与独立地形，曾用建筑下移补洞 | 改回正确主景分层，取消建筑 / 旗帜的人为下移；补取 full_NPC 图集，仅绘制地面槽 `2`；补齐原站 28 顶点 / 26 三角面的地形及纹理，不再让天空从台阶下穿出；旗帜、云、花叶与蝴蝶随动共同播放 |
| D / 3.2 | [虚空鼓动，劫火高扬](https://webstatic.mihoyo.com/ys/event/e20221024prev/index.html)：缺少舞台效果和前景雾；云 / 树的 extra 风摆遗漏；部分 loop 依赖 in 的终态 | 补齐 shouye_effect_immobilized、main_cloud 与飘叶；先应用 in 终态再开始 loop，不播放长入场；恢复前叶位置和主景尺度，横屏仍保留光、叶与雾 |

B 的 `BG.png` 确实未随用户原始目录提供，但进一步核对表明 `BG` 用在原站的 `scene_mon_0`，不是首页背景。它并非本次背景缺口，不再将缺少 BG.png 当作首页无法还原的原因，也不请求这个无关层。[原站场景配置所在脚本](https://webstatic.mihoyo.com/ys/event/e20220917prev/vendors_c06290f60048167974de.js)

## 动态和大小位置

- 原站的多份 `animation` / `loop` 本身为空。风摆存于 `extra`，仅使用标准 Spine AnimationState 不会播放这些效果。`extra-motion.ts` 现在在关键帧之后应用模式 1 的子链风摆和各轴缩放、模式 3 的多谐波位移；采用导出的周期、振幅、相位、层级传播和时间比例，不用统一 CSS 摇晃代替骨骼。
- 模式 4 用导出的延迟、速度、阻尼、角度范围做稳定的蝴蝶次级随动，避免依赖原引擎帧率；这是近似适配，不声称旧引擎物理轨迹逐帧相同。恢复普通姿态后再应用扩展，避免累计漂移；零时间重画不推进物理，暂停测试比较实际画布。
- 四套均采用原站 `2500×1080` 的设计取景。B 的景深分组对缩放进行了透视补偿，本项目采用补偿后的平面坐标；例如 L_steps_2 恢复到 `(-552.24, -363.67)`、比例 1，而非旧版 `(-1080, -380)`、比例 0.95。
- C 的独立地形不是一张平面背景图。保留原网格顶点、UV、索引和 X 轴旋转，将原站最终位置及 2500 深度相机投影到同一背景画布，按原 order=100 绘制；不引入 Three.js，也不拿色块填充穿空。天空底图另按原几何的 2858×1480 映射，不能仅依图片天然比例 cover。
- 镜头仍使用小幅纵向视差。渲染相机为 `1.12` 倍 overscan，抵消外层相同倍数的防露边缩放，不额外放大原站构图。静态图改为同设计比例的 `2000×864`，避免旧 `1600×900` 在宽横屏中二次裁切、静态与动态大小不同。
- 页面不保留阅读遮罩、暗角、颗粒 DOM 遮盖或全 UI 压暗 / 降饱和；E 的新指定处理仅在背景内部，其他原色保持。文字 / 图标用局部阴影，不拿整屏遮罩解决可读性。主树、气泡、梦露与操作几何不变，设置模态遮罩保留。

### 本轮指定效果

- A：继续以 30 FPS × 原 0.6 速度自动下移，约 3.39 秒；采用原纵向起点 / 缓动，远景由 -1437、中近景由 -1200 / -1500 上升，天空上移 233，光照从第 34 帧亮起，藤蔓延迟显现。按最新反馈取消 Z 轴缩放，各层大小固定为终态，避免忽大忽小。开场与加载由 BackgroundBase 绘制与 WebGL 相同的 cover / 原几何，首帧无第二次透明度接力；实际桌面 / 横屏像素对照验证取景连续。
- A 树苗：用户确认沿用原方式自动下移。固定在倒木前设计地面 `(0, -360)`，起初位于画面下方，按 qianjin 相同纵向位移进入视野，不能贴着屏幕浮动。树与前景共用导演的活动时间，慢加载不推进，暂停 / 窗口 / 质量重建保持时间；减少动态、加载失败或上下文丢失显示静态终态时，树一起落地，恢复不倒退。不是章节转场或交互锁定，浇灌随时可用。
- B：将原 `mask_sc` / `mask_sc_opacity` 改写为同一批次的 UV 滚动和边缘衰减。恢复左前 / 左中 / 右前 / 右中及远景五条独立沙带，按原角度 -10° / -33° / 28° / 30° 与景深补偿绘制；不再用覆盖底部的一张雾片来回平移。五条共用一张沙纹理，横屏不删除。
- B：`light_top` 采用原双正弦透明度，opacity=1.35、range=0.37，加色混合；位置与尺寸补偿 -258.17 景深。补齐已有 `mainview_caihong` 的倾斜光晕。远景红色物质保留静态底层，再以 `mainview_up` 的双相流图交叉采样形成连续流动，range=0.56、opacity=0.7，不只改变亮度。公开原配置 / 方程见 [3.1 场景包](https://webstatic.mihoyo.com/ys/event/e20220917prev/vendors_c06290f60048167974de.js)。
- D：`main_cloud` 保持原位置 `(20, -445)` 和 2820×512 大小，使用原 `CLOUD` 噪声采样、speed=0.2、方向 `(0.6, 0.2)` 及 0.015 UV 扰动，雾内部持续流动，而非整张图平移。原方程见 [3.2 场景包](https://webstatic.mihoyo.com/ys/event/e20221024prev/vendors_e97dceaac7776c7c150a.js)。
- 三种流图着色器复用背景 PolygonBatcher；无独立画布或 RAF。纹理单元、标准 Spine 批次在效果提交后恢复；同效果只编译一次、同图只解码 / 上传一次，程序随场景释放。GPU 时间按无缝周期归一化，避免长时间运行精度退化。手机保留上述效果，仅降采样和帧率。

## 补取清单

已补齐下列八个文件，无需用户手动获取：

| 新增原始副本 | 官方来源 | 用途 |
| --- | --- | --- |
| `asserts/reference-supplements/3.0/index_light.jpg` | [3.0 首页脚本](https://webstatic.mihoyo.com/ys/event/e20220814prev/index_b1ed31e4fa6de2a3102d.js)，模块 66146 内嵌 JPEG | A 光照，3823 字节 |
| `asserts/reference-supplements/3.6/full_NPC.json` | [3.6 场景包](https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/vendors_4dab91e6184845585fd0.js)内嵌数据 | C 地面骨骼，26466 字节 |
| `asserts/reference-supplements/3.6/full_NPC.atlas` | 同一官方场景包 | C 地面图集，365 字节 |
| `asserts/reference-supplements/3.6/full_NPC.png` | [3.6 官方纹理](https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/images/full_NPC.b323a559..png) | C 共用打包纹理，481713 字节 |
| `asserts/reference-supplements/3.6/ground.png` | [3.6 官方地形纹理](https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/images/4%E8%A1%A8%E9%9D%A2%E9%A2%9C%E8%89%B2.2420f1fc..png) | 原 4表面颜色，206385 字节 |
| `asserts/reference-supplements/3.6/ground.geometry.json` | 同一 3.6 官方场景包，几何 6a0931bad31e2f0b2004cbf63b3a607b | 原网格数据，1656 字节，不包含站点脚本 |
| `asserts/reference-supplements/3.1/abd_smoke_diffuse.jpg` | [3.1 官方流图](https://webstatic.mihoyo.com/ys/event/e20220917prev/images/abd_smoke_diffuse_jpg.14529b29..jpg) | 红色流动，155995 字节 |
| `asserts/reference-supplements/3.2/loading_flowMap.jpg` | [3.2 首页脚本](https://webstatic.mihoyo.com/ys/event/e20221024prev/index_f68c818de38938e8cd58.js)，模块 77323 内嵌 JPEG | 下方流雾，14115 字节 |

下载脚本为 `npm run assets:background-supplements`，只读取公开官方文件，静态解析字符串，不执行原站脚本。固定 SHA-256 校验不匹配就停止，不盲目覆盖。来源、字节数和哈希记录在 `asserts/reference-supplements/manifest.json`。用户原有的 asserts 文件和现实角色替换文件未改动；发布副本仍登记在 public/asserts/。

其余补层来自已有本地文件，不需要重复下载。C 的完整图集含人物碎片，但 `slots: ['2']` 仅放行舞台地面，其他槽不会提交绘制；不修改原 JSON / atlas / PNG 来删除人物。

本轮两张流图均从公开官方资源重新读取并固定 SHA-256，完整记录仍在 manifest；B 的 mainview_caihong 已存在本地，不重复下载。若追求原站完整 3D 镜头及全部特效逐帧一致，仍需相应引擎能力，不是再补几张 PNG。当前没有必须由用户手动获取的背景素材清单。

## 明确保留的差异

1. A 入场按本项目新反馈保留自动下移与分层纵向节奏，但刻意取消原 Z 轴推拉，保持固定比例；不复制完整 Three.js 相机或后处理。树苗加入同一地面时间线，原站滚动章节 / 主角 / NPC 和宣传界面不复刻，D 仍直接采用入场终态接循环。
2. 本轮 B 飞沙 / 阳光 / 红色流图和 D 流雾使用原方程适配，不再是单纯位移；A 常态光照仍为轻量加色。飘叶仍是同一画布上的精灵，没有移植原站 GPU Bezier 粒子或额外的 300 粒沙尘发射器。
3. 手机降低纹理分辨率与帧率，只省掉飘叶、瓶子及独立近蝴蝶等装饰；A 光照、B 五条飞沙 / 阳光 / 光晕 / 红色流动和 D 雾保留。仍需真实 Android / iOS 性能验收。

## 验证与截图

E / F 背景轮的 **209 / 209 单元、91 / 91 完整浏览器、类型检查与生产构建通过**为历史；其 20 项先行专项不重复计数。覆盖派生哈希、原生多相位顶点 / UV / 约束、合成目标与真实 GPU 释放，六套动态 / 静动取景，以及既有入梦、梦露、角色、存档和校时。本轮独立角色 / 小生物及保留的背景回归以 TEST_PLAN.md 最新记录为准。

| 对照 | 官方桌面主场景 | 本地同尺寸纯背景 | 页面桌面 / 横屏 |
| --- | --- | --- | --- |
| A | [1600×900](screenshots/reference-A-official.png) | [1600×900](screenshots/background-A-clean-reference-size.png) | [桌面](screenshots/background-A-desktop.png) / [横屏](screenshots/background-A-mobile-landscape.png) |
| B | [1600×900](screenshots/reference-B-official.png) | [1600×900](screenshots/background-B-clean-reference-size.png) | [桌面](screenshots/background-B-desktop.png) / [横屏](screenshots/background-B-mobile-landscape.png) |
| C | [1600×900](screenshots/reference-C-official.png) | [1600×900](screenshots/background-C-clean-reference-size.png) | [桌面](screenshots/background-C-desktop.png) / [横屏](screenshots/background-C-mobile-landscape.png) |
| D | [1600×900](screenshots/reference-D-official.png) | [1600×900](screenshots/background-D-clean-reference-size.png) | [桌面](screenshots/background-D-desktop.png) / [横屏](screenshots/background-D-mobile-landscape.png) |

纯背景截图不含主树和 UI，只保留实际画布的可见取景；当前页面本身也没有阅读遮罩。A 纯背景和 poster 采集入场终态；额外入场首 / 末画面保存在 `screenshots/background-A-entrance-start-desktop.png`、`background-A-entrance-end-desktop.png` 和对应横屏文件。不把不同尺寸、角色覆盖和动画相位的整页截图计算成「还原度百分比」。

844×390 原站横屏对照也已保存：[A](screenshots/reference-A-official-mobile.png)、[B](screenshots/reference-B-official-mobile.png)、[C](screenshots/reference-C-official-mobile.png)、[D](screenshots/reference-D-official-mobile.png)。对应同尺寸纯背景：[A](screenshots/background-A-clean-mobile-landscape.png)、[B](screenshots/background-B-clean-mobile-landscape.png)、[C](screenshots/background-C-clean-mobile-landscape.png)、[D](screenshots/background-D-clean-mobile-landscape.png)。A 先点击入场，不能把最初加载画面当作其主景。

图像纹理与 E 离屏 RGBA 目标估算，单位 MiB；桌面为 1600×900、DPR 1，横屏为 844×390、DPR 1，E 目标随实际画布尺寸变化。原始数据在 `screenshots/background-budget.json`，运行 `npm run assets:background-audit` 更新纯景与预算：

| 背景 | 桌面 Spine / 图片层 | 横屏 Spine / 图片层 | 桌面纹理 | 横屏纹理 |
| --- | --- | --- | ---: | ---: |
| A | 5 / 2 | 5 / 1 | 53.54 | 22.67 |
| B | 7 / 11 | 7 / 11 | 67.93 | 30.21 |
| C | 11 / 1 | 9 / 1 | 76.88 | 32.35 |
| D | 8 / 2 | 8 / 1 | 86.37 | 36.07 |
| E | 8 / 2 | 8 / 1 | 91.86 | 37.33 |
| F | 1 / 0（内部保留 19 组环境层） | 1 / 0 | 34.13 | 31.25 |

上述为去重上传图像与 E 受限离屏目标的宽×高×4，不含解码图、默认画布缓冲、角色、驱动或浏览器内存，不是整机峰值。桌面 / 横屏上限 30 / 20 FPS、纹理 2048 / 1024，不预载下一套。E 不额外下载贴图，F 完整去掉专用角色页；仍未部署或完成真机 / 线上性能验收。
