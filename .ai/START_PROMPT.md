# 重构执行交接：R3a 已完成，直接继续 R2b

更新：2026-11-05。先读 .ai/STATUS.md，再读 AGENTS.md、docs/requirements.md、.ai/PLAN.md、docs/refactoring-plan.md、docs/refactoring-r2a.md、docs/refactoring-r3a.md，核对 git status／git log。已完成 R0 69dc592、H1 730f8fd、R1 d5a0124、R2a e6a762a；R3a 与本交接同批本地提交。不重做这些部分。

用户已明确授权连续完成全部既定重构；会话过长时，在完整部分验证并本地提交后新开同项目会话接续，不逐片确认。下一步直接 R2b→R3b→R4a→R5。R4b、TanStack Query、p-limit、Chevrotain 只有确实更简单且等价才采用，不为清单强行换库。不自行指定新模型或开启并行代理。

保留全部阅读功能、来源语义、记录与真实竞态，删除可避免的重复知识和不必要结构。不要启动 S5、官网、购域名、安装、推送、发布或关机。源码／锁文件／插件仍 0.1.24，已安装记录仍为 0.1.23。ReadingState 旧字段规范化留 R5；真实桌面完整 UI 与非 Windows x64 平台仍未验。

R2a：ChapterContent 共享缓存、旧 raw 本地重解析、来源 ID／空正文校验和公共统计 CAS。准备不改记录；实际打开先校验与迁移记录，再写缓存、登记定位／图片索引并返回 token。保留 v3→v4 同源迁移、expected revision、清缓存代次和清历史保护；remember 复用已有 layout。

R3a：snapshot-state 纯 reducer 集中五类快照更新；普通快照不倒退目录，刷新不覆盖较新私人状态，字数沿用核验时间合并。useCatalogRefresh／useStoryPreparation 去重、代次、两并发不改；route 的旧画面与原动画提交点保留，导航／保存留 R3b。没有新依赖。

本批 build／check 90/90、最终类型格式通过。R2a 冻结全库零差异零联网；R3a 未改解析，未重复审计。R3a Edge fixture 首轮30/31，转场实时轮询未采到反向动画，改在真实 animationstart 暂停原动画后整文件5/5。真实首轮19/20，立绘仍在网络中时5秒断言结束，等待精确响应后图片整文件4/4。完整断言与产品保留，失败trace已存档，31／20个唯一场景均有通过记录。不要把首轮写成全过。R2a另有真实正文首轮6/7后文件7/7。

已实际操作设计稿和当前三页，实看四窗口／双主题刷新截图。首次可视化误用npm exec node，已使用 .local/toolchain/node-v26.13.0-win-x64/node.exe 重验；清单锁文件未改。以后运行本地 .mjs 直接用该固定可执行文件。

重定位包 .ai/local/refactoring-0.1.24/r3a/relocated 阅读器：69个dist与Node哈希一致、无链接或私人状态，fixture／真实stdio、双进程、实际HTTP十工具与MCP／完整HTML通过。真实117部、首篇64块、1500×844CG、532536字节UI。官方app-server全新隔离配置读取准备包installed=false，连接明确的本次包发现10个app-only及global；不是已安装桌面UI验收。4341–4344端口与本批测试进程已退出。

冻结基线 .ai/local/refactoring-0.1.24/baseline.json，SHA256 07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e，独立构建在相邻 baseline/。固定1756篇及独立字数、169立绘、122CG引用、207组合、302原图、21身份发言块；不是全库身份验收。不覆盖基线或修改样本掩盖差异，所有写入探针只用 .ai/local，不碰 .runtime 或真实安装记录。

R2b：分清 prts-resources 的资料取得、纯选择、二进制／组合读取，沿用 prts-portrait／prts-cg。cache.run 建立代次上下文，不是冗余转发；新旧映射、显式变量、唯一身份、确证404才回退及原图／默认／占位／错误语义不能丢。核实封面特例但无等价来源证据就保留，不新增角色表或猜URL。

R3b：整理导航、位置恢复和保存生命周期，保留旧画面、flush、顺序保存、错误所有者和动画取消提交保护。R4a：共享字段扫描并去掉 ComplexFlow 正常异常分流，不改 parser 版本或结构指纹。R5：磁盘入口旧字段规范化及有收益的重复边界清理，保留 reading／index／cache、真实多进程保护和旧数据迁移。

证据在 r2a／r3a 本机目录。附加 check-package.mjs、probe-http-contracts.ts、probe-host-isolated.ts 均明确指向r3a包，复用时更新目标路径，不冒充新包。PowerShell 调 scripts/npm.ps1 分隔符用字面 '--'；Edge／HTTP按工具审批在沙箱外隔离运行。每片验证后更新STATUS／PLAN／DECISIONS并独立本地提交；必要时在完整边界继续新会话，不停在重规划或让用户重复授权。
