# 桌面纳西妲鼠标指针

## 素材、署名与发布

来源为用户提供的 `asserts/cursor/`，作者 **SAM TOKI STUDIO**，原作地址是随附版权说明中的 [Sam Toki Mouse Cursors](https://github.com/SamToki/IconDesign---Sam-Toki-Mouse-Cursors)。按原说明：仅供个人免费使用、不得商用，传播 / 转载须注明出处。公告 `src/content/notice.md` 的素材来源已包含作者、原作链接、这些限制与本地原版权说明链接；不改用户其余公告内容、不将素材来源冒充额外授权。

六个实际适配的 `.cur` 原字节复制为 `public/asserts/cursor/<用途>-<哈希>.cur`，每个4286B，原32×32与原热点不变；版权文本原字节另存 `public/asserts/cursor/COPYRIGHT.txt`（394B），合计 **26,110B**。源文件与其余未用指针保留；没有把无对应网页状态的Windows手写 / 镜像 / 对角缩放素材强行套在按钮上。

| 网页状态 | 源指针 | 原热点 | 原生失败回退 |
| --- | --- | --- | --- |
| 默认 / 首屏 / 揭幕 | 01_Normal | 0,0 | auto |
| 按钮、链接、树、小生物 | 15_Finger(large) | 6,6 | pointer |
| 文字输入 / 可编辑区域 | 06_Beam(reversed) | 15,15 | text |
| 禁用控件 | 08_Unavailable | 15,15 | not-allowed |
| abbr帮助说明 | 02_Help | 15,14 | help |
| 水平音量滑杆及原生轨道 / 滑块 | 10_EW | 15,15 | ew-resize |

没有改变控件行为、透明命中区、拖动镜头、键盘、焦点、指针事件或读屏名称。帮助样式只匹配语义明确的 `abbr[title]`，不把所有有title的可点击按钮误改成问号。

## 实现与性能

`src/main.tsx` 最后引入 `src/styles/cursors.generated.css`。桌面作用域先让body后代及前后伪元素显式继承，再通过`:root :is(...)`语义规则覆盖组件里的高优先级pointer / default，不使用!important。修复原`.debug-panel > summary`比裸summary规则优先的问题，设置label及内部span、调试内容 / 按钮 / 下拉框 / 输入均继承相应形象。仅在主指针 `(hover: hover) and (pointer: fine)` 且非强制色时应用；手机纯触屏不套用、不请求CUR，触摸屏电脑的主鼠标满足条件时照常使用。强制色系统采用原生光标；缺失或不支持CUR时按每个声明的标准关键字回退。

日期、时间、月份、周及datetime-local归文字输入；浏览器可样式化的日期编辑区、日历按钮、数字微调、清除 / 文件按钮、滑杆轨道与滑块分别匹配文字 / 点击 / 拖动，禁用内部控件保持禁用形象。不同浏览器的私有伪元素分开声明，不让一个不认识的选择器使其他规则一起失效。操作系统接管的日期弹窗 / 原生下拉菜单 / 滚动条可能保持系统样式，本轮不为此重造这些原生控件。

CSS使用浏览器原生cursor与真实热点，不隐藏系统指针、不加跟随DOM、pointermove监听、定时器、动画、Canvas / GL / RAF或运行时依赖。资源只在匹配的桌面状态按需请求，不进入全设备集中预载，不延长揭幕；所有发布文件登记在 `docs/cursor-assets.manifest.json`，原作与版权文本分别保留来源 / SHA-256 / 大小。生产构建直接携带现有public副本，无需上传原始整套素材。

## 更新

```sh
npm run assets:cursors
npm run assets:fonts
npm run assets:startup
npm test
npm run build
npm run release:audit
```

`scripts/prepare-cursors.mjs` 校验CUR类型、尺寸、单图与热点 / 数据范围后复制，生成CSS及清单。替换源文件后本地重新生成；仅在核对当前清单和绝对目录后清理旧的无引用发布副本，原素材不能删。公告新增中文后更新字体；发布由负责人手动执行，验证及限制见TEST_PLAN.md。原生操作系统光标通常不会进入Playwright截图，自动验收检查CSS、设备条件、热点与HTTP原字节，不把截图当成各操作系统光标外观的人工验收。
