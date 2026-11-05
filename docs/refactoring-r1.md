# R1：工具契约与可信调用

日期：2026-11-05。从干净的 `730f8fd` 接续，功能比较基线仍为 `7724df1`／0.1.24。本片不改变版本、依赖、磁盘格式、工具名、资源 URI、可见性或阅读规则；没有安装、推送或发布。

## 职责变化

- `shared/tools.ts` 关联十个工具的输入 schema、默认值解码后的参数、输出 schema 和具体结果类型。工具名枚举与注册表在编译时互相约束；映射类型保持工具名与参数／返回值的关系，没有用强转、`any` 或非空断言换取泛型接口。
- HTTP 外部参数经 `ReaderService.call` 解码，再进入类型明确的 handlers。MCP 普通工具复用同一 schema，由 SDK 校验参数后调用 `execute`；不再在服务分发、record 内重复解析相同参数。实际来源、磁盘和缓存重新进入系统的校验仍保留。
- HTTP／宿主返回值在 `ui/transport.ts` 的逻辑工具边界解码；页面、目录刷新、统计准备、简介和图片组件直接取得具体类型，不再自行选择结果 schema。字数结果仍在准备 hook 核对所属剧情；正文和统计的请求篇目 ID 在传输边界核对。损坏结果明确报告 parse，不会写入 UI 状态。
- 图片保持两种投影：HTTP 返回完整逻辑结果；MCP `structuredContent` 只含图片摘要，二进制放 app-only `_meta`。沿用已有扁平 MCP 输入 envelope，再由逻辑图片契约检查 kind 对应的必要标识；分段字段由 SDK 校验一次，`imageToolMetadata` 接收可信字段。重组只负责有序字节／JSON，完整图片校验统一交给逻辑结果边界，显式零图层占位仍有效。
- transferId、cacheEpoch、分段数量／顺序、后续请求不重复 refresh、清理后中止等保护均保留。ReaderError 的 code／sourceUrl 不从文案推断；本机连接、JSON 解析及宿主桥接异常保留原 cause，宿主拒绝仍为 unknown，不改成 PRTS 网络故障。

R102 中旧 ReadingState 可选字段的规范化留给 R5 的磁盘入口审查。本片不提前改变存储表示，也不把“新剧情尚无代次”或未知分母当作不可能状态。SourceImage 的稳定请求键重新进入 JSON 时仍有输入解码；这是独立于已删除的结果重复校验的边界。

## 官方接口依据

本次重新读取 [OpenAI 工具参考](https://developers.openai.com/plugins/reference)及[扩展入口文档](https://developers.openai.com/plugins/build/extensions)，核对 `outputSchema`、app-only `ui.visibility`、隐藏 `_meta` 和 global／thread 入口。检查已安装的 MCP server 2.4.0 与 ext-apps 2.0.4 的类型及实现：SDK 会校验入参和结构化出参，因此普通 MCP 调用无需再把同一参数当 unknown 解码。没有升级 SDK 或引入模型 API。

将冻结基线和当前构建分别接入独立 InMemoryTransport，比较完整 `tools/list` 和 `resources/list`：十个工具和一个资源的 schema、描述、annotations、入口及可见性**完全一致**。报告在本机 `r1/mcp-descriptors.json`，不是只比较工具数量。

## 验证

- `build` 通过；`check` 86/86，类型和格式通过。新增 HTTP／host 的坏结果、错篇目、显式占位和 cause 验证；MCP 与直接外部调用拒绝错误输入，原记录保持。构建后 check 包含当前 dist 的双进程用例。
- `audit:refactor` 对冻结报告零差异、0 网络尝试：1,756 篇完整 v4 结构及独立字数、169 立绘、122 CG 引用、207 组合、302 原图和固定身份样本 21 个发言块。基线 SHA256 仍为 `07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e`。
- Edge fixture 完整 31/31，包括目录与保存乱序、设置、按需图片、导航、四窗口、键盘／触摸及减少动态效果。没有改布局、样式或动画；实看本轮窄屏正文、中等篇目轴和低高度真实立绘截图，不宣称重做全部设计稿人工验收。
- 真实 PRTS 首轮 18/20。封面专项开始后，前一阅读场景在途正文准备补入了 4-10 END 的公共字数；该专项的新准备请求均被测试拦截。另一次立绘重试尚未返回时，5 秒可见性断言先结束。两份原始 trace／截图已保留；产品没有因此修改。封面测试先清理隔离公共缓存、建立代次屏障后取比较起点；图片测试等待实际重试响应，再验证正常解码／显示。完整 stories／state 比较和图片断言保持，最终真实整套 **20/20** 通过（2.9 分钟）。
- `plugin:prepare` 后复制至含中文／空格的新目录，67 个 dist 文件和包内 Node 的 SHA256 全部一致，无符号链接或私人状态。包内 fixture stdio 返回十个 app-only 工具、3 部目录和 532,238 字节正式 HTML；真实 stdio 返回 117 部目录、64 块首篇、1500×844 CG 与隔离位置保存；双进程探针通过预取不写已读、旧修订拒绝、清理隔离和迟到保存保护。真实 stdio 首次沙箱内目录请求失败，诊断确认 ReaderError network；沙箱外同包通过，原日志保留。
- 实际包 HTTP 探针调用全部十个工具（fixture 图片明确 resource_missing）、验证错误输入和缺篇、清缓存保留记录、清记录保留设置；同服务 Streamable HTTP MCP 发现十个工具并读取与包内文件逐字节相同的 HTML。临时探针首轮把小写 doctype 当作失败，保留日志后改为完整 HTML 文件比较并通过；不涉及产品修改。
- 用本机官方 app-server、全新隔离配置与数据目录读取准备包：plugin/read 识别 0.1.24／reader，installed=false；独立 MCP 配置明确指向本次重定位包，宿主发现十个 app-only 工具及 global／thread 元数据。没有启用或安装插件。根据[当前本地插件加载规则](https://developers.openai.com/plugins/build/plugins)，已安装复制与源目录是不同状态；旧安装的 0.1.23 不作为新包通过的证据。

所有证据与写入探针在 `.ai/local/refactoring-0.1.24/r1/` 或已有 `.ai/local/` 测试目录。当前桌面中安装插件的完整 UI、其他操作系统／架构仍未验；隔离 app-server 发现元数据不替代这些验收。沙箱回环受限，Edge 和 HTTP 依工具审批在沙箱外隔离运行。最后已在沙箱外只读确认 4341／4342／4343 无监听，本轮隔离包测试进程已退出。

## 复跑与接续

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run audit:refactor '--' --output .ai/local/refactoring-0.1.24/r1/current.json --compare .ai/local/refactoring-0.1.24/baseline.json
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PORT = '4341'
./scripts/npm.ps1 run test:e2e
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run plugin:prepare
./scripts/npm.ps1 run probe:mcp '--' '.ai/local/refactoring-0.1.24/r1/relocated 阅读器'
./scripts/npm.ps1 run probe:s4:installed '--' '.ai/local/refactoring-0.1.24/r1/relocated 阅读器'
```

包探针传入实际准备／复制完成的路径；`probe:mcp` 默认真实 PRTS，设置 `READER_SOURCE=fixture` 时走原创来源。本机附加脚本为 compare-mcp.mjs、probe-http-contracts.ts、probe-host-isolated.ts，精确命令和完整结果在同目录日志。不将它们或公开正文加入 Git。

下一步直接 R2a，统一正文取得但分开准备与打开的副作用；随后 R3a、R2b、R3b、R4a、R5。持续执行授权不变；在验证并本地提交的边界可新建同项目会话接续。按本片提交回退不需要修改任何记录或缓存格式。
