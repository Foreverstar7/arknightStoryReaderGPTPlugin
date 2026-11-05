# 0.1.25 本机安装

日期：2026-11-05。用户在全部既定重构完成后要求安装。当前 Windows x64 已通过官方 CLI 安装并启用 0.1.25，包含 R5 `28b9855` 的最终实现；没有推送或发布。

## 安装版本与处理

重新读取本机清单发现，安装前已经是 0.1.24，但缓存包仍为重构前的 63 个 dist 文件；此前协作记录中的“已安装 0.1.23”已不是当前状态。准备包的 73 个文件与 R5 验证产物一致。

官方 CLI 0.166.0-alpha.6 的 `plugin add` 首次尝试替换同版本缓存时返回 `failed to back up plugin cache entry`／Windows 拒绝访问。该版本目录仍有七个阅读器 Node 进程运行。没有结束现有会话或删除旧包，改为将 package、lockfile、plugin 和源码版本一致递增至 0.1.25，再用官方安装器写入独立版本目录，成功返回 installed／enabled。

相对 R5 构建，仅 `shared/version.js` 和 `ui/index.html` 的 0.1.24 字符串变为 0.1.25，其余 71 个 dist 文件哈希完全相同。没有修改依赖、阅读规则、数据路径或磁盘格式。

## 本轮验证

- build（含类型检查）、格式检查、platform 四项版本／工具链／重定位检查通过。
- 实际安装包的 73 个 dist 文件及 Node 与当前准备构建逐一一致，没有符号链接或私人数据文件。
- 对实际安装目录运行真实 PRTS stdio 探针：10 个 app-only 工具、117 部目录、533176 字节正式 UI、首篇 64 块、1500×844 CG 和隔离位置保存均通过。
- 官方 `codex app-server` 加载已安装插件，返回 0.1.25，发现 10 个 app-only 工具和 global 入口。没有发起模型调用。
- 开发 SQLite、安装数据 SQLite 和旧 state.json 三份真实阅读文件的安装前后 SHA256 一致。探针保存只写独立目录；本轮探针退出后没有 0.1.25 Node 进程残留，没有强停旧版本进程。

0.1.25 只更新版本标识，本轮未重跑完整浏览器／全库审计；R5 的 104 项、最终 fixture 34 项、真实 PRTS 20 项及固定 1756 篇零差异结果见 [R5 报告](refactoring-r5.md)，不将其写成本轮重新执行。后台加载器通过仍不代表桌面完整阅读 UI 已验收，非 Windows x64 平台仍待实测。

## 命令与证据

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 exec '--' tsx --test tests/platform.test.ts
./scripts/npm.ps1 run format:check
./scripts/npm.ps1 run plugin:prepare
codex plugin add arknights-story-reader@arknights-reader-dev --json
codex plugin list --marketplace arknights-reader-dev --json
./scripts/npm.ps1 run probe:mcp '--' '<安装结果的 installedPath>'
$env:CODEX_CLI_PATH = (Get-Command codex).Source
$env:READER_DATA_DIR = '<本轮隔离宿主探针目录>'
./scripts/npm.ps1 run probe:host
```

安装与验证证据在 `.ai/local/install-0.1.25/`，同版本首次失败及安装前包差异在 `.ai/local/install-0.1.24-refactor/`。所有真实阅读文件只计算哈希，没有复制内容到日志。

本轮重新检索并读取了 [OpenAI 官方打包说明](https://developers.openai.com/plugins/build/plugins)，同时核对本机 CLI 的 `plugin add --help`。用户正常重启 ChatGPT 桌面客户端后加载新版，在“方舟阅读器本机开发”中打开“方舟剧情阅读器（开发）”；本轮没有重启用户客户端。
