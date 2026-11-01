# S2 真实 PRTS 接入证据

核对：2026-11-01；本机版本 0.1.7。这里只记录本仓库实际取样和执行结果，不将旧实验或浏览器预览当成宿主全路径验收。

## 来源与取样范围

公开入口使用 `https://prts.wiki/w/{标题}?action=raw`，无需 Cookie、登录状态或模型 API key。PowerShell `Invoke-WebRequest` 在本机返回 Tengine 403；系统 curl 及项目 Node 原生 fetch 可收到 200。产品只使用 Node fetch，没有加入浏览器伪装、凭据重放或 fixture 回退。

| 实际取数页 | UTF-8 字节 | 目的 |
| --- | ---: | --- |
| [剧情一览原始页](https://prts.wiki/w/剧情一览?action=raw) | 459 | 确认正文转引 `剧情导航` |
| [剧情导航模板原始页](https://prts.wiki/w/模板:剧情导航?action=raw) | 223833 | 从活动正文表取得 16 篇顺序；排除重复 Navbox |
| [GT-1 日正当中/BEG](https://prts.wiki/w/GT-1%20日正当中/BEG?action=raw) | 14237 | 实际首篇，64 块／1630 字 |
| [GT-1 日正当中/END](https://prts.wiki/w/GT-1%20日正当中/END?action=raw) | 5081 | 实际相邻篇，24 块／765 字 |
| [W2G/BEG](https://prts.wiki/w/W2G/BEG?action=raw) | 17362 | 额外解析样本：6 组选项、1973 字；没有加入活动目录 |

还核对了 [当前播放器入口](https://prts.wiki/w/Widget:StoryPlayer?action=raw)及它引用的公开 StoryPlayer JavaScript，确认选项值、Predicate 筛选、Character／CharSlot 及空姓名的语义。下载的脚本只用于查证，没有执行或复制为应用架构。没有下载其余 14 篇正文、整库映射或图片。

源站目录中的正文地址包含关卡中文标题，`GT-1/BEG` 实测 404。来源标题形成 `prts:` ID，正文保留原页面、文本路径、原始 Wiki 和脚本摘要版本。章节编号与名称分别映射，避免界面重复显示编号。完整原文只在忽略的本机缓存／取样目录，不放进安装包或提交；测试正文均为原创语法样例。

## 解析与进度边界

- 支持本轮样本的对白／空姓名旁白、连续发言、图片引用、人物槽位、大小写指令、旧式 `[delay=...]`、Decision／Predicate 及分支合流。不会全局删除方括号或执行输入代码。
- 每个分支从对应状态出发；共同后续取所有输入路径一致的状态，歧义槽位不继承。选项、各分支、选项子集共有正文和共同后续各计一次。匿名姓名不随资源 ID 改名，焦点不等同于说话人，真实模式不生成猜测立绘。
- 序章曾比独立源行计数多 42 字，定位为 4 条旧式 delay 指令误入旁白，修复并加入回归后独立计数与解析均为 1973 字。GT-1 两篇也与源行计数分别一致。
- 未支持的嵌套 Decision、部分多段字幕、未知指令或损坏字段明确返回带来源／脚本行号的解析错误。当前不是整部 16 篇或全 PRTS 语法的兼容认证。
- 单篇分母来自实际解析正文；记录持久保留可选 `totalWords`。只要一篇没有可靠字数，整体显示“总字数待核实”。没有把剩余 14 篇按零计入，也没有预取以制造百分比。
- 原始正文和目录缓存按最后使用时间到期。清理内容不清 SQLite 阅读记录；同进程当前已打开正文的滚动保存使用最小内存定位索引，无需再次回源。版本改变时仍明确报冲突，自动修订迁移属于 S4。

## 本轮执行与可复跑命令

使用项目 Node 26.13.0／npm 12.2.1；没有新增依赖。Windows 命令：

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run probe:prts
$env:PLAYWRIGHT_CHANNEL = 'msedge'
./scripts/npm.ps1 run test:e2e
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run probe:mcp
./scripts/npm.ps1 run probe:http
./scripts/npm.ps1 run plugin:prepare
codex plugin add arknights-story-reader@arknights-reader-dev --json
./scripts/npm.ps1 run probe:mcp -- <实际安装目录>
./scripts/npm.ps1 run probe:host
```

| 层次 | 实际结果 | 边界 |
| --- | --- | --- |
| 取数 | 全新隔离目录 5 次公开请求，目录读取不下载任何正文 | 不覆盖未打开的 14 篇 |
| 解析／存储 | 18 项测试通过，真实 3 样本计数对照通过；已缓存真实内容可在注入断网后重启读取，失败刷新保留缓存 | 断网通过替换 WikiReader 注入，没有断开物理网络 |
| 浏览器 | Edge 原有 10/10；最终真实路径 3/3（14.5 秒） | 章节失败重试为明确注入的 HTTP 503；真实正文主路径没有 mock |
| MCP | 源码 stdio、实际安装包内 Node stdio、预览 Streamable HTTP 均取到真实 64 块首篇；隔离 stdio 成功保存位置 | 没有向模型暴露内部工具，没有模型调用 |
| 宿主 | 官方 CLI 安装 0.1.7；官方加载器发现 reader、7 个 app-only 工具及 global 入口 | 未实际在当前桌面宿主内点击新版完整路径或确认动效 |

真实浏览器检查覆盖 320×760、768×900、1440×900、1024×400，浅／深主题、减少动态效果、键盘浏览线、窄屏侧栏、续读、清缓存和零图片请求。截图位于 `.ai/local/screenshots/prts-*.png`，已实际查看窄屏／中等／桌面／低高度代表截图；探针原文与最新 JSON 证据在 `.ai/local/prts/live-Ic1VjP/`。测试及会写位置的 MCP 探针使用隔离目录。

已通过隔离 Edge 的 `setContent` 加载仓库原始 `reader-preview.html`，实际点击活动及篇目，检查桌面与 320px 画面。正式实现保持阅读宽度、姓名列和正文起点、交错篇目轴及既有导航；正式全区域布局多出来源提示条。可观察差异为文字封面、暂无关卡简介／图片，以及真实全剧情字数未知；参考稿的外包装边距和模拟百分比不带入应用。参考截图为 `reference-*.png`。相邻篇目动效仍以最新已确认需求为准，保留平面的相反方向横向扫过。

本机 4318 已切换为 0.1.7／prts，原 `.runtime/` 与安装用户数据目录保留，内置浏览器展示真实目录。0.1.7 包 UI 为 499719 字节。尚未推送、发布或上架。
