# 重构执行交接：R2a 已完成，直接继续 R3a

更新：2026-11-05。先读 .ai/STATUS.md，再读 AGENTS.md、docs/requirements.md、.ai/PLAN.md、docs/refactoring-plan.md 和 docs/refactoring-r2a.md，核对 git status／git log。此前 R0 69dc592、H1 730f8fd、R1 d5a0124 已完成；R2a 与本交接同批本地保存。不重做这些部分。

用户已明确授权连续完成全部既定重构；会话过长时，在完整部分验证并本地提交后新开同项目会话接续，不逐片确认。下一步直接 R3a，然后 R2b／R3b／R4a／R5。R4b、TanStack Query、p-limit、Chevrotain 只有确实更简单且等价才采用，不为清单强行换库。不自行指定新模型或开启并行代理。

保留全部阅读功能、来源语义、记录与真实竞态，删除可避免的重复知识和不必要结构。不要启动 S5、官网、购域名、安装、推送、发布或关机。源码／锁文件／插件仍 0.1.24，已安装记录仍为 0.1.23；真实桌面完整 UI 和非 Windows x64 平台仍未验。

R2a：ChapterContent 共享缓存、旧 raw 本地重解析、来源 ID／空正文校验和公共统计 CAS。准备不改记录；实际打开先校验与迁移记录，再写缓存、登记定位／图片索引并返回 token。保留 v3→v4 同源迁移、expected revision、清缓存代次和清历史保护；remember 复用已有 layout。ReadingState 旧字段规范化仍留 R5。

本片 build／check 88/88、冻结全库零差异零联网、Edge fixture 定向 10/10。真实正文首轮 6/7，SR-2 请求尚未响应时 5 秒可见性断言结束，trace 已保留；只把该断言等候上限改为 30 秒，受影响整文件复验 7/7。当前 dist fixture stdio／双进程通过；本批完整浏览器与包回归在 R3a 稳定后执行。R1 的宿主发现与包验证不能写成本片重验。

冻结基线 .ai/local/refactoring-0.1.24/baseline.json，SHA256 07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e，独立构建在相邻 baseline/。固定 1,756 篇及独立字数、169 立绘、122 CG 引用、207 组合、302 原图、21 身份发言块；不是全库身份验收。不覆盖基线或修改样本掩盖差异，所有写入探针只用 .ai/local，不碰 .runtime 或真实安装记录。

R3a：把 ReaderApp 的初次快照、普通快照、刷新目录、公共字数及阅读状态更新集中到明确入口，沿用 useCatalogRefresh 和 story-counts。刷新只改公共目录，不覆盖迟到私人状态；普通快照不倒退新目录。保留 route 的旧画面与原动画提交点，导航／保存生命周期留 R3b。复用五个 catalog-refresh 场景和四窗口／双主题验收。

图片沿用 prts-portrait／prts-cg，不新增角色表；解析先共享扫描并去掉 ComplexFlow 正常异常分流，不改 parser 版本。存储保留 reading／index／cache 边界及跨进程保护。

证据在 .ai/local/refactoring-0.1.24/r2a/；R1 附加 compare-mcp.mjs、probe-http-contracts.ts、probe-host-isolated.ts 可按当前产物复用。PowerShell 调 scripts/npm.ps1 的分隔符用字面 '--'。Edge／HTTP 回环依工具审批在沙箱外隔离执行。每片完成后更新 STATUS／PLAN／DECISIONS 并独立本地提交；交接传递剩余目标，不停在重规划或要求用户重复授权。
