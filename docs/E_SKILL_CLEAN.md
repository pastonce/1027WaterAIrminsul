# E技能图集：四叶印与光线分离

原套件的部分角花被所有权矩形切掉尖端，部分珠链带有角花碎片。当前使用clean-v2派生套件，原asserts/E技能素材根目录三件套和哈希完整保留。

## 素材与几何

- 使用内置image_gen从原corner_tr提取完整、真实透明的单枚四叶印，保留绿叶 / 白色星芯风格，去除光线、珠子与游离碎点。工程稿为asserts/E技能素材/clean-v2/four-leaf-master.png，精确提示词 / 源图与生成路径见e-skill-clean-generation.json。
- 四角独立完整，放在原180×180区域内；光线 / 珠链根据原alpha分析得到的轴线与圆珠中心、半径，以代码图形重建，保留原构图和轻微线形。角花不再带线，珠链不再带花瓣碎片；center_emblem逐像素沿用原图。
- 源骨骼JSON和atlas逐字节复制，仍为4.0.33、19骨骼 / 17槽、1024×640、normal合成。原世界变换、UV区域、开场方窗、分裂 / 放大轨迹和show / hide / idle时序不变。
- 新PNG为84838 B，运行时发布public/asserts/effects/e-skill-frame-clean-7e78729b722f.png；旧public PNG已在阶段收尾时删除，本地原三件套仍供重制与校验。祝福仍16块外围、中心为草元素图标；开场仍使用原中心纹样与右上角四叶印。

这是图案分离和派生清理，不宣称新纹理与原图逐像素相同；完整框前后对照保存在artifacts/irminsul/skill-comparison.png。未额外烘焙光晕或将合成改为additive，局部发光仍由原运行时效果提供。

## 重建与发布

运行`npm run assets:e-skill-pattern`会先执行assets:e-skill-clean，离线生成clean-v2三件套和e-skill-clean.manifest.json，再由匹配4.0解析器导出eSkillPattern.generated.json并复制哈希PNG。重建使用已有透明工程稿，不自动调用生成服务；原图 / 工程稿缺失时失败，不静默退回旧混杂图集。

e-skill-clean.manifest.json登记原三件套哈希、透明工程稿哈希、分析几何及派生三件套哈希。开场、祝福与预载均从E_SKILL_PATTERN读取新纹理，缺图仍走原有界回退，不加运行时Canvas / GL / RAF。

手动发布需携带public新PNG与生成JSON / 启动清单；仅在本地重做素材时需要原三件套、透明工程稿和生成记录。README与原同目录README已注明派生入口。实际验证见TEST_PLAN.md。
