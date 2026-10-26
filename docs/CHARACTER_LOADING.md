# 纳西妲加载与正确姿态回退 · 2026-10-26

nahida-placeholder.svg仅在用户显式启用Nidaha彩蛋时展示。正常加载、网络失败、图片错误和WebGL不可用均不选择该SVG；每种CHARACTER_ASSETS必须有自身透明poster。A/C/D/F继续用既有派生姿态，B/E及G补取原本地Spine同一取景的透明首帧，三件套、动作与用户原图不改。

B/E与G新增两张WebP共99,270B（48,832 / 50,438B），高640px、透明、质量.88；原auto viewport与四周8%保持，原动作0.7秒。脚本`node scripts/prepare-character-posters.mjs`仅本地离线重制，临时随机端口在finally关闭；原素材及输出SHA、尺寸与可见像素登记于character-posters.manifest.json，运行时入口为src/data/characterPosters.generated.json。此脚本不进云端prebuild，不要求正式浏览器新增Canvas或生成图片；root统一更新startup目录后，两个当前姿态poster按正常公共角色回退纳入集中下载。

NahidaAvatar按variant / reduced / placeholder建立独立keyed生命周期，不携带上一形态的ready / 失败图片状态；旧播放器与旧图片的回调不会修改新形态。加载阶段先展示正确poster，ready后换为原动态Spine；poster本身也失败时只使用安全的局部标识，不改成其他角色或彩蛋。

CharacterAdapter每次加载持有独立AbortController、对象URL和播放器，失败或离开时释放；仅当前未失败的尝试可以回报ready。初始失败后按1.2 / 2.4秒最多再尝试两次，原poster一直可见；网络online事件可重新开始一次有限恢复。角色响应头与每个响应流块都有30秒无进展限制，每收到新块重新起算，不限制正常下载总时长，缓存正文和网络悬挂均不会永久等下去；所有三件套响应正文下载完毕后，另启用20秒解码 / 首帧看门狗。手机WebGL上下文丢失先回退对应poster，再按同一有限流程重建；暂停与原动作保留，不同时保留多个播放器。卸载取消重试 / 解码计时、监听和未完成请求，旧success不能复活画布。

JSON和atlas响应按UTF8解码后，沿用Spine4.0内部rawDataURIs的原始文本契约；此数据直接交下载器读取，不经过浏览器URL解析，# / %与非ASCII名称都原样保留。不向这个不支持decodeURIComponent的接口传百分号编码，也不修改第三方下载器。纹理仍原Blob / atlas页映射。共享资源缓存的读取超时、下载重试和开场放行由StartupLoader / cache统一处理，本组件不另建缓存、未来场景实例或永久循环。

测试：tests/character-presentation.test.ts验证全部六姿态只使用对应poster、仅显式彩蛋显示SVG与派生哈希；tests/character-adapter.test.ts覆盖慢下载不误超时、解码有界恢复、旧回调、有限重试 / dispose与上下文丢失 / 暂停。浏览器脚本e2e/character-recovery.spec.ts覆盖B/E/G无GL正确图及现实角色上下文恢复；本轮实际执行结果由最新TEST_PLAN汇总，不把脚本存在当作通过。
