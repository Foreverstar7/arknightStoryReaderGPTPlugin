# 重构交接：全部既定工作已完成

更新：2026-11-05。R0／H1／R1／R2a／R3a／R2b／R3b／R4a／R5 全部完成并分别本地提交。R4a 为 `4c43794`，R5 为 `28b9855`；其余提交及各片报告见 `.ai/PLAN.md`。不再自动新开会话或重复这些切片，后续按用户的新任务推进。

开始新任务先读 `.ai/STATUS.md`，再按任务读 `AGENTS.md`、`docs/requirements.md`、`.ai/PLAN.md`、`docs/refactoring-plan.md` 和相关交付报告，核对 `git status`／`git log`。用户已追加要求安装，源码／锁文件／插件版本现为 0.1.25，installed／enabled为true，依赖未变。旧0.1.24目录仍有进程、同版本替换失败，因此使用独立版本目录；没有强停旧会话。没有推送、发布、S5 搜索、官网或域名操作。

0.1.25相对R5仅两个产物中的版本字符串变化，其余71个dist文件相同；实际安装包73文件与Node哈希一致，build／类型／格式及platform4/4、真实stdio与官方加载器通过，三份真实阅读文件哈希不变。用户仍需正常重启桌面客户端；完整桌面UI未验。本轮未重跑完整浏览器／全库审计，详细证据见 `docs/install-0.1.25.md`；下方为R5原始验证记录，不冒充0.1.25新执行结果。

R4a 将源字段扫描与流程投影分开，Decision 入口配对 label／value，明确选择简单／复杂流，移除 ComplexFlow 异常和重新解析；保持原输出、段落、ID、revision、parser v4、scene／CG 和来源诊断。扫描错误仍在投影到达原行时抛出，Warp／GotoPage 仍检查原始全文。R4b／Chevrotain 及 UI 候选库未证明简化收益，不采用不是未完成项。10648 组原创组合结果／诊断等价；同输入测量全库 1777.20→1779.36ms、37 篇复杂流 105.03→81.60ms，内存相近。方法与局限见 `docs/refactoring-r4a.md`。

R5 在磁盘入口一次规范化旧代次／修订字段，内部更新使用 StoredReadingState；字数行共用解码，删除 PublicCache 转发子类，可信来源结果不重复 parse。磁盘未知输入、异构 pending map、事务、historyToken、cache epoch、统计 CAS、旧 JSON 防复活和旧 raw 迁移仍有真实职责，必须保留。version-1／表／wire schema 不变；读取已有 SQLite 行不为补字段而重写，正常更新可保存已有可选字段的显式默认值。目录创建失败现明确归类 storage，原始 cause 留在本机错误，不通过 toFailure 泄漏。

后续不能退回的已验证行为：准备只写公共缓存／统计，实际打开才迁移记录和登记定位；快照合并不能倒退目录或私人状态；cache.run 仍有代次职责，图片 404 回退需要来源依据；R3b 保存队列遇到前笔失败仍须等待已排队后笔，动画取消与提交错误分别处理，旧导航不得提交。详细依据在对应 R2／R3 报告及 `.ai/DECISIONS.md`。

R5 最终 build／check **104/104**，类型／格式通过，真实 PRTS **20/20** 首轮通过。fixture 首轮 **33/34**：原生滑动后末次点按未打开；原 trace 保留，五次独立诊断正常，唯一根因未证实。测试改为等待实际 scrollend，再用稳定元素的相对留白坐标；断言与产品逻辑保留，最终完整 **34/34**。详见 `docs/refactoring-r5.md`，首轮与最终证据在 `.ai/local/refactoring-0.1.24/r5/`。

冻结基线 `.ai/local/refactoring-0.1.24/baseline.json`，SHA256 `07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e`，独立构建在相邻 `baseline/`。R5 再次核对固定 1756 篇结构及独立字数、169 立绘、122 CG 引用、207 组合、302 原图和固定身份样本 21 发言块，零差异、零联网；不是全库身份验收。不覆盖基线或修改样本掩盖差异。

本轮实际包 `.ai/local/refactoring-0.1.24/r5/relocated 阅读器` 的 73 个 dist 文件及 Node 哈希一致，无链接／私人状态，已清除 PublicCache 遗留模块。fixture／真实 stdio、双进程、HTTP 十工具／MCP 完整 HTML 及隔离官方 app-server 发现通过：117 部、首篇 64 块、1500×844 CG、533176 字节 UI。宿主 installed=false，不等于安装后桌面完整 UI 验收；非 Windows x64 仍未实测。

最终 UI HTML 与 R3b 相同，SHA256 `4fe49f0f0361870d23e4d2cb81450cc95a3a8c43345c7c452115b66d333a67ad`；已实看本轮 320px 浅色／低高度深色正文和真实立绘。4341–4344 无监听，本轮包测试进程已退出。后续复用探针必须指向新任务的实际包，不能把 R5 包冒充后续构建。

直接运行本地 `.mjs` 使用 `.local/toolchain/node-v26.13.0-win-x64/node.exe`，不要用 `npm exec node`。PowerShell 调用 `scripts/npm.ps1` 的分隔符为字面 `'--'`。当前 TS lib 为 ES2023，测试门控复用 `tests/helpers/deferred.ts`。所有探针和测试只写 `.ai/local/` 或新隔离目录，不碰真实 `.runtime` 和安装记录；Edge／HTTP 按工具审批隔离运行。
