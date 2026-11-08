# 对话搜索卡片高度修复

修复提交：`8e026320c232e4e4a85327dc342a202a93d7ab1b`。集成与发行状态见 [STATUS](../.ai/STATUS.md)。

## 问题与修改

搜索结果晚于首次尺寸测量到达时，html／body／root 和搜索结果的百分比高度不随内容增长。加载态曾通知 92px，卡片生成后宿主仍沿用这一高度。

inline 搜索改为自然文档高度，由 SDK 观察并发送尺寸；宿主限制高度时允许文档滚动。fullscreen 的错误条与结果共用受限容器，点击卡片后的返回条和 ReaderApp 共同受 iframe 视口约束，返回结果后恢复对应布局。

宿主初始化、context 更新和显示模式请求返回的实际模式均同步布局；请求被拒绝时继续在当前容器操作。搜索在读取偏好前跟随宿主主题。

## 复测

使用项目固定工具链，在仓库根目录执行：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
./scripts/npm.ps1 run test:e2e:host
```

不设置 PLAYWRIGHT_CHANNEL 时使用已安装的 Playwright Chromium。默认端口为 4349，可通过 READER_HOST_E2E_PORT 选择空闲端口。测试自行隔离构建，使用原创 fixture 数据和实际 MCP 资源／工具，经官方 AppBridge／PostMessageTransport 协商 iframe 高度；无需预先构建仓库 dist。

报告为 `.ai/local/search-card-check/host-report.json`，截图和 trace 位于同目录的 results。验证不依赖其他开发者保留的历史截图或数据。

## 已有结果与边界

2026-11-08，Windows Edge 157.0.4341.42 的 18 项检查通过。原布局的延迟结果断言失败；修复后三卡由加载态 92px 增为 484px。覆盖结果时序、无结果、错误重试、连续更新／分页、模式拒绝与实际返回模式、封面点击、正文滚动及返回、宿主高度上限和尺寸稳定；四种窗口、双主题、键盘及减少动态效果均已检查。

类型检查、168 项单元／协议测试及格式检查分别通过。

这些结果证明 SDK 协议和隔离 iframe 布局。真实桌面仍需检查延迟搜索、连续查询、卡片进入、fullscreen／返回及窗口和主题变化；其他宿主和平台分别验收。已冻结的 1.1.1 包不含本修复，应在后续新版本中交付。
