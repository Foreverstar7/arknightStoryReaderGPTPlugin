# 当前状态

更新：2026-11-06。源码版本 **0.1.26**，npm 尚未发布，稳定 marketplace 为空，GitHub 仓库为 private。

## 当前实现

- 阅读器具备七类目录、三页导航、全部分支、按需图片、本机续读、字数进度和独立缓存管理。
- 正式入口使用系统 Node，只支持 PRTS；npm 包内嵌生产依赖。源码与独立开发副本保留 fixture。
- 普通 push／PR 在 Ubuntu 检查；标签候选发布保留 Windows 验收；稳定来源由人工提升。三个工作流已实现，远程尚未实跑。
- 文档按当前实现整理，设计预览复用正式 UI。图片回归样本位于 tests/fixtures/prts-image-baseline.json。

## 验证

Windows x64、Node 26.13.0／npm 12.2.1 已有包协议、真实 PRTS 小样本、fixture 浏览器和隔离 CLI 加载器证据。真实 npm 安装、完整桌面阅读、异机及其他平台仍待验收。

本次整理已通过 `npm run check`（110 项测试）、回归样本完整等价核对与文档本地链接检查。当前预览在 Edge 完成双主题、四种窗口的三页导航，以及立绘、CG、键盘设置与最近阅读恢复检查；无页面溢出或控制台错误。

检查记录位于 `.ai/local/docs-current-check.log`、`current-docs-check.json` 和 `current-doc-preview/`。Ubuntu Check 的实际运行待推送后验证。现有 tgz 未包含本次文档整理，发布前须重新打包验收。

## Git 与接续

Git 历史已移除旧截图，并将作者／提交者统一为 Foreverstar7 与个人邮箱；姓名改写不改变文件内容、提交日期或说明。恢复 bundle、工作区快照和核对结果保存在已忽略的 `.local/history-cleanup/20261106/` 与 `identity-20261106/`。

源码、分发、文档整理与 Ubuntu Check 纳入本次提交，不创建发布标签。其他电脑有旧克隆时，应保存未提交工作后重新 clone，不合并或推回旧历史。

下一步由发布者确认包名权限、代码许可与公开时机，再按 [发布指南](../docs/releasing.md)完成首次本机发布、OIDC 和真实桌面验收。搜索与官网见 [PLAN](PLAN.md)。
