# R5：存储边界与重构收尾

日期：2026-11-05。从 R4a `4c43794` 接续。R0／H1／R1／R2a／R3a／R2b／R3b／R4a／R5 既定工作已完成；版本仍为 0.1.24，依赖未变。R4b／候选换库没有证明额外简化收益，不作为遗漏工作继续挂起。

## 改动

ReadingStore 在磁盘解码时将旧数据缺少的 chapterRevisions、historyEpoch、storyHistoryEpochs 规范化为确定的内部形状；原记录、设置、最后／最远位置、未知进度和最近阅读不补造默认值。服务不再反复判断整个代次字段是否存在，新剧情尚无局部代次仍按零处理。

读取已有 SQLite 行不会为规范化而重写；后续正常更新保存已有可选字段的显式默认值。记录 version=1、数据库表、外部 schema 和工具名不变，旧 JSON／SQLite 仍可读取。响应可能将这些原本可选的字段明确返回为 0／空对象，旧契约已允许这些值，不需要数据迁移或清理。

内部 change 回调接受并返回 StoredReadingState，不再重复 parse 已经通过工具／来源边界和磁盘入口的对象；外部磁盘未知数据继续完整验证。字数索引的两处磁盘读取共用 decodeCount，移除 String(row.data) 强行转字符串。保存定位通过 findIndex 确认后不再重复检查该索引是否存在。

PublicCache 只有构造转发及较窄 scope 类型，没有独立存储行为。所有调用改为直接构造 JsonCache，并保留原来的 mapping／metadata／images 字面 scope；CacheScope 仍限制合法范围，正文和目录的专用接口保留。没有建立替代 manager、factory 或通用 repository。

资源／资料的已解码来源结果不再立刻重复 schema.parse；磁盘读取和异构 pending map 的重新取出仍要解码。后者实际存储 Promise<unknown>，保留一次类型收窄比强转或再建数个注册器更直接。cache.run、请求合并、刷新标记与代次检查没有删减。

## 明确修复的错误反馈

新增边界测试先取得 **2/5**，失败证据保留在 `boundary-before.log`：旧字段未规范化是本片预期变更；另两项复现了已有错误反馈问题。

- reading 目录创建原来位于存储 try 之外，路径冲突会漏出未分类的系统异常。现纳入同一 storage 错误边界，保留路径和原文件，修复路径后可以重试。
- 旧 JSON／SQLite 失败原来丢弃 cause。现在保留原原因供本机排查，toFailure 仍只输出既有公开字段，不把 SQLite 原始错误或私人数据传到页面。

坏 JSON、非法代次和损坏统计仍明确失败；不回退旧文件覆盖 SQLite，不清记录，不吞错或无限重试。注入真实 SQLite 触发器拒绝写入后，原提交仍在，移除故障后重试成功。

## 保留的边界与保护

| 保留项                                               | 原因                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| reading／index／cache 各自事务与耐久性               | 私人记录、公共统计和可丢弃内容职责不同；未合成通用存储框架，未调整原有 SQLite 配置               |
| BEGIN IMMEDIATE、historyToken、cache epoch、统计 CAS | 多进程保存、清除、刷新与迟到响应真实可达，保护对象不同                                           |
| 旧 JSON 标记、cache tombstone、v3→v4／旧 raw 迁移    | 旧磁盘输入仍在支持范围内；清理后不能复活或主动补下载                                             |
| 来源／磁盘／HTTP／MCP／传输结果解码                  | 它们重新跨越未知输入边界；MCP 图片 envelope 仍需验证 kind 对应的字段，不能因基础字段已解码而省略 |
| SourceImage 的输入 key 解码                          | effect 从序列化 key 恢复联合输入类型；不通过强转删除校验，也不为少量解码再引入同步状态           |
| UI 保存与转场的错误所有者                            | R3b 已验证失败前笔后仍排空保存队列、动画取消与提交错误分别处理；未退回提前结束 flush 的旧算法    |
| 已确认封面／分类／源语法及资源预算                   | 先前 H1／R2b／R4a 已核实其依据；没有把必要产品／来源规则当作可删除常量                           |

## 最终验证

- build、check **104/104**；最后的类型与格式检查通过。存储／旧格式／跨进程／修订专项 **23/23**，新边界用例全部通过。首条定向命令额外带了不存在的 tests/s4.test.ts，runner 未执行该文件；23 项的实际范围为 reading-boundary、storage、cache-storage、cache-races、revisions，S4 准备由完整 check 的 story-preparation 及浏览器／双进程探针覆盖。
- R5 最终 `audit:refactor` 再次取得固定 **1,756 篇结构和独立字数、169 立绘、122 CG 引用、207 组合、302 原图及固定身份样本 21 发言块零差异、零联网**。基线 SHA256 仍为 `07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e`；没有覆盖基线或修改样本。
- 真实 PRTS 全套 **20/20** 首轮通过，3.1 分钟。fixture 首轮 **33/34**；保留 trace／失败截图，调整测试观察点后最终完整 **34/34**，1.6 分钟。没有降低断言或改产品点击逻辑。
- 重定位包 **73 个 dist 文件**与项目 Node 哈希逐一一致，无链接或私人状态。源码与36个编译模块对应；删除 PublicCache 后明确清除构建／准备包中其旧 js 和 map，最终包没有遗留该模块。
- 本轮实际重定位包的 fixture／真实 stdio、双进程、HTTP 十工具／MCP完整HTML和隔离官方 app-server 发现均通过。真实返回 **117 部、首篇64块、1500×844 CG、533,176字节UI**及隔离保存。host `installed=false`，明确不等于安装后桌面完整UI验收。
- 最终 UI HTML 与 R3b 的 SHA256 相同：`4fe49f0f0361870d23e4d2cb81450cc95a3a8c43345c7c452115b66d333a67ad`。实看本轮320px浅色、低高度深色正文与真实立绘共四张截图，布局、来源入口、透明图片和可用控件保持。没有重做布局或重复交互稿操作。
- 4341–4344无监听，本轮R5包测试进程已退出，核对见 `cleanup-check.json`。所有探针／测试只写 `.ai/local/`，没有将真实 `.runtime` 或实际安装记录作为测试目录；没有安装、推送或发布。当前桌面宿主完整UI和非Windows x64仍待对应环境实测。

### 触摸首轮失败的观察边界

首轮在原生横向滑动后直接读取绝对坐标并点按卡片右下留白，最后的正文可见性断言失败；画面仍停留在目录，没有出现页面错误提示。trace 保留了该次点按坐标和原目录。五次独立事件诊断均正常，记录证明 touchEnd 后仍可能继续惯性滚动；首轮根因没有被独立、稳定复现，不能直接宣称已证明产品故障或唯一原因。

原测试只等 scrollLeft>50，未等原生滚动结束。现在在滑动前监听 scrollend，保留位移断言，再等实际结束；末次点按使用 locator 的相对留白位置和原生可见／稳定性检查，避免使用过早保存的绝对坐标。没有固定 sleep、force、自动重试或删除触摸／留白断言；完整最终34项通过。

## 实际命令与后续

证据在 `.ai/local/refactoring-0.1.24/r5/`，首轮与最终日志分开，源码及协作记录独立本地提交。

```powershell
./scripts/npm.ps1 exec '--' tsx --test tests/reading-boundary.test.ts
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run typecheck
./scripts/npm.ps1 run format:check
./scripts/npm.ps1 run audit:refactor '--' --output .ai/local/refactoring-0.1.24/r5/current.json --compare .ai/local/refactoring-0.1.24/baseline.json
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PORT = '4341'
./scripts/npm.ps1 run test:e2e
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run plugin:prepare
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe .ai/local/refactoring-0.1.24/r5/check-package.mjs
./scripts/npm.ps1 run probe:mcp '--' '.ai/local/refactoring-0.1.24/r5/relocated 阅读器'
./scripts/npm.ps1 run probe:s4:installed '--' '.ai/local/refactoring-0.1.24/r5/relocated 阅读器'
./scripts/npm.ps1 exec '--' tsx .ai/local/refactoring-0.1.24/r5/probe-http-contracts.ts
$env:CODEX_CLI_PATH = (Get-Command codex).Source
./scripts/npm.ps1 exec '--' tsx .ai/local/refactoring-0.1.24/r5/probe-host-isolated.ts
```

stdio分别设置READER_SOURCE=fixture／prts；Edge／HTTP和真实网络按工具审批在沙箱外隔离运行。辅助 `probe-touch.mjs` 使用4344及独立数据记录五次真实事件。日常仍按当前剧情准备正文、按需读取图片，维护全库审计不进入产品运行路径。

既定重构已结束，无需继续新开会话执行R4／R5。后续S5搜索、S6网站／分发、安装或发布需按用户的新任务推进；本次没有启动它们。回退本片不要求改表、清缓存或清记录，旧版可读取同一version-1记录。
