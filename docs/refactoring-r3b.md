# R3b：导航、位置与保存生命周期

日期：2026-11-05。从 R2b `e85c9a8` 接续，功能比较基线仍为 `7724df1`／0.1.24。版本、依赖、工具、磁盘格式、字数口径及样式不变。

## 职责与行为

`useReadingPosition` 接管一个正文挂载周期内的 DOM 锚点恢复、顶部阅读位置观察、滚动／隐藏／宿主 flush 事件与清理。顺序保存和去重由普通闭包 `createPositionSaveQueue` 管理，替代 Reader 中分散的队列 refs；它不负责网络或显示错误。纯视频仍不产生阅读记录，最后与最远位置仍由既有领域／服务处理。

`usePageTransition` 只适配 DOM 动画和终态释放。ReaderApp 继续拥有当前／目标页面、异步取数与原有 flushSync 提交点，route 保留旧画面；数据、顶栏、恢复位置和正文同时切换。取消后仍检查导航代次，卸载时失效在途导航。封面、来源条裁剪、前后篇遮罩、降级动画与减少动态效果逻辑均保留。

错误文案与对应重试函数组成一个 Failure 状态，删除独立维护的 retry ref，避免其他操作先改写已有错误的重试行为。保存失败由 ReaderApp 展示；队列允许后续重试且等待整条保存链。设置刷新仍可收到拒绝；导航重试处已由 banner 处理的拒绝有明确所有者。

核对 [W3C View Transitions 规范](https://www.w3.org/TR/css-view-transitions-1/#viewtransition)：skipTransition 不取消更新回调，ready 可能因动画跳过而拒绝，状态提交失败由 updateCallbackDone 反映。现在分别处理动画准备、提交错误与动画结束，不把提交异常当作成功吞掉；旧请求的错误也不能覆盖新导航。

本片没有引入查询库或导航框架。现有有限 Route、请求代次和普通模块足以分清职责；新增缓存库不能替代打开正文的迁移副作用或持久记录保护。

## 随审查修复的已复现问题

提取后的原保存算法在“前一保存失败，后面已有另一保存排队”时，外层 catch 会让 flush 提前返回。原创测试先取得 **2/3**，失败日志为 `queue-first.log`，随后将错误处理放入每次等待中；仍由父层报告，不自动重试失败写入，但继续等待后续保存。浏览器再次验证该顺序下清记录必须等后笔保存完成才请求，结束后记录为空。

完整 fixture 首轮 **33/34**。新增真实 View Transition 回调失败测试已显示错误并能重试，但 Edge 还抛出一条未处理的 ready 拒绝；原 trace／截图保留在 `fixture-first-failure/`。补齐 ready 的动画拒绝处理，保留提交异常报告及完整断言，最终整套 **34/34** 通过。这是产品错误处理修正，不能写成纯测试等待问题。

实看首轮截图发现 reader／transitions 的旧用例继承前场景的显式深色设置，系统浅色模拟未真正切换主题。现在这些文件在测试开始将隔离设置恢复 system，reader 截图另断言 data-theme；最终四窗口浅／深八张正文截图均实看。没有改产品主题逻辑或降低界面断言。

## 验证与交付边界

- build／check **95/95**，最终构建的类型与格式通过。新增三个队列测试和三个浏览器生命周期场景；其他导航、历史、目录、正文准备、设置、清缓存、慢请求取消和原生动画降级均保留。
- 最终完整 fixture **34/34**；真实 PRTS 全套 **20/20** 首轮通过。
- 本批 R2b 已取得冻结 1,756 篇与图片／身份专项零差异、零联网。本片只改 UI 生命周期，未重复解析审计，也不将 R2b 的回放写成本片新报告。
- 准备包重定位至含中文／空格的新路径，**73 个 dist 文件**与 Node 哈希一致，无链接或私人状态。最后 ready 处理仅改变 UI HTML，将最终构建 HTML 更新到准备包和重定位包后再次逐文件核对；没有把旧包当作最终产物。
- 包内 Node 的 fixture／真实 stdio、双进程、实际 HTTP 十工具与完整 MCP HTML 通过；真实返回 117 部、64 块首篇、1500×844 CG、533,176 字节 UI 及隔离位置保存。
- HTTP 探针首轮在 10 秒健康轮询内未就绪，服务未退出且无输出；保留 `http-first.log`／`http-first-server.log`，启动慢的根因未证实。仅将本机探针的有界健康等待改成 30 秒后复验通过，产品超时未改。
- 官方 app-server 在全新隔离配置中读取 0.1.24 准备包，installed=false；明确连接本轮重定位包发现十个 app-only 工具与 global 入口。不是安装后桌面完整 UI 验收，非 Windows x64 仍待对应环境。

已实际操作交互稿与当前总目录→篇目轴→正文并检查截图。横向交错轴、正文宽度／左对齐与侧栏重排保留；与旧稿的可观察差异仍是已确认的来源条、公共准备状态、清历史入口、进度圆环及全窗口布局。测试覆盖键盘、触摸、resize 和减少动态效果；低高度独立滚动、320px 侧栏收起与正文可读。本片不改布局／颜色／动效时长。

所有写入仅用 `.ai/local/`，未操作 `.runtime` 或实际安装记录。4341–4344 无监听，本批重定位包测试进程已退出。未安装、推送或发布。下一会话直接 R4a→R5，R4b／换库仍为条件项，不重新规划已完成切片。

## 实际命令

证据位于 `.ai/local/refactoring-0.1.24/r3b/`；完整首轮、失败 trace 和最终日志分开保存。

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run format:check
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PORT = '4341'
./scripts/npm.ps1 run test:e2e
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run plugin:prepare
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe .ai/local/refactoring-0.1.24/r3b/check-package.mjs
./scripts/npm.ps1 run probe:mcp '--' '.ai/local/refactoring-0.1.24/r3b/relocated 阅读器'
./scripts/npm.ps1 run probe:s4:installed '--' '.ai/local/refactoring-0.1.24/r3b/relocated 阅读器'
./scripts/npm.ps1 exec '--' tsx .ai/local/refactoring-0.1.24/r3b/probe-http-contracts.ts
$env:CODEX_CLI_PATH = (Get-Command codex).Source
./scripts/npm.ps1 exec '--' tsx .ai/local/refactoring-0.1.24/r3b/probe-host-isolated.ts
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe .ai/local/refactoring-0.1.24/r3b/visual-review.mjs
```

stdio 分别设置 READER_SOURCE=fixture／prts。PowerShell 参数分隔符使用字面 `'--'`；浏览器／HTTP 与真实网络探针经工具审批在沙箱外隔离运行。初次新增测试误用了超出项目 ES2023 lib 的 Promise.withResolvers，类型检查阻止构建后改为复用既有 deferred helper；没有改变工具链或编译目标。
