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

本地检查记录位于 `.ai/local/docs-current-check.log`、`current-docs-check.json` 和 `current-doc-preview/`。Ubuntu 的类型／测试、构建、离线包验证和 fixture 浏览器结果见 [main 分支 Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/workflows/check.yml?query=branch%3Amain)，包验证报告随该次运行保存。正式发布须重新打包并完成发布验收。

## 发布前准备

2026-11-06 已确认原创代码采用 MIT，新增 LICENSE（Foreverstar7 署名），同步 package／lock、README、发布指南及实际包验收规则。游戏与 PRTS 内容不受该许可授权，第三方依赖保留各自许可。

`./scripts/npm.ps1 exec '--' prettier --check package.json scripts/verify-package.ts` 通过。`./scripts/npm.ps1 pack --dry-run --ignore-scripts --offline --json --logs-max=0` 通过，确认 LICENSE 收入包清单，package／lock 均为 MIT；清单位于 `.ai/local/license-pack-dry-run.json`。本轮未生成发布 tgz，更新后的实际包验收规则待最终源码重新打包后执行；应用测试复用现有有效证据。

同日 npm registry 对 `arknights-story-reader` 返回 404，未见已发布包，首次创建权限仍待 npm 发布时校验。远端 main 为 `daefa320a3167b0e8ff0d7f027ae18daf0acdfa2`，对应 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42179974525) 成功。许可变更尚未提交／推送，仓库仍为 private。

## Git 与接续

Git 历史已移除旧截图，并将作者／提交者统一为 Foreverstar7 与个人邮箱；姓名改写不改变文件内容、提交日期或说明。恢复 bundle、工作区快照和核对结果保存在已忽略的 `.local/history-cleanup/20261106/` 与 `identity-20261106/`。

源码、分发、文档整理与 Ubuntu Check 纳入本次提交，不创建发布标签。其他电脑有旧克隆时，应保存未提交工作后重新 clone，不合并或推回旧历史。

下一步经发布者授权提交／推送许可变更，确认仓库公开时机，再按 [发布指南](../docs/releasing.md)从最终源码重新打包验收，完成首次本机发布、OIDC 和真实桌面验收。搜索与官网见 [PLAN](PLAN.md)。
