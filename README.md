# 明日方舟剧情阅读器

在支持 MCP Apps 的桌面宿主中浏览 PRTS 剧情、阅读全部分支、按需查看图片，并保存本机阅读进度。正常阅读不需要模型 API key。

这是个人维护的非官方工具，不隶属于鹰角网络、PRTS 或 OpenAI。

发行版本、稳定来源收录情况及已验证的桌面／平台范围见[当前状态](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/blob/main/.ai/STATUS.md)。

## Quick Start

系统需 Node.js ≥26.13.0、npm ≥12.2.1，桌面客户端需能从 PATH 找到 Node。

安装前先确认[来源目录](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/blob/main/.agents/plugins/marketplace.json)中包含本插件；未收录时使用[源码开发副本](#安装源码开发副本)。

```sh
codex plugin marketplace add Foreverstar7/arknightStoryReaderGPTPlugin --ref main
codex plugin add arknights-story-reader@arknights-reader --json
```

包内包含服务、HTML、生产依赖与启动清单；无需 clone 或构建。其他 MCP Apps 宿主的 stdio 配置见[接入说明](docs/integration-notes.md)。

## 升级与卸载

升级时先正常关闭旧阅读器会话，再更新来源并安装：

```sh
codex plugin marketplace upgrade arknights-reader
codex plugin add arknights-story-reader@arknights-reader --json
# 卸载插件
codex plugin remove arknights-story-reader@arknights-reader --json
```

使用[源码开发副本](#安装源码开发副本)时，将上述来源名替换为 `arknights-reader-dev`。升级、卸载和清缓存均保留外部阅读记录；清除记录要在阅读器页面中单独操作。

## 本地运行

项目固定 Node.js 26.13.0／npm 12.2.1。Windows PowerShell：

```powershell
./scripts/setup-toolchain.ps1
./scripts/npm.ps1 ci
./scripts/npm.ps1 run dev
```

打开 [本机开发预览](http://127.0.0.1:5173)。默认读取真实 PRTS 数据，开发记录与缓存保存在项目的 `.runtime/`。

macOS／Linux 对应使用 `sh scripts/setup-toolchain.sh` 和 `sh scripts/npm.sh`，需要 curl、tar、sha256sum／shasum；尚未实机验收。也可用自己的版本管理器准备同一工具链。

### 使用原创样例预览

在新的 PowerShell 窗口中设置来源和独立数据目录后启动：

```powershell
$env:READER_SOURCE = 'fixture'
$env:READER_DATA_DIR = Join-Path $PWD '.ai/local/preview'
./scripts/npm.ps1 run dev
```

该窗口使用原创测试正文及示意图片。关闭窗口后，其他终端的配置不受影响。正式 npm 包仅支持 PRTS，不包含 fixture。

### 构建和检查

```powershell
./scripts/npm.ps1 run check       # 类型、测试、格式
./scripts/npm.ps1 run build
./scripts/npm.ps1 start           # http://127.0.0.1:4318
./scripts/npm.ps1 run package     # .local/releases/ 中的完整运行包
./scripts/npm.ps1 run package:verify
```

[脚本说明](scripts/README.md)列出宿主探针和维护审计；[验证指南](docs/testing.md)说明如何选择检查。

### 安装源码开发副本

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run plugin:prepare
codex plugin marketplace add ./.local/marketplace --json
codex plugin add arknights-story-reader@arknights-reader-dev --json
```

前两步生成新的开发副本，后两步安装到当前客户端。客户端需能从 PATH 找到项目要求的 Node；项目工具链只调整当前终端，不修改系统 PATH。为桌面客户端配置好 Node 后，正常重启客户端，再从插件入口打开阅读器。

## 数据与内容来源

- 安装模式将数据写入 Windows `%LOCALAPPDATA%/ArknightsStoryReader/`；macOS／Linux 使用 `$XDG_DATA_HOME/arknights-story-reader/`，未设置时为 `~/.local/share/arknights-story-reader/`。
- `READER_DATA_DIR` 可覆盖数据目录，不要设在插件版本目录内。阅读记录、内容缓存和公共字数分别存储，详见[接入说明](docs/integration-notes.md#本机数据)。
- 目录、正文、人物映射及图片来自 [PRTS](https://prts.wiki/)。打开一部剧情后准备该部正文，图片按需取得；不预下载整库。缓存默认在最后使用 7 天后到期。
- npm 包不附带剧情原文、游戏截图、立绘或 CG。游戏名称、角色、剧情和美术的权利属于鹰角网络及相应权利人；PRTS 的原创内容适用其[版权说明](https://prts.wiki/w/PRTS:著作权)。公开可访问不等于获得再分发许可。
- 本项目原创代码采用 [MIT 许可证](LICENSE)，不包含对游戏内容或 PRTS 内容的授权；第三方依赖遵循各自许可。来源或权利问题可通过 [GitHub Issues](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/issues) 提供具体链接。

## 文档入口

- [阅读行为与功能范围](docs/requirements.md)
- [结构、接口与存储](docs/integration-notes.md)
- [PRTS 规则维护](docs/maintenance.md)
- [发布步骤](docs/releasing.md)

参与开发先读 [AGENTS.md](AGENTS.md) 与[当前状态](.ai/STATUS.md)。
