# 交互音效

## 素材与来源

已替换旧合成铃音；原始下载另存 `asserts/reference-supplements/sfx/`，不覆盖企划原素材。当前七份 AAC 音频合计 **150,375 B**，JSON 数据包合计 **200,687 B**，新增两份共 84,094 B，不新增运行时外链。本轮按用户要求不进行测试 / 浏览器验收 / 主观试听，仅生成编码与清单；历史通过数不代表本轮验证。

| 交互 | 声音 / 时长 | 来源及许可 |
| --- | --- | --- |
| 成功收集普通 / 奖励梦露 | 单颗短水滴，347 ms | Jan Schupke / Vehicle，[Tinysized SFX](https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx)，CC0 |
| 有效及日期锁定满额时的免费浇灌 | 柔和倒水，1610 ms | 同一 Tinysized SFX 包，CC0 |
| 随机兰那罗入场 / 无交互自然退场 | 轻叶声，1050 ms；退场略慢、略轻 | Augmentality / Brandon Morris，[Random Sounds Samples](https://opengameart.org/content/random-sounds-samples)，选择 CC0 |
| 点击随机 / F 常驻兰那罗并成功领奖 | 短促弹跳，388 ms | cfork、Iwan Gabovitch / qubodup，[Cute Cartoon Jump](https://opengameart.org/content/cute-cartoon-jump-sound-effect)，CC-BY 3.0；保留作者 / 原声 / 修改声明 |
| 真正阶段加载开始 | 传送，3240 ms | [Genshin Teleport](https://www.myinstants.com/en/instant/genshin-teleport-81406/)，malakai1 上传的社区片段，**非官方资源下载 / 非 CC0** |
| 纳西妲实际来访登场 | 轻盈魔法竖琴 / 微回声，1850 ms | Julie Damsgaard / Spring Spring，[Magic Words + Healing](https://opengameart.org/content/magic-words-healing-sound-effect) 的 health_restore.wav，CC0；不用带人声的 magic_words.wav，不冒充原神官方音效 |
| Rainstorm 成功生成梦露 | 真实密集雨声，3100 ms，短渐出、不循环 | Ylmir，[Rain (loopable)](https://opengameart.org/content/rain-loopable)，CC0，原 ZIP 的 1.mp3 截取 |

传送页面没有单独提供再分发授权，相关游戏权益仍归原权利人；非商业声明不能代替授权。上线前由负责人确认许可，或提供可授权的干净传送录音替换；不把社区标题当作官方来源证明。署名 / 许可链接与修改声明同时放在源目录和随站点分发的 `public/asserts/sfx/CREDITS.txt`；来源页、下载地址、源 / 输出 SHA-256、滤镜、音量与字节数见 `sfx-assets.manifest.json`。

## 编码与加载

`npm run assets:sfx` 使用与 BGM 相同的本地 FFmpeg，生成 AAC-LC / MP4、96 kb/s、48 kHz、单声道的小副本。使用素材而非运行时合成振荡器；轻度高低通、逐素材增益、限峰与短淡入淡出。来访竖琴的微回声烘焙在短副本中，不新增运行时节点。编码过程统计只用于生成清单，不宣称本轮试听 / 浏览器播放或回归通过。

发布文件为哈希 **`.json`**，包含 version=1 与单份 base64 音频；浏览器校验大小 / 版本 / 字符后还原 AAC 字节，交给原生 `AudioContext.decodeAudioData`，不加密、不自定义音频解码。首轮 `.m4a` 与同字节 `.bin` 的 fetch 均被本机 IDM Advanced Integration 回 204 空内容；最终 JSON 包实际播放通过，不禁用 / 修改浏览器或下载器配置。约 29 KiB 的 base64 封装开销换取兼容，仍逐个按需请求；BGM 原 HTMLAudioElement / M4A 流式加载与音质不改。

开场预载七份小 JSON 压缩响应，不创建 AudioContext / AudioBuffer；实际成功动作才读取版本缓存并解码一份，进退叶声共用缓冲。解码缓存最多七份，原每文件 128 KiB / 5 秒校验、失败冷却和动作有效时限保持；迟到音效不补播，无全量解码或后台轮询。

## 播放与混音

- 与 BGM 共用唯一惰性 AudioContext；第一次真实点击 / 键盘才授权，授权不请求素材，同次动作可等待尚未完成的授权；游戏不等待音频 Promise，获得授权过晚也不补响。
- 独立音效 GainNode 总线与轻度 DynamicsCompressor；不改 BGM 音量，避免短音反复抽吸。文件留峰值余量，单声淡入 8ms / 淡出 60ms；默认总音量 60%。相对增益：水滴 0.9、浇灌 0.85、入场 0.28、退场 0.22、弹跳 0.75、传送 1；叶声是更轻的环境细节。
- 收露 85ms 节流、同类最多两声，全部同时最多六声，必要时替换最旧声。失败 / 满额 / 过期、重复领取、露水不足或禁用动作不响；鼠标经过后再点击同一颗不重复。
- `GameController.subscribeSound` 发送真实成功动作，不根据 React 重绘猜测，也不入存档。EncounterDirector 明确区分自然入退；点击跳出仅弹跳、不叠自然退场叶声。清理、换景、回望、停止不冒充退场；F 常驻不因重绘 / 重新进入就响叶声。
- 传送仅在旧对白 / 来访结束、门槛满足、实际覆盖加载图时一次；进度变化 / 新景就绪 / 普通刷新不额外触发。加载中拒绝其他音效，新场景释放残余声；不为网页启动技能揭幕额外加声。
- 来访音增益 .64，仅 companion 真正进入 arrive 时一次，随机 / 保底 / Nahida 代码来访统一，重绘 / 观察 / 施法不重复。暴雨增益 .54、同类最多一声，仅 Rainstorm 成功生成 40 颗时一次；设置内输入则随面板关闭、梦露开始运动时播放，重复输入仅保留一次，后台 / 竖屏 / 重置 / 换景取消未播请求。均受原交互音量 / 授权 / 并发管理，不改 BGM。
- 设置 / 后台 / 竖屏 / 片头 / 梦醒停止短音并撤销请求，恢复不补响；换景 / 回望清理旧作用域。只暂停音效总线，不 suspend 共享上下文或干扰 BGM 暂停。节点结束断开；卸载清理请求 / 超时 / 缓冲 / 节点，最后关闭上下文。

## 设置与兼容

「轻柔的交互音效」替换为 **「交互音效音量」** 0～100 滑条，与音乐独立；0 静音并保留上次正音量，调大开启，面板内不边拖边连续试听。

v2 新增 `settings.soundVolume`：0～1、默认 0.6，非数字 / 非有限值回默认，其余钳位；保留 `sound` 兼容，**旧档显式关闭仍静音**，不强制开启，新档 / 缺项默认开启。0 数据也确实静音，不改音乐或游戏收据。

## 验证

`tests/sound.test.ts` 检查文件哈希 / 许可 / 峰值、按需缓存、共享上下文、授权、节流 / 并发、失败超时、取消清理与成功事务。`e2e/interaction-sound.spec.ts` 用真实 AudioContext / 本地副本，观察实际 BufferSource.start，不把网络请求 / 解码 Promise 当成已播放。当前执行结果与限制见 [TEST_PLAN.md](TEST_PLAN.md)。
