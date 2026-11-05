# 重构执行交接：R1 已完成，从 R2a 继续

更新：2026-11-05。先读 .ai/STATUS.md，再读 AGENTS.md、docs/requirements.md、.ai/PLAN.md、docs/refactoring-plan.md、docs/refactoring-r1.md，核对 git status 与 git log。本会话开始于干净的 `730f8fd`，R1 与本交接同批本地提交；此前 R0 为 `69dc592`、H1 为 `730f8fd`。功能比较基线仍为 **7724df1／0.1.24**。不要重做 R0／H1／R1。

用户已明确要求连续完成全部既定重构；会话过长时在一个部分完成验证并本地提交后，新开同项目会话继续，不逐片确认。直接实施 R2a 正文取得 → R3a 目录状态，再按依赖和实际收益完成 R2b／R3b／R4a／R5。R4b、TanStack Query、p-limit、Chevrotain 是收益条件项，不能为完成清单强行采用。无新模型要求，使用用户当前默认配置；不自行指定其他模型或开启并行代理。

目标仍是职责清楚、去掉可避免硬编码／不可达内部防御／过度设计，同时保留全部行为、来源与记录。不要启动 S5 搜索、官网、购域名、安装、推送、发布或关机。当前源码、锁文件和插件仍 0.1.24，已安装记录仍 0.1.23。

已完成 R1：

- shared/tools.ts 关联十工具 schema、ToolInput／ToolArgs／ToolOutput；HTTP service.call 解码，MCP SDK 解码后 execute。UI transport 统一校验结果，组件的重复 schema.parse 移除。保留错篇目／错剧情、修订、historyToken、ReaderError code/sourceUrl/cause、图片占位／组合／分段与代次保护。没有强转、any 或新依赖。
- 本地 SDK／当前官方文档已核对。与独立冻结构建比较完整 tools/list、resources/list 零差异。ReadingState 的旧可选字段仍留 R5 磁盘入口规范化，不能误写成 R1 已完成此项。
- build／check 86/86；最终类型和格式通过。Edge fixture 31/31。真实首轮 18/20，两处测试时序问题已保留 trace：前场景在途统计污染封面比较，以及图片重试响应晚于 5 秒可见性断言。只修正测试隔离／响应等待，不改产品、数据或完整断言；最终真实整套20/20。
- audit:refactor 1756篇及独立字数、169立绘、122CG引用、207组合、302原图和固定21个身份发言块均零差异、零联网。不是全库身份或真实宿主完整UI验收。
- 重定位包67个dist＋Node哈希一致、无链接／私人状态。fixture与真实stdio、双进程、实际HTTP十工具与MCP／完整HTML通过。真实117部、首篇64块、1500×844CG、532238字节UI及隔离保存通过。沙箱内真实stdio目录返回network，沙箱外同包通过；原始日志保留。
- 官方app-server使用全新隔离配置：plugin/read识别0.1.24准备包，installed=false；通过明确指向当前包的独立MCP配置发现十个app-only工具与global/thread入口。此证据不是已安装插件的完整桌面UI；其他平台仍待实测。

冻结基线 `.ai/local/refactoring-0.1.24/baseline.json`，SHA256 **07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e**；独立构建在相邻 baseline/。R1报告、完整日志、失败trace和附加探针在 `.ai/local/refactoring-0.1.24/r1/`。本轮 4341／4342／4343 与隔离包测试进程已确认退出。不覆盖基线，不更新源样本来掩盖变化。PowerShell 调用 scripts/npm.ps1 时参数分隔符写字面 `'--'`。Edge／HTTP 在 Windows 沙箱内回环 EACCES，按工具审批用隔离端口在沙箱外运行。

R2a 重点：service.prepareChapter 与 loadChapter 仍重复旧缓存／本地raw重解析／当前统计／来源获取。抽取内聚正文取得职责，准备只处理正文缓存和公共字数；实际打开才迁移记录、产生token及建立定位／图片索引。不用任意布尔副作用组合；保留expected revision、字数CAS、缓存代次、来源ID检查及v3→v4同源迁移。现有测试入口：story-preparation、revisions、body-images、cache-races。

R3a 保留目录刷新迟到保护和原动画提交点；R3b 再整理导航／保存生命周期。图片沿用已有prts-portrait／prts-cg，不新增角色表或猜URL；解析先共享字段扫描移除ComplexFlow正常控制流异常，不升级parser版本掩盖差异。存储保持reading／index／cache职责和真实跨进程保护，所有写入探针仅指向隔离目录，不触碰.runtime或真实安装记录。

每片完成相应验证、更新STATUS／PLAN／DECISIONS并独立本地提交。若再次交接，传递完成提交、未完成范围、冻结基线和验证限制，不让后继停在重规划或要求用户重复授权。
