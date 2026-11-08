# 当前状态

更新：2026-11-08。功能范围以 [需求](../docs/requirements.md)为准，待办见 [PLAN](PLAN.md)，发布操作见 [发布指南](../docs/releasing.md)。

## 实现状态

- 阅读器已具备七类目录、三页导航、全部分支、按需图片、本机续读、字数进度和独立缓存管理。姓名与场景资源分开处理，立绘匹配及限制见 [立绘说明](../docs/portrait-speaker-evidence.md)。
- 基础剧情搜索已实现：唯一模型可见工具为 `reader_search`，支持剧情名称、篇目编号／标题、PRTS 人物实际出场；其余十一项工具仅供页面使用。桌面搜索卡片通过官方深链进入同一安装来源的侧栏阅读器，保留命中篇目标记；其他宿主保留当前容器阅读。结果页保留失败重试和分页，不显示常驻“刷新搜索资料”按钮。深链身份、协议和验证见 [侧栏跳转](../docs/sidebar-reader-links.md)。
- 网站包含介绍／占位演示、安装指南和独立 `/reader/` 真实网页阅读入口。真实网页入口已部署到同站点 `/reader/`；构建与维护见 [网站说明](../docs/website.md)。

## 乐章目录与阅读导航：1.1.6 共享实现

用户已授权正式实施、提交推送和清理被忽略的备份／检查文件。共享 ReaderApp 已接入类型／乐章双视图、模式偏好、所属乐章标签、独立分叉及往返定位。桌面剧情轴保留拖动、原生横向滚动与浏览线，隐藏额外滚动条；手机乐章视图为纵向列表与选择器。来源未收录的现有剧情保留在“其他”，资料错误可单独重试。初始 [HTML 样例](../docs/design/catalog-modes-preview.html) 仅作布局参考，其虚构数据不进入生产构建。

用户已撤回自动隐藏，各平台顶部仅通过图标手动展开／收起，滚动不改变状态，并补偿当前可见内容锚点。正文删除末尾上一篇／下一篇按钮；电脑宽屏左右留白为整高透明点击区，保留箭头，悬停只显示手形，滚轮仍原生滚正文。手机横滑预览目标并在松手时切篇，顶部有按钮入口。竖滑、选区、屏幕边缘和多指介入不误切；沿用原保存队列和字数规则。乐章选择随浏览位置／关联返回恢复，顶部展开／收起保持选择。

- 1.1.6 类型、178 项单元／协议及格式检查分别通过；`run package`、`run package:verify -- --prts` 通过，实际包在源码外解包、冷缓存离线安装，12 项工具／唯一模型搜索／global 入口和两份 UI 一致。真实包读取 117 部目录、64 块正文、1500×844 CG，保存／重开／清缓存／模拟卸载保留均通过。
- 1.1.6 在 Edge 157.0.4341.42 的 45 项 fixture 浏览器、27 项 SDK iframe、22 项独立网页回归通过；WebKit 27.2 的网页 20 项通过、两项 CDP 原生触摸专项按内核跳过并由 Edge 覆盖。检查包含手动状态、导航选择保持、留白上／下位置点击、透明悬停、原生滚轮、选区保护、首尾入口、模式／续读、独立失败重试、清缓存代次、低高度目标可见、减少动态效果，以及 320×760、768×900、1440×960、1024×400 双主题。已查看窄屏、桌面、低高度与真实源截图；收起／展开的可见段落误差不超过 1px。网页正文固定在第二行，收起外壳后仍占满剩余高度。
- 正式桌面请求成功读取当前 PRTS 曲谱；独立网页真实源确认 117 部剧情全部保留、87 部归入 14 个乐章、29 个连接点，无未对应名称。真实网页往返定位、320px 深色布局通过，目录浏览未请求正文且没有脚本错误。这是当次源核对结果，不是硬编码数量。
- 本次修改由网页与插件共用；Pages 部署和插件发行仍分开。首轮 `3f25634` 已推送，Pages 42489638092 部署成功且线上 WebKit 27.2／320px 真实源复查通过，Check 42489638187 的 Ubuntu 验收通过；Windows 真实图片工具未取得可解析的结构化结果而失败，该次未生成 1.1.5 草稿，不据此猜测网络根因。该提交包含先前自动隐藏方案；用户后续修订和导航状态修复进入 1.1.6，1.1.5 本地包及历史归档保留。变更见 [1.1.6 说明](../docs/releases/1.1.6-notes.md)。本轮不执行 Publish release，也未替换当前用户安装；正式已公开版本仍为 1.1.4。手机真机手势和实际桌面升级体验仍按 PLAN 后续验证。
- 最新功能提交 `651449b` 已推送；[Pages 42491906231](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42491906231) 成功。线上 WebKit 27.2／320px 再次确认 117 部目录、87 个乐章标签、29 个连接点、滚动保持手动状态、展开／收起后选择保留及可用高度，无整页横向溢出或脚本错误。[Check 42491906251](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42491906251) 的 Ubuntu 验收通过；Windows 第一次在真实图片阶段失败，重跑失败作业后在目录请求报明确 `network`／20 秒超时（job 128768297264），草稿步骤跳过。该远端取数限制与本地同版本实际包的真实源成功结果分别保留，1.1.6 草稿尚未生成。
- [Check 42493173720](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42493173720) 的 Windows 实际包及真实 PRTS 验证已通过，随后失败于手机触摸回归。用相同 Chromium 156.0.8078.4 本地重现：匀速 CDP 拖动释放后偶发保留滚动手势，下一次 tap 没有派发 click；等待五秒仍可重现。测试输入改为释放前减速，正文确实上下滚动与单次点击收起均保留断言，删除固定 500ms 等待，应用代码与手动收起规则未变。修复后该项连续八次、完整 fixture 45 项与网页 22 项通过，类型／178 项单元协议／格式检查通过；新的远端候选验收待完成。
- 已按用户要求清理约 1.29 GB 的历史备份、实验下载、旧日志与检查产物；真实 `.runtime/reading/records.sqlite` 哈希未变，依赖／工具链、发行包、注册工作树和离线回归必需样本保留。历史条目中的本机临时报告路径只记录当时取证位置，后续复现使用仓库脚本和已列 Actions。当前验收摘要与截图基线保留在被忽略的 `.ai/local/score-implementation/`。

## 纯前端网页阅读器

下文保留双视图接入前的网页基线；本轮共享界面验证以上节为准。

`/reader/` 通过 PRTS 移动域名的公开跨域 API 直接读取内容，避免手机 UA 在标准域名触发无 CORS 的 302。浏览器仅持久保存阅读记录、修订／字数摘要与设置；目录、正文、映射及图片只在当前页面复用，不注册 Service Worker。封面按可见范围加载，保留浏览器正常 HTTP 缓存，不预下载或长期保存全库封面。介绍页保留演示和桌面安装，六个演示剧情名与原创封面对应，其余内容仍是占位符。

独立网页构建复用 ReaderApp、ReaderService 与解析器，选择浏览器存储、设置与字节／哈希适配；桌面存储、原始 PRTS 请求和 MCP 入口沿用主分支实现。共享服务的三处字数调用等待同步或异步结果。网页集成保留主分支 1.1.4 的搜索深链与发行能力；现有固定标签、发行物和安装未替换。

- 本地类型／173 项单元与协议／格式检查、网页类型和完整静态构建通过。网页最新回归 Edge 19 项通过；WebKit 18 项通过、1 项 CDP 原生触摸专项按内核跳过。长目录覆盖手机原生纵向滑动、整卡点击、电脑浏览线末端定位和宽／窄窗口往返；目录截图覆盖四种窗口与双主题。既有桌面 39 项 fixture、27 项 SDK iframe 和 10 项介绍演示的成功记录保留，后续网页样式没有修改桌面源码。
- 已检查 320×760、768×900、1440×960、1024×400 双主题和低高度：手机窄屏篇章目录为纵向卡片列表，隐藏浏览线与横向提示；电脑保持横向交错轴和浏览线。网页外壳列宽已约束，长目录不再撑宽整页。正文及阅读领域规则不变。
- 手机 API 问题已复现：iPhone Safari 标识的真实请求在标准域名收到指向 `m.prts.wiki` 的无 CORS 302，出现与 iOS 27 用户相同的目录错误。网页改为直连源站移动 API 后，同一 WebKit／iPhone 标识通过真实 PRTS 目录、正文、立绘、CG 和刷新续读；桌面源码没有新增改动。自动回归模拟浏览器拒绝请求，实际 302／CORS 与真实数据验证分别留存本机证据，不能把模拟视为真机通过。
- 集成后 Edge 真实 PRTS 目录、孤星阅读、进度保存／刷新恢复再次通过；独立切片的 CW-6 立绘和 CG 显示已验证，未访问本机业务 API 或 MCP。原始证据保存在被忽略的本机目录。用户已确认 iOS 27 总目录可见、篇章目录能上下滑动并打开篇目；Android 真机、手机触摸图片、重开续读与主屏幕启动仍待验证。

网页布局更新 `4200727` 已推送 main，[Pages 42476966362](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42476966362) 与 [Check 42476966347](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42476966347) 均成功。正式 [网页阅读器](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/reader/) 已复查：iPhone 标识的 WebKit 中目录纵向排列、浏览线隐藏、整卡打开及正文／图片／续读正常；桌面真实长目录仍为横轴，浏览线能定位末篇，整页无横向溢出。用户已在 iOS 27 手机上确认总目录可见、新版篇章列表可上下滑动且可打开篇目；手机图片交互、重开续读、主屏幕启动和 Android 真机仍待确认。本轮没有另发 npm／插件版本。

## 桌面端：1.1.4 已公开

package／lock／plugin／源码版本统一为 1.1.4。新增桌面搜索到侧栏的深链、已有阅读器的导航处理，以及从固定验收提交自动填写 Release 草稿标题／正文。包含 1.1.3 的按钮精简，不新增模型工具或设置入口。变更说明见 [1.1.4](../docs/releases/1.1.4-notes.md)，后续发布操作见 [发布指南](../docs/releasing.md)。

- 本地 `./scripts/npm.ps1 run check`、`run build` 通过，包含 172 项单元／协议测试与格式检查。发行文案回归用真实隔离 Git 提交验证固定来源、错版／空白拒绝和已有草稿恢复保留文案。
- `run package` 与 `run package:verify` 通过：实际 tgz 在源码外解包，冷缓存离线安装、生产依赖、三种 MCP 入口和两份 UI 一致。`run plugin:prepare` 已生成 1.1.4 开发副本，开发 mcp.json 的目标身份与其 marketplace 一致；`run probe:host -- --isolated` 验证本机加载器的 12 项工具、唯一模型搜索和 global 入口。该探针只安装到隔离配置，未替换当前用户安装。
- Edge 的 fixture 浏览器 39 项及 SDK iframe 27 项通过，使用独立端口和原创记录。新增的 9 项覆盖正式／开发身份、首次与重复链接、慢初始化中更新目标、保存排队／失败重试、最新目标、坏链接、宿主拒绝，以及四种窗口双主题。已查看 320×760、768×900、1440×960、1024×400 的生成截图，篇目轴、命中标记、键盘和减少动态效果保持原有布局。
- 固定工具链 Node 的 `--import tsx scripts/probe-search.ts` 通过：真实剧情名称、R8-1、塔露拉出场及导语可查，断网重开复用缓存，阅读记录不变且正文下载为零。报告位于 `.ai/local/story-search/live-1794128870214/report.json`；UI 报告、截图和 trace 位于 `.ai/local/search-card-check/`。
- 固定源码 `950e14e8efcaeacfaebaa914503b29703222bcfd` 已推送 main，[Check 42466429465](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42466429465) 的 Ubuntu、Windows 验收与草稿准备成功。Windows 172 项测试通过；Ubuntu 170 项通过、2 项 Windows 专项跳过。两平台各 39 项 fixture 浏览器和 27 项 SDK iframe 通过，[Pages 42466429578](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42466429578) 部署成功。
- Windows 首轮图片验收失败；本地同版实际包的完整 PRTS 复测通过后，重跑该次 Check 的失败作业，第 2 次运行完成真实 117 部目录、64 块正文、1500×844 CG 及记录保存／重开／清缓存／模拟卸载保留验证，未跳过检查。两次日志保留于 `.ai/local/delivery-1.1.4/`；不能仅据首轮缺少错误详情的返回认定具体网络根因。
- [1.1.4 Release](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/releases/tag/v1.1.4) ID `438150329`，三个附件齐全，tgz 为 8,025,929 字节。v1.1.4 固定标签记录同一源码、dirty=false、integrity 与原 Check 第 2 次运行；已核对草稿标题和正文与该提交的版本说明一致。1.1.3 草稿与原三个附件 ID／体积／digest 均未变。1.1.4 已于 2026-11-08 公开，[Publish 42469568159](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42469568159) 成功；远端 `dd44ea9` 回写精确 marketplace 与 [1.1.4 回执](../docs/releases/1.1.4.json)，正式来源及 npm latest 为 1.1.4。浏览器／SDK fixture 不代替真实桌面 URI 跳转结论，当前用户安装未替换。

## 跳过 1.1.3

1.1.3 按已确认规则保留未发布，后续 1.1.4 已公开。保留 [1.1.3 草稿](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/releases/tag/untagged-092bb25f7780a44b621f)、v1.1.3 标签和三个附件，固定源码为 `7fddc89e0a21a3db48fbfa0624d5169742aa9b35`，不覆盖或替换。原验收见 [Check 42462612021](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42462612021)，该版改动已包含在后续源码中。

## 搜索卡片高度修复

修复提交为 `8e026320c232e4e4a85327dc342a202a93d7ab1b`，已连同文档精简合入最新 main，以 **1.1.2** 交付。远端 1.0.1／1.1.0／1.1.1 的发布回执和正式来源更新已保留。inline 结果按内容提供自然高度，fullscreen／正文保留受限视口；宿主实际显示模式与主题同步布局。复现方法见 [修复说明](../docs/search-card-height-fix.md)。

- Windows Edge 157.0.4341.42 的 SDK iframe 检查 18 项通过，覆盖延迟结果、错误重试、连续更新、分页、显示模式、卡片进入与返回、四种窗口、双主题、键盘及减少动态效果。
- 类型检查、168 项单元／协议测试和格式检查分别通过。
- 修复版尚待真实桌面操作；已冻结的 1.1.1 归档不含此修复。

## 上一版：1.1.2 已公开

该版 package／lock／plugin／源码版本为 1.1.2，固定验收源码为 `4ebce5660234ab811f3642263c27a209131a00be`。[Check 42460035613](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42460035613) 的 Ubuntu、同提交 Windows 验收及草稿准备全部成功；[Pages 42460035698](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42460035698) 的检查与部署成功。

- Windows 类型／169 项／格式、源码外实际包与冷缓存离线安装、三种 MCP 入口和两份 UI、真实 117 部目录／64 块正文／1500×844 CG、记录保存／重开／清缓存／模拟卸载保留均通过。Windows 与 Ubuntu 的 39 项 fixture 浏览器、18 项 SDK iframe 回归分别通过；Ubuntu 单元测试为 167 项通过、2 项 Windows 锁定专项按平台跳过。
- [1.1.2 Release](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/releases/tag/v1.1.2) ID `438108095`，三个附件齐全，tgz 为 8,023,998 字节。v1.1.2 标签指向固定源码 4ebce56，标签内版本、dirty=false、integrity 与 CI 运行已核对；原有四个 Release 的附件 ID／体积／digest 均未变。
- 1.1.2 已于 2026-11-08 公开；[Publish 42462147645](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42462147645) 第 2 次运行已成功。main 的 `17f5368` 回写了精确 marketplace 与 [1.1.2 回执](../docs/releases/1.1.2.json)，正式来源及 npm latest 均为 1.1.2。复测和已验收边界见 [修复说明](../docs/search-card-height-fix.md)，原始回执与摘要仅留在 `.ai/local/delivery-1.1.2/`。

npm 明确版本的 404 可见性等待从五分钟调整为 20 分钟，Publish release 作业总时限从 15 调整为 30 分钟；查询成功即继续。已存在版本的 latest 回读仍限五分钟，权限／JSON／integrity 错误仍立即失败。调整依据为 1.1.0 的 Validating 超过原等待预算，重跑后完成发布；这不是 npm 的统一时限。内容见 [1.1.2 说明](../docs/releases/1.1.2-notes.md)。

## 发布交接

以下为 2026-11-08 最近一次已记录的验收结果；远端最新状态应核对对应 Release 与工作流。

| 对象           | 已记录结果                                                                                             | 依据                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1.1.1 固定归档 | GitHub／npm／正式来源及回执发布成功；固定源码 `baf8ee32bc79c37649f7e8ca49b744f990a64271`；不含高度修复 | [Publish 42459507527](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42459507527) |
| 1.1.2 固定归档 | GitHub／npm latest／正式来源及回执均已发布成功                                                         | [Publish 42462147645](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42462147645) |
| 1.1.4 固定归档 | GitHub／npm latest／正式来源及回执均已发布成功 | [Publish 42469568159](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42469568159) |
| 网站           | 网页真实阅读入口的专项检查、构建与部署通过                                                                       | [Pages 42474015572](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42474015572)   |
| 正式来源       | `.agents/plugins/marketplace.json` 与 npm latest 均为 1.1.4；1.1.3 保留未发布            | [来源目录](../.agents/plugins/marketplace.json)                                                              |

GitHub Release 公开与 npm／正式来源发布完成分别核对。[1.1.1 变更说明](../docs/releases/1.1.1-notes.md)保留该版搜索卡片的已知问题。已有标签与附件保持冻结，新变更使用新版本，不替换同名归档。

## 验证边界

- SDK iframe、浏览器、MCP 协议、包安装与真实桌面操作分别记录，不能互相代替。
- 当前搜索高度修复尚无真实桌面验收结论；macOS／Linux 及其他 MCP Apps 宿主也未实机验收。
- 已有验证基于 Windows x64、Node 26.13.0／npm 12.2.1。可复现命令见 [验证指南](../docs/testing.md)，原始日志、截图和临时数据仅保存在被忽略的本机目录。
