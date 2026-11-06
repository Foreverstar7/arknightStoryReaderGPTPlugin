# 当前状态

更新：2026-11-06。正式版目标保持 **1.0.0**。本轮修复基于 `21d196d`，该提交的 Ubuntu Check 已通过；按用户明确授权重建的未发布标签 `v1.0.0` 仍指向该提交。第二次 Windows 标签验收在离线包验证阶段报告 `EBUSY`，npm 发布跳过。本次交付已在本地验证的验收进程回收与错误保留修复，八个文件已获统一提交／推送授权，下一步核验该次 Ubuntu Check；标签尚未再次移动。已发布 **0.1.26** 的 next／latest 指向和 registry integrity 沿用下方首次发布及交接核验。稳定 marketplace 仍为空，GitHub 仓库为 public。

## 当前接续：Windows 验收进程回收

- 首次 [Windows 标签验收](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42223826659) 因 `tar -C` 丢失中文目标路径失败。本机复现后，改用进程 `cwd` 并先解析归档绝对路径，保留相对输入、中文目录覆盖及 package/ 条目限制。该修复已提交并推送为 `21d196d79da38910b047bd1f9849e60d385203ad`，[Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42226576247) 通过。
- 经用户明确授权，未发布的 `v1.0.0` 已从 `30ad8b1` 重建到 `21d196d`，新注释标签对象为 `e14969e3e1f1059e9f38a69e1308a2439bfe9a38`。操作前 npm 1.0.0 返回 404。第二次 [Windows 标签验收](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42227719463) 的源码检查、构建和打包通过，离线包验收清理临时目录时报告 `EBUSY`；publish 为 skipped，没有待审批部署。本轮未重跑该 CI 或执行 npm 发布。
- 旧脚本的 finally 清理可能覆盖前面的失败，因此旧 CI 日志无法证明最初失败的阶段。本机以真实子进程复现：握手超时后 SDK 异步关闭尚未完成，目录清理会抢先执行；加入等待实际 onclose 后该回归通过。这是已证实的清理竞争，不把它当作已查明 CI 原始错误的证据。
- 本地验收脚本现在先登记连接所有权，失败时也回收；等待 SDK 的实际关闭事件后清理，短暂 Windows 锁使用 Node 原生有限重试。原始错误、关闭错误和清理错误一起保留，持续锁定仍失败。新增阶段／耗时日志，成功报告在清理完成后写入。未改阅读器运行代码、依赖、版本或发布工作流。
- 固定 Node 26.13.0／npm 12.2.1 下，定向 12/12、完整 `./scripts/npm.ps1 run check` 的 117 项测试／类型／格式通过；隔离 npm tgz 子进程主动中断后清理的探针也通过。原 tgz 的离线复验成功，原归档／回执已备份到 `.ai/local/release-1.0.0/windows-cleanup-fix/`。
- 本轮 `./scripts/npm.ps1 run package` 已重建本地预检包（7,924,858 字节），回执为 `sourceCommit: 21d196d`、`dirty: true`。新包离线验收通过：2,776 个文件、10 个 app-only 工具、global 入口、533,175 字节 HTML、全新缓存离线 npm 启动及临时目录清理。对同一 tgz 增加 `--prts` 在正常本机环境通过：117 部目录、64 个正文块、1500×844 图片、保存／重开、最后与最远位置分离、清缓存及模拟卸载后保留外部记录。所有记录均为隔离测试数据。
- `PLAYWRIGHT_CHANNEL=msedge` 下运行 `./scripts/npm.ps1 run test:e2e`，正常本机环境 34/34 通过。受限环境首次运行停在测试服务监听之前，已主动中止并确认相关进程退出、端口释放；不计为通过。此轮使用 Edge，最终 Windows CI 使用 Chromium，真实 Codex 桌面验收仍未完成。日志、包回执、报告与归档哈希汇总位于 `.ai/local/release-1.0.0/windows-cleanup-fix/`。
- Windows 本地预检步骤已补入 [验证指南](../docs/testing.md#windows-本地候选预检)，可先在本机排查，再执行最终标签 CI。用户已授权统一提交／推送本轮八个修复与交接文件，使用本机默认个人 Git 署名，不改 Git 配置；下一步核验 Ubuntu Check。再次更新标签、npm 发布与稳定提升仍分别等待用户明确确认。

## 已完成：1.0.0 原归档本地预检

- 使用固定 Node 26.13.0／npm 12.2.1 执行 `./scripts/npm.ps1 run release:version '--' 1.0.0`，统一 package、lock 两处、plugin 与源码共五处版本声明。锁文件保留原键顺序，依赖版本和 integrity 未变，稳定 marketplace 未改。版本选择依据见 [DECISIONS](DECISIONS.md#首个正式稳定版目标2026-11-06)。
- `./scripts/npm.ps1 run check` 在 1.0.0 下通过：类型、110 项测试和格式检查；`./scripts/npm.ps1 run package` 的完整构建也通过。命令日志为 `.ai/local/release-1.0.0/check.log` 和 `package.log`。
- 新归档为 `.local/releases/arknights-story-reader-1.0.0.tgz`（7,924,744 字节）。`release.json` 记录 sourceCommit 为 `8fd5a58`、`dirty: true`，因为打包时升版改动尚未提交；这是本地预检包。验收前后独立计算的 SHA-512 与回执一致，同一归档未被替换。
- `./scripts/npm.ps1 run package:verify '--' '.local/releases/arknights-story-reader-1.0.0.tgz'` 通过：仓库外解包、MIT 许可、完整生产依赖、无开发／私人内容、10 个 app-only 工具、global 入口、533,175 字节 UI HTML 与全新 npm 缓存离线加载；归档含 2,776 个文件，未运行安装脚本。
- 对同一归档增加 `--prts` 的验收直接在沙箱外运行，沿用上轮已验证的运行方式，通过。真实 PRTS 小样本取得 117 部目录、首篇 64 块及 1500×844 图片，最后／最远位置分离、保存／重开、清缓存与模拟移除包后保留外部记录均通过，全部使用隔离临时数据。
- 原包报告与回执的副本、完整命令日志、归档哈希和汇总位于 `.ai/local/release-1.0.0/`。该阶段的本地包验收未运行浏览器或真实 Codex 桌面验收，未操作私人阅读记录，也未发布 npm。

上述预检后、`30ad8b1` 提交前仅调整了 README 与协作 Markdown 的正式版文案，运行代码和安装命令未变。README 标明“1.0.0 为首个正式版”的版本定位及稳定来源安装条件，临时发布进度统一留在本页与 GitHub Release。当时按用户要求，纯文案调整没有重复测试、打包或 PRTS 验收。上述 7,924,744 字节归档及回执现已备份至 `.ai/local/release-1.0.0/windows-cleanup-fix/original-*`；本轮本地重建包另见顶部。最终候选仍由标签 CI 从干净提交重新构建并验收，不将本地预检归档直接用于发布。

此前未提交／发布的 0.1.27 仅完成本地预检，已由 1.0.0 目标取代。其 tgz 仍保留在 `.local/releases/`，原回执、离线／PRTS 报告、首次沙箱网络失败及成功复验日志均保存在 `.ai/local/release-0.1.27/`；不再将该版本作为本轮候选目标。

## 当前实现

- 阅读器具备七类目录、三页导航、全部分支、按需图片、本机续读、字数进度和独立缓存管理。
- 正式入口使用系统 Node，只支持 PRTS；npm 包内嵌生产依赖。源码与独立开发副本保留 fixture。
- 普通 push／PR 使用 Ubuntu Check；版本标签在 Windows 构建和验收，npm 发布 job 在 Ubuntu 上传同一 tgz，并绑定唯一的 `npm-production` environment。未配置 macOS 或三平台验收矩阵。
- 稳定提升由 `workflow_dispatch` 手动触发，要求真实宿主验收确认，核对标签／回执／registry integrity 后固定精确 npm 版本，不绑定 environment。
- 文档按当前实现整理，设计预览复用正式 UI。图片回归样本位于 tests/fixtures/prts-image-baseline.json。

## 验证

Windows x64、Node 26.13.0／npm 12.2.1 已有包协议、真实 PRTS 小样本、fixture 浏览器和隔离 CLI 加载器证据。真实 npm 安装、完整桌面阅读、异机及其他平台仍待验收。

1.0.0 准备提交已有 `npm run check`（110 项基线测试）、回归样本完整等价核对与文档本地链接检查记录；本次新增归档回归及定向结果见顶部。预览在 Edge 完成双主题、四种窗口的三页导航，以及立绘、CG、键盘设置与最近阅读恢复检查；无页面溢出或控制台错误。

本地检查记录位于 `.ai/local/docs-current-check.log`、`current-docs-check.json` 和 `current-doc-preview/`。Ubuntu 的类型／测试、构建、离线包验证和 fixture 浏览器结果见 [main 分支 Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/workflows/check.yml?query=branch%3Amain)，包验证报告随该次运行保存。后续发行内容改变时，须使用新版本号重新打包、验收，不覆盖已发布的 0.1.26。

## 首次发布与验证

原创代码采用 MIT，LICENSE 署名为 Foreverstar7，package／lock 的许可字段一致。游戏与 PRTS 内容不受该许可授权，第三方依赖保留各自许可。

已发布包由首次发布电脑 Windows x64 使用 Node 26.13.0／npm 12.2.1，从源码提交 `f17597ff5ba344c520f996797dcf95b3a2f4f7a9` 的干净工作区运行 `./scripts/npm.ps1 run package` 生成。该机归档为 `.local/releases/arknights-story-reader-0.1.26.tgz`（7,923,564 字节），`.local/releases/release.json` 记录 sourceCommit 与 `dirty: false`。已发布归档保持不变，下方 0.1.26 的本机证据路径均指首次发布电脑，不要求搬运到本机。

`./scripts/npm.ps1 run package:verify` 与 `./scripts/npm.ps1 run package:verify '--' --prts` 均通过，直接验收本次实际 tgz。确认 MIT 元数据和 LICENSE、生产依赖、协议／HTML、全新 npm 缓存离线加载；真实 PRTS 小样本取得 117 部目录、64 个正文块及 1500×844 图片，保存／重开、最后与最远位置分离、清缓存及移除程序后保留外部记录均通过。报告为 `.local/releases/verification-offline.json`、`verification-prts.json`，完整本机命令日志与摘要位于 `.ai/local/release-0.1.26-*`。这些检查不替代已发布 npm 包的真实 Codex 桌面验收。

该源码提交的 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42185883021) 已通过：110 项单测、34 项浏览器测试、类型／格式、构建及实际包离线验证；未重复运行本机应用测试。未推版本标签、未提升稳定目录。

registry 核验确认 `arknights-story-reader@0.1.26` 公开可用，next 与 latest 均指向 0.1.26，维护者和发布者为 `foreverstar7`，SHA-512 integrity 与本机验收归档记录一致。结果位于 `.ai/local/release-0.1.26-registry.json`。GitHub 仓库为 public，匿名读取 main 的 LICENSE 已通过。

已通过 GitHub REST GET 独立核验唯一的 `npm-production` 环境：Required reviewer 为 Foreverstar7，允许自审，管理员不能绕过。用户提供的 npm 网页截图确认 trusted publisher 对应 `Foreverstar7/arknightStoryReaderGPTPlugin`、`release.yml` 和 `npm-production`，允许 `npm publish` 与 `npm stage publish`，状态为 `Pending validation`；须在 2026-11-08 12:11 UTC（北京时间 20:11）前完成首次成功发布。标签验收已实跑但解压失败，OIDC 与稳定提升尚未执行；已发布 npm 包的真实 Codex 桌面验收仍未完成。0.1.26 归档中的 README 保留打包时的“未发布”提示；源码文案已更新，不替换已发布归档。

上轮发布配置整理时使用项目固定 Node 执行 `.ai/local/check-release-config.mjs`：3 份 workflow 的 YAML 解析、单一 environment 绑定、工作流改动范围和 19 个 Markdown 相对文件链接检查通过；报告为 `.ai/local/release-config-check.json`。普通检查与候选发布工作流未改动，稳定提升仅移除 environment 绑定，其手动触发、宿主确认和并发控制保持原值。此记录对应当时的本地静态配置校验，该次配置整理未重跑应用测试。

README 的 Quick Start 稳定安装与升级／卸载说明位于本地开发说明之前，发行与验收状态引用本页，来源收录条件位于安装命令之前。Markdown 解析、19 个相对文件链接、2 个页内锚点和 4 个入站 README 标题链接检查通过，6 个命令块内容与已提交版本一致，仅调整顺序；报告为 `.ai/local/readme-check.json`。

## Git 与接续

Git 历史已移除旧截图，并将作者／提交者统一为 Foreverstar7 与个人邮箱；姓名改写不改变文件内容、提交日期或说明。当时的恢复 bundle、工作区快照和核对结果保存在首次发布电脑已忽略的 `.local/history-cleanup/20261106/` 与 `identity-20261106/`，本机接续不要求搬运旧归档。

已发布包的源码提交在 main 历史中。本机原 main 停在清理前的旧历史，`pull --ff-only` 抓取成功但不能快进；核实工作区干净并取得用户明确授权后，已用 `git reset --keep origin/main` 对齐远程 `8fd5a58ae39ae7340364ddf44a9357602b534dc6`。未恢复、合并或推回旧历史，未创建额外 clone 或 worktree，未操作私人阅读记录。

1.0.0 准备提交 `30ad8b1` 与路径兼容修复 `21d196d` 均已按用户授权提交／推送，使用本机默认个人 Git 署名，未修改 Git 配置；两次 Ubuntu Check 均通过。按用户另行明确授权，未发布标签 `v1.0.0` 已重建为对象 `e14969e3e1f1059e9f38a69e1308a2439bfe9a38`，指向 `21d196d`，该次 Windows 验收失败，详见顶部。本轮进程回收与错误保留修复已完成本地预检，并获统一提交／推送授权；标签尚未再次移动，npm 发布与稳定提升未操作。未修改已发布的 0.1.26 归档。未完成事项见 [PLAN](PLAN.md)，当前操作规则见 [发布指南](../docs/releasing.md)。
