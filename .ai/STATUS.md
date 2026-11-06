# 当前状态

更新：2026-11-06。正式版目标保持 **1.0.0**。进程回收修复 `7833ace` 的 Ubuntu Check 已通过；第三次 Windows 标签验收基于该提交，保留了原始错误：`npx` 初始化超出 SDK 默认 60 秒，关闭与清理均通过，npm 发布跳过。本次交付 npm 离线准备／MCP 握手分离及验收复核修复，本地完整 check 的 118 项测试与同一 tgz 的真实 PRTS 复验通过。用户已授权持续修复、提交／推送及更新仍未发布的候选标签，直到服务器 Windows Release 验收通过；npm 发布仍由用户网页审批。已发布 **0.1.26** 的 next／latest 指向和 registry integrity 沿用下方首次发布及交接核验。稳定 marketplace 仍为空，GitHub 仓库为 public。

## 当前接续：npm 离线准备与 MCP 握手

- 进程回收、原始错误保留及本地预检指南已统一提交／推送为 `7833ace8ff87b28b70a5bb12270398861686dea7`，使用本机默认个人 Git 署名，未改 Git 配置。[Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42232817930) 全部通过。该阶段本地证据含 117 项完整 check、实际包离线／PRTS 和 Edge 34 项回归，保存在 `.ai/local/release-1.0.0/windows-cleanup-fix/`。
- 用户再次明确确认后，`v1.0.0` 从 `21d196d` 更新到 `7833ace`，新注释标签对象为 `00cafdda80faeaa2050f22601d868dc2c82d1896`。推送前 npm 1.0.0 返回 404，并只读核验 npm-production 的 Foreverstar7 必需审批、允许自审及禁止管理员绕过；推送使用旧对象约束的 force-with-lease，只更新该未发布标签。
- 第三次 [Windows Release 验收](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42233591090) 的 117 项测试／类型／格式、构建打包、解压、生产依赖、manifest／bin 启动及协议／HTML 均通过。`Initialize MCP (npx)` 在 60,006ms 报 `REQUEST_TIMEOUT`，随后关闭连接（2,110ms）与删除临时目录（500ms）均通过。清理不再覆盖原始错误，也未出现 EBUSY。真实 PRTS、浏览器和 artifact 上传跳过，publish 为 skipped，没有待审批部署；未重跑失败 CI 或执行 npm 发布。
- 该次干净 CI 从 `7833ace` 生成的 tgz 为 7,923,617 字节，integrity 与前一次 `21d196d` CI 包一致；验收工具修复不在运行包中。原始日志及标签回执为 `.ai/local/release-1.0.0/windows-cleanup-fix/windows-release-7833ace-failed.log` 和 `retag.json`。
- 本地脚本将全新隔离 npm 缓存的离线 tgz 准备移到握手之前：先以 `--offline --ignore-scripts` 提供指定包并运行当前 Node 的 `--version`，使用现有 npmCommand 的 120 秒进程限时；随后从同一缓存启动实际包 bin 并做 MCP／HTML 或记录验收，SDK 握手仍为默认 60 秒。仍不借用源码依赖、全局缓存或私人记录，未改阅读器运行代码、依赖、版本或工作流。
- 固定 Node 26.13.0／npm 12.2.1 下，类型、格式、13 项定向回归通过；新增真实 fixture tgz 覆盖冷缓存准备、不执行安装脚本，并以安装目录内标记证明后续 bin 使用同一安装。复用现有本地 1.0.0 tgz（7,924,858 字节、sourceCommit 为 `21d196d`、dirty 为 true），离线及正常本机环境 `--prts` 验收均通过：2,776 个文件、10 个 app-only 工具、global 入口、533,175 字节 HTML、117 部目录、64 个正文块、1500×844 图片，保存／重开、清缓存及模拟卸载后保留外部记录。完整日志与报告在 `.ai/local/release-1.0.0/npm-startup-fix/`。
- 用户要求复核 Release 检查，已核对 Windows 验收、同一 artifact 传递、版本／提交／run ID／SHA-512 发布校验及环境审批。另补强两点：真实 PRTS 样本必须包含 CG，不能缺图时跳过图片验收；manifest／bin／npx 的工具契约须完整一致。补强后本地完整 `./scripts/npm.ps1 run check` 的 118 项测试、类型与格式通过，同一归档 `--prts` 复验通过；日志为上述目录的 `review-check.log` 与 `review-prts.log`。沿用有效应用构建与浏览器证据，没有重打包或重复浏览器回归。新修复仍待 Windows CI 验证。
- 用户已明确授权继续处理直到服务器 Release 验收通过，本次提交／推送和后续必要的未发布 `v1.0.0` 标签更新均在该授权内，不再逐次确认。每次移动前仍核对 npm 未发布、远程标签对象与 npm-production 必需审批；npm 发布和稳定提升仍保留人工确认。下一步提交／推送本轮七个文件，核验 Ubuntu Check，再运行 Windows Release 验收。

此前首次 Windows 验收因 tar 的 `-C` 参数丢失中文路径失败，路径修复为 `21d196d`，其 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42226576247) 通过；第二次 [Windows 验收](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42227719463) 的原始失败被 finally 的 EBUSY 遮盖。第三次运行已明确保留 npx 超时，不能据此补写前两次日志中未观察到的阶段。

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

1.0.0 准备提交 `30ad8b1`、路径兼容修复 `21d196d` 与进程回收修复 `7833ace` 均已按用户授权提交／推送，使用本机默认个人 Git 署名，未修改 Git 配置；Ubuntu Check 均通过。第三次 Windows 运行的标签对象为 `00cafdda80faeaa2050f22601d868dc2c82d1896`，指向 `7833ace`，该次 npx 验收超时，详见顶部。本轮已取得持续推进到 Windows Release 验收通过的提交／推送与未发布候选标签更新授权，npm 发布与稳定提升仍保留人工确认。未修改已发布的 0.1.26 归档。未完成事项见 [PLAN](PLAN.md)，当前操作规则见 [发布指南](../docs/releasing.md)。
