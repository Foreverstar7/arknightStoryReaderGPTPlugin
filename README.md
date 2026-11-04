# 明日方舟剧情阅读插件

面向 PRTS 剧情的 ChatGPT extension 阅读器。先实现阅读器，再添加一个面向对话的基础剧情搜索工具。

开发优先复用成熟工具、官方 SDK、原生控件和项目已有实现；没有明确的性能、兼容性或功能缺口时，不重复造轮子。需要自行实现时，先说明现有方案的具体缺口和选择依据。

依赖、Node.js、npm 和构建工具优先使用最新稳定版；明确不兼容时才使用较早版本并记录原因。升级先核对兼容要求并运行项目检查，已验证组合写入清单、锁文件和运行时版本提示。

## 当前状态

当前源码版本为 0.1.24，补齐桌面多平台运行／打包路径。阅读器已有七类剧情目录、打开时检查与手动刷新、正文／分支、按需封面／CG／立绘、设置及 SQLite 本机阅读记录；唯一的模型可见剧情搜索工具尚未接入。

「骑兵与猎人」已贯通真实封面、关卡简介、按需立绘和 CG。正文图片默认手动，自动模式只在 hover 姓名或接近 CG 时获取；目录封面进入可视区域独立加载。透明图片、表情叠加与独立图片缓存已有实测。三个页面、既有动效和 SQLite 阅读记录保留。

解析兼容与图片修复的历史验证分别见 [正文兼容](docs/prts-compatibility-0.1.21.md)、[图片修复](docs/prts-image-fixes-0.1.22.md)和 [立绘身份匹配](docs/prts-portrait-identity.md)。这些结果不代表所有图片或各系统宿主均已验收；当前交付与未覆盖项以 [状态](.ai/STATUS.md) 为准。

原创 fixture 保留为显式开发来源：PowerShell 用 `$env:READER_SOURCE = 'fixture'`，macOS / Linux shell 用 `export READER_SOURCE=fixture`；将值改为 `prts` 恢复真实来源。默认是真实 PRTS，各来源使用不同篇目标识，切换不删除旧阅读记录。

常规阅读不需要模型 API key。接入依据和实测边界见 [接入记录](docs/integration-notes.md)，当前验收与未覆盖项见 [状态](.ai/STATUS.md)。

## 平台支持与测试范围

**目前仅在 Windows x64 上进行过实际测试。macOS、Linux 和 Windows ARM64 只完成代码层面的预适配，尚未在对应系统／架构上验证安装、启动或阅读；不保证可用。**

| 适配目标 | 工具链准备 | 插件内启动命令 | 验证状态 |
| --- | --- | --- | --- |
| Windows x64 | PowerShell | `./runtime/node.exe` | 本机实测；真实桌面宿主完整阅读路径仍单独待验 |
| Windows ARM64 | PowerShell | `./runtime/node.exe` | 未实测 |
| macOS Intel / Apple Silicon | POSIX shell | `./runtime/node` | 未实测 |
| Linux x64 / ARM64 | POSIX shell | `./runtime/node` | 未实测 |

这里的多平台指上述桌面系统。系统版本与 Linux 的 C 库等仍需满足固定 Node 官方二进制的要求；未提供 Android / iOS 原生包或 Alpine / musl 专用运行时。浏览器预览、MCP 通信、插件安装与真实宿主 UI 分别验收，宿主能否提供该系统的入口也需单独确认。

**在每个目标系统／架构上分别准备工具链、执行 `npm ci`、构建并打包。** 产物带本机 Node 与依赖，不是可在不同系统间通用的一个安装包；不要复制 Windows 的 `node_modules` 或插件包到 macOS / Linux 使用。Windows 上的六目标路径测试只能验证分支选择，不能替代其他系统实测。

## 运行

本轮固定 Node.js 26.13.0 LTS + npm 12.2.1，版本提示见 `.node-version` / `.nvmrc` 与 `packageManager`。依赖记录在 `package.json` 与 `package-lock.json`，不依赖全局 Node 包。已有版本管理工具时可按这些文件切换；Windows 可在项目内准备官方运行时，不更改系统安装：

```powershell
./scripts/setup-toolchain.ps1
./scripts/npm.ps1 ci
./scripts/npm.ps1 run build
./scripts/npm.ps1 start
```

macOS / Linux 使用以下入口（需要 `curl`、`tar` 及 `sha256sum` 或 `shasum`；这些命令尚未在真实 macOS / Linux 上验证）：

```sh
sh scripts/setup-toolchain.sh
sh scripts/npm.sh ci
sh scripts/npm.sh run build
sh scripts/npm.sh start
```

两类准备脚本均从 Node 官方下载并核验 SHA256，将固定 Node 与 npm 放在被忽略的 `.local/toolchain/`，不修改系统安装。下文的 `npm` 命令在 Windows 可替换为 `./scripts/npm.ps1`，在 macOS / Linux 可替换为 `sh scripts/npm.sh`。已有版本管理工具并切换到匹配版本时，源码预览也可直接运行：

```sh
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

使用项目内工具链时，浏览器下载命令可写为 `./scripts/npm.ps1 exec -- playwright install chromium` 或 `sh scripts/npm.sh exec -- playwright install chromium`。Linux 还需安装 Playwright 要求的浏览器系统依赖。

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

打包前必须运行本系统的 `setup-toolchain` 脚本，即使源码预览使用自己的版本管理工具。生成内容在被忽略的 `.local/marketplace/`；源清单为 `plugin.json` 和 `mcp.json`。打包器先检查项目内 Node 的版本、系统、架构和 SQLite，再复制对应二进制与许可证；Unix 包设置可执行权限，依赖复制时解引用符号链接，`runtime/target.json` 记录目标。

Windows 清单使用 `./runtime/node.exe`，macOS / Linux 使用 `./runtime/node`，均直接运行包内 Node。参数与工作目录保留 `${PLUGIN_ROOT}`；可执行命令沿用已验证的 `./` 相对路径形式。MCP、封面与双进程探针读取实际 `mcp.json`，不再自行写死 Windows 路径。

以上安装命令仅在目标系统已有兼容的官方 CLI／桌面宿主时适用；**macOS / Linux 的宿主安装和入口未验证**。安装后重新加载桌面客户端，在本机来源“方舟阅读器本机开发”中查看“方舟剧情阅读器（开发）”。源码预适配不等于已完成跨平台分发；各系统干净安装、打包归档后的权限保持与真实宿主验收仍属 S6。当前没有自动安装、推送或发布 0.1.24。

stdio 配置直接运行 `node dist/server/main.js --stdio`，避免 npm 启动提示混入协议 stdout。`reader_open` 与其余内部工具均声明 `visibility: ["app"]`；唯一的模型可见剧情搜索工具留到 S5。

## 本机数据

- 开发预览：项目 `.runtime/reading/records.sqlite` 保存阅读记录与偏好，`.runtime/cache/` 保存可清理内容。SQLite 事务保护多个宿主服务进程的并发更新，旧开发版本的 `state.json` 首次迁入时保留原文件。
- 安装后的插件：Windows 使用 `%LOCALAPPDATA%/ArknightsStoryReader/`；macOS / Linux 沿用 `$XDG_DATA_HOME/arknights-story-reader/`，未设置时为 `~/.local/share/arknights-story-reader/`。为保留旧记录，本次不把 macOS 改到另一个目录。数据不随插件版本缓存目录更换而删除。
- `READER_DATA_DIR` 可显式覆盖数据根目录。历史和内容缓存始终分目录保存，清缓存不清历史。
- 正文、目录、资源映射、简介及图片默认按最后使用时间保留 7 天；首次加载页面检查过期缓存。`cache/text`、`cache/prts`、`cache/mapping`、`cache/metadata`、`cache/images` 只保存公开内容。图片以资源 URL 为键去重；清图片保留映射，清全部内容同时清映射，均不访问 `reading/`。
- 当前剧情会准备正文与公共字数；任一篇分母未知时，全剧情显示“总字数待核实”，不按篇数估算，不预下载整库。清缓存保留位置、最远进度和已核实字数；当前进程内保存已打开正文无需重新取数。
- 位置保存段落标识和段内比例，最远进度独立保存。修订迁移只在可验证时保留定位与已读，无法确认时明确报告状态，不伪造百分比。

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
