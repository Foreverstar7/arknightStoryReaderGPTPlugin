# 当前状态

更新：2026-11-08。功能范围以 [需求](../docs/requirements.md)为准，待办见 [PLAN](PLAN.md)，发布操作见 [发布指南](../docs/releasing.md)。

## 实现状态

- 阅读器已具备七类目录、三页导航、全部分支、按需图片、本机续读、字数进度和独立缓存管理。姓名与场景资源分开处理，立绘匹配及限制见 [立绘说明](../docs/portrait-speaker-evidence.md)。
- 基础剧情搜索已实现：唯一模型可见工具为 `reader_search`，支持剧情名称、篇目编号／标题、PRTS 人物实际出场；其余十一项工具仅供页面使用。搜索卡片进入篇章目录，简介只在目录中展示。
- 网站包含侧栏浏览与对话搜索的滚动演示、占位阅读器和安装指南。构建与维护见 [网站说明](../docs/website.md)。

## 搜索卡片高度修复

修复提交为 `8e026320c232e4e4a85327dc342a202a93d7ab1b`，已连同文档精简合入最新 main，以 **1.1.2** 交付。远端 1.0.1／1.1.0／1.1.1 的发布回执和正式来源更新已保留。inline 结果按内容提供自然高度，fullscreen／正文保留受限视口；宿主实际显示模式与主题同步布局。复现方法见 [修复说明](../docs/search-card-height-fix.md)。

- Windows Edge 157.0.4341.42 的 SDK iframe 检查 18 项通过，覆盖延迟结果、错误重试、连续更新、分页、显示模式、卡片进入与返回、四种窗口、双主题、键盘及减少动态效果。
- 类型检查、168 项单元／协议测试和格式检查分别通过。
- 修复版尚待真实桌面操作；已冻结的 1.1.1 归档不含此修复。

## 当前交付：1.1.2 草稿已验收

package／lock／plugin／源码版本已统一为 1.1.2，固定验收源码为 `4ebce5660234ab811f3642263c27a209131a00be`。[Check 42460035613](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42460035613) 的 Ubuntu、同提交 Windows 验收及草稿准备全部成功；[Pages 42460035698](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42460035698) 的检查与部署成功。

- Windows 类型／169 项／格式、源码外实际包与冷缓存离线安装、三种 MCP 入口和两份 UI、真实 117 部目录／64 块正文／1500×844 CG、记录保存／重开／清缓存／模拟卸载保留均通过。Windows 与 Ubuntu 的 39 项 fixture 浏览器、18 项 SDK iframe 回归分别通过；Ubuntu 单元测试为 167 项通过、2 项 Windows 锁定专项按平台跳过。
- [1.1.2 草稿](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/releases/tag/untagged-1929afdd88a3fccb29fc) ID `438108095`，三个附件齐全，tgz 为 8,023,998 字节。v1.1.2 标签指向固定源码 4ebce56，标签内版本、dirty=false、integrity 与 CI 运行已核对；原有四个 Release 的附件 ID／体积／digest 均未变。
- 1.1.2 尚未 Publish，npm latest／正式来源仍为 1.1.1。本轮没有替换已安装开发插件或共享预览；本地完整 check、Edge 18 项和 actionlint 也已通过。复测和已验收边界见 [修复说明](../docs/search-card-height-fix.md)，原始回执与摘要仅留在 `.ai/local/delivery-1.1.2/`。

npm 明确版本的 404 可见性等待从五分钟调整为 20 分钟，Publish release 作业总时限从 15 调整为 30 分钟；查询成功即继续。已存在版本的 latest 回读仍限五分钟，权限／JSON／integrity 错误仍立即失败。调整依据为 1.1.0 的 Validating 超过原等待预算，重跑后完成发布；这不是 npm 的统一时限。内容见 [1.1.2 说明](../docs/releases/1.1.2-notes.md)。

## 发布交接

以下为 2026-11-08 最近一次已记录的验收结果；远端最新状态应核对对应 Release 与工作流。

| 对象           | 已记录结果                                                                                             | 依据                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1.1.1 固定归档 | GitHub／npm／正式来源及回执发布成功；固定源码 `baf8ee32bc79c37649f7e8ca49b744f990a64271`；不含高度修复 | [Publish 42459507527](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42459507527) |
| 网站           | 1.1.2 源码的构建、10 项专项检查与部署通过                                                              | [Pages 42460035698](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42460035698)   |
| 正式来源       | `.agents/plugins/marketplace.json` 与 npm latest 均为 1.1.1，正式发布 1.1.2 后才自动更新               | [来源目录](../.agents/plugins/marketplace.json)                                                              |

GitHub Release 公开与 npm／正式来源发布完成分别核对。[1.1.1 变更说明](../docs/releases/1.1.1-notes.md)保留该版搜索卡片的已知问题。已有标签与附件保持冻结，修复使用 1.1.2，不替换同名归档。

## 验证边界

- SDK iframe、浏览器、MCP 协议、包安装与真实桌面操作分别记录，不能互相代替。
- 当前搜索高度修复尚无真实桌面验收结论；macOS／Linux 及其他 MCP Apps 宿主也未实机验收。
- 已有验证基于 Windows x64、Node 26.13.0／npm 12.2.1。可复现命令见 [验证指南](../docs/testing.md)，原始日志、截图和临时数据仅保存在被忽略的本机目录。
