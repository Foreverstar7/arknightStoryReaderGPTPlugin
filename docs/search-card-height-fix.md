# 对话搜索卡片高度修复交接

2026-11-08，Windows x64。修复以干净的 `main@b4821f1befce2c4a1050db36f7aed9dcdaa775af` 为基线，保存在本地 `codex/fix-search-card-height`；交付回复列出完整提交 SHA，也可用 `git rev-parse codex/fix-search-card-height` 核对。没有推送、升版、发布或修改既有标签／归档。

## 问题与修改

搜索结果晚于第一次尺寸测量到达时，html／body／root 和搜索结果的百分比高度不随内容增长。SDK 只观察外层尺寸，因此卡片已经生成，宿主却仍使用加载态的 92px。既有只读证据在 `.ai/local/portrait-chat-polish/card-diagnostic/`；其中四卡数据的 649px 对照与本轮原创三卡测试不是同一组数据。

inline 搜索现在按自然文档高度交付尺寸，不增加自定义测量器。宿主设高度上限时仍可滚动文档。fullscreen 的错误条与搜索结果共享一个受限容器，结果内部滚动；点击卡片后，返回条和 ReaderApp 共同受当前 iframe 视口约束，目录和正文继续内部滚动。返回后恢复该模式下的结果布局。

宿主初始化、context 部分更新和显示模式请求的实际返回值均同步到布局；请求被拒绝时继续在当前容器操作。搜索在 ReaderApp 读取偏好之前默认跟随宿主主题。卡片内容、搜索范围、工具可见性、按需 PRTS 与记录契约不变。

## 已验证

- 使用实际构建 HTML，通过 `createReaderMcp` 读取真实 search／global 资源并调用工具。浏览器端使用官方 AppBridge／PostMessageTransport，与应用自带 SDK 完成初始化、输入、结果、模式和 `size-changed` 交换。inline iframe 仅依通知调整高度，fullscreen 实际等于窗口高度；没有用固定大高度预览代替。
- 原布局的延迟结果断言真实失败，三张卡片超出 iframe；修复后默认 1280px 宽的通知由 92px 增为 484px，所有卡片及按钮在分配高度内，宽度往返后高度回到原值。
- Windows Edge **157.0.4341.42** 最终 **18 项通过**，覆盖即刻／延迟结果、无结果、错误与重试、保留结果时的错误、连续结果更新、分页、fullscreen 初始值／部分通知／仅返回实际模式、拒绝全屏、封面点击、键盘进入、正文滚轮与返回、宿主高度上限、连续缩放、global 入口。320×760、768×900、1440×960、1024×400 与双主题均检查，含减少动态效果；尺寸必须稳定且无页面运行异常。
- 截图实际检查：inline 的全部结果可见；窄窗口和低高度目录通过自身垂直滚动访问篇目，返回条保留在其上方，未重做导航或设计样式。
- `./scripts/npm.ps1 run check` 的类型与 **168 项测试通过**。运行期间继续修改测试文件导致末尾格式提示，随后已对最终文件分别重新执行 `run typecheck` 与 `run format:check` 并通过；不把那次退出码写成完整 check 成功。隔离构建由最终 iframe 测试重新执行。

命令输出、JSON 报告及截图在 `.ai/local/search-card-check/`：`baseline.log`／`baseline.png`、`host-suite-final.log`、`host-report.json`、`check.log`、`typecheck-final.log`、`format-final.log`、`fixed-delayed.png`、`inline-*` 和 `directory-*`。这些是本机证据，不提交生成文件。

## 复测与边界

在本仓库、上述固定修复提交执行：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_HOST_E2E_PORT = '4351'
./scripts/npm.ps1 run test:e2e:host
```

不需要预先运行 `build`。命令只生成 `.ai/local/search-card-check/run-*` 的 HTML、原创 fixture 记录和测试报告，结束后停止临时服务。本轮未重建仓库 `dist/`、已安装开发插件或 `.local/marketplace`，未接管用户的 4330 预览，也未操作私人阅读记录。Node／npm 使用固定的 26.13.0／12.2.1，无依赖升级。

真实 Codex 桌面中的修复版仍待“讨论剧情搜索工具方案”验收对话（01a1b65a-289c-7c61-a0da-50b7e6106603）接续。需要复测晚到结果、连续查询、卡片点击、fullscreen／返回、窗口和主题；本轮不替换其正在验收的插件产物。上述结果只证明实际 SDK 协议与隔离 iframe 布局，不证明真实桌面、其他 MCP 宿主或其他平台已验收。本轮没有重新执行真实 PRTS 探针、网站或完整旧浏览器套件，因为取数、业务与网站未变。

本地清单仍声明 1.1.1，但冻结的验收源码 **baf8ee32bc79c37649f7e8ca49b744f990a64271**、草稿 **438038850**、v1.1.1 标签与三个附件均不含本修复。后续版本号、集成和发行顺序由原验收对话决定，不移动标签、替换附件或使用同名本地源码冒充归档已更新。
