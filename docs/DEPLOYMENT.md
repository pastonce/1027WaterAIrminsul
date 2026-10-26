# 本地构建与手动部署

本项目已完成当前阶段的本地开发与清理，未代为提交、上传或发布。当前规则与后续贺图接入见 [PHASE_HANDOFF](PHASE_HANDOFF.md)，文件边界见 [RELEASE_RESOURCES](RELEASE_RESOURCES.md)。

## 本地运行

使用根目录 `.node-version` 指定的Node 24，安装锁定依赖。

```sh
npm ci
npm run dev
npm test -- --maxWorkers=4
npm run build
npm run release:assets
npm run release:audit
npm run preview
```

`build`前自动更新两份MD正文与启动资源目录；不执行素材重绘、FFmpeg压缩、字体工具或原图编码。`release:assets`核对各阶段 / 两张插图选择 / 设备档 / 静态回退与剩余发布文件，只报告、不删除；`release:audit`检查dist资源与目录一致、文件体积及Function必需文件。

开发时钟和开发存档与生产独立。`preview`使用本地Node提供 `/api/time`，只是本地生产包检查，不能替代实际Cloudflare运行验收。

## 上传源码

建议使用GitHub Desktop或Git提交，遵守 `.gitignore`；浏览器手动拖拽不会自动应用忽略规则。

必须保留：

- `src/`、`public/`、`functions/`、`server/`、`scripts/`。
- `asserts/对白整合.md`、`asserts/生日贺图/信与回复.md`：prebuild的唯一正文输入。
- `docs/`（不含screenshots）及JSON清单；源码类型检查与资源工具会读取其中部分清单。
- `package.json`、`package-lock.json`、`index.html`、`vite.config.ts`、`tsconfig.json`、`.node-version`、`.npmrc`、`.gitattributes`、`.gitignore`、`.env.example`。
- `README.md`、`AGENTS.md`、`project_prompt.md`、`tests/`、`e2e/`、`playwright.config.ts`，供维护和回归。

不上传原始大美术、原MP3 / TTF / 参考视频、`node_modules/`、`dist/`、`artifacts/`、`.asset-work/`、校准辅助图、截图及缓存；本地原稿仍保留。原始素材测试需要本地完整来源目录，云端只运行build。不要把令牌、`.env`或`.dev.vars`加入仓库。`.gitattributes`保留二进制及素材原字节，避免哈希因换行转换失配。

## 服务器校时必须同时部署

| 路径 | 职责 |
| --- | --- |
| `dist/` | 静态页面、程序及当前public资源 |
| `functions/api/time.ts` | 根目录的Cloudflare Pages Function入口 |
| `server/timeEndpoint.ts` | Function响应实现 |
| `src/game/time/protocol.ts` | Function引用的协议常量 |
| `public/_routes.json` → `dist/_routes.json` | 仅API路径调用Function，静态资源保持静态 |

Pages Git集成构建命令为 `npm run build`、输出为 `dist`，保留项目根目录的Functions和全部引用源码。使用Wrangler时也须从项目根目录部署；只把dist拖到控制台不会自动具备本项目Function。参考 [Pages Functions](https://developers.cloudflare.com/pages/functions/get-started/)。实际账号、项目选择和发布由负责人手动完成。

生产权限只读取服务器确认时间；本轮F/G已改为 **2026-10-27 13:27:00 +08:00**，G还须完成F与梦醒。接口失败不回退本机时间，不使用静态JSON替代。Birthday和Past都是隔离的本页预览 / 测试，不修改正式时钟或存档。

## 配置与缓存

当前为公测，默认 `VITE_PUBLIC_TESTING=true`：保留标题标记，隐藏测试代码为Past（不区分大小写），旧test无效。以后设为false重新构建可关闭公开测试入口 / 标记；开发模式仍有原调试工具，其他彩蛋不受影响。

哈希资源允许长期缓存，HTML与 `/api/time` 不永久缓存；非哈希Spine / poster等更新时应刷新缓存。音频M4A保持`audio/mp4`及Range支持，字体为`font/woff2`。当前缓存只覆盖选定静态资源 / 当前曲目，不是离线PWA或云端存档。

## 发布后检查

1. `/api/time?requestId=deployment-check`返回匹配requestId、服务器now和no-store，不能是index.html。
2. 新旧存档、日期边界、首次种子 / 收露 / 浇灌、阶段插图 / 梦醒、N01 / X11、设置与首访公告正常。
3. 七首音乐、交互声音、17套角色、六背景、两设备档、静态回退、许可 / 署名文件无缺失。
4. 2026新贺图在本地生成并部署后，切换2023～2026、缩图 / 全图及退出书页正常。
5. 用真实手机 / Safari复核音频授权、低端帧率、旋转 / 后台恢复和触摸；Chrome视口模拟不等于真机。

素材出处、Spine和第三方音效的许可仍按原署名记录保留；来源登记不替代授权。当前验证结果见 [TEST_PLAN](TEST_PLAN.md)。
