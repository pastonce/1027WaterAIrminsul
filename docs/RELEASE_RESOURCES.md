# 发布资源与清理边界

`public/`会由Vite原样复制到dist；仅不预载旧文件并不能减少发布包。本轮实际清除了弃用的发布副本，并将离线校准图移出public。逐项路径、字节、SHA256和去向在 `cleanup.manifest.json` 的 `phaseWrapUp` 中。

## 已处理

- 删除11个文件：8份旧哈希字体、旧 `effects/e-skill-frame.png`、未引用 `ui/leaf.svg` 及public下重复且失效的README。当前干净技能图集和两份活动字体保留。
- 21张hiding-back / hiding-foreground / hiding-after-*只是离线遮挡分析与校准输入，移到 `asserts/calibration/backgrounds/`。实际运行用的22份poster / hiding-band-* / hiding-light-*继续发布；`hiding-band-0`虽不在集中预载中，也是真实静态回退依赖，保留。
- 两类处理合计从发布目录排除18,641,265字节。本轮X11 / Past字体重生后另删除2份被替代字体，清单另记；计入新字体替换后的发布素材净减少18,641,525字节，该次收尾369个文件 / 101,608,077字节。

后续交互优化因新增测试退出反馈重生两份字体，清理对应旧哈希（另记interactionRefinementsFontRefresh），当前369个发布素材 / 101,608,089字节；没有重新加入此前移出的校准板或旧技能图集。

## 保留理由

原E技能三件套仍被clean-v2生成器用于中心纹样、轴线 / 珠链分析和几何 / 哈希校验，不是可丢弃的废稿；原四叶印透明稿也需留在本地。源字体、MP3、树原稿、Spine原件、补取来源 / 版权和校准数据同理。它们默认被.gitignore排除，不进入dist。

当前树登记的原型 / 完整体双档仍供轮廓注册、原生切图与维护校验，保留metadata和对应WebP。角色透明poster、减少动态 / 无GL回退、光流纹理、桌面CUR与版权文件均是有效依赖，不按“本次预载未下载”判断废弃。

## 资源检查

```sh
npm run assets:startup
npm run release:assets
npm run build
npm run release:audit
```

`release:assets`只检查和报告，没有删除开关；`-- --report`另存本地 `artifacts/release-assets.json`。它对所有阶段 / 音乐、两种插图、桌面 / 横屏和减少动态求并集，再加入真实静态回退、当前字体 / 指针及元数据引用。出现候选后须先核对工具 / 许可 / 回退使用，不允许直接按字符串搜索结果递归删目录。

`assets:hiding-layers`现在把运行时分带写入public、校准辅助图写入本地asserts；`assets:hiding-calibration`从本地清单读取辅助图并传入离线浏览器，不再通过公开URL加载。原43条校准 / 发布记录保持可核对。

其他构建物、测试截图、缓存和临时打包由.gitignore排除；本轮不清空node_modules或本地验证历史，不把忽略规则当成删除操作。所有保留在public中的文件正常上传，Functions与服务端源码仍是发布必需。
