# 当前状态

更新：2026-11-07。**1.0.0 的 Windows Release 完整验收已通过，项目网站已上线；npm 发布正在等待用户网页审批。** 候选标签固定指向 `cce87d6`，网站／文档提交未移动它。网站、部署工作流与原创示例已推送；README 已补三张原创建面图说明，随本次最终交接提交。完成远程核对并保存交接后按用户本轮要求正常关机。已发布 **0.1.26** 沿用既有 registry 证据，稳定 marketplace 仍为空，真实桌面与稳定提升仍待人工完成。

## 当前接续：网站已上线，等待用户审批 npm

- `cce87d6c2abfc7760272981ad44f5349267d59a7` 的 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42250956103) 全部通过。第八次 [Windows Release](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42251044304) 的 accept-package 已成功：119 项、类型／格式、构建、全部实际 tgz 离线／PRTS 及 34 项 Chromium 浏览器回归通过。真实横滑、scrollend 与之后一次点击均通过；该次一次冷安装 75,870ms，安装产物的 Node 握手约 222ms。
- 注释标签对象 `31b92868b3a04f118716b0ebe3d6c568ae2ce827` 固定指向 `cce87d6`。已保存并独立核对同一次 CI 的 npm-candidate artifact：`arknights-story-reader-1.0.0.tgz` 为 7,923,617 字节，源码／run ID／dirty=false／SHA-512 均匹配。完整包和报告位于 `.ai/local/release-1.0.0/touch-scroll-fix/accepted-cce87d6/`，`server-acceptance.json` 在其上级目录；hash 为 `sha512-06q8zw5cD1WDznpKV61DSPBXlzn1lXmyiROKRqQnZYlp8JQg5XRcUtx83ZYmb2scNgI5kSBkPXqJ2LOaE8COcw==`。
- publish job 为 waiting，pending_deployments 明确为 npm-production、Foreverstar7 必需审批；助手未批准或发布。用户醒后在上述 Release 页面点击 Review deployments → npm-production → Approve and deploy，将上传已验收的同一 tgz 到 next。OIDC 与 trusted publisher 验证仍待这次实际发布，之后才安排真实 Windows Codex 桌面和稳定提升。
- 中文项目网站已实现：原创纸页／书签图形、三个实际 fixture 界面示例、阅读方式、安装文档／发行入口及非官方说明。`website/` 只含公开静态文件，不访问 PRTS、不读取私人数据、不加载第三方字体；构建输出独立为 `build/site/`。维护与素材来源见 [网站说明](../docs/website.md)。
- 本地固定工具链下类型与项目格式通过；网站两个浏览器场景通过，覆盖实际项目子路径、资源、键盘／点击标签、说明展开，以及四种窗口×双主题和减少动态效果，无横向溢出、页面错误或第三方请求。实际截图已检查，证据位于 `.ai/local/project-website/` 和 `test-results/site/`。
- 网站主体已提交／推送为 `f6d4221c0ade7e378c21be053f4ab61690c58bb5`，[Pages 构建与部署](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140503) 及该提交的 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140890) 全部通过。公开网站为 [剧情阅读器](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/)，实际线上 Chromium 已验证 HTTP 200、桌面／320px 深色布局、图片、标签与说明展开，无页面错误或失败响应；回执为 `.ai/local/project-website/live-verification.json`。
- 已复用当前仓库既有 Git 登录创建 Pages（HTTP 201），只在进程内使用认证，未显示或保存凭据。构建源为 workflow、HTTPS 已启用；新 `github-pages` 环境只用于网站，npm-production 审批保持独立。README 的目录／篇目／正文图片复用原创资产，三条公开图片地址均返回 HTTP 200。此次最终提交包含图片说明和上线记录；关机仅按用户本轮完成后的指令执行。
- 网站链接与 README 图片说明更新在 main；已验收 1.0.0 tgz 内 README 保持 cce87d6 的版本。继续发布同一验收归档，不为后续网站／文档补充重建包或移动标签。

## 此前：同版 Chromium 已复现并修复触摸注入

- `7f8f46109906cd58147bce5adbbb5237195270a1` 的 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42248061639) 全部通过。第七次 [Windows Release](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42248202943) 的 119 项、构建与完整实际包／PRTS 验收再次通过，但浏览器仍 33/34：偏移稳定后一次 tap 有触摸事件、未生成 click，正文没有打开。位置连续稳定不足以证明原生手势已结束；不能仅靠替换等待条件解决。发布 skipped，未执行 npm 发布。
- 已下载该次 `release-diagnostics`，CI trace／截图保存在 `.ai/local/release-1.0.0/touch-scroll-fix/windows-diagnostics/`。本机 Node 下载浏览器无进展，改用系统下载器取得官方 CDN 的同一 Chromium headless shell 156.0.8078.4，成功本地复现相同失败。诊断确认 CDP detach 前后 maxTouchPoints 均为 1，延后 detach 仍失败；快速触摸移动后下一次 tap 无 click，按实际 requestAnimationFrame 节奏发送相同移动后生成 click 并打开正文。
- 当前只改测试输入节奏：保留原 touchStart／touchMove／touchEnd、原生惯性、scrollLeft 大于 50、scrollend 完成及之后一次正常 padding tap 打开的全部断言，移除未解决问题的 200ms 偏移替代条件；无点击重试或强制设置偏移。固定 Node 26.13.0／npm 12.2.1 下，同版 Chromium 原断言连续 3 次通过、完整 34 项通过，类型与格式通过。证据为 `chromium-current-touch.log`（修复前失败）、`chromium-touch-events.log`、`chromium-paced-original-assertions.log` 和 `chromium-full.log`，均在上述本机目录。
- 下一步按持续授权统一提交／推送该修复与记录，更新仍未发布的候选标签并跟进服务器验收。完成后制作／部署项目 Pages 网站，再保存交接并按用户要求关机；npm-production 的发布审批仍由用户完成。

## 此前：触摸回归观察实际滚动终态

- 单次冷安装修复已提交／推送为 `ace31d2eb3698bdac06332cbf8ec0870a83e2ad0`，[Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42245190105) 的 119 项检查、构建、离线实际包及 34 项浏览器回归全部通过。候选标签对象 `92ab243d088d6dd6da23111f367386be77fd260c` 指向该提交；推送前 registry 1.0.0 返回 404，npm-production 的必需审批独立核验通过。
- 第六次 [Windows Release](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42245615586) 的 119 项检查、构建和完整实际包验收通过。全新 npm 安装准备 133,990ms，实际安装 bin 的 Node 握手 313ms，离线三入口工具／HTML、117 部目录、64 块、1500×844 图片、续读／清缓存及卸载保留记录全部通过。timing 显示 loadTrees 约 59 秒、loadBundles 约 37 秒；安装阶段没有再次触发 120 秒通用限时。完整日志为 `.ai/local/release-1.0.0/single-install-fix/windows-ace31d2-failed.log`。
- Windows Chromium 156 的 fixture 浏览器回归 33/34 通过；唯一失败在 `cards.spec.ts`：真实横滑已经使 scrollLeft 大于 50，但测试注入的 scrollend 标记 5 秒内未变 true。产品代码不依赖该事件。当前测试改为按 50ms 间隔观察实际偏移，要求连续 200ms 稳定；保留真实触摸输入、横滑距离、不误开、之后一次普通 padding tap 打开的全部路径，不强制滚动位置或重试点击。失败诊断 artifact 调整为 `release-diagnostics`，同时保存 npm 日志及浏览器截图／trace。
- 本机 Windows Edge 156 的原触摸测试连续 3 次通过；修正后全部卡片的鼠标／键盘／双主题／触摸场景各重复 3 次，9/9 通过，类型与格式通过。证据为 `.ai/local/release-1.0.0/touch-scroll-fix/`。本机同版 Chromium 下载无进展后已停止，未计作本地 Chromium 验证；完整 34 项及同版 Chromium 仍由新 Windows CI 核验。沿用上述已通过的 119 项和完整实际包证据，不重复本地 PRTS。
- 下一步统一提交／推送该测试及诊断修复，核验 Ubuntu Check；按持续授权更新仍未发布的 v1.0.0，跟进完整 Windows Release。npm 发布仍由用户在网页审批。

## 此前：完整验收只准备一次冷安装

- 安装与通信分离修复已提交／推送为 `73c335ce7238557bfedbd45cf5162c70af80abbf`，[Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42239968895) 全部通过。第五次 [Windows Release](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42241430924) 的离线包验收通过：冷安装 107,174ms，安装后的 bin 握手 340ms。随后独立 PRTS 验收完成目录、正文、CG 和前面的记录检查，在第二次新缓存准备 120,028ms 后被脚本 SIGTERM 终止。publish skipped，没有待审批部署；这不是 Actions 的 25 分钟 job 限制或 OIDC 错误。完整日志为 `.ai/local/release-1.0.0/npm-stdio-fix/windows-73c335-prts-failed.log`，npm 内部具体耗时阶段仍未由该日志确定。
- 本轮将三个入口的工具契约／HTML 比对统一放在 PRTS 请求之前，默认模式继续不访问 PRTS；`--prts` 完成同样的全部离线检查，再执行原有真实正文、CG、最后／最远位置、重开、清缓存及模拟卸载保留记录检查。每次验收仍使用全新隔离缓存，后续重开复用已经验证的安装目录。Windows 工作流只调用一次完整 `--prts`，保留 check、构建、Chromium 浏览器回归与同一 tgz artifact。
- 安装命令单独允许 300 秒，MCP 握手仍 60 秒，其他 npm 命令仍 120 秒。安装的 timing／verbose 日志实时输出并保存在 `.local/releases/npm-install-logs/`，失败后仍由 artifact 留存。关闭该离线安装命令无关的 npm 自身更新查询；未改变产品、依赖、版本、npm-production 审批或发布脚本。
- 固定 Node 26.13.0／npm 12.2.1 下完整 check 的 119 项、类型和格式通过；新增真实损坏 tgz 回归验证失败清理后保留诊断，成功 fixture 也验证 timing 文件。现有实际 tgz 的默认／PRTS 验收通过；关闭 npm 更新查询后再通过 7 项定向及完整 PRTS 复验，未观察到 npm registry fetch，确认全部离线检查先于 PRTS 且只准备一次安装。117 部目录、64 块、1500×844 图片和记录保留均通过，原归档 SHA-512 未变。本机证据位于 `.ai/local/release-1.0.0/single-install-fix/`；该包仍是 `sourceCommit: 21d196d`、`dirty: true` 的本地预检归档，新候选由标签 CI 构建。
- 该修复已提交／推送并由第六次 Windows 运行验证完整实际包通过，后续浏览器修复与待办见顶部。服务器完整验收通过后由用户网页批准上传同一 tgz，助手不批准发布。

## 此前：npm 安装与 Node stdio 通信

- npm 准备／验收复核修复已提交并推送为 `fe8919caeb31afd985f91fb97c9464bdf31fe585`，[Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42236865450) 通过。第四次 [Windows Release](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42237265759) 的 118 项检查、构建、实际 tgz 解包、依赖、manifest／bin 及工具／HTML 均通过；离线 npm 准备耗时 91,516ms 成功，随后 npm 包装层初始化在 60,009ms 超时。关闭 stdin 后才出现 npm 的 bin 启动信息；清理通过，publish skipped，无发布审批任务。日志为 `.ai/local/release-1.0.0/npm-startup-fix/windows-fe8919-failed.log`。
- 查到相似的 [npm/cli #9959](https://github.com/npm/cli/issues/9959)：Windows 管道 stdin 下 npx 可能卡住，issue 仍开放，但其 npm 10 环境与本项目 npm 12 不同，不能据此认定同一根因。当前 CI 的直接 Node 握手约 0.4 秒已通过，不能归因为整台机器不支持 MCP。正式 mcp.json 本来就使用系统 Node，npm 只承担安装阶段。
- 本次验收由 npm exec 在全新隔离缓存中离线安装实际 tgz；非交互 npm 命令明确关闭 stdin。通过 npm 提供的 PATH 解析已安装 package.json，校验 Node／包名／版本／bin，并以 realpath 确认产物属于该缓存，拒绝源码或全局包。之后由系统 Node 直接启动该实际安装的 bin，保留全部工具契约、HTML、CG、续读／清缓存校验；模拟卸载同时移除解包副本和 npm 安装副本后确认外部记录仍在。npm 进程上限仍 120 秒、MCP 握手仍 60 秒，未改产品、版本、依赖或发布工作流。
- 本地固定 Node 26.13.0／npm 12.2.1 下类型、13 项定向回归通过；fixture 验证隔离安装、禁用安装脚本、安装目录复用和非交互命令获得 stdin EOF。对同一本地 1.0.0 tgz 的离线／真实 PRTS 复验通过，npm 安装目录内入口的握手分别约 404ms／311ms，10 个工具完整一致、HTML 533,175 字节，117 部目录、64 块、1500×844 图片及记录保留均通过。完整证据在 `.ai/local/release-1.0.0/npm-stdio-fix/`。沿用有效的 118 项完整基线、构建与浏览器证据，不重复无关验证。

- 进程回收、原始错误保留及本地预检指南已统一提交／推送为 `7833ace8ff87b28b70a5bb12270398861686dea7`，使用本机默认个人 Git 署名，未改 Git 配置。[Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42232817930) 全部通过。该阶段本地证据含 117 项完整 check、实际包离线／PRTS 和 Edge 34 项回归，保存在 `.ai/local/release-1.0.0/windows-cleanup-fix/`。
- 用户再次明确确认后，`v1.0.0` 从 `21d196d` 更新到 `7833ace`，新注释标签对象为 `00cafdda80faeaa2050f22601d868dc2c82d1896`。推送前 npm 1.0.0 返回 404，并只读核验 npm-production 的 Foreverstar7 必需审批、允许自审及禁止管理员绕过；推送使用旧对象约束的 force-with-lease，只更新该未发布标签。
- 第三次 [Windows Release 验收](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42233591090) 的 117 项测试／类型／格式、构建打包、解压、生产依赖、manifest／bin 启动及协议／HTML 均通过。`Initialize MCP (npx)` 在 60,006ms 报 `REQUEST_TIMEOUT`，随后关闭连接（2,110ms）与删除临时目录（500ms）均通过。清理不再覆盖原始错误，也未出现 EBUSY。真实 PRTS、浏览器和 artifact 上传跳过，publish 为 skipped，没有待审批部署；未重跑失败 CI 或执行 npm 发布。
- 该次干净 CI 从 `7833ace` 生成的 tgz 为 7,923,617 字节，integrity 与前一次 `21d196d` CI 包一致；验收工具修复不在运行包中。原始日志及标签回执为 `.ai/local/release-1.0.0/windows-cleanup-fix/windows-release-7833ace-failed.log` 和 `retag.json`。
- `fe8919c` 曾将全新 npm 缓存准备移到握手之前，安装阶段成功但仍以 npm 进程承载 MCP 管道；第四次 Windows 结果证明仅拆分时限仍不足。本次改为上述实际 Node 入口，npm 安装验收继续保留。
- 固定 Node 26.13.0／npm 12.2.1 下，类型、格式、13 项定向回归通过；新增真实 fixture tgz 覆盖冷缓存准备、不执行安装脚本，并以安装目录内标记证明后续 bin 使用同一安装。复用现有本地 1.0.0 tgz（7,924,858 字节、sourceCommit 为 `21d196d`、dirty 为 true），离线及正常本机环境 `--prts` 验收均通过：2,776 个文件、10 个 app-only 工具、global 入口、533,175 字节 HTML、117 部目录、64 个正文块、1500×844 图片，保存／重开、清缓存及模拟卸载后保留外部记录。完整日志与报告在 `.ai/local/release-1.0.0/npm-startup-fix/`。
- 用户要求复核 Release 检查，已核对 Windows 验收、同一 artifact 传递、版本／提交／run ID／SHA-512 发布校验及环境审批。`fe8919c` 另要求样本 CG 必须完成图片验收及各入口完整工具契约一致，本地完整 check 的 118 项通过，证据为 `review-check.log`／`review-prts.log`；当前入口为清单、解包 bin 与 npm 安装后的 bin。
- 用户已明确授权继续处理直到服务器 Release 验收通过，必要修复的提交／推送和未发布 `v1.0.0` 标签更新均在该授权内，不再逐次确认。每次移动前仍核对 npm 未发布、远程标签对象与 npm-production 必需审批；npm 发布和稳定提升仍保留人工确认。最新执行位置见顶部。

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
