# 明日方舟剧情阅读插件

面向 PRTS 剧情的 ChatGPT extension 阅读器。先实现阅读器，再添加一个面向对话的基础剧情搜索工具。

开发优先复用成熟工具、官方 SDK、原生控件和项目已有实现；没有明确的性能、兼容性或功能缺口时，不重复造轮子。需要自行实现时，先说明现有方案的具体缺口和选择依据。

依赖、Node.js、npm 和构建工具优先使用最新稳定版；明确不兼容时才使用较早版本并记录原因。升级先核对兼容要求并运行项目检查，已验证组合写入清单、锁文件和运行时版本提示。

## 当前状态

当前 0.1.10 将 PRTS 剧情一览正文范围的 117 部／1756 篇按“主线、支线、故事集、集成战略、生息演算、四月辑录、其他”展示，保留源顺序和 ID。篇目整卡可打开、简介重试独立，拖动不误开；两种卡片 hover 仅手形，窄屏七类入口换行。鼠标／触摸／键盘、各尺寸主题及原有转场回归见 [UI 验证](docs/ui-0.1.10.md)。

「骑兵与猎人」已贯通真实封面、关卡简介、按需立绘和 CG。正文图片默认手动，自动模式只在 hover 姓名或接近 CG 时获取；目录封面进入可视区域独立加载。透明图片、表情叠加与独立图片缓存已有实测。三个页面、既有动效和 SQLite 阅读记录保留。

目录覆盖不等于每篇正文兼容认证，也不表示每个封面都存在。本轮仍只取必要样本；没有可确认的封面显示“暂无封面”，缺少简介则隐藏，未知脚本明确报错。范围、实测结果和未覆盖项见 [S3 证据](docs/prts-s3.md)。

原创 fixture 保留为显式开发来源：启动前设置 `$env:READER_SOURCE = 'fixture'`；恢复真实模式用 `$env:READER_SOURCE = 'prts'`。各来源使用不同篇目标识，切换不删除旧阅读记录。真实取数、支持语法、实测与未覆盖范围见 [S2 证据](docs/prts-s2.md)。

常规阅读不需要模型 API key。接入依据和实测边界见 [接入记录](docs/integration-notes.md)，当前验收与未覆盖项见 [状态](.ai/STATUS.md)。

## 运行

本轮固定 Node.js 26.13.0 LTS + npm 12.2.1，版本提示见 `.node-version` / `.nvmrc` 与 `packageManager`。依赖记录在 `package.json` 与 `package-lock.json`，不依赖全局 Node 包。已有版本管理工具时可按这些文件切换；Windows 可在项目内准备官方运行时，不更改系统安装：

```powershell
./scripts/setup-toolchain.ps1
./scripts/npm.ps1 ci
./scripts/npm.ps1 run build
./scripts/npm.ps1 start
```

准备脚本从 Node 官方下载、核验 SHA256，将 Node 与 npm 放在被忽略的 `.local/toolchain/`。下文的 `npm` 命令均可替换为 `./scripts/npm.ps1`；已经切换到匹配版本时直接运行：

```powershell
npm ci
npm run build
npm start
```

打开 [本机阅读器](http://127.0.0.1:4318)。HTTP MCP 地址为 `http://127.0.0.1:4318/mcp`。服务仅监听回环地址，不向公网开放。

页面开发可运行 `npm run dev`，浏览器打开 `http://127.0.0.1:5173`；Vite 提供热更新，页面通过代理调用同一套本机服务。宿主使用 `dist/ui/index.html` 单文件资源，宿主验证前需重新构建。

## 验证

```powershell
npm run check
npm run probe:prts
npm run probe:prts:s3
node --import tsx scripts/probe-mcp.ts
npx playwright install chromium
npm run test:e2e
npm run test:e2e:prts
```

`check` 包含类型、领域／存储／MCP 测试和格式检查；MCP 探针会启动独立 stdio 进程并读取正式 UI 包。浏览器检查前需要构建。Windows 已有 Edge 时可复用它，省去 Chromium 下载：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

MCP 探针可额外传入安装目录，按该目录的 `mcp.json` 启动其实际运行时与服务，用于核验安装产物。项目内工具链对应命令为 `./scripts/npm.ps1 run probe:mcp -- <安装目录>`。

安装后还需运行 `npm run probe:host`：它通过官方 `codex app-server` 的插件加载器与工具目录检查已启用的 reader 服务、app-only 可见性及全局入口。可用 `CODEX_CLI_PATH` 指定桌面客户端配套的 Codex CLI。独立 SDK 协商成功不能替代这项检查；后台发现成功也不能替代用户实际点击入口。

fixture 浏览器回归使用独立端口 4319 和 `.ai/local/e2e-state/`；真实 PRTS 检查使用 4320 和每次独立的 `.ai/local/prts-browser/` 目录，不会清除实际用户记录。两套测试输出分在 `test-results/fixture` 与 `test-results/prts`。截图位于 `.ai/local/screenshots/`。`probe:prts` 只取目录、两篇正文及一个分支样本；`probe:prts:s3` 校对全目录顺序，并取一篇正文、关卡简介、封面及少量人物／CG 样本，保留忽略的 JSON 证据。fixture、真实来源、注入失败和宿主验证分别报告。

## 本机开发插件

```powershell
npm run build
npm run plugin:prepare
codex plugin marketplace add ./.local/marketplace --json
codex plugin add arknights-story-reader@arknights-reader-dev --json
```

生成内容在被忽略的 `.local/marketplace/`；源清单为 `plugin.json` 和 `mcp.json`。Windows 生成包同时包含已校验的 Node 运行时并直接调用，避免宿主 PATH 选中较旧 Node。安装后重新加载桌面客户端，在本机来源“方舟阅读器本机开发”中查看“方舟剧情阅读器（开发）”，通过全局侧栏或会话面板入口打开。仅安装到本机，不发布到目录。生成包包含当前机器的运行时和依赖，仅供本机开发验证，跨平台分发属于 S6。

Windows 包的启动命令必须使用包含在插件内的 `./runtime/node.exe`。当前宿主拒绝在 `command` 中使用 `${PLUGIN_ROOT}/runtime/node.exe`，尽管独立探针手动展开它后可以启动。0.1.4 已修正入口加载问题，用户确认主侧栏可打开；当前 0.1.10 已安装并通过官方加载器发现、安装包真实正文与 CG 通信，0.1.9 目录仍保留。新版宿主中的画面和完整阅读操作仍独立待复核。更新正在运行的本机包使用新版本目录，然后重新打开宿主阅读器以使用新版。

stdio 配置直接运行 `node dist/server/main.js --stdio`，避免 npm 启动提示混入协议 stdout。`reader_open` 与其余内部工具均声明 `visibility: ["app"]`；唯一的模型可见剧情搜索工具留到 S5。

## 本机数据

- 开发预览：项目 `.runtime/reading/records.sqlite` 保存阅读记录与偏好，`.runtime/cache/` 保存可清理内容。SQLite 事务保护多个宿主服务进程的并发更新，旧开发版本的 `state.json` 首次迁入时保留原文件。
- 安装后的插件：Windows 使用 `%LOCALAPPDATA%/ArknightsStoryReader/`，不随插件版本缓存目录更换而删除记录。其他系统使用 XDG 用户数据目录。
- `READER_DATA_DIR` 可显式覆盖数据根目录。历史和内容缓存始终分目录保存，清缓存不清历史。
- 正文、目录、资源映射、简介及图片默认按最后使用时间保留 7 天；首次加载页面检查过期缓存。`cache/text`、`cache/prts`、`cache/mapping`、`cache/metadata`、`cache/images` 只保存公开内容。图片以资源 URL 为键去重；清图片保留映射，清全部内容同时清映射，均不访问 `reading/`。
- 当前已打开篇目的字数可核实并保留；任一篇分母未知时，全剧情显示“总字数待核实”，不按篇数估算或预下载未读正文。清缓存保留位置、最远进度和已核实字数；当前进程内保存已打开正文无需重新取数。
- 位置保存段落标识和段内比例，最远进度独立保存。当前对正文修订会明确报告版本冲突；跨版本定位迁移仍待实现。

## 开始开发

1. 先阅读 [当前状态](.ai/STATUS.md)，再读 [AI 协作约定](AGENTS.md)。
2. 阅读 [需求](docs/requirements.md)，打开 [交互预览](docs/design/reader-preview.html)。
3. 按 [实施切片](.ai/PLAN.md) 开始；新 Codex 对话可直接使用 [开发 prompt](.ai/START_PROMPT.md)。

## 资料位置

| 路径 | 用途 |
| --- | --- |
| `docs/requirements.md` | 已确认需求和明确标注的待验证内容 |
| `docs/design/` | 原始交互片段、可独立打开的预览及设计验证快照 |
| `docs/integration-notes.md` | 官方资料、历史证据的边界、实现前验证事项 |
| `.ai/` | 可提交的协作状态、计划、决策和开场 prompt |
| `.ai/local/` | 不提交的临时笔记、截图及原始工具输出，可按需创建 |

设计预览使用原创示例正文和参考封面；预览包装器中的状态模拟与 CDN 依赖用于设计体验，不是正式插件的运行架构。
