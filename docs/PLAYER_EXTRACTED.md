# 可移用的独立 Spine 角色

当前17套原始素材不改。开场按本设备资源计划下载压缩文件，不批量实例化；随机生物 / 常驻 / 晶蝶的原动作与层次保持。Nidaha 仅替换纳西妲运行时形象，不改角色源文件；见 EASTER_EGGS.md、STARTUP_ASSETS.md。

已按用户要求清空 `asserts/player-source/`，保留空目录。完整壁纸 `asserts/player/` 及五张参考图保持原样；本次提取结果在 **`asserts/player-extracted/`**，可以整体复制，也可以只取某个角色文件夹。

用户随后已按类型整理并修改部分 atlas；当前主游戏直接使用这批当前文件，不重新提取覆盖。下面路径已同步到 nahida / aranara / crystalfly 分类。新增发布登记与主游戏映射见 [INHABITANTS.md](INHABITANTS.md)；此前提取验证与旧哈希仍是历史记录，不能替代当前发布副本登记。

2026-10-17 的主游戏细化保留 3～7 秒停留、六物件 + 四屏缘真实藏身、中心散露及过百逐只晶蝶；最新逐点渐显 / 下方出口 / 短程进退、左右屏缘腾空直出、C4 / C6 换位及树体透明区域穿透也仅改主游戏。随机角色共享背景 GL 仍用 4.0 解析，未修改或重提取本目录三件套 / 示例；当前姿态校准与最新验证见 INHABITANTS.md、TEST_PLAN.md。

## 提取结果

当前来访继续用户三件套、完整取景与原 loop，不重提取 / 裁切 / 改写源文件，也不在运行时水平镜像 Spine 或 poster。A / C / F 保留原左右落点，B / D / E 两处均在树左侧；角色 alpha 草光单独叠加，花叶按原向身体锚点和实际包络发射，不反算 x、不烘入纹理。见 NAHIDA_BLESSING.md、TEST_PLAN.md。

最新特效为角色轮廓草光 → 花叶流 → 树侧 E 技能外围与中心单枚真实草图标扫描 → 成长，删除角色侧小框 / 小图标及数据电路。独立 UI 图标与用户 E 技能图集发布副本均另存 effects，不改本目录 17 套三件套或其纹理，几何导出与实际验证见 E_SKILL_PATTERN.md、NAHIDA_BLESSING.md。

最新 C4 / C6 动效及镜头控件补调仅改主游戏配置 / CSS，三件套、发布素材与校准不变；本次按用户要求未运行验证，下列提取记录及既有游戏截图均不作为本次验收。

| 原图范围 | 素材包内的目录 | 内容 |
| --- | --- | --- |
| image_1_10 及必要依赖 | `nahida/nahida_wave/` | 欢庆纳西妲，含花冠 |
| 同上 | `aranara/aranara_01/`～`aranara_06/` | 前六只兰那罗，随机藏身 |
| 同上 | `crystalfly/crystalfly_01/`～`crystalfly_03/` | 三种晶蝶 |
| image_2_15 | `nahida/nahida_swing/` | 秋千纳西妲，含绳索 / 座椅 |
| image_3_12 | `nahida/nahida_dream/` | 美梦纳西妲及花篮 |
| image_4_11 / 12 / 13 / 15 | `nahida/nahida_bouquet/` | 花束纳西妲及附件 |
| 同上 | `aranara/aranara_07/`～`aranara_10/` | 后四只兰那罗，F 常驻 |

共 **17 套**，每个角色目录严格只有 **同名 `.json`、`.atlas`、`.png` 三个文件**，合计 51 个素材文件。无需再复制整张壁纸、其他角色、原播放器或其他图集页。`manifest.json` 提供 17 套的路径、标签、动画名和取景框，但单独加载一个角色时不依赖它。

第一组部分必要碎片实际在 `image_1_11.png`：已依据骨骼与网格依赖一并提取，重新打入各自的 PNG。没有因用户指定主图为 image_1_10 而丢掉这些碎片。派蒙、NPC、背景与无关花草没有进入提取套件。所有选中区域保持原像素，保留原图集旋转、裁切偏移，并添加两像素边缘留量。

第一组兰那罗依次为右侧浅色、中间叶帽、浅绿圆身、左侧高帽、左下宽帽和右上飘浮；第四组依次为上方圆帽、前方彩帽、前方蓝帽和右侧小帽。[目录清单](../asserts/player-extracted/manifest.json) 中也有标签。

## 先预览

在素材包根目录打开终端，运行：

```sh
node web/serve.mjs
```

打开 [本地预览页](http://127.0.0.1:8080/web/)。可切换 17 个角色、选择原动画、暂停和继续；默认播放 `loop`。预览已附带本地 4.0.31 运行时、样式和许可文件，无需安装 npm 依赖，也不请求 CDN。关闭终端服务使用 Ctrl+C。

需要改端口时，PowerShell 中执行 `$env:PORT='8081'` 后再运行上述命令。网页资源通过 HTTP 加载，使用本地服务访问。

## 在网页 / TypeScript 工程中使用

本批骨骼导出为 **Spine 4.0.17**，演示和加载器使用 **4.0.31**。将需要的角色目录放进目标工程的静态资源目录，例如：

```text
public/spine/nahida/nahida_wave/
  nahida_wave.json
  nahida_wave.atlas
  nahida_wave.png
```

保持三者同目录和原文件名。不同组的 `aranara_01` 等名字相同，按原组别路径复制即可。

在**目标工程**安装匹配的播放器：

```sh
npm install --save-exact @esotericsoftware/spine-player@4.0.31
```

将 [web/mountSpineCharacter.ts](../asserts/player-extracted/web/mountSpineCharacter.ts) 复制到目标工程的源码目录。准备一个有实际宽高的容器：

```html
<div id="actor" style="width:360px;height:480px"></div>
```

在对应 TypeScript 入口中加载：

```ts
import { mountSpineCharacter } from './mountSpineCharacter';

const host = document.querySelector<HTMLElement>('#actor');
if (!host) throw new Error('Missing #actor');

const player = await mountSpineCharacter(
  host,
  '/spine/nahida/nahida_wave/nahida_wave', // 文件地址，不带扩展名
);
```

此加载器会读取 JSON 的取景框，使用透明背景与 `premultipliedAlpha: false`，默认循环播放 `loop`。不需要手动补图集页映射，不需要 Unity 布局数据。

可直接控制返回的播放器：

- `player.pause()`：暂停。
- `player.play()`：继续。
- `player.setAnimation('loop', true)`：循环播放默认动作。
- `player.setAnimation('Anim_FadeIn', false)`：播放拥有该动作的角色入场；每套实际动作名见清单或预览下拉框。
- `player.dispose()`：在页面、组件或角色卸载时销毁，释放画布与 GPU 资源。

入场动作播完后如需继续循环，可以调用 `player.addAnimation('loop', true, 0)` 排队。创建时也可传第三个参数 `{ animation: 'Anim_FadeIn' }`；加载器支持 `AbortSignal` 取消加载。React / Vue 等组件卸载时应同时取消仍在进行的加载，或销毁已经返回的实例。

角色位置与显示大小通过容器 CSS 调整。JSON 已将动画包络平移至底部居中的局部坐标，保留原动作轨迹；晶蝶仍会在自己的包络内飞动。取景使用 JSON 自带的 `skeleton.x / y / width / height`，不要沿用完整壁纸的 16:9 框。

若已有 Spine 4.0 的底层渲染器，可直接加载三件套，播放 `loop`，采用上述边界和直通 alpha；不必使用附带的播放器。配置依据 [官方 Web Player 说明](https://esotericsoftware.com/spine-player) 和 [版本匹配约定](https://esotericsoftware.com/spine-versioning)，本包的字段和调用均以实际安装的 4.0.31 类型及浏览器测试为准。

## 原提取轮动画与验证

提取时追踪实际网格的加权骨骼，而非只看 slot 所属骨骼；这保留了六只兰那罗的根部挂件和脚部。每套只保留其绘制附件、必要祖先骨骼、权重引用、IK / transform / path 依赖及相关时间线。原循环、入场、眨眼、变形和曲线保持，`loop` 是该角色原主循环的统一别名。用无绘制附件的计时骨保留原片段周期，避免裁掉其他角色后缩短动画。

原提取轮实际通过：17 套真实 4.0.31 解析、相关动画与循环边界对照；648 个重新打包区域逐像素一致；17 套合计 68 次原角色 / 提取角色 WebGL 像素对照；17 套各有桌面和手机横屏两种独立网页验收，共 34 组，验证播放、暂停与恢复。TypeScript 加载器通过独立类型检查及实际加载 / 取消检查，当时项目 180 项单测与构建通过。以上为用户后续整理前的历史，不替代当前游戏接入验证；当前结果见 TEST_PLAN.md。移动端为 Chrome 模拟横屏，真机仍未验收。

<!-- ENGINEERING_RECORDS -->

## 工程记录

原目录 `asserts/player-source/` 的 101 个文件已按用户明确要求删除，未另存一份源文件副本。`asserts/player/` 的 61 个素材文件及五张参考与上一版哈希一致；源备份历史哈希仅作为记录保留。旧完整壁纸生成器已移除，现有验证与预览不再读取已删除目录。

原提取轮使用的工程命令如下。用户已调整目录与部分 atlas，**不要直接重提取覆盖当前包**；若需要重做，先确认输出位置与迁移方案。主游戏更新当前素材应使用 `assets:inhabitants` 和 `assets:inhabitant-posters`，不是以下旧提取流程：

```sh
npm run assets:extract-player-spine
npm run assets:verify-player-extracted
npm run assets:player-extracted-previews
npm run assets:verify-player-spine
npm run assets:player-spine-previews
```

提取依赖本项目的 Node、Python 和 Pillow。运行播放器或移用三件套不需要 Python。临时打包数据使用 `.asset-work/player-extract/`，避免被游戏 Playwright 的 `test-results/` 清理。重提取会覆盖这 17 套派生文件和附带网页；输入始终是保留的完整 `player/`，不会重建原始 Unity 导出。

最大顶点差为 0.0001221 骨骼单位，裁切区域内 UV 像素差最大 0.0000611；颜色 / 透明度一致。比较源角色先施加相同局部平移再计算约束，避免把不同世界坐标下的浮点舍入误判为动画变化。原动画累计 49 个角色片段、343 个采样时刻、518,980 个顶点坐标及相同数量的 UV 坐标；另有 17 条主循环别名的真实画面对照。

原提取轮未修改主游戏、未写发布副本、未重跑完整游戏浏览器回归；这里的 34 组为独立素材演示，不与游戏用例混计。后续本轮已将用户当前 17 套注册到 `public/asserts/inhabitants/`，保留源文件，玩法 / 回退 / GPU / 完整回归另见 INHABITANTS.md 和 TEST_PLAN.md。四套完整壁纸在旧源删除后通过的 8 组动态预览亦属于历史记录。

报告：[几何与动画](player-extracted/geometry-validation.json) · [纹理打包与像素哈希](player-extracted/texture-packing.json) · [WebGL 与独立演示](player-extracted/browser-validation.json)。

预览：[17 套总览](screenshots/player-extracted/overview.png) · [桌面演示](screenshots/player-extracted/demo-desktop.png) · [手机横屏演示](screenshots/player-extracted/demo-mobile-landscape.png)。
