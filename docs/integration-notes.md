# 接入参考与待验证事项

初始资料核对日期：2026-11-01；多平台补充核对：2026-11-04；本机安装核对：2026-11-05。以下链接用于开发时查证，具体 SDK、宿主版本和行为仍需在本仓库验证。

## 2026-11-05 重构产物安装

- 重新检索并读取[官方打包说明](https://developers.openai.com/plugins/build/plugins)，同时核对本机CLI 0.166.0-alpha.6的 `plugin add --help`。同版本替换旧0.1.24目录失败且仍有运行进程，改为0.1.25独立目录安装；不强停用户会话，不改数据根目录。
- 实际安装／启用、73文件与Node一致性、真实stdio及官方插件加载器通过，三份阅读文件哈希不变。用户正常重启客户端加载新版，后台发现不等于完整桌面UI验收；详见[0.1.25安装记录](install-0.1.25.md)。

## 2026-11-04 多平台预适配补充

- 本日重新检索并读取 [OpenAI 本地 stdio 插件文档](https://developers.openai.com/plugins/deploy/desktop-only)及[打包文档](https://developers.openai.com/plugins/build/plugins)：包中包含服务及依赖，参数／工作目录可使用 `${PLUGIN_ROOT}`。沿用本项目在 Windows 已验证的 contained `./` 可执行命令路径；不据此推断 macOS／Linux 宿主入口已经可用。
- Node 26.13.0 的[官方校验清单](https://nodejs.org/dist/v26.13.0/SHASUMS256.txt)已确认包含 win／darwin／linux 的 x64 与 ARM64 六种归档。新 sh 脚本只取当前目标归档，SHA256 失败时不解压／执行；没有升级运行时或依赖。未在 macOS／Linux 上下载并运行归档。
- 使用 [Node `fs.cp` 的 `dereference`](https://nodejs.org/api/fs.html#fspromisescpsrc-dest-options) 解引用依赖符号链接，避免复制后的包仍依赖原 checkout。Unix 二进制另设可执行位；真实 Unix 安装后的权限仍需实测。
- 0.1.24 验证使用隔离目录。Windows 代码分支测试与 Git sh 模拟只证明预适配逻辑；README 明确 Windows x64 是唯一实测环境，其他系统／架构及完整桌面宿主 UI 均待验。0.1.23 的安装与加载器结果不作为 0.1.24 的已安装证明。

## 官方资料入口

- [OpenAI：Plugin Extensions](https://developers.openai.com/plugins/build/extensions)：侧栏、会话面板及深链接入口。
- [OpenAI：为 MCP 添加 UI](https://developers.openai.com/plugins/build/chatgpt-ui)：MCP Apps 桥接、UI 与业务状态职责，以及存储说明。
- [OpenAI：插件参考](https://developers.openai.com/plugins/reference)：工具描述、`_meta.ui.visibility` 和 UI 元数据。
- [OpenAI：打包插件](https://developers.openai.com/plugins/build/plugins)：本地目录与安装分发方式，实施时重新核对。
- [PRTS 剧情一览](https://prts.wiki/w/剧情一览)：首批目录范围。

官方文档说明工具可对模型、页面或两者可见。因此“对话侧只提供一个搜索工具”不代表阅读器所有内部动作必须塞入同一个工具。按实际职责设计内部接口，验证宿主入口工具的注册要求。

官方文档也说明 widget state 属于单个 UI 实例，不应作为持久业务数据的唯一来源。这个项目要求本机保存，不要求云端账号或跨设备同步；本地服务的存储方式由实现确定。

## 交接证据的边界

设计检查快照证明迁入前的静态交互稿通过了对应浏览器操作，不证明新仓库插件已经完成。独立预览用浏览器 localStorage 模拟部分状态，且从 CDN 加载部分界面辅助库；这些都不能作为生产打包策略直接照搬。

旧环境的隔离测试插件曾打开侧栏并连接宿主，部分原始剧本与 PNG 样本曾被验证。这次没有迁入旧插件源代码、安装状态或原始样本，需求文档中的历史总结不能替代在新仓库重做取数和接入验证。

## 需要尽早解决的实现问题

1. 真实宿主入口、桥接和深链接：先验证最小路径，不等全部页面做完再集成。
2. 目录、简介、封面与剧本字段：保留来源、稳定标识和真实顺序，不根据少量样本假定全库一致。
3. 分支合流与人物状态：用互斥分支、匿名显示名及多人场景样本验证，歧义时不猜人物。
4. 全剧情字数分母：保持按需取正文和正确加权进度，确认可用元数据或其他满足范围的办法；未知数据不能当成已知零值。
5. 源站修订与续读兼容：定位不能只保存滚动像素；刷新正文和重新分词计数后要处理原位置的兼容恢复。
6. 图片触发与缓存：默认 hover 不发起立绘请求；缓存过期、清理和断网不能误删阅读记录。

上述是工程验证任务，不要求重新讨论已确认的页面布局或扩大首版产品范围。

## 2026-11-01：本仓库 S0 实施记录

- 已实际读取以上官方文档，另核对 [MCP App 快速开始](https://developers.openai.com/plugins/build/app-quickstart) 及官方 `modelcontextprotocol/ext-apps` v2.0.4 React 示例、`openai/mcp-extensions` 的入口示例。新增 `create-mcp-app` skill 用于 MCP Apps 生命周期和注册方式。
- npm 安装的版本：`@modelcontextprotocol/ext-apps` 2.0.4、`client/server` 2.4.0、`node` 2.1.2、`express` 2.0.2；React 19.3.1、Vite 8.3.5、TypeScript 7.0.2。精确依赖见锁文件。采用当前 skill 要求的拆分 MCP SDK 2.x，没有混装旧版 `@modelcontextprotocol/sdk`。
- 使用 `registerAppTool` / `registerAppResource`、标准 `ui.resourceUri`、`useApp`；桥接处理器先注册后连接。全部内部工具均为 `ui.visibility: ["app"]`，`reader_open` 声明 `openai/ui.entrypoints` 的 `global` 与 `thread`。官方入口示例明确允许入口工具只对 app 可见。
- `@openai/mcp-extensions` 0.2.1 当时的可选 peer 仍声明 ext-apps `^1.7.5`。本切片仅需文档规定的声明式入口元数据，因此没有为了类型辅助安装该包或强行覆盖 peer；后续需要深链接的运行时 API 时再核对兼容版本。
- UI 打包成单一 HTML，宿主内容访问均经 SDK `callServerTool`；当前不需要任何外域 CSP。直接预览使用同一个服务层的 HTTP 适配，没有伪造宿主对象。
- 开发环境实测 Node 24.14.1、npm 11.21.1、Codex CLI 0.166.0-alpha.5.1；桌面包 `OpenAI.Codex` 26.1027.6604.0。官方 CLI 成功添加 `arknights-reader-dev` 本机来源并安装 0.1.0，用户随后反馈“现在已经能看到了”。未通过自动化独立复核真实侧栏内的全部操作，不能据此宣称真实数据可用。
- 独立 stdio 进程已协商成功，列出 7 个内部工具，读取 3 部原创 fixture 与完整 HTML 资源；浏览器预览已实际打开。HTTP 通信、真实宿主完整桥接与 PRTS 分别记录验收，不互相代替。
- 限制：浏览器工具阻止 `file:` 方式打开交互稿；读取用户已打开的 Firefox 页面时授权超时。已研读完整设计源码并检查正式实现截图，尚未完成交互稿本身的本轮实际体验。Computer Use skill 禁止操作 ChatGPT 桌面 UI，因此本机安装使用官方 CLI，入口打开由用户操作。
- 浏览器测试复用本机 Edge，使用项目内 Playwright 1.64.1；默认 Chromium 下载未完成后已停止。沙箱访问回环 HTTP 返回 EACCES，实际浏览器测试经受审查的本机执行完成。
- 实测宿主有两个阅读器 Node 服务进程，记录存储因此改用 SQLite 的 `BEGIN IMMEDIATE` 事务；没有自行实现跨进程文件锁。依据 [Node SQLite 官方文档](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) 及本机 24.14.1 实测，仅使用该版本已有的 API。旧 JSON 记录一次迁入并保留源文件；内容缓存仍独立。
- 按用户追加的“尽量最新稳定版”要求，已核对 [Node 官方发布索引](https://nodejs.org/dist/index.json)：最新稳定为 26.13.0 LTS，27.0.0-alpha 不作为稳定版使用。npm registry 最新稳定是 12.2.1，原 Node 24.14.1 不满足其 engines。项目内准备 Node 26.13.0 + npm 12.2.1，SHA256 与官方 SHASUMS256.txt 核对一致；依赖 `npm outdated --json` 无过期项。

## 2026-11-01：真实主侧栏入口修复

- 0.1.3 独立 stdio 通信正常，但真实 Agent Plugins 加载器拒绝 `command: "${PLUGIN_ROOT}/runtime/node.exe"`，明确要求裸可执行名称或包含在插件内的 `./` 路径；`plugin/read` 因此没有发现 MCP 组件。独立探针展开占位符的结果不能代表插件能加载。
- 0.1.4 生成清单改为 `./runtime/node.exe`，以相同版本的官方 app-server 读取插件与工具目录，得到 reader 服务、7 个内部工具及 global 入口。用户随后确认 ChatGPT 主侧栏能打开，S0 的真实入口路径有了直接证据。
- `scripts/probe-host.ts` 保留这条加载器检查，不创建对话或调用模型；它启动隔离的同版本 app-server，不能代替对现有桌面窗口的实际观察。0.1.5 已安装并重新通过安装包 stdio 与该加载器检查，新 UI 为 499181 字节；宿主内动效修复仍待用户复核。
- 0.1.5 普通页面只使用一个内容快照，书页转动单独提取正文，避免多个捕获面独立交接；参考 [Chrome 官方 View Transitions 文档](https://developer.chrome.com/docs/web-platform/view-transitions/same-document)的快照与伪元素说明，继续复用原生动画 API。

## 2026-11-01：0.1.6 导航边界与横向渐进替换

- 用户澄清所需为 Kindle 漫画式的横向扫过，0.1.5 的整页旋转已取消。参考 [实现作者对 Wipe／Reveal 的说明](https://github.com/daIvanCode/legacy-kindle-pageflip-animations/blob/main/README.md)；查到 [Kindle 实拍参考页](https://www.bilibili.com/video/BV1fb4y1b7nn/)，浏览器加载超时，未完成视频观看。浏览器端采用相反方向的柔边 mask 揭示，不模拟墨水屏物理刷新或添加 3D 卷页依赖。
- 已复现并修正提示条下沿被内容快照擦过的问题。依据原生 API 的捕获规则，根节点退出快照，动画层裁剪到实际内容上边界；半像素边界须向上取整，才能保持提示条边沿不变。每个主题 4 条路径各 3 帧（共 24 帧）分别对比静态提示条，完全一致。
- 官方 CLI 已安装 0.1.6，安装包 stdio 读取 7 个工具、3 部 fixture 和 498292 字节正式 UI；同版本宿主加载器发现 reader 服务及 global 入口。浏览器最终检查 10/10 通过，尚未获得新版在真实宿主内的视觉确认。
- 安装、宿主后台发现和真实宿主中的视觉效果仍分开记录；浏览器通过不作为宿主画面确认。

## 2026-11-01：0.1.7 真实 PRTS 切片

- 默认 `PrtsSource` 读取剧情一览及其转引的剧情导航活动正文表，首片为「骑兵与猎人」16 篇。只获取实际选择的正文；首／次篇及序章分支样本实测见 [S2 证据](prts-s2.md)。不接入登录、Cookie、模型 API 或额外模型工具。
- 本轮使用 OpenAI Docs skill 重新检索并读取 [当前插件参考](https://developers.openai.com/plugins/reference)，保留 `ui.visibility: ["app"]`，让入口返回实际来源而非 fixture 常量，并将可能读取公开 PRTS 的 snapshot／chapter／record 标记 `openWorldHint: true`。入口和 CSP 结构未扩展；正文数据仍经现有 SDK 读取，UI 不直连源站。
- 0.1.7 已通过实际安装目录包内 Node 的 stdio 协商、真实首篇 64 块及隔离位置保存，UI 为 499719 字节；Streamable HTTP 取得相同真实正文。官方加载器发现 0.1.7、reader、7 个内部工具及全局入口。真实宿主当前窗口内的视觉与完整路径仍待复核。
- Edge 原有 10 项回归、本轮最终 3 项真实数据页面检查及 18 项领域／存储／MCP 测试通过。已实际在隔离 Edge 打开交互预览并点击活动与篇目，对照桌面和 320px 画面；旧记录中的预览文件打开限制不等于本轮无法对照。

## 2026-11-01：0.1.9 S3 目录与按需图片

- 已重新读取 [OpenAI 当前 UI 接入说明](https://developers.openai.com/plugins/build/chatgpt-ui)和 [插件参考](https://developers.openai.com/plugins/reference)，使用 OpenAI Docs 与 create-mcp-app skill 核对 app-only、CSP 及工具结果。新增 `reader_image`、`reader_chapter_info`，9 个工具全部 app-only。入口、包内启动命令和 SDK 生命周期沿用已有实现。
- PNG 图层放返回 `_meta.readerImage`，不进入模型可见结构化结果；UI 经 `callServerTool` 取得 data URL，以原生 SVG 图层渲染。不增加 UI 到 PRTS 的访问或外域 CSP；当前真实宿主的图片和完整操作仍须单独验收。
- 实际 0.1.9 安装包内 Node stdio 返回 117 部、64 块真实首篇、真实 CG 和隔离位置保存，UI 506231 字节；预览 HTTP MCP 同样成功。官方加载器发现 reader、9 工具和 global 入口。完整证据见 [S3 记录](prts-s3.md)。
- 24 项领域／缓存／存储／MCP 检查、10 项 fixture 浏览器与 6 项真实浏览器检查通过；宿主 UI 与浏览器结果分开记录。没有新增模型 API key、模型调用、RAG、对话侧进度工具或执行推送／发布。

## 2026-11-03：0.1.18 当前剧情正文准备

按用户新要求，打开某部剧情即在页面生命周期内以最多两篇并发准备该部全部正文；不预取其他剧情或正文图片。`reader_prepare_chapter({chapterId})` 是新增 app-only 内部工具，返回标识、修订、字数与核验时间，不传整份正文。工具总数为 10，模型可见工具仍未接入。

`index/word-counts.sqlite` 是独立公共统计索引，跨清正文缓存和清历史保留；既有 `reading/records.sqlite` 和 `cache/content.sqlite` 职责不变。预取不会迁移或更新阅读记录，实际打开时才执行修订迁移。UI 防止迟到响应覆盖新字数；清全部内容时停止预取队列，旧请求不能回填。

首页白底百分比圆环、真实 PRTS 全篇分母及实际安装验证见 `prts-s4.md` 顶部 0.1.18 交付记录。上述规则更新早期逐篇按需加载的范围，仍不允许整库预取或推断未知字数为零。
