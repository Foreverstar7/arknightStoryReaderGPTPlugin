# 当前状态

更新：2026-11-06。源码版本 **0.1.26**，npm 尚未发布，稳定 marketplace 为空，GitHub 仓库为 private。

## 当前实现

- 阅读器具备七类目录、三页导航、全部分支、按需图片、本机续读、字数进度和独立缓存管理。
- 正式入口使用系统 Node，只支持 PRTS；npm 包内嵌生产依赖。源码与独立开发副本保留 fixture。
- 普通 push／PR 已接入 Ubuntu Check；标签候选发布保留 Windows 验收；稳定来源由人工提升。标签发布和稳定提升尚未实跑。
- 文档按当前实现整理，设计预览复用正式 UI。图片回归样本位于 tests/fixtures/prts-image-baseline.json。

## 验证

Windows x64、Node 26.13.0／npm 12.2.1 已有包协议、真实 PRTS 小样本、fixture 浏览器和隔离 CLI 加载器证据。真实 npm 安装、完整桌面阅读、异机及其他平台仍待验收。

本次整理已通过 `npm run check`（110 项测试）、回归样本完整等价核对与文档本地链接检查。当前预览在 Edge 完成双主题、四种窗口的三页导航，以及立绘、CG、键盘设置与最近阅读恢复检查；无页面溢出或控制台错误。

本地检查记录位于 `.ai/local/docs-current-check.log`、`current-docs-check.json` 和 `current-doc-preview/`。Ubuntu 的类型／测试、构建、离线包验证和 fixture 浏览器结果见 [main 分支 Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/workflows/check.yml?query=branch%3Amain)，包验证报告随该次运行保存。正式发布使用下述已重新打包并验收的归档；若发行内容改变，须重新打包、验收。

## 发布前准备

2026-11-06 已确认原创代码采用 MIT，新增 LICENSE（Foreverstar7 署名），同步 package／lock、README、发布指南及实际包验收规则。许可变更已按授权提交并推送 main：`f17597ff5ba344c520f996797dcf95b3a2f4f7a9`，作者与提交者均为 Foreverstar7 与个人邮箱。游戏与 PRTS 内容不受该许可授权，第三方依赖保留各自许可。

本机 Windows x64 使用 Node 26.13.0／npm 12.2.1，从该提交的干净工作区运行 `./scripts/npm.ps1 run package`，重新生成 `.local/releases/arknights-story-reader-0.1.26.tgz`（7,923,564 字节）。`.local/releases/release.json` 记录该 sourceCommit 与 `dirty: false`；后续仅更新协作记录，不改变该发行物的源码或内容。

`./scripts/npm.ps1 run package:verify` 与 `./scripts/npm.ps1 run package:verify '--' --prts` 均通过，直接验收本次实际 tgz。确认 MIT 元数据和 LICENSE、生产依赖、协议／HTML、全新 npm 缓存离线加载；真实 PRTS 小样本取得 117 部目录、64 个正文块及 1500×844 图片，保存／重开、最后与最远位置分离、清缓存及移除程序后保留外部记录均通过。报告为 `.local/releases/verification-offline.json`、`verification-prts.json`，完整本机命令日志与摘要位于 `.ai/local/release-0.1.26-*`。这些检查不替代已发布 npm 包的真实 Codex 桌面验收。

该源码提交的 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42185883021) 已通过：110 项单测、34 项浏览器测试、类型／格式、构建及实际包离线验证；未重复运行本机应用测试。同日 npm registry 对 `arknights-story-reader` 的只读查询返回 404，未见已发布包，首次创建权限仍待 npm 发布时校验。按本轮要求，仓库仍为 private，未推版本标签、未发布 npm、未提升稳定目录。

## Git 与接续

Git 历史已移除旧截图，并将作者／提交者统一为 Foreverstar7 与个人邮箱；姓名改写不改变文件内容、提交日期或说明。恢复 bundle、工作区快照和核对结果保存在已忽略的 `.local/history-cleanup/20261106/` 与 `identity-20261106/`。

源码、分发、文档与 Ubuntu Check 已在 main。其他电脑有旧克隆时，应保存未提交工作后重新 clone，不合并或推回旧历史。

提交／推送许可变更与本机重打包验收已完成。下一步等待发布者明确授权仓库公开及首次 npm 发布，再按 [发布指南](../docs/releasing.md)完成本机交互登录／2FA、首次发布、OIDC 和真实桌面验收。搜索与官网见 [PLAN](PLAN.md)。
