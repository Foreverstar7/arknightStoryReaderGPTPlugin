# 当前状态

更新：2026-11-08。功能范围以 [需求](../docs/requirements.md)为准，待办见 [PLAN](PLAN.md)，发布操作见 [发布指南](../docs/releasing.md)。

## 实现状态

- 阅读器已具备七类目录、三页导航、全部分支、按需图片、本机续读、字数进度和独立缓存管理。姓名与场景资源分开处理，立绘匹配及限制见 [立绘说明](../docs/portrait-speaker-evidence.md)。
- 基础剧情搜索已实现：唯一模型可见工具为 `reader_search`，支持剧情名称、篇目编号／标题、PRTS 人物实际出场；其余十一项工具仅供页面使用。桌面搜索卡片通过官方深链进入同一安装来源的侧栏阅读器，保留命中篇目标记；其他宿主保留当前容器阅读。结果页保留失败重试和分页，不显示常驻“刷新搜索资料”按钮。深链身份、协议和验证见 [侧栏跳转](../docs/sidebar-reader-links.md)。
- 网站包含侧栏浏览与对话搜索的滚动演示、占位阅读器和安装指南。构建与维护见 [网站说明](../docs/website.md)。

## 当前交付：1.1.4

package／lock／plugin／源码版本统一为 1.1.4。新增桌面搜索到侧栏的深链、已有阅读器的导航处理，以及从固定验收提交自动填写 Release 草稿标题／正文。包含 1.1.3 的按钮精简，不新增模型工具或设置入口。变更说明见 [1.1.4](../docs/releases/1.1.4-notes.md)，后续发布操作见 [发布指南](../docs/releasing.md)。

- 本地 `./scripts/npm.ps1 run check`、`run build` 通过，包含 172 项单元／协议测试与格式检查。发行文案回归用真实隔离 Git 提交验证固定来源、错版／空白拒绝和已有草稿恢复保留文案。
- `run package` 与 `run package:verify` 通过：实际 tgz 在源码外解包，冷缓存离线安装、生产依赖、三种 MCP 入口和两份 UI 一致。`run plugin:prepare` 已生成 1.1.4 开发副本，开发 mcp.json 的目标身份与其 marketplace 一致；`run probe:host -- --isolated` 验证本机加载器的 12 项工具、唯一模型搜索和 global 入口。该探针只安装到隔离配置，未替换当前用户安装。
- Edge 的 fixture 浏览器 39 项及 SDK iframe 27 项通过，使用独立端口和原创记录。新增的 9 项覆盖正式／开发身份、首次与重复链接、慢初始化中更新目标、保存排队／失败重试、最新目标、坏链接、宿主拒绝，以及四种窗口双主题。已查看 320×760、768×900、1440×960、1024×400 的生成截图，篇目轴、命中标记、键盘和减少动态效果保持原有布局。
- 固定工具链 Node 的 `--import tsx scripts/probe-search.ts` 通过：真实剧情名称、R8-1、塔露拉出场及导语可查，断网重开复用缓存，阅读记录不变且正文下载为零。报告位于 `.ai/local/story-search/live-1794128870214/report.json`；UI 报告、截图和 trace 位于 `.ai/local/search-card-check/`。
- 推送后由现有 Check 对固定提交进行 Ubuntu 检查和 Windows 发包验收，再准备 1.1.4 草稿。浏览器／SDK fixture 不代替真实 ChatGPT 桌面处理 URI 的实机结论；本轮不自动安装或 Publish。

## 跳过 1.1.3

用户已确认 **1.1.3 不 Publish，后续只发布 1.1.4**。保留 [1.1.3 草稿](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/releases/tag/untagged-092bb25f7780a44b621f)、v1.1.3 标签和三个附件，固定源码为 `7fddc89e0a21a3db48fbfa0624d5169742aa9b35`，不覆盖或替换。原验收见 [Check 42462612021](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42462612021)，该版改动已包含在后续源码中。

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
| 网站           | 1.1.3 源码的检查、构建与部署通过                                                                       | [Pages 42462612047](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42462612047)   |
| 正式来源       | `.agents/plugins/marketplace.json` 与 npm latest 均为 1.1.2；1.1.3 为已验收草稿                        | [来源目录](../.agents/plugins/marketplace.json)                                                              |

GitHub Release 公开与 npm／正式来源发布完成分别核对。[1.1.1 变更说明](../docs/releases/1.1.1-notes.md)保留该版搜索卡片的已知问题。已有标签与附件保持冻结，新变更使用新版本，不替换同名归档。

## 验证边界

- SDK iframe、浏览器、MCP 协议、包安装与真实桌面操作分别记录，不能互相代替。
- 当前搜索高度修复尚无真实桌面验收结论；macOS／Linux 及其他 MCP Apps 宿主也未实机验收。
- 已有验证基于 Windows x64、Node 26.13.0／npm 12.2.1。可复现命令见 [验证指南](../docs/testing.md)，原始日志、截图和临时数据仅保存在被忽略的本机目录。
