# R3a：目录与阅读状态的更新归属

日期：2026-11-05。从 R2a `e6a762a` 接续；比较基线仍为 `7724df1`／0.1.24。没有改变版本、依赖、磁盘或工具契约，也没有安装、推送或发布。

## 改动与边界

`ui/snapshot-state.ts` 用一个纯 reducer 接管初次快照、普通快照、刷新目录、公共字数和阅读状态五类更新。ReaderApp 的回调只提交对应事件，删除分散的对象展开与重复空状态判断。普通快照带回当前记录和统计，但不能倒退新目录；目录刷新只合入目录与较新的统计，不覆盖已保存设置、位置或已清历史。继续复用 story-counts 的核验时间比较，没有复制百分比或字数算法。

useCatalogRefresh 的一次自动检查、在途合并、取消代次与失败重试不变；当前剧情的两并发准备不变。route 仍保存转场期间的旧画面，最新目录信息从 snapshot 取得，源目录移除当前剧情时仍能显示已打开内容。快照与页面仍在原 flushSync／ViewTransition 提交点一起切换；没有改变导航、保存队列、样式或动画时长。

未引入 TanStack Query 或 p-limit。此次重复知识是公共与私人状态的合并规则，现有请求 hook 已承担取消与合并；普通 reducer 足够，新增查询缓存仍需保留这些业务规则。导航／位置保存生命周期留 R3b，不在本片扩大调整。

## 验证结果

- build／check **90/90**，最终类型和格式检查通过。新增两个状态序列验证包含双启动响应顺序、较新字数、异剧情统计、刷新增加／删除目录项、迟到普通快照、保存设置及清记录；保留未知分母。
- Edge fixture 首轮 **30/31**。五个目录专项全部通过，覆盖来源调用次数、慢刷新／旧导航快照、失败重试、清历史／缓存、键盘／触摸、四窗口和双主题。唯一失败是转场测试的实时轮询未采到反向动画；退避采样可能跳过 440 ms 动画，同轮 reader 动画事件测试通过。保留原 trace，取帧测试改为在真实 animationstart 暂停原动画，再检查 20%／50%／80% 的遮罩、方向、透明度和无变形；没有合成动画或删断言。整个 transitions 文件复验 **5/5**。31 个唯一 fixture 场景均有通过记录，不写成首轮 31/31。
- 完整真实 PRTS 首轮 **19/20**。0-10 立绘请求在 5 秒可见性断言结束时仍未响应，trace 的 reader_image 状态为未完成；改为等待相同篇目／块的实际响应，再检查原图、焦点与键盘。整个 prts-body-images 文件复验 **4/4**；20 个唯一场景均覆盖通过。没有修改图片来源、正文、产品等待或错误逻辑。
- 本批正文／解析比较已在 R2a 取得：固定 1,756 篇及独立字数、图片／身份专项对冻结报告零差异、零联网。本片只调整 UI 状态更新，未重跑解析审计，也不把 R2a 报告写成本片新报告。
- 准备包复制到含中文／空格的新目录：**69 个 dist 文件**与当前构建逐项 SHA256 相同，Node 与项目固定运行时相同，无符号链接或私人状态文件。包内 fixture／真实 stdio、双进程和实际 HTTP 十工具通过；HTTP MCP 读取的 HTML 与包内文件完全一致。真实 stdio 返回 117 部、64 块首篇、1500×844 CG、532,536 字节 UI，并完成隔离位置保存。
- 官方 app-server 用全新隔离配置读取准备包并连接确切重定位包：0.1.24、installed=false、10 app-only 工具及 global 入口。此证据是加载器／工具发现，不能替代安装后桌面 UI。没有新增接口用法，沿用 R1 已核对的官方 SDK／入口契约。
- 4341／4342／4343／4344 无监听，本批隔离包测试进程已退出。所有写入只在 `.ai/local/`，未操作真实记录。

## 实际界面对照

用固定 Node 26.13.0 和隔离 Edge 实际操作设计稿及当前总目录→篇目轴→正文，检查截图；另实看目录刷新在 320×760、768×900、1440×900、1024×400 的浅／深八张截图。窄屏刷新失败文案完整换行、焦点清楚；中等／桌面保留侧栏，低高度主内容独立滚动；正文保留姓名栏与正文左对齐。

与旧设计稿的可观察差异继续是已有功能：来源条、刷新反馈、正文准备状态和清历史入口，以及后来确认的白底进度圆环；设计稿自身有外层边框与示例内容，正式页使用全窗口和真实／fixture 数据。横向交错轴、三页层级、浅深主题及纵向阅读保持，本片没有调整这些外观。

首次可视化调用使用 `npm exec node`，npm 将 node 解析为临时预发行包；该次运行不计固定工具链验收，原日志保留。随后明确调用项目 `.local/toolchain/node-v26.13.0-win-x64/node.exe`，使用全新隔离记录完整重验并查看截图。项目清单、锁文件与已验证运行时未改变。

## 命令与交接

完整日志、首轮失败 trace、截图、包哈希和附加探针在 `.ai/local/refactoring-0.1.24/r3a/`。主要实际命令：

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PORT = '4341'
./scripts/npm.ps1 run test:e2e
./scripts/npm.ps1 run test:e2e '--' tests/browser/transitions.spec.ts
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run test:e2e:prts '--' tests/browser/prts-body-images.spec.ts
./scripts/npm.ps1 run plugin:prepare
./scripts/npm.ps1 run probe:mcp '--' '.ai/local/refactoring-0.1.24/r3a/relocated 阅读器'
./scripts/npm.ps1 run probe:s4:installed '--' '.ai/local/refactoring-0.1.24/r3a/relocated 阅读器'
./scripts/npm.ps1 exec '--' tsx .ai/local/refactoring-0.1.24/r3a/probe-http-contracts.ts
$env:CODEX_CLI_PATH = (Get-Command codex).Source
./scripts/npm.ps1 exec '--' tsx .ai/local/refactoring-0.1.24/r3a/probe-host-isolated.ts
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe .ai/local/refactoring-0.1.24/r3a/visual-review.mjs
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe .ai/local/refactoring-0.1.24/r3a/check-package.mjs
```

fixture stdio 单独设置 READER_SOURCE=fixture；真实 stdio 用默认 prts。所有端口测试均依工具审批在沙箱外运行。后续从 R2b 接续 R3b／R4a／R5；整体解析器替换与换库仍是条件项。真实桌面完整 UI 与非 Windows x64 平台继续待独立验证。回退本片不需要改任何记录或缓存格式。
