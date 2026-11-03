# 剩余封面方案与隔离验收（0.1.19 候选）

日期：2026-11-03。分支 `codex/remaining-covers`，基线 `b00b5b9471345420ff8210e586275caa001b2daa`（0.1.15）。本分支与主目录未提交的 S4 隔离；没有安装／覆盖用户的 S4 插件，没有更新 4318，没有进入 S5、推送或发布。最终只读检查发现主目录已交付 S4 0.1.18，故本候选改为 0.1.19，避免不同内容重号；集成时仍须核对届时版本。

## 实现

| 范围 | 来源与展示 |
| --- | --- |
| 四月辑录 2020—2026 | 按唯一 APF 年份匹配[活动一览](https://prts.wiki/w/活动一览?action=raw)的显式 `link=愚人节活动#YYYY` 文件链接，取现成 1560×500 PNG；不再取入口竖图 |
| 主线前五章 | [主题曲索引](https://prts.wiki/w/关卡一览/主题曲?action=raw)中按唯一标题及 EP00—EP04 节读取文件引用，完整展示 512×512 原图，1560:500 外框加主题背景 |
| 主线／活动补充剧情 | 稳定 ID 分别对应应用文字封面「主线补充剧情」「活动补充剧情」，无图片请求及失败重试；仍为 8／3 篇，原目录名称与导航不变 |
| 早期危机合约 | 仅 `prts:活动剧情/特殊 · 危机合约` 使用[活动关卡索引](https://prts.wiki/w/关卡一览/活动关卡?action=raw)引用的「活动名称 危机合约.png」，463×121 完整显示＋背景；仍为三篇 |
| 日暮寻路 | 保留「活动预告 日暮寻路 01.jpg」原图，仅单图预算升为 20,000,000 字节，原 MIME／实际格式校验及独立重试保留 |

所有源图 URL 仍由 MediaWiki imageinfo 解析。元数据 parserVersion 4 使旧四月竖图等版本 3 资料按需重验，不清用户记录或全库缓存。未知尺寸仍为待适配；没有把任意尺寸放行。封面展示规则集中在 `shared/cover-policy.ts`，固定入口／合集 ID／通用文件的必要性、出处、范围及改版检查见代码注释和 `.ai/DECISIONS.md`。

全目录来源审计：[逐部清单](prts-cover-coverage.json)，**117 部／1756 篇，115 部源文件＋2 部应用文字封面**，其中 109 部标准横幅、6 部批准的背景填充图，114 张独立源图。在线审计 128 个公开资料／imageinfo 请求，离线复跑 0 请求。审计未批量下载正文或图片；115 部文件核验不等于 115 部浏览器解码。

## 实际发现并修复的两处问题

1. **单次大图结果超出 SDK 默认 stdio 缓冲。** 日暮原图实取 17,835,330 字节，base64 为 23,780,440 字符。直接返回 `_meta.readerImage` 时，SDK 2.4.0 的 stdio `ReadBuffer` 默认 10 MiB 使连接关闭。现在沿用同一个 app-only `reader_image`，每段最多 1,000,000 JSON 字符，段号／总数／SHA256 版本 ID 校验后重组原契约；最多 64 段。后续段关闭 refresh、复用正常缓存，源版本改变则显式失败并允许整张重试。未调大探针默认缓冲，没有新增模型工具、缩略图、转码或常驻传输会话。大图变化需要服务端和 UI 成套更新，旧 UI 不认识分段。
2. **进入篇目页的第一张封面快照退回 idle。** 对 `startViewTransition` 提交后的实际 DOM 取样复现，主页图已加载仍会在新页重新等待图片。现用 UI 生命周期内的 Map 共享已加载对象，新页首次绘制即可复用；清缓存推进内存代次，迟到请求不重建新页复用。现有主页隐藏保留、恢复位置及按可视区取图不变。

## 本轮验证

| 层次 | 实际结果与范围 |
| --- | --- |
| build / check | 通过，37/37；类型、格式通过；20 MB 精确边界接受、超一字节拒绝、失败后重试、原字节缓存及离线复用通过 |
| Edge fixture | 16/16，32.5 秒；既有导航／阅读／恢复／动效与缓存隔离回归通过。随后补充的封面清理代次防护由下方真实 PRTS 迟到响应回归覆盖 |
| Edge 真实 PRTS | 14/14；本批 14 张原图逐张实际解码，2 部文字封面无图片请求；主页与篇目页、320×760／768×900／1440×900／1024×400、浅深主题、键盘、减少动态效果、独立重试、首张转场快照、快速往返、窗口变化、清理时迟到响应均通过 |
| 实际隔离包 stdio / HTTP MCP | 14 张原图经真实工具调用取得，SHA256 逐张一致；使用默认 stdio 缓冲，9 个工具仍 app-only，图片字节不进入 structuredContent；封面操作前后阅读状态一致 |
| SDK AppBridge iframe | ext-apps 2.0.4 的 AppBridge／PostMessageTransport，加正式构建 UI；日暮原图 24 段，浏览器解码 1560×500、17,835,330 字节、SHA256 一致；0 正文请求、0 页面异常 |
| 常规包内读取 | 117 部目录、GT-1 前篇 64 块、1500×844 CG，隔离记录保存／stdio 和 HTTP 均通过；47 个 dist 文件与准备包逐一哈希相同，UI 514273 字节 |
| 目标桌面宿主 UI / 当前宿主加载器 | **未验证此候选**；隔离阶段不覆盖用户正在使用的 S4 插件。官方 SDK 桥接及协议不替代桌面 UI |

机器可复核的公开摘要、14 张图的来源／尺寸／字节 SHA256、包文件哈希见 [验证清单](prts-cover-validation-0.1.19.json)。日暮原图 SHA256 为 `f0bee989d33c99b95d87da91169858d39aece3ca8a1a5f277aea0432922a9b7e`；本批 MCP 最大单次结果 **1,000,558 字节**。小结果仍直接返回 readerImage。官方 [工具结果说明](https://developers.openai.com/plugins/reference)支持 app-only `_meta` 传输，但未据此宣称任意宿主的大结果上限。

14 项真实 PRTS 浏览器回归在最终实现上完成，随后仅将候选版本由 0.1.18 改为 0.1.19。换版后重新通过 build/check、包准备、14 图 stdio／HTTP MCP、常规篇目读取和 SDK iframe；47 文件哈希摘要对应最终 0.1.19。没有将 S4 的未提交代码或其测试结果计入本分支。

已实看方图桌面浅色、文字封面 320px 深色、危机合约低高度深色及 SDK 大图截图；方图完整居中、文本无错误徽标、标题和章号不裁切，正文轴及按钮可操作。内置浏览器额外点击了主线封面进入篇目页。交互稿的直接 file URL 被浏览器安全策略拒绝，本轮仅对照仓库 HTML/CSS 源码与已有布局，未将旧交互稿浏览记录当作本轮视觉证据。Computer Use 的 SKILL.md 引用 guidance.md 明确禁止自动操作 ChatGPT 桌面 UI，本轮没有绕过；真实宿主视觉仍待用户体验。

## 命令与隔离

在本 worktree 运行，Node 26.13.0／npm 12.2.1，依赖沿用锁文件，没有新增／升级包。npm 缓存使用 `.local/npm-cache`；项目本机包只准备到 `.local/marketplace`，未安装。

```powershell
$env:npm_config_cache = Join-Path (Get-Location) '.local/npm-cache'
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:READER_E2E_PORT='4329'
./scripts/npm.ps1 run test:e2e
$env:READER_E2E_PRTS_PORT='4330'
./scripts/npm.ps1 run test:e2e:prts
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx scripts/audit-prts-covers.ts --online
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx scripts/audit-prts-covers.ts
./scripts/npm.ps1 run plugin:prepare
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx scripts/probe-covers.ts .local/marketplace/plugins/arknights-story-reader
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx scripts/probe-covers.ts http://127.0.0.1:4338/mcp
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx scripts/probe-mcp.ts .local/marketplace/plugins/arknights-story-reader
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx scripts/probe-http.ts http://127.0.0.1:4338/mcp
```

真实来源请求／Edge 启动需要环境授权；默认 sandbox 的 DNS 无法解析，依赖安装与公开探针使用相应授权运行。初次 npm 参数转发及相对包路径失败已修正后重跑；它们不计入通过结果。

临时 raw、缓存、记录、探针和截图均在 `.ai/local/`，包括 `prts-browser.log`、`fixture-browser.log`、`check-final.log`、`cover-probes/`、`bridge-report.json` 与 `screenshots/`；原图／正文／私人记录不提交。SDK iframe 的临时入口为 `.ai/local/probe-bridge.mjs`，使用当前仓库依赖；不依赖旧 Obsidian 仓库或全局 Node 包。

验证结束后已核对可执行文件与命令行，关闭本 worktree 的 4338 服务（最终进程 36128）。4318 未操作；历史 PID 文件不能用作今后直接停止进程的依据。

## 尚未完成的集成边界

最后只读核对主目录 `E:\codeProject\arknightStoryReaderGPTPlugin` 时，main 仍为 `b00b5b9`，S4 及后续篇目准备功能未提交，多处与本分支交叉。不能安全合并，也不能替另一个聊天打包提交。本次保留已提交封面分支和 worktree，**没有合并提交，worktree 未清理**。

主目录独立提交后，应先把新 main 合入此分支、保留 S4 的 SQLite 缓存／修订与准备功能，重新验证分段大图与 S4 缓存的最终组合，再合回 main。确认 main 已包含全部封面提交、无未合并独有提交或未保存工作后，保留证据、停止临时服务并用受支持的 worktree 归档工具清理。未完成上述步骤前不能称整个合并交付完成。
