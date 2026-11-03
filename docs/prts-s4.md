# S4 验收：持久续读、修订迁移与缓存

本页保留独立分支交付历史。S4 已提交为 23c7208，封面为 87f3930；合并后的 0.1.19 验证与当前 Git 状态见 docs/integration-0.1.19.md 和 .ai/STATUS.md。下文未提交／等待条件不再作为当前阻塞。

2026-11-03 后续授权：用户要求先提交 S4，再合并已验证的封面分支。S4 0.1.18 在 main 单独形成提交边界，随后于独立工作树集成 0.1.19；旧文中的“不提交／不处理剩余封面”是本轮授权之前的交付状态。不进入 S5，不推送或发布。提交前已重新通过 build 和 check（47/47）；最终组合另行验证。

## 当前交付：0.1.18 首页圆环与整部正文加载

2026-11-03 用户体验指出：逐篇阅读后才能补齐分母，会使首次阅读的整体百分比不可用。此前将 0.1.17 的 S4 概括为全部完成不够准确。本次按新指令补齐此路径，版本 **0.1.18**，Git 基线仍为 `b00b5b9`，不提交、不进入 S5。

- 首页使用白底百分比圆环，金色弧段按已读比例增长；未阅读剧情显示 0%。有旧记录但统计缺失／修订不一致时显示短横线及可访问说明，不再显示“总字数待核实”，不伪造百分比。
- 打开剧情即加载该部全部正文，最多两篇并发，篇目列表先展示，可边加载边阅读。显示加载篇数、失败重试和完成后的总字数。离开剧情停止排队，已发请求可完成；清理全部内容停止队列并阻止旧请求回填，重新进入／主动重试才能恢复。
- 预取不创建已读记录、不更新最近阅读、最后／最远位置、不迁移旧阅读记录，不请求正文图片或映射；封面及手动／自动正文图片规则不变。
- 独立 `index/word-counts.sqlite` 保存篇目、剧情、源修订、字数、统计时间，不保存正文或私人阅读位置。清缓存／清历史保留公共统计。刷新本章更新对应字数；发现旧记录修订不一致时，实际打开正文才迁移。
- 索引通过修订比较拒绝迟到响应，UI 按统计时间合并慢快照与预取结果；缺失篇目不计零，完整分母齐全后按字数加权。新增 `reader_prepare_chapter` 仅供 app 使用，只返回小型统计结果；共 **10 个 app-only 工具**，无模型调用或整库预取。

| 验证层次 | 本轮最终结果 | 边界 |
| --- | --- | --- |
| 检查与构建 | check **47/47**、类型／格式和 build 通过 | 新增五项统计／存储回归，原修订、离线、过期与跨进程缓存检查保持通过 |
| 浏览器 fixture | **20/20**，1.4 分钟 | 新增预取无阅读副作用、两请求上限、失败重试、圆环加权、清理中止；四窗口、浅深主题、键盘、减少动态效果 |
| 浏览器真实 PRTS | **12/12**，1.5 分钟 | 骑兵与猎人 **16 篇／14,519 字**，阅读前分母齐全；预取无正文图片调用，续读和清缓存后进度可用 |
| 实际安装包 MCP | stdio、HTTP、双进程 S4 探针通过 | 六篇 fixture 预取不写记录，字数索引跨清缓存／清历史保留 |
| 官方加载器 | 0.1.18、10 app-only 工具和 global 入口通过 | 不替代真实宿主 UI |
| 手动浏览器 | 首页 0% → 加载 6 篇／4,002 字 → 阅读第一篇 → 首页 16% | 原创隔离样例；桌面／窄屏截图实际查看 |
| 真实桌面宿主 UI | 留用户重启客户端后体验 | 沿用下文 Computer Use 限制 |

新圆环测试首轮因主题控件定位超时导致全套 19/20；改用实际 combobox 可访问名称定位后，专项 2/2、最终全套 20/20。没有放宽产品断言或超时。第一次沙盒测试无法访问 localhost 健康检查，改在可访问回环的隔离测试环境完成验证，不把启动尝试计为通过。

安装目录为 `C:/Users/Administrator/.codex/plugins/cache/arknights-reader-dev/arknights-story-reader/0.1.18`。**49 个 dist 文件**逐一 SHA256 一致，包内 Node 哈希一致，UI **517423 字节**。固定 Node 26.13.0／npm 12.2.1，没有依赖升级。

本轮核心命令如下；MCP 和 S4 探针自动建立隔离数据根，HTTP 只对另行启动且明确配置隔离数据根的安装包服务执行。不得将写入／清理探针指向 4318 真实预览或系统插件数据。

```powershell
./scripts/npm.ps1 run check
./scripts/npm.ps1 run build
$env:PLAYWRIGHT_CHANNEL='msedge'
./scripts/npm.ps1 run test:e2e
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run plugin:prepare
codex plugin add arknights-story-reader@arknights-reader-dev --json
$installed = 'C:/Users/Administrator/.codex/plugins/cache/arknights-reader-dev/arknights-story-reader/0.1.18'
./scripts/npm.ps1 run probe:mcp -- $installed
./scripts/npm.ps1 run probe:s4:installed -- $installed
./scripts/npm.ps1 run probe:http -- http://127.0.0.1:4323/mcp
./scripts/npm.ps1 run probe:host
```

日志位于 `.ai/local/s4/`：`check-0.1.18.log`、`build-0.1.18.log`、`browser-fixture-0.1.18-final.log`、`browser-prts-0.1.18.log`、`installed-s4-0.1.18.log`、`stdio-0.1.18.log`、`http-0.1.18.log`、`host-0.1.18.log`、`installed-hashes-0.1.18.json`、`real-story-counts-0.1.18.json`。八张圆环截图在 `.ai/local/screenshots/story-ring-{theme}-{width}x{height}.png`。

本次交付前后，真实预览数据库、系统插件数据库和旧 JSON 三份阅读文件哈希均一致；所有写入／清理测试均隔离。4318 为最终 0.1.18/prts，原 `.runtime` 保留；临时 fixture 和隔离 HTTP 验证服务收尾关闭。仍未提交、推送或发布。

限制：首次打开较长剧情需要等待全部正文；网络／解析失败支持重试，未完成时不能显示准确整体比例。本次完整真实验证针对骑兵与猎人，不宣称所有 117 部脚本都已完整解析。剩余封面不扩展，停在 S4。

## 0.1.17 历史验证记录

以下保留旧版竞态诊断证据；“分母继续未知”“9 个工具”及旧版本／文件数仅适用于 0.1.17，以顶部最新交付为准。

日期：2026-11-03。交付版本 **0.1.17**，Git 基线 `b00b5b9471345420ff8210e586275caa001b2daa`（0.1.15）。本次接续已有未提交的 0.1.16 实现，保留原成果后修复、复核并完成本机交付；没有提交 Git、推送、发布或进入 S5。本文结果均为本轮最终源码的实际检查，历史 0.1.16 成功记录不作为最终证据。

## 交付结论

S4 实现及可自动验证的本机交付已完成，停在 S4 等待用户体验。保留既定主页状态、导航、阅读动效、1560:500 封面策略和全部阅读记录。9 个工具仍全部仅对 app 可见，无模型调用、搜索、RAG 或整库下载。

| 验证层次 | 本轮结果 | 边界 |
| --- | --- | --- |
| 领域、存储、协议检查 | `check` 42/42，类型与格式通过；`build` 通过 | 使用隔离测试目录 |
| 浏览器 | Edge fixture 18/18、真实 PRTS 12/12；内置浏览器额外操作与交互稿对照 | 不代表桌面宿主 UI |
| 实际安装包 MCP | 包内 Node stdio、Streamable HTTP、双进程 S4 探针通过 | stdio 写记录及 HTTP 数据均隔离 |
| 官方宿主加载器 | 0.1.17、reader、9 个 app-only 工具、global 入口通过 | 使用官方 CLI app-server，不创建聊天或调用模型 |
| 当前桌面宿主 UI | **留给用户体验** | 没有用浏览器或加载器结果替代宿主视觉验收；现有桌面会话仍可能使用旧服务，体验前需重启桌面客户端 |

## 缓存失败的复现与修复

最初单独运行压力测试成功，整套并发检查则分别复现了两种故障，原始异常和失败操作现已保留：

1. `tests-diagnostic-2.log`：双独立 worker 的 `stress scope=images`，失败操作 `images.put`、阶段 `begin`，原始异常为 `ERR_SQLITE_ERROR`、`errcode: 5`、`database is locked`。发生在 `BEGIN IMMEDIATE`，不能归为 JSON 文件损坏。
2. `tests-diagnostic.log`：图片编码回归在 `images.put`、阶段 `operation` 失败，原始异常是 `EPERM`、`errno: -4048`、`syscall: rename`，临时 JSON 替换目标 JSON 失败。这是文件系统替换问题；没有证据将其归因于特定杀毒软件或机器负载。

旧实现每次操作开关 SQLite 连接，以写事务包住 JSON 读写、整文件访问时间重写和目录删除；清缓存又连续提交两次代次事务。记录的空清理事务已有数百毫秒持锁，连续重获锁可使另一 worker 用尽原有 5 秒等待。隔离微型实验中，30 次开关连接的 DELETE 模式写事务合计 6046ms；仅改为 WAL、仍逐次关闭也需 5761ms。因此没有靠增加超时、重试或放松断言处理。

最终使用已有 Node SQLite 能力，把 JSON 值、最后访问时间与代次共同放入独立的 `cache/content.sqlite`：

- 每进程、每数据根复用连接；短事务使用 WAL，下载过程不持事务。命中缓存只更新访问时间，不再替换整个 JSON 图片文件。
- 清理在一个事务内删除对应内容并推进作用域代次，旧请求后续写入被拒绝；新请求使用新代次，不加入清理前的 pending promise。
- 旧 JSON 文件按需读取并迁入，正文、目录、资料、映射和图片格式均兼容。旧文件不再写入；清理代次和失效占位防止它们在重启或过期后复活。旧文件删除放在事务外，不会删掉清理后新写入的 SQLite 内容。
- `CacheStorageError` 保留 `cause`、`operation`、`phase`；worker 失败保留动作、作用域和完整异常链。界面／MCP 仍只返回安全的结构化错误，不把内部异常或记录内容发到工具结果。
- 原有 5000ms 锁等待没有增加。专门持有真实写锁的测试仍得到原始 SQLite 错误，文件路径错误另行报告；不是隐藏所有 storage 失败。

修复后原跨进程压力测试保留全部断言，在两套浏览器回归并行期间连续通过 5 次。启用诊断记录的 845 次缓存事务（含 140 次清理）中，事务持锁最大 5ms；这是本次隔离 fixture 负载的观测，不是对任意缓存大小的性能承诺。另有旧缓存兼容／重启／过期防复活、SQLite 写入失败回滚、真实锁与文件错误分类三项回归。

WAL 的 `synchronous=NORMAL` 只用于可再取的内容缓存：进程退出后可恢复，突然断电可能丢失近期缓存事务；阅读记录仍使用原独立数据库及其 FULL 默认，不降低记录持久性。固定 Node 内实际 SQLite 为 3.54.0。参考 [Node SQLite](https://nodejs.org/api/sqlite.html)、[SQLite 锁与事务](https://www.sqlite.org/lockingv3.html)及 [SQLite WAL](https://www.sqlite.org/wal.html)。旧版本进程不理解新缓存协议，升级后应重启宿主，避免混用。

## 修订迁移与阅读规则

独立复核了 `revisions.ts`、`service.ts`、契约及页面状态同步，并执行以下路径：

- 最小持久索引仅含段落 ID、完整正文／分支指纹、字数与修订，不保存完整正文副本。上次位置与最远位置分别迁移，不用旧 occurrence ID 猜测重复正文。
- 插入正文后匹配原段落；原段改写或删除时退回之前可确认段落，无法确认则退回篇首。保留迁移前的位置、累计字数、完成状态和原时间；迁移本身不改变最近阅读排序。
- 新增／改写正文取消旧完成状态；仅删除已读正文或演出变化可保留完成。没有旧索引时明确显示“修订进度待核实”，读到当前篇末后确认；无法确认的旧概要不会被后续修订覆盖丢失。
- 保存只使用内存索引、持久索引或已有本地缓存。缺索引时明确冲突，源站请求次数为零；清缓存后滚动不会重新下载正文。
- 使用持久修订比较阻止旧窗口保存和迟到源响应覆盖较新记录。缓存修订与权威记录不一致时明确要求刷新，保留记录。
- 回看不降低最远进度；跳到后篇不把中间未读篇算作已读；仅确认实际篇末才显示 100%，其他估算最多 99%。单篇与全剧情按字数加权，沿用同一权威状态。
- 新 service 实例在注入断网时从缓存恢复位置；刷新失败保留已有正文和缓存并显示重试错误。刷新本章只更新目标章；图片清理、全部内容清理、单独清阅读记录均有隔离验证。

## 全剧情字数来源

重新运行 `probe:prts:s4`，只请求七个明确公开页面：剧情一览、模板:剧情导航、模板:剧情模拟器、模块:Plot、骑兵与猎人、GT-1 日正当中/BEG、W2G/BEG。

本次目录为 117 部／1756 篇，已核实的目录分母为 0。正文样本为 GT-1 前篇 64 块／1630 字、W2G/BEG 88 块／1973 字。上述页面没有提供满足“对白、旁白、选项、各分支、共同后续仅一次”口径的可靠全剧情分母。没有证明站内不存在任何其它统计；当前仍保持未知，不将未知篇目计零、不按篇数平均、不预取未读正文来补齐。

证据：`.ai/local/prts/s4-denominators-358uQA/report.json`，含七页地址、时间、SHA256 和计数标记检查结果。

## 浏览器与视觉验收

使用固定 Node 26.13.0、npm 12.2.1、项目 Playwright 与本机 Edge。覆盖 320×760、768×900、1440×900、1024×400，浅／深主题、键盘、减少动态效果、续读、刷新失败、空数据、缓存隔离及旧导航回归。断网为来源边界注入，没有断开机器网络或修改 PRTS。

首轮 fixture 为 17/18：旧动效测试按默认 `expect.poll` 退避取样，trace 中 48915ms 采样仍在等待正文，49421ms 下一次采样时动画已结束；49087ms 与 49256ms 的截图显示实际横向揭示。506ms 采样间隔漏过了 440ms 动画。测试改为记录浏览器真实 `animationstart` 事件，不延长产品动画、不修改导航；专项 1/1 和最终整套 18/18 通过。原有双向波纹逐帧几何、平面、不透明和无快照回退检查仍通过。

额外在内置浏览器打开 `docs/design/reader-preview.html`，操作剧情、篇目和正文，对照正式隔离 fixture。正式页仍使用既定正文宽度、姓名列、旁白起点和侧栏；S4 的可见新增是滚动区外修订说明及未知修订进度文字。实测滚动至 582px 后经“主页 → 最近阅读”恢复为 582px。已查看最终窄屏深色、桌面浅色和低高度深色截图，修订说明可换行，设置和正文仍可操作。

代表截图：`.ai/local/screenshots/s4-revision-dark-320x760.png`、`s4-revision-light-1440x900.png`、`s4-revision-dark-1024x400.png`。动效失败 trace 和中间帧保留于 `.ai/local/s4/navigation-failure/`。

## 实际命令与本机安装

工作目录均为项目根，命令使用项目固定运行时。最终 build 后仅调整测试的动画观察方式和协作文档，产品源码／dist 未再改变。

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx --test tests/cache-races.test.ts tests/cache-storage.test.ts tests/revisions.test.ts tests/storage.test.ts
$env:PLAYWRIGHT_CHANNEL='msedge'
./scripts/npm.ps1 run test:e2e
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run probe:prts:s4
./scripts/npm.ps1 run plugin:prepare
codex plugin add arknights-story-reader@arknights-reader-dev --json
$installed = 'C:/Users/Administrator/.codex/plugins/cache/arknights-reader-dev/arknights-story-reader/0.1.17'
./scripts/npm.ps1 run probe:mcp -- $installed
./scripts/npm.ps1 run probe:s4:installed -- $installed
./scripts/npm.ps1 run probe:http -- http://127.0.0.1:4323/mcp
./scripts/npm.ps1 run probe:host
```

- build 通过；最终 check 42/42、类型和格式通过；缓存／修订专项 16/16。最终 Edge fixture 18/18（1.2 分钟）、PRTS 12/12（1.5 分钟）。
- 官方 CLI `0.166.0-alpha.5.1` 安装成功，独立目录为上面的 `$installed`，旧版本保留。47 个 dist 文件逐一 SHA256 一致，包内 Node 与固定运行时哈希一致且报告 v26.13.0；正式 UI 513227 字节。哈希清单在 `.ai/local/s4/installed-hashes-final.json`。
- 实际包内 stdio 和 HTTP 均报告 0.1.17、9 个内部工具、117 部目录、64 块真实首篇、1500×844 CG；图像仅在 app metadata，stdio 隔离保存位置成功。
- S4 安装探针使用两个包内 Node 进程、隔离原创 fixture，验证未知旧记录迁移、旧修订写入拒绝、读完再回看、清图片保留正文／记录、全部清理后保存不回填，以及独立清历史保留缓存／设置。
- 官方加载器发现 0.1.17、reader、9 个 app-only 工具和 global 入口。本机桌面包核实为 OpenAI.Codex 26.1027.6604.0。按 [官方插件打包说明](https://developers.openai.com/plugins/build/plugins)及当前本机 CLI 实测完成安装，不把文档中的其它宿主行为当成本机事实。
- 更新旧进程前均重新核对 `ExecutablePath`、命令行及端口。4318 已更新至 0.1.17/prts，保留真实 `.runtime/`；4323 为实际包的隔离 HTTP 验证服务，完成后关闭。临时 4321/4322 fixture／交互稿服务完成后关闭。
- 所有写记录、迁移和清缓存验证都显式使用 `.ai/local/` 隔离目录；重新检查 stdio／S4 探针环境配置，HTTP 数据根与手动 fixture 数据根均为隔离路径。真实 `.runtime/reading/records.sqlite` 和系统插件旧 `state.json` 交付前后 SHA256 一致。
- 系统插件的 `records.sqlite` 哈希发生变化：基线快照为北京时间 20:27:20，数据库最后修改于 20:28:50，当前 19 条记录中一条的更新时间为 20:28:50，含一个持久修订索引。桌面宿主父进程 13252 于 20:28:38 启动了 0.1.17 服务 27852；这些更新早于本轮安装包 stdio（20:29:38）、加载器（20:29:40）及 HTTP（20:31:12）探针。未自动操作真实宿主 UI，也没有覆盖、清理或回滚该数据库；现有证据不足以将这次写入归因于具体 UI 操作，不能声称真实数据库逐字节未变。前后哈希、文件时间、聚合记录元数据和进程线索均保留在 `.ai/local/s4/`，不输出整份私人阅读记录。

完整命令输出在 `.ai/local/s4/`：`build-final.log`、`check-final.log`、`targeted-cache-revision.log`、`cache-stress-final-1.log` 至 `5.log`、两套 `browser-*-final.log`、`install-final.log`、`stdio-final.log`、`http-final.log`、`installed-s4-final.log`、`host-final.log`。这些本机日志和数据不提交。

## 用户体验与剩余限制

重启桌面客户端后重新打开方舟阅读器，使旧版本服务退出，再体验续读、回看、刷新本章及缓存设置。浏览器预览入口为 `http://127.0.0.1:4318`，它保留原有预览阅读记录；插件使用独立的系统用户数据目录，两个入口不宣称自动同步。

本轮没有自动操作真实桌面宿主 UI：[Computer Use 技能](C:/Users/Administrator/.codex/plugins/cache/openai-bundled/computer-use/26.1027.51404/skills/computer-use/SKILL.md)要求遵守其 guidance，其中明确“Do not automate the ChatGPT desktop app UI”。已用允许的浏览器、官方 CLI 和加载器完成独立可验部分；宿主桥接后的实际布局、图片显示和完整阅读交由用户体验。

全剧情分母仍按上述证据明确未知；未抽样 PRTS 脚本形式和剩余封面继续保留既有边界。修订迁移采取保守确认策略，不保证任意重写都能自动找到原位置。没有验证突然断电或磁盘损坏恢复。S4 到此停止，S5 与剩余图片均不自动推进。
