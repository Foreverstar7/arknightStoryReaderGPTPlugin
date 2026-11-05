# 重构执行交接：R4a 已完成，直接继续 R5

更新：2026-11-05。先读 .ai/STATUS.md，再读 AGENTS.md、docs/requirements.md、.ai/PLAN.md、docs/refactoring-plan.md、docs/refactoring-r2b.md、docs/refactoring-r3b.md、docs/refactoring-r4a.md，核对 git status／git log。已完成 R0 69dc592、H1 730f8fd、R1 d5a0124、R2a e6a762a、R3a 3b48d6a、R2b e85c9a8；R3b fa531bb；R4a 与本交接同批独立本地提交。不重做这些部分。

用户已明确授权连续完成全部既定重构；会话过长时，在完整部分验证并本地提交后新开同项目会话接续，不逐片确认。下一步直接 R5。R4b 只有确实更简单且等价才采用；TanStack Query／p-limit 在已完成 UI 片没有简化收益，不采用不是遗留必做项。不自行指定新模型或开启并行代理。

保留全部阅读功能、来源语义、记录与真实竞态，删除可避免的重复知识和不必要结构。不要启动 S5、官网、购域名、安装、推送、发布或关机。源码／锁文件／插件仍 0.1.24，已安装记录仍为 0.1.23。ReadingState 旧字段规范化留 R5；真实桌面完整 UI 与非 Windows x64 平台仍未验。

R2a：ChapterContent 共享缓存、旧 raw 本地重解析、来源 ID／空正文校验和公共统计 CAS。准备不改记录；打开先校验与迁移，再写缓存、登记定位／图片索引并返回 token。保留 v3→v4 同源迁移、expected revision、清缓存代次和清历史保护；remember 复用 layout。

R3a：snapshot-state reducer 集中五类快照；普通快照不倒退目录，刷新不覆盖较新私人状态，字数按核验时间合并。目录／准备 hook 的去重、代次、两并发不变，route 旧画面保留。

R2b：prts-resource-source 负责公开请求／限量读取／索引与映射解码，prts-image 负责原图与按序组合。PrtsResources 保留缓存／身份／404 回退，prts-portrait／prts-cg 保留纯选择。PortraitImage 消除缺状态分支，现代准确选择失败后不重复选择。cache.run 仍有代次职责，必要封面规则没有等价源字段而保留。92/92、真实图片／封面13/13、冻结全库与图片身份零差异零联网。

R3b：useReadingPosition 管理挂载期的DOM锚点／恢复／事件，position-save-queue 负责顺序、去重和排空，usePageTransition 只负责动画适配；ReaderApp 保留请求、错误和原 flushSync 提交。Failure 共同保存文案与重试，卸载使导航失效。确实修复了原先前笔保存失败使flush提前返回（后笔尚在队列）的竞态；不得退回整段catch跳出等待。动画ready预期拒绝被消费，updateCallbackDone异常展示；finished只释放生命周期，取消仍核对导航代次。

验证：build／check95/95，最终类型／格式通过。fixture首轮33/34，新增提交异常场景暴露ready未处理拒绝；产品修正后完整最终34/34。实看发现旧reader／transitions测试继承深色，使浅色模拟无效，现测试先恢复system，真正四窗口双主题八张正文截图已检查。真实全套20/20首轮通过。实际操作交互稿与当前三页。R3b仅改UI，未重复冻结解析审计，不冒充新报告。

最终包 .ai/local/refactoring-0.1.24/r3b/relocated 阅读器：73个dist与Node哈希一致，无链接／私人状态；最后UI HTML已更新并重核对，fixture／真实stdio、双进程、HTTP十工具／完整HTML和隔离官方宿主发现通过。真实117部、首篇64块、1500×844CG、533176字节UI。HTTP首轮10秒健康轮询未就绪、无日志且未退出，根因未证实；仅探针等候上限改30秒后通过。宿主installed=false，不能当作桌面完整UI验收。

4341–4344无监听，本批r3b包Node测试进程已退出。所有探针只写.ai/local，不碰.runtime和真实安装记录。原始失败日志／trace与最终结果在r3b目录。check-package.mjs、probe-http-contracts.ts、probe-host-isolated.ts可复用但必须改为下一片实际包路径；不得把r3b包当作未来包。

冻结基线 .ai/local/refactoring-0.1.24/baseline.json，SHA256 07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e，独立构建在相邻baseline/。固定1756篇及独立字数、169立绘、122CG引用、207组合、302原图、21身份发言块；不是全库身份验收。不覆盖基线或修改样本掩盖差异。

R4a已完成：prts-scanner单次读取字段并保留行号，Decision配对label／value，明确选择简单／复杂流，移除ComplexFlow与重跑。保留两种输出、段落、ID、revision、v4、scene／CG和来源诊断。扫描错误等投影到达原行才抛出，原始全文仍检查Warp／GotoPage。check99/99、真实PRTS20/20首轮通过；最终固定1756篇结构／独立字数及图片身份零差异零联网，10648组原创指令组合结果／诊断等价。同输入校准测量全库1777.20→1779.36ms、37篇复杂流105.03→81.60ms，内存相近，首轮与最终分开保留。R4b／Chevrotain无已证实的简化收益，不采用不是遗漏。详见docs/refactoring-r4a.md；证据.ai/local/refactoring-0.1.24/r4a/。

R5：审查ReadingState磁盘入口旧字段规范化、PublicCache仅scope限制与剩余重复parse／兜底；保留reading／index／cache不同耐久性、真实跨进程事务、historyToken、epoch、统计CAS、旧JSON防复活和旧raw迁移。不要建通用repository／事务框架，不以清数据消除旧格式。

直接运行本地.mjs用 .local/toolchain/node-v26.13.0-win-x64/node.exe，不能npm exec node。PowerShell调用 scripts/npm.ps1 分隔符用字面'--'。当前TS lib为ES2023，测试门控复用tests/helpers/deferred.ts，不为Promise.withResolvers改变工具链。Edge／HTTP按工具审批沙箱外隔离运行。每片验证后更新STATUS／PLAN／DECISIONS并独立本地提交；若再过长，在完整边界新开会话，不停在重规划。
