# 本地预览、校时与发布

公告收据 `irminsul.notice.seen.v1` 与 v2 独立，首次加载 / 揭幕完成后才自动显示，清网站数据才恢复首次状态。Birthday 使用按输入加载的小分块 / 私有内存进度，不依赖修改服务器、账号或数据库；正常校时 API 仍必须发布，不可用静态 JSON 替代。

## 声明正文更新

公告 / 设置 / 全屏已统一绿色衬底。新增机制提示按用户决定留到下一轮，正常 `build` 通过 `dialogueRelease.ts` 保留旧池；不要手改生成 JSON 或绕过这个发布保护。解除方式见 DIALOGUE_RELEASE.md，当前原稿不删除、未实现提示中的新彩蛋。

右上设置左侧的声明正文在 `src/content/notice.md`，已按用户确认公开署名「独钓」、QQ 1666417849 与原神 UID 190497686。该文件随 `src/` 上传并在构建时编入脚本，不需要发布机访问外部 Markdown 服务；修改线上内容必须重新构建 / 部署，不是只上传原始 MD 即时生效。字体生成器已包含 `src/**/*.md`，新增字符后按 NOTICE.md 执行对白同步 → 字体 → 启动清单 → 验证 / 构建，再由负责人手动发布；这里只完成本地开发。

G 当前底图使用最小 cover、下沿优先，仍是同一压缩派生；每次整页重抽六组转场，不强制绕过有效 HTTP / CacheStorage，未修改服务器校时和成长存档权限。素材原作者 / 许可仍需负责人核对、尤其社区传送片段，声明页不会把来源记录冒充授权证明。

本轮发布还需携带 `public/asserts/gifts/date-candy.png` 与 `public/asserts/gifts/halvamazd.png`（真正透明 PNG、开场只下载压缩文件、G 送礼才解码展示），资源 / 精确编辑提示词见 gift-assets.manifest.json。FG 加载后新增 6 秒黑屏 / 眨眼，G 展示收据延迟至醒来完成；祝福流程为 U / 送礼 / 彩雨同步 → N，详见 REALITY_CELEBRATION.md。仅本地完成验证，未代替用户发布。

仅在本地开发，没有登录或部署 Cloudflare。2026-10-18 来访 / 祝福开发恢复单元、生产构建与浏览器验证，最新结果见 TEST_PLAN.md；此前 C4 / C6 小轮跳测仅为历史。以下发布操作由负责人决定并手动执行。

2026-10-20 最新修订：F 恢复 image_2 无 Role 动态环境，G 仅将静态底图换为压缩 background.png，原现实角色 / 拱廊 / 交互不改。转场 cover 全屏、图标原位叠图，气泡纹样更清晰；预选 ID / 单规格预取、双就绪、失败回退与服务器门控保持。

最新首屏采用「沉入梦乡」、两行新邀请与同人生贺声明，深绿文字 / 入口适配原明亮森林，仅局部 CSS、不改背景或加整页暗罩。发布携带字体清单当前两个哈希 WOFF2，原 TTF / MP3 不发布。前轮 body Portal 设置兼容、A 欢迎等镜头、三批时间表、开放前入口拦截与 G 终点均保持；本轮验证及限制见 TEST_PLAN.md，未发布。

本轮来访概率、双位置与草元素祝福不新增远程运行依赖；存档增加 visitPositions / guaranteedVisits / blessedVisits 并保留一位小数，既有版本仍为 v2。日期上限与祝福结算仍只使用服务器确认权限，不以演出计时或设备时间开放内容；发布保持携带 Function，不只上传静态 dist。旧存档完成来访不追赠，待播 / 结算恢复规则见 NAHIDA_BLESSING.md。

## 本地使用

```sh
npm install
npm run dev
```

开发客户端仍使用独立的模拟时钟和测试存档，默认 2026-10-25 10:27，适合提前测试后期内容。不会使用校时结果覆盖开发面板设置。 时间表以 project_prompt.md §4 为准：25 日 10:27 A→B→C（210 / 313 / 520），26 日 10:27 D→E（725 / 814），27 日 10:27 F（1027），G 在最终梦醒后进入。均为北京时间，同批权限仍逐段推进；整页权限上限为 0→520→814→1028，祝福不越所属段。

```sh
npm run build
npm run preview
```

生产预览客户端请求同域 `/api/time`，Vite 插件用本机 Node 服务的日期响应；页面里修改 `Date.now()` 或添加跳过时间的 URL 参数无效。**这不是 Cloudflare 边缘运行验收**，本机系统时间若被修改也会影响本地 Node 服务。正式站点则读取 Cloudflare Function 所在服务器的日期。

可在本地浏览器打开 `/api/time` 检查 JSON 协议；`HEAD` 返回相同缓存头但无正文，其他方法返回 405。`requestId` 是防误用旧缓存的请求标识，不能传入日期修改服务器时间。

## 必须包含的部署文件

| 路径 | 职责 |
| --- | --- |
| `dist/` | Vite 构建的页面、程序和 public/ 副本 |
| `functions/api/time.ts` | Cloudflare Pages 文件路由入口，位于项目根目录，不放入 dist |
| `server/timeEndpoint.ts` | Function 引用的纯 Web API 响应逻辑 |
| `src/game/time/protocol.ts` | 服务端和客户端共享的协议常量 |
| `public/_routes.json` → `dist/_routes.json` | 只让 `/api/time` 与末尾斜杠路径调用 Function，其余保持静态请求 |

Function 不使用 Node 专属 API、密钥、数据库或额外绑定，返回 `{ version: 1, now: 毫秒时间戳, requestId }`，并设置禁止浏览器 / CDN 缓存的响应头。不要为该接口配置强制缓存。

**不能仅把 dist 拖拽上传到 Cloudflare 控制台并认为 Function 会自动存在。** Pages 的 functions/ 需要通过 Git 集成或 Wrangler 部署，目录必须保留在项目根部。[Cloudflare Functions 部署说明](https://developers.cloudflare.com/pages/functions/get-started/)

## 负责人手动发布

当前 GitHub 准备与资源筛选见下方「上传清单」。`.node-version` 固定 Node 24，构建仍是 `npm run build` → `dist`；`prebuild` 只重生对白和本地发布资源清单，不依赖 FFmpeg / Python / 原始大图。当前为公开测试版，`VITE_PUBLIC_TESTING=true`（默认）显示测试标记并允许隐藏 test；正式收尾可设置 false 重新构建关闭该入口。

可选其一，本轮没有执行下列发布操作：

1. **Pages Git 集成**：将本项目源码交给已连接的仓库构建；构建命令 `npm run build`，输出目录 `dist`，项目根目录需包含 `functions/`。使用项目要求的 Node 22.12+，建议 24。当前目录并非 Git 仓库，本轮没有擅自初始化或上传。
2. **Wrangler**：在项目根目录、完成账号授权后，手动执行 `npx wrangler pages deploy dist --project-name=YOUR_PROJECT_NAME`，将占位项目名替换为自己的 Pages 项目。必须从仍能找到 functions/ 和依赖源码的目录执行，不要只把 dist 单独拷贝出去。[Cloudflare Wrangler 上传说明](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

若需发布前在 Cloudflare 本地运行时检查，可另行准备 Wrangler 并从根目录执行 `npx wrangler pages dev dist`；这不是项目当前 npm 命令的依赖，本轮未安装或运行 Wrangler。[官方本地运行说明](https://developers.cloudflare.com/pages/functions/local-development/)

不要把账号令牌或其他凭据写进源码、文档或聊天。修改发布方式或需要新增平台绑定时应先确认。

## 上传清单

`.gitignore` 已排除 node_modules、dist、artifacts、旧截图 / 工作缓存、环境密钥与原始大素材；放行 `asserts/对白整合.md` 与 `asserts/生日贺图/信与回复.md` 供构建。**浏览器拖拽上传不会自动遵守 .gitignore**，推荐使用 GitHub Desktop 按忽略规则提交，或手动筛选下列内容。本轮不初始化 Git、不提交、不代上传。

- 必须：`src/`、`public/`（含全部当前派生素材与 `_routes.json`）、`functions/`、`server/`、`scripts/`、`asserts/对白整合.md`、`asserts/生日贺图/信与回复.md`。G 书页依赖 public/asserts/birthday-mail/ 与对应生成 JSON / manifest，26 空图不发布为有效图片。
- 必须：`package.json`、`package-lock.json`、`index.html`、`vite.config.ts`、`tsconfig.json`、`.node-version`、`.npmrc`；保留 `.gitignore`、`.gitattributes`、`.env.example`、AGENTS / README / project_prompt；上传docs（排除screenshots），其中JSON清单被类型检查引用。
- `.gitattributes` 对原始 / 发布素材关闭换行转换，避免Git在JSON / atlas / 对白稿上改换行导致登记SHA失配；不会修改当前本地素材。
- 保留测试源码 `tests/`、`e2e/` 和 Playwright 配置；原始素材校验测试需在本地恢复完整 asserts，Cloudflare只运行build，不运行这些素材回归。
- 不上传：本地完整原始 asserts（除上述两份正文稿）、大视频、原始生日贺图 / 参考站源码、node_modules、dist、.asset-work、.npm-cache、artifacts、test-results、docs/screenshots、.env / .dev.vars。仅忽略上传，原素材没有删除。

GitHub浏览器上传单文件上限25MiB，Pages Free单站20000文件、每文件25MiB；当前构建通过 `release:audit` 检查，最大文件约4.1MB，原始视频不在发布包。[GitHub限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)、[Pages限制](https://developers.cloudflare.com/pages/platform/limits/)

Pages Git构建：根目录本项目、Node24、命令 `npm run build`、输出 `dist`；原有根级 Functions与服务端依赖必须一并存在。构建参数参照 [Cloudflare官方说明](https://developers.cloudflare.com/pages/configuration/build-configuration/)。公开测试默认带测试标记；正式关闭请设置 `VITE_PUBLIC_TESTING=false` 后重新构建。

## 上线后核对项目

1. 请求站点的 `/api/time?requestId=deployment-check`，应得到当前服务器时间、相同请求标识、JSON Content-Type 及 `Cache-Control: no-store`；不能返回 index.html。
2. 查看网络面板，确认 `/asserts/` 和静态程序仍正常加载，API 不使用旧缓存；真实域名的缓存规则不能覆盖禁止缓存头。
3. 右上角设置可在首屏查看校时状态，开放前打开设置仍保持intro、不挂载树 / 对白或音乐流程；点击入梦仍仅提示，修改设备日期不能提前开放。公开测试可主动输入test进入内存会话验证未来内容，刷新退出、不改正式进度；VITE_PUBLIC_TESTING=false正式构建关闭公开test。
4. 阻断校时请求，确认同页已开放内容继续；恢复请求后自动更新。检查 5 秒超时、15 秒重试与回到前台恢复；在页面资源仍可加载的条件下刷新，原存档必须保留。
5. 观察实际流量和平台 Functions 配额 / 错误日志，必要时调整轮询间隔；本轮没有测量线上配额或成本。
6. 核对 A～F 动态背景、F 无 Role 的 festival.json / atlas / 十四页、当前 poster / hiding-*，以及两版运行时均携带；不带回 Role 十五页，独立角色保持。G 静态图在 backgrounds/reality/。哈希图可长期缓存，旧无哈希 poster / atlas 不设永久 immutable，换图同步刷新版本。
7. 补取的 forest/index_light.jpg、canopy/full_NPC.json / atlas / png、canopy/ground.png / ground.geometry.json，以及本轮 dunes/abd_smoke_diffuse.jpg、sanctuary/loading_flowMap.jpg 都必须随 public 副本进入 dist；dunes/mainview_caihong.png 也需携带。运行时不访问原站，不执行补取脚本。核对无全屏遮暗、A 入场可暂停续播且不阻断、B 左下 / 右侧飞沙和光晕 / 红色流动、D 下方流雾，以及横屏 / 减少动态终态。最新实际测试结果见 TEST_PLAN.md，原站差异见 BACKGROUND_FIDELITY.md，不代替线上真机验收。
8. 冷缓存 / 热缓存点击入梦，开场到首帧不改变缩放；树苗先在画面下方，按原方式自动下移后出现在倒木前，慢加载不提前出现。核对普通梦露 5 秒、奖励梦露 60 秒后过期不可收，设置 / 后台 / 竖屏暂停剩余时间，已存梦露不被清空。这是表现寿命，不是服务器日期权限。
9. 携带 `public/asserts/inhabitants/` 的 51 份三件套、17 张透明 poster，以及五套背景目录下的 hiding-band-* 和 A 的 hiding-light-1.webp。素材登记在 `docs/inhabitants/manifest.json`，43 份派生资源登记在 `hiding-layers.json`；改背景遮挡层次后运行 assets:hiding-layers 与 assets:hiding-calibration，仅改藏点坐标只需后者。本轮 C ground 上移 40 世界单位，重导静态分带 / poster；遮挡槽与藏点姿态不变、沿用校准。A / C / D / F 为 dream / wave / bouquet / swing，B / E、G 保持既有；角色全部 4.0。随机兰那罗共享背景原 GL 穿插，C 背景仍 4.1；常驻 / 晶蝶额外一个透明画布，不逐只建上下文。
10. 复核来访每浇 0.1、单段最多两次、未抽中则倒数第二浇一次兜底补满，非强制两次；对白后随机 3～7 秒停留。每套六个分散物件点 + 四周点、真实遮挡、普通物件跳出钻回和中心散露，左右屏缘领奖腾空直出、不回落。复验 A1 / A2、C3 / C4 渐显及下方离屏、C6 渐显，D / E 的 1 / 2 / 6 短程柔和进退，C4 / C6 不被导航遮挡；树体透明空白须穿透、命中随实际高度变化。F 四常驻刷新不重复领；奖励不计七颗但已存不超 13，满额留场，飞行 / 退场 / 60 秒寿命可暂停。晶蝶成长 100 前不出现，之后按种子随机树高逐只新增、旧位置不变。减少动态 / 无 GL / 丢失恢复仍可点击，A 静态加色光不能出现暗色块。v2 与短时奖励不跨刷新规则不变；不得在正式站开启调试，见 INHABITANTS.md。
11. 携带 loading/seven-elements.webp、loading/art/ 十一图双档、backgrounds/reality/ 和 ui/ 哈希 icon PNG / dialogue JPEG，登记见 page-assets.manifest.json。复核只取已选单规格、cover 铺满不留白 / CD2 右对齐，七元素原位置叠于插图，插图 / 新景双确认后解锁；失效白底。后台 / 省流量不预取，刷新 choices / sceneStage 保持，不重扣 / 重赠。
12. 携带 `music.generated.json` 对应七个 M4A、`ui/music-button-*.png` 与 `fonts.generated.json` 对应两份 WOFF2；哈希见 music / font manifest，禁止把原 MP3 / TTF / `.asset-work/` 全量发布。音乐 M4A 按 `audio/mp4`、支持 Range / 206；WOFF2 用 `font/woff2`，哈希文件可长期缓存，HTML 不永久缓存。build 读取已生成副本，发布机无需 FFmpeg / fontTools；替换源文件先本地生成、检查派生。核对手势授权、G 曲目、按钮旋转 / 暂停、曲间留白与直接设置；音频失败不阻断游戏，见 AUDIO_AND_FONTS.md，音效数据包另见后项。

## 断网策略与边界

音效发布附带 `sounds.generated.json` 对应的 `public/asserts/sfx/` 七份哈希 JSON 数据包及 CREDITS.txt，不发布下载原文件 / 临时 M4A / 旧二进制副本。服务器按 `application/json` 提供，不重写音频数据；校验源、数据包与还原 AAC 三组哈希。音效打包在本地执行 `npm run assets:sfx`，发布机不需 FFmpeg。上线前负责人确认社区原神传送片段的使用 / 再分发许可，或替换为已获许可的源；CC-BY 弹跳的作者与改动声明必须随 CREDITS.txt 保留。重试 / 静音 / 真实动作播放见 INTERACTION_AUDIO.md，不能只验证请求成功。

- 正常每 60 秒校时，临近配置边界提前请求；只有服务器确认后才开放新日期内容。网络恢复、前台恢复及设置内手动重试也会更新。
- 整次响应读取在 5 秒后取消，HTTP 错误、HTML、错误协议 / 请求标识或非法时间均拒绝。失败每 15 秒重试，绝不回退设备时间。
- 本页已有确认结果时保留其日期权限；首次失败或刷新后没有确认结果时，先保留收露、对白与免费观赏浇灌。成长存档、梦露和待播回应不会清除或重复扣费，网络恢复后自动显示符合权限的进度。
- 校时状态只在设置内显示，不新增主界面提示框、倒计时或成长数字。设备日期、存档 updatedAt、URL 参数都不作为日期凭据。
- 没有 Service Worker / PWA；只有选定压缩资源的版本磁盘缓存，不缓存 HTML / API / BGM，所以不承诺完整离线打开；没有账号、服务端存档或跨设备同步，也不声称能阻止修改前端程序的主动作弊。

本机验证范围与当前通过结果见 TEST_PLAN.md；真实 Cloudflare、Android 和 iOS Safari 仍需负责人发布后实测。

发布包需同时含 public/asserts/effects/dendro.png（64×64、2164 B，补取来源 / 哈希见 reference-supplements/nahida/manifest.json）及 e-skill-frame.png（用户原图集逐字节复制，1024×640、122861 B，源哈希与导出数据见 E_SKILL_PATTERN / E_SKILL_PATTERN.md）。运行时同域、无镜像 / 原站外链；发布前确认使用条件。验收轮廓草光 → 花叶 → 素材大框 / 中心单图标扫描 → 成长、无小框 / 数据连结、减少动态静态标记、素材失败不中断和服务器权限下刷新不重赠；不代用户发布。
