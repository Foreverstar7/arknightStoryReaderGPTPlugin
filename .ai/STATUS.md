# 当前状态

更新：2026-11-08。当前发布契约为 **推送 main → Check 的 Ubuntu 检查成功 → 同一提交的 Windows 验收与草稿准备 → 发布者点击一次 Publish release → 自动发布 npm latest、固定 marketplace 和回执**。此前 next／候选安装／宿主证据／独立 promote 的人工门槛已取消，后续不得按旧记录恢复。

## 当前：桌面对话搜索卡片高度修复，本地已验证

- 本轮修复授权取代此前“只排查不改代码”。起点为干净的 `main@b4821f1befce2c4a1050db36f7aed9dcdaa775af`，修复保存在本地 `codex/fix-search-card-height`；未创建 worktree、推送、升版或发布。冻结的 1.1.1 验收源码仍为 baf8ee3，草稿 ID 438038850、标签和三个附件不含本修复且保持不动。
- inline 搜索的 html／body／root／结果容器按内容提供自然高度；fullscreen 搜索在错误条下独立滚动，选中目录／正文后沿用受限视口和内部滚动。宿主初始化、context 更新及显示模式请求的实际返回值均同步布局；不靠固定大高度或自定义尺寸观察器。搜索尚未载入 ReaderApp 时也能跟随宿主主题。
- 新增 `npm run test:e2e:host`：独立构建到 `.ai/local/search-card-check/run-*`，经实际 MCP 资源和工具、官方 AppBridge／PostMessageTransport／App SDK 进行 iframe 高度协商。旧布局的延迟结果检查真实失败；修复后 1280px 宽时通知由加载态 92px 增为三卡 484px。最终 Windows Edge 157.0.4341.42 的 18 项通过，覆盖延迟／即刻结果、无结果、错误重试、连续更新、分页、模式切换／拒绝全屏／仅返回实际模式、封面真实点击、正文滚动与返回、宿主高度上限、连续宽度变化、四种窗口双主题、键盘及减少动态效果；同时检查尺寸稳定和页面运行错误。截图已实际查看。
- 本轮类型检查、168 项既有单元／协议测试、最终格式检查通过。未重建仓库 `dist/`、已安装开发插件或 `.local/marketplace`，未操作私人记录或 4330 预览；临时服务已由测试清理。命令、证据和复测边界见 [卡片高度修复交接](../docs/search-card-height-fix.md)。真实 Codex 桌面的修复版卡片仍待原验收对话接续，不能以隔离 SDK 宿主代替。

## 此前交付：1.1.1 草稿已验收，等待用户返回发布

- 用户已明确要求推送并跟进 Check／Prepare／网站，正式发布待其返回。9596c75944389a3703813753f428fc6393a46e7a 已从 codex/portrait-chat-polish 快进合入并推送 main，工作流与另一对话的既有改动完整保留。
- [Check 42447808883](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42447808883) 的 Ubuntu verify、Windows accept-package 与 draft 全部成功，验收源码为交接提交 baf8ee32bc79c37649f7e8ca49b744f990a64271；[Pages 42446767205](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42446767205) 的网站检查、构建和部署成功。Windows 含类型／168 项／格式、实际包的三种 MCP 入口与两份 UI、冷缓存离线 npm 安装、真实 117 部目录／64 块正文／1500×844 CG／独立记录保留，以及 39 项 fixture 浏览器回归。
- 此前 9596c75 的 [Check 42446767197](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42446767197) 中 Ubuntu verify 成功，但 Windows 真实 PRTS 目录连接三次失败，draft 跳过；随后 baf8ee3 的干净构建完整通过。没有放宽联网验收、修改网络规则或用本地旧包替代 CI 新包。失败摘要在 .ai/local/portrait-chat-polish/ci-*-attempt-summary.log，最终结构化回执为 accepted-1.1.1.json。
- [1.1.1 草稿](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/releases/tag/untagged-212b10da730606fd3d43) ID 438038850，三个附件齐全；tgz 为 8,023,862 字节，integrity 为 sha512-XvXhwf49IwAuQsGQKYge2Bx+hoPEXkyV3/AlEkU/x0aeIiMpIetqb5BOJUfxQshUsetb3MK1tCnaE/WR4ukYLg==。v1.1.1 注释标签 d371c53105a08baf44f49d747b0e7f31ee133c05 指向 baf8ee3，标签内 source／integrity／体积／dirty=false／CI run 与草稿核对一致。后续文档不移动标签或替换附件。
- 1.1.1 尚未正式发布；1.1.0、1.0.1 仍为 draft，原三个附件的 ID／digest 与此前记录一致。本轮交付止于已验收草稿，正式 Publish 等用户返回。后续文档提交的 Check 应通过已有完整草稿而跳过重建；实际桌面搜索卡片仍有下述已复现缺陷，不将自动验收写成该问题已解决。
- 用户另要求只排查 maaTask 对话“查找莱茵生命相关剧情”的卡片问题。原三次调用均带完整结果、UI URI 和 _meta.readerSearch，宿主资源读取及 widget 初始化成功；并非搜索无结果或没有注册 UI。客户端同期有大量 ResizeObserver 尺寸循环错误，其他对话的 unknown MCP server 日志不能套作本次原因。
- 已用安装的 1.1.0 原 HTML／SDK 与同一公共结果隔离复现：加载态先测量为 92px，100ms 后 DOM 已生成四卡，但外层与 .search-results 的 height: 100%／内部滚动使自动测量仍停在 92px；只在临时 DOM 使用自然高度后第二次通知为 649px，四卡可见。结果先于首次测量时另观察到约 654px，表现受时序影响。已冻结的 1.1.1 没有改这组布局，缺陷仍在；当次排查未修改业务代码或真实安装。本地源码后续修复与尚待真实桌面复测的边界见页首。
- 完整只读报告、原始／对照 JSON 和截图在 .ai/local/portrait-chat-polish/card-diagnostic/；4348 临时服务与诊断标签已关闭，保留用户的 4330 预览及私人记录。本版可复制 Release 文案见 docs/releases/1.1.1-notes.md，已明确卡片已知问题，不将诊断写成修复。

## 1.1.1 立绘浮层与网站消息

- 用户要求先等另一对话提交并推送；已确认工作流 64d6d67、网站 e7a31c4 已推送后开始本轮，保留其全部改动；该对话现已完成。实现分支为 codex/portrait-chat-polish，通过既有脚本统一到 1.1.1，已交付 main；既有 1.1.0 固定包、标签与附件保持原样。
- 有可用立绘时保留图片、模式选择与来源，图片下方不显示成功／默认状态说明或刷新按钮。不一致与未确认关系的提示仍在图片上方。无可用立绘时只留“暂无可显示的立绘”和原来源链接，移除灰色人形、长诊断、核验按钮；两种图都不可选时隐藏双选框并收紧空态高度。
- 立绘仅在结构化错误码为 network 时显示简短失败提示与重试按钮；网络失败也不显示人形占位。详细错误保留在 title／无障碍说明及结构化状态中，不把缺图、解析或身份不确定等错误猜成网络失败。封面与 CG 重试行为保留。
- 网站提交非空输入后创建用户气泡、对应助手回复并清空输入框。每个请求分别持有回复节点，支持加载期间与连续提交，结果不覆盖先前对话；错误、未支持输入及重置均保留演示范围。仍为原创样例，没有模型或 PRTS 调用。
- 本地固定工具链下，check 的类型／168 项／格式、应用与网站构建通过；Edge 网站全套 10 项、fixture 浏览器 39 项、真实 PRTS 立绘 3 项均通过。覆盖四种窗口、双主题、键盘、触摸、正常／默认／无图／网络错误及原场景不一致；默认图、紧凑无图和消息气泡截图已实际检查。日志在 .ai/local/portrait-chat-polish/。
- 用户改为自行在 GitHub 补 Release 说明：按 1.0.0、1.0.1、1.1.0 的固定源码提供可复制中文文案，保留已有构建校验信息；本轮未编辑远端说明。当前浮层精简不写入 1.1.0 的已包含功能。

## 已交付：检查后准备草稿与网站底部输入区

- 用户要求 Check 成功后才执行 Prepare，两个阶段验证同一提交。Prepare 改为由 Check 的 `verify` 成功后调用的可复用工作流，仅 main push 调用；输入为该次 push 的完整 SHA，计划／草稿保存均检出该 SHA，计划另核对触发 SHA 与实际 HEAD，Windows 构建使用计划输出的固定提交。中断恢复仍复用原验收 artifact，正式发布入口和既有冻结标签／附件不变。
- 网站“亲自试试”的预设输入与提交按钮移到对话区域底部，消息、状态和结果在上方独立滚动；新增结果和错误定位最新消息。实际看图发现低高度下侧栏会撑高网格行并裁切输入区，现约束行高并允许侧栏独立滚动，输入与按钮完整可见。只调整 website 与其专项检查，不改变插件源码或 1.1.0 包版本。README 搜索截图已重新生成并看图，其余四张截图逐字节未变。
- 固定 Node 26.13.0／npm 12.2.1 下，`./scripts/npm.ps1 run check`（168 项、类型和格式）、最终 `run typecheck`、网站类型／构建，以及既有 actionlint 1.7.12 对全部工作流的检查通过。Edge 最终网站全套 9 项通过，覆盖 320×760／768×900／1440×960／1024×400 双主题、真实滚轮／键盘／触摸、连续缩放、减少动态效果和错误后重试；8 张最终搜索画面均已实际查看。位置断言在同一帧读取几何，避免外层原生焦点滚动造成跨帧误差，并额外检查输入区不超出窗口内容边界。
- 日志与截图在 `.ai/local/check-before-draft/`：`check.log`、`typecheck-final.log`、`site-build-final.log`、`site-verified.log`、`site-results-verified/` 与 `previews.log`。临时预览使用 4338／4331 且已停止，未接管保留给用户的 4330 服务；仅使用独立网站演示数据。
- 用户已明确授权工作流与网站分两次提交，再一起推送 main。共享文档按职责拆分；远端 Check／Prepare 与 Pages 的结果以本次提交的 Actions 运行记录为准，不以本地 actionlint 或既有 1.1.0 验收替代。

## 当前交付：1.1.0 草稿就绪，等待 Publish release

- 用户确认后，立绘 6a97f34、搜索与升版 3a18b60 已分开保存并一起快进合入／推送 main；远端原有 c69cbd5／99c24f9 网站 CI 修正保留。后续 MCP 修复为 e79acf4。未代为正式发布，也未修改稳定 marketplace。
- [Check 42442400578](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42442400578) 全部成功；[Pages 42441849552](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42441849552) 的网站检查与部署成功。公开网页已只读验证 HTTP 200、搜索输入与《孤星》预设存在；后续修复只涉及 MCP／测试，没有新的页面改动。
- [Prepare release draft 42442400487](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42442400487) 第 2 次运行成功，包含 Windows 实际包、真实 PRTS 和 fixture 浏览器验收。固定 v1.1.0 注释标签为 2b9e67d2，指向干净源码 e79acf40f99c0888d6d33c53cb727e82d3792f72，记录原验收 run／attempt；后续文档提交不移动该标签或替换包。
- [1.1.0 草稿](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/releases/tag/untagged-13c2bfc6aa95a553a246) ID 为 438010070，tgz／release.json／verification-prts.json 三个附件齐全；tgz 为 8,024,255 字节，标签内 source／integrity／体积与草稿一致。旧 1.0.1 仍为 draft，三个附件的 ID／digest 已与推送前逐项比较，均未变。下一步只需发布者点击 1.1.0 的 Publish release，再核对发布工作流、npm 和正式清单／回执。
- 本地集成验证包括 168 项 check、39 项 fixture 浏览器，以及网站四种窗口／双主题与触摸；触屏测试已改为继承配置 baseURL，支持隔离端口。实际包预检覆盖 12 个工具（唯一模型可见 reader_search）、两份真实 UI 的三种 MCP 入口、117 部目录、正文／CG 与独立记录保留。证据集中在 `.ai/local/delivery-1.1.0/`，正式草稿使用 CI 新包。
- 首次 CI 暴露协议测试误依赖旧 dist，已通过现有 projectRoot 边界改为隔离原创 HTML；无 dist 的源码副本完整 check 168 项通过。另补齐 MCP portraitView 字段及 default／scene 参数转发断言，实际包读取 global／search 两份构建 HTML。Windows 首次真实目录请求遇到网络失败，只重跑失败发行作业后通过；没有跳过真实源验收或调整生产网络规则。
- 当前对话连接的开发插件已实际调用 reader_search 并定位《孤星》；这证明工具调用链路，不等于真实桌面卡片点击／显示模式已验收。真实桌面新版本体验仍待使用者操作。全部诊断使用隔离数据，未操作私人阅读记录；本机 4330 网页预览为用户保留。

## 1.1.0 剧情搜索实现

- 搜索在 `codex/story-search` 实现，已随独立立绘提交合入 main。用户最终授权精简范围：剧情名称、篇目编号／标题、PRTS 记录的人物实际出场；组织、国家和事件由 AI 搜索剧情名称后批量定位，不维护关联索引。人物不查仅被提及、不猜匿名身份，接受 PRTS 收录滞后。
- 唯一模型可见工具为 `reader_search`，支持批量查询、分页和刷新；其余 11 个页面数据工具保持 app-only。模型只取得简短公共结果，完整卡片／命中篇目放在页面专用 metadata，不返回正文或私人记录。官方隔离加载器已确认 12 个工具、唯一搜索工具可见及原 global 侧栏入口；这不是实际桌面卡片点击验收。
- 搜索按需缓存目录与出场表，本地没有下载正文仍可查询。真实冷缓存探针只请求 6 个目录／出场表／导语页面，正文和图片下载为 0；重新打开后断网复用缓存、阅读状态不变。冷缓存断网、解析不兼容与确实无结果分别处理，不静默当作零结果。
- 卡片显示封面、名称、类型与篇目数，无简介或私人进度。点击进入现有篇章目录，显式目标优先于自动续读，匹配篇目标记并定位；封面本身可点击，图片仍按可见性加载。目录新增 PRTS 现成导语和来源链接，缺失隐藏、错误可重试；原逐篇简介保留。
- 网站在同一窗口依次展示侧栏浏览和对话搜索；原浏览动作速度保留，新增搜索后为 18 单位／932svh。独立“亲自试试”保留侧栏及窄屏入口，预设输入为“帮我找一下《孤星》”，返回卡片后进入目录。名称之外的简介、篇目和正文仍明确占位，不请求 PRTS、模型或私人数据。README 五张实际截图已重新生成并看图。
- package／lock／plugin／源码版本统一为 **1.1.0**，没有升级依赖。兼容的功能新增使用次版本号；标签与草稿已由 CI 准备，尚未正式发布，正式 marketplace 保持不动。
- 固定 Node 26.13.0／npm 12.2.1 下，完整 `run check`（类型、162 项测试、格式）通过；最终导语结构补查后 search／transport 9 项专项与实际包构建通过。fixture 浏览器全套 39 项通过，搜索专项最终 3 项通过。网站类型／构建与最终 Edge 8 项通过，包含 320×760、768×900、1440×960、1024×400 双主题、键盘、触摸和减少动态效果；截图已实际检查。
- 最终真实元数据探针在 `.ai/local/story-search/live-1794067126600/report.json`：名称批量匹配《孤星》与《绿野幻梦》，塔露拉取得当前可映射目录中的 13 部剧情，R8-1 定位《怒号光明》，活动／主线导语均取得；13 不是 PRTS 之外的完整性承诺。测试、构建、网站、加载器和实际包日志集中在 `.ai/local/story-search/`。
- 最终 `.local/releases/arknights-story-reader-1.1.0.tgz` 本地预检包及 `package:verify --prts` 通过：2,781 文件、12 个工具（1 个模型可见／11 个 app-only）、651,929 字节 UI HTML，隔离 npm 安装与三种 MCP 入口一致；真实 117 部目录、64 块正文与 1500×844 CG、记录保存／重开／清缓存／模拟卸载保留均通过。完整日志为 `package-final.log`、`package-verify-final.log`，报告为 `.local/releases/verification-prts.json`。包由未提交工作区生成，只作本地预检，正式发行由干净源码工作流重新准备。
- 搜索实现与立绘修正分别保存提交，交付授权见页首；起始差异仍保存在 `baseline.patch`。真实 Codex 桌面的搜索卡片、点击跳转和显示模式仍待实际体验；不以包或加载器验证代替。全部验证使用隔离数据，未操作私人阅读记录。

## 当前：立绘假冲突、原场景查看与说明，本地已实现

- 用户确认默认点击、开启“自动显示图片”后才悬停的既有规则保留，仅补清楚文档。新增方形双选控件，左“默认立绘”、右“场景立绘”，角色一致时仍保留；悬停选项直接说明含义，不增加 i 图标，并提供无障碍描述和原生方向键操作。没有可靠资源的一侧禁用，选择只在当前浮层有效。
- BW-ST2 中妻的源图片确实存在。旧规则把妻在丈夫画面中的反应对白算作妻的身份，造成假冲突；现使用同篇同分支的独立展示及其他已确认画面归属排除这类冲突，不靠焦点、姓名例外或猜资源地址。当前场景有该角色时仍优先指定表情；画面只显示其他人时使用已确认的发言人同造型默认图，无画面与不一致分别说明。
- 用户选择允许查看不一致的原场景：图片上方始终提示“场景立绘与发言人不一致”，两种模式下方分别解释当前显示的内容；未知对应关系写“尚未确认角色与立绘的对应关系”，多个原场景候选并列保留，不把查看图片当作身份已确认。占位进一步区分身份、造型、无画面、引用与来源缺图，网络／解析失败仍可重试。
- 已有 1,756 篇公开正文样本重算无解析失败；107 篇新增 1,358 处可确认的多人场景绑定，旧绑定丢失／改变均为 0。这是规则覆盖数，不是完整图片链路的净修复数，未下载全库图片。妻／夫 17 处真实绑定，以及 CW-6 塞雷娅、LE-6 别格勒的指定表情均已实际取得。用户提供的 ASS 页公开数据中，妻的一处反应行仍指向丈夫图；只核对了部署代码与数据，没有取得其后端生成算法或完成该站 UI 验收。
- 最终固定 Node 26.13.0 下，`node --import tsx --test tests/prts-speaker.test.ts tests/body-images.test.ts tests/portrait-views.test.ts` 的 22 项通过；`./scripts/npm.ps1 run build`（含类型检查）、网站 `tsc -p tsconfig.website.json --noEmit` 与 `node scripts/build-site.mjs` 通过。日志为 `.ai/local/wife-portrait-20261107/final-{tests,build,site}.log`。修改文件的 Prettier 检查与 `git diff --check` 通过。没有运行本轮全套检查，也不将另一搜索任务的验收混作本轮结果。
- Edge 网站专项 `tests/site/portrait-views.spec.ts` 通过：320×760、768×900、1440×960、1024×400 双主题共 8 组，检查切换、方向键、禁用状态、焦点返回与浮层边界，截图已实际查看。真实 PRTS 专项 `tests/browser/prts-body-images.spec.ts --config=playwright.prts.config.ts --grep='confirmed wife/scene mismatch'` 通过，妻的默认图与原场景丈夫图内容不同，两侧不一致提示均可见，方向键可切回；截图为 `test-results/prts/prts-body-images-confirmed-46e3f-in-independently-selectable/wife-{default,scene}.png`。最终追加的原生悬停说明不改变布局，未为该文案重复运行浏览器。
- README、需求、PLAN、DECISIONS 与 `docs/portrait-speaker-evidence.md` 已同步。全部诊断使用隔离缓存／数据，不读取或改写私人阅读记录。新实现尚未在已安装的真实桌面插件验收，也未为本项修正单独重新打包或安装；已冻结 1.0.1 归档和标签保持不动。用户已授权将本项修正与搜索实现分成两次提交，随后统一为 1.1.0 推送；交付时以最终源码重新准备包。

## 当前：网站部署已恢复

- 1.0.1 已以 bfa13c3 推送 main。Check 运行 42384750152 全部通过；Pages 运行 42384750136 的类型、数据检查和网站构建均通过，但网站浏览器检查第 4 项超时，部署尚未执行。
- 原提交的 Prepare release draft 运行 42384750231 已完成 Windows 实际包、真实 PRTS、浏览器验收及草稿保存。1.0.1 草稿就绪，但尚未代为 Publish；网站检查修正不改已验收的插件源码与归档。
- 日志确认已点击固定的角色 B 立绘遮住了检查试图悬停的前方角色 A 姓名。按浮层可用空间向上放置是正常布局，不能为通过检查取消点击固定或使用强制悬停。检查改为滚动后方姓名到阅读区下沿，再真实悬停，并同时断言新姓名未展开、原姓名仍展开和原浮层名称保持。
- 本次只修复检查及协作说明，不改产品行为、版本或发布制品。保留用户“不用测试”的要求，不追加本地测试；提交推送后由现有 Actions 执行并核对网站部署结果。搜索讨论保留在原工作区，修正使用隔离工作区，不混入未确认的搜索范围。
- 修正提交 99c24f9 的 Pages 运行 42385390356 已成功：网站类型、样例数据、构建、六项页面检查和部署全部通过。其普通 Check 的类型与 153 项测试通过，只剩新增检查的换行格式提示，已使用仓库现有 Prettier 写入标准格式；没有追加本地测试。后续完整检查状态以最终格式提交对应的 Actions 为准，用户可自行测试公开网站。

## 此前：1.0.1 体验修正，准备发布与用户自测

- 本轮开始时工作区干净。用户要求统一作为 1.0.1：姓名悬停离开关闭且点击可固定、去除说明和点状下划线、多角色 NPC 通用匹配、进度横杠原因与恢复入口、两个补充封面、网站滚动放慢、设置侧滑与刷新遮挡、插件图标。package／lock／plugin／源码版本均已更新，无依赖升级。
- 头像最终规则为悬停临时预览、点击固定；滑过其他姓名不替换，点原姓名／外部或 Esc 关闭。默认手动、触摸与键盘保留。设置从右侧 320ms 滑入，关闭恢复焦点；模态打开期间正文刷新原位提交，不创建遮挡设置的文档转场截图。
- 多角色匹配沿用精确干员资料，补充同篇同分支容器的一致单资源关联；同组同造型多表情取有来源的默认。全目录 117 部／1,756 篇已核对当前公开 SHA-1，无解析失败；同篇规则辅助覆盖 47,998 处（不是净新增修复数，未下载全库图片）。序章两个参考 NPC 的多资源发言实际图片及页面验收通过。没有新增姓名例外或凭 focus 猜角色。
- 四部进度参考的 14／16／19／3 篇均可完整准备；最初只读健康汇总确认有旧修订记录。目录新增待核实记录入口，后台准备仍不覆盖阅读记录。用户随后自行清理记录并确认恢复正常；本轮只读核对与解释，没有代为清理或修改私人数据库。
- 两张内置 ImageGen 原创线描封面已按稳定 ID 接入，原图和提示词保存在 docs/design/supplement-covers/，WebP 共 80,254 字节；网站滚动在侧栏选中、目录、篇目轴、定位篇目和正文展开五处冻结画面，继续滑过短距离再推进。用户批准加长后总长为 650svh，动作距离仍为 380svh，停留从 120 增为 170svh（约 +42%），正文略长；保持原生滚动和可倒放，不用计时或输入锁。插件清单加入网站图标的明暗 SVG，并通过实际包资源检查。
- 用户追加两张补充封面必须标明非官方图片；目录卡片、篇目页小封面和无障碍名称均已加入常驻“非官方图片”，小封面不再隐藏该说明。追加构建、既有封面专项（含四种窗口×双主题）、实际看图及更新后归档的离线安装／MCP 验证通过，日志在 .ai/local/supplement-cover-label/。
- 用户确认立绘应优先剧情指定表情，只有表情无法确定／指定图确认缺失时才用有依据的同角色同造型默认；已核对现有实现并澄清需求文案，没有把多角色一概改为默认。600svh 版本的距离映射曾通过 153 项检查、网站构建／类型、Edge 网站 6 项与封面迁移中途缩放／倒放补查；五个停留点及真实滚轮“短滑保持、继续滑恢复”均验证，截图已实际检查。日志在 .ai/local/walkthrough-stops/；网站调整不改变此前验收的插件归档。
- 最新加长参数为侧栏 24、目录 36、篇目轴 32、定位篇目 28、正文 50svh。本地网站已构建；用户随后明确“调整好就行，不用测试”，此后未继续自动检查或浏览器验收。该要求前已结束的两项时间映射检查、网站类型与构建日志在 .ai/local/walkthrough-holds-longer/，不得用既有 600svh 截图代替此次新验收。
- 最终类型／151 项测试／格式、两种构建及网站类型通过；fixture 原全套 35 项加修正后的设置专项 4 项通过，网站最终 6 项、真实 PRTS 专项 3 项通过。实际 1.0.1 归档的离线安装、MCP 三种入口、图标、10 个 app-only 工具通过；追加非官方标识后 HTML 为 643,245 字节，已重打包并与最终构建逐字节核对一致。详情与验证边界见 docs/reader-polish-1.0.1.md。
- 用户已授权提交并推送 main，要求推送后整理改动供其自测；本轮继续不追加本地测试。推送按现有工作流自动检查、部署网站与准备 1.0.1 草稿，实际运行结果以 Actions 为准，不把推送成功等同于部署或 npm 发布成功。正式 Publish release 仍由发布者执行，稳定 marketplace／1.0.0 标签不手动修改。既有 4330 预览保留；人物搜索讨论另留本地，不混入本次 1.0.1 提交。

## 此前已完成：单次 Publish 发布流程

- 开始本轮时工作区干净，已有本地提交保留。版本仍为 1.0.0；本轮范围为发布自动化、文档和验证，不为这些改动创建 1.0.1。用户已授权本地检查通过后推送 main，未授权代为 Publish Release 或移动既有版本标签。
- Check 保留普通 push／PR 自动检查。prepare-release.yml 在 main 判断新版本；已有完整草稿／已发布版本和清单回写的普通提交跳过发行。新版本通过 Windows 实际包／真实 PRTS／fixture 浏览器验证后才创建固定注释标签与草稿，上传同一 tgz、release.json 和 verification-prts.json。中断后复用标签中记录的原验收 run／artifact；不重打包替换已冻结归档，不移动标签。
- release.yml 保留现有 OIDC 文件名和 npm-production 环境，改为 release.published，限制正式版本。发布脚本读取 Release 附件及对应标签，不使用最新 main 的包版本或重新构建；核对源码、包／plugin 版本、验证报告和实际 SHA-512，发布 latest 并确认 registry 后才写 main 的精确清单与 docs/releases/X.Y.Z.json。同版本同 hash 跳过上传；不一致报错。旧标签只迁移已存在 npm 包，不上传。
- 已移除 promote.yml、候选准备命令和人工 host_evidence／host_accepted。源码开发副本、官方加载器探针和自动实际包验证继续保留。README／发布指南仅维护长期步骤、安装更新命令、完成判据与失败恢复，不记录临时聊天安排；插件不因发布而后台升级。
- 一次性 npm／GitHub 配置已完成；最近只读核对 npm-production 的 protection_rules=[]、deployment_branch_policy=null。npm Trusted Publisher 保持 release.yml + npm-production，允许 npm publish 与 npm dist-tag；配置说明见 docs/releasing.md。
- 本地固定 Node 26.13.0／npm 12.2.1：完整类型、147 项测试、格式检查通过；actionlint 1.7.12 验证全部工作流通过。测试覆盖普通提交不重复发行、冻结源码和原 artifact 恢复、实际 tar 包版本／hash、防止标签移动和附件覆盖、npm 相同版本续跑／冲突及旧版不重发。完整构建打包与实际包验证通过：2775 文件、生产依赖、全新 npm 安装、10 个 app-only 工具、global 入口和 533554 字节 HTML；只使用隔离临时数据。日志集中在 .ai/local/release-flow/。
- 1.0.0 的旧注释标签仍指向 cce87d6，原归档 SHA-512 已与 npm latest 只读核对一致；docs/releases/1.0.0.json 如实保存既有发布的迁移回执，不伪造新发布运行。正式 marketplace 继续精确固定 1.0.0，不操作私人阅读记录。
- 网站分支 e1a1c3e 与图片改动 c29a113 已包含在 main 并部署；79195ac 的 Check、Prepare release draft 和 Pages 均成功。README／网站安装段统一为“添加来源 → 刷新来源 → 安装插件”，保留用户主动更新说明；4330 本机预览继续保留。后续部署以对应提交的 Actions 结果为准，npm 写入仍由 Publish release 触发。
- 安装说明专项验证通过：固定 Node 26.13.0 下 `node scripts/build-site.mjs`、`node node_modules/typescript/bin/tsc -p tsconfig.website.json --noEmit`、修改文件的 Prettier 检查和 Edge 网站 6 项回归通过。安装区另实查 320×760／768×900／1440×960／1024×400 双主题共 8 种画面：命令文本与 README 一致、14px 自然换行、无横向溢出、键盘可到达。截图及报告在 .ai/local/site-install-commands/；仅展示命令，未执行插件安装。

## 已完成：点击体验区图片与占位内容

- 用户纠正目标为“点击尝试区”，不是滚动区；标题、简介、正文、选项和已知角色名统一为明确占位符。六张既有线描意象图接入目录封面和原位场景，不复制官方剧情／图片。WebsiteDemoSource 与原开发 FixtureSource 分开，继续复用真实 ReaderApp、字数规则和工具契约；数据、图片清单和样式都在 website/demo/。
- 用户明确拒绝人形，并追加“卡通可爱一点”。最终采用四足坐姿的卡通动物兔子，细项圈上的蓝色菱形与小银环只作阿米娅元素转译；原始透明 PNG、动物体态编辑输入、设定链接和完整内置 image_gen 提示词保存在 docs/design/website-demo-assets/。网页 WebP 为 768×768／52,462 字节，四角 alpha 均为 0。普通角色与分支角色使用同一张替身图，匿名“？？？”保持中性占位，不推定身份。
- 共享数据只增可选 imagesAvailable／sourceLabel，使有真实素材的 fixture 走既有图片交互，来源链接显示“演示素材原图”；普通 fixture 和 PRTS 的默认行为保持。图片失败／重试、默认手动／自动开关、Esc／外部关闭、触摸与键盘均实际验证。新版使用独立 v2 会话键，保留旧 v1 与私人插件记录。
- 封面以完整 16:9 原图放入原 1560:500 外框，网站专用深蓝黑衬底补足留白，不裁切或拉伸。实看低高度截图发现原固定体验框使兔兔部分出界，已改为随视口高度收缩；四种窗口×双主题中浮层实际位于外层可视区，保留原生内部滚动。320px 角色长姓名自然换行，无横向溢出。
- 滚动演示内容、时间轴与 430svh 节奏未改。已验收换机前未测的新节奏；测试将 none／单位矩阵按 DOMMatrix 等价比较，并在真实触摸完成原生 scrollend 后只 tap 一次，不重试点击或强制产品状态。
- README 改用 demo-library.png、demo-chapters.png、demo-reader.png、demo-portrait.png 四张真实占位界面图。capture-site-previews.mjs 启动自己的 4331 静态服务，以全新浏览器会话操作当前网站并截图，禁止外部请求，不依赖 dist/server、PRTS 或私人记录；已实际重新生成并看图。
- 固定 Node 26.13.0／npm 12.2.1 下已执行：`./scripts/npm.ps1 ci`；`./scripts/npm.ps1 run check`（类型、128 项测试和格式全部通过，含 9 项网站数据测试）；`./scripts/npm.ps1 run build`；`node scripts/build-site.mjs`；`node node_modules/typescript/bin/tsc -p tsconfig.website.json --noEmit`；Edge 的网站 6 项与原阅读器 35 项浏览器回归均通过。网站包括默认按需加载、设置／续读／重置、损坏存储恢复、真实图片／503 重试／自动开关、320px 原生触摸、320×760／768×900／1440×960／1024×400 双主题和减少动态效果。命令日志在 .ai/local/website-demo-media/，网站实际截图在 test-results/site/。
- 未进行新的真实 PRTS／Codex 桌面／实际发行包验收；这些不是本轮图片改动的验证结论。未新加或升级依赖，package／lock 与版本未改。原已验收候选和 npm 审批流程保持独立。

## 此前：网站新版换机交接

- 完整源码已移入 website/，不依赖 .ai/local、本机 63171 样例服务或全局工具。沿用紧凑无配图首屏、静态项目图标、三个入口、安装指南与 FAQ；不恢复玛恩纳演出。
- 默认展示可倒放滚动流程，下方“亲自试试”按需加载真实 ReaderApp；复用原创 fixture／字数规则，独立浏览器会话记录。六张优化后的主题封面随代码保存，《巴别塔》用二版；篇目与正文明确标为原创示意。六张原始 PNG、完整提示词及弃用的巴别塔首版编辑输入已归档 docs/design/website-covers/ 并随 Git 同步；历史 HTML／截图仍仅保留在公司电脑 .ai/local，不是新机运行前提。
- 初版已完成固定 Node 26.13.0／Edge 156 的静态构建、类型／格式、7 项浏览器数据测试、5 项网站浏览器场景（含四种窗口×双主题、倒放／停留、试读／续读／重置、存储错误恢复与 320px 原生触摸）。初版实际截图与报告在本机 .ai/local/website-final/evidence，未随代码同步。
- 用户反馈切换过快后，新增稳定停留：时间轴 12 → 18 单位，滚动区 320svh → 430svh，有效距离约增加一半；点击与封面迁移局部时长保持。分镜测试采样点已更新。按用户新要求，节奏微调后未构建、测试或浏览器检查，不能用初版通过证据替代新节奏验收。
- 现有 Check 对所有分支推送运行，包含通用检查／打包／插件浏览器回归；网站专项构建、网站浏览器测试与 Pages 部署工作流仍只在 main 的相关变更时自动运行。本次只同步工作分支，CI 问题留到用户回家后继续。
- 先前已获用户批准的 ReaderApp.resumeOnStart、Library 内部分类滚动及其回归随本次网站依赖一起保存；正式插件默认续读契约保留，现有发行包与标签不变。

## 本轮前的本机稿：无首屏配图

- 入口仍为 `http://127.0.0.1:63171/`，文件为 `.ai/local/website-structure-v2/index.html`。去除角色主视觉／技能占位及对应样式，不以软件截图替代；静态项目图标、简介与三个入口保留。
- 首屏取消左右分栏，改为左对齐的紧凑单栏；标题按可用宽度换行，减少上下间距，让下方交互阅读器更早出现。默认隐藏结构标注，顶部按钮仍可展开。
- 阅读器示例与常见问题之间新增“安装指南”，依次说明运行环境、安装插件、重启后打开阅读器；沿用 README 的 Node.js ≥26.13.0／npm ≥12.2.1。“添加并安装插件”仅展示 README 的两条命令，窄屏代码自动换行；用户明确未来使用时稳定来源已就绪，已删除命令前后的收录条件与源码开发提示。首屏安装按钮滚到本页指南，升级／卸载继续链接 GitHub 完整指南；仅展示命令，不执行安装。
- 仅调整外层 HTML 与相关说明，不重建 iframe，不修改阅读器组件或演示记录。现有服务按请求读取 HTML，刷新即可取用。按用户要求没有运行测试、浏览器检查或新截图，历史布局证据不作为本次验收。
- 文字（63184）与插画（63183）试稿、素材和证据继续保留，不再作为首页采用候选，也不继续安排首屏技能精修。正式网站与发行包未改动。

## 已搁置：纯文字战场完整演出

- 入口 `http://127.0.0.1:63184/`，默认在原首页品牌、介绍与三个入口旁播放；“只看动画”可单独查看。地图由「墙」「路」「雨」和点阵组成，竖排「玛恩纳」与标点组成看报小人，技能为「技」，暖金「斩」将靠近的「敌」打成「退」并冲散。全场景为 SVG 文字，不依赖角色图片或生成素材。
- 已贯通看报 → 自动选中／显示技能 → 自动点按 → 收报、挥剑 → 持续文字斩击。初次约 4.5 秒看到命中，之后每 2.3 秒继续；划走或隐藏标签页停止、返回重播。提供暂停／继续／重播，不自动回到看报。减少动态效果冻结在同一技能画面，雨与人物也不继续移动。
- 色彩沿用深蓝黑、米白与克制金色，文字敌人为低饱和陶红；窄屏用原生 SVG viewBox 聚焦动作区域，不缩放网页。命中、路径和时长是原创排版／演出参数，不是游戏数值；维护位置在本目录 README、`battle-state.mjs` 和 `battle.mjs`。
- 固定 Node 26.13.0／Edge 156.0.4314.58 的 `check.mjs` 通过：完整自动演出、连续波次、四种窗口×双主题、暂停／继续、键盘／触摸、滚动返回、缩放与减少动态效果，无溢出、页面错误、失败或第三方请求。追加 `check-visibility.mjs` 通过：1024×400 中仅露出地图上沿时不播放，姓名身体至少 60% 可见后才开始；窄屏与返回重播继续正常。已实看首页、看报、选中、斩击、320px 和低高度双主题画面。证据为本目录 `evidence/check.json`、`visibility.json` 与实际截图；11.28 秒实际播放录像 `text-battle-preview.webm` 及 `recording.json` 覆盖完整开技能与连续三次斩击，已抽帧检查。
- 阅读器区域复用 v2 已构建的 fixture 和 63171 服务，只验证既有入口能加载，不重设样例记录；动画独立可用。原插画版、阅读器源码、正式网站、封面与发行包均未改动。用户评审后改用无首屏配图方向，本稿作为历史探索保留。

## 已搁置：插画 V3 完整演出与选中转角镜头

- 用户认可选中效果并授权补完剩余演出，另要求选中时镜头轻微推进并改变角度，不能只是平移拉近。当前贯通自动选中 → 指针点按技能 → 收报持剑 → 持续暖金斩击；无需用户点击，划走停止、回来从选中重播，不自动回到看报。纯文字稿独立保留，不替换彼此。
- 用户明确选最初身体较长的那张人物，保留比例再增加成熟感；场景仍为构图草稿。新稿 `.ai/local/hero-rain-game-v3/`，预览 `http://127.0.0.1:63183/`，默认在已有首页介绍与三个入口旁查看，也可切到场景近看／人物对比。继续沿用《孤星》深蓝黑、米白线描、克制金色，不移植其天文题材。
- 地图改为作战画面式俯视斜角，可见屋顶／短墙，地面延伸出画幅四边，没有侧视地平线或悬浮地台。背景 `assets/rain-battlefield.svg` 由本机 `draw-scene.mjs` 绘制，`composition.json` 保留原创投影与落脚点。只查看官方商店截图核对布局，未复制官方贴图。
- 较长身材原图复制为 `assets/mlynar-tall-original.png`；内置 image_gen 在此图上调整眉眼、脸型与肩颈，独立保存 `assets/mlynar-mature-v3.png`，未改头身比例、服装与看报姿态。完整编辑提示词和原生成路径为 `PROMPTS.md`；原图未覆盖，未输入官方图像。角色公开使用许可仍未确认。
- 继续使用原生可视区观察与 Web Animations，无新依赖。选中时整体推进 5.5%，仅地面／范围层作小幅投影基变换，人物保持直立且脚底对齐；开启技能时恢复镜头。背景加 overscan 防止转角露空边，原构图与待机人物未变。三个范围邻格仍是已核对的基础范围，不是三技能扩大范围。
- 内置 image_gen 以成熟版为输入新增六帧透明挥剑图集 `assets/mlynar-attack-atlas-v1.png`（1254×1254），持剑、准备、举剑、下斩、随动、收势独立切帧，未覆盖待机 PNG；原图、完整输入／输出和提示词在 `PROMPTS.md`。按实际输出测量 UV／落脚点，用互补 SVG 裁切保留跨列剑尖，不改图像像素。动作与独立 SVG 剑弧共用 1800ms 周期，不漂移，不加敌人、伤害数字、音效或震屏。
- 完整图片解码且场景／人物可见后自动开始；划走、隐藏标签页或切视图立即取消，旧异步回调不继续开启技能。提供暂停／继续／重播，不抢焦点；继续只恢复运行中的动画，不重放已经结束的开启片段。减少动态效果直接显示静态持剑与局部金光，没有运行动画。
- “体验阅读器”现在滚到本页复用的原创 fixture 阅读器，便于向下阅读再回来观察重播；使用 v2 既有构建与独立演示记录，通过 fixture 来源检查后转发本机 63171 API，没有复制阅读规则。页面主题与阅读器原有设置分别控制；63171 不可用时阅读器明确报错／可重试，首屏选中不受影响。
- 固定 Node 26.13.0／Edge 156.0.4314.58 的 `check-performance.mjs` 通过：无输入的完整首次演出、实际循环六帧／剑弧同步、镜头转角／脚底对齐、暂停与键盘继续、技能移动／开启中取消、划出零动画及返回一次重播；四种窗口×双主题的选中人物／技能与六帧完整边界、320px 触摸、系统主题和减少动态效果通过，无溢出、页面错误、正常失败请求或第三方请求。
- `check-performance-recovery.mjs` 注入新图集 404／样例 API 503 后恢复通过；新图集等待实际 SVG load 后才开始，不换图，API 错误不影响完整演出。实看选中转角、指针／点按／开启、六帧、320px 斩击、低高度与恢复截图，报告和截图在 `evidence/performance/`。`check.mjs` 指向完整演出检查；选中版源码／检查保存在 `checkpoints/auto-selection/`，静态版在 `checkpoints/scene-character/`，历史证据不覆盖。
- 用户评审后改用无首屏配图方向，本稿作为历史探索保留，不再精修首屏演出。正式网站、阅读器源码、既有封面和发行包本轮未改动。
- V2 侧视场景与大头短身候选保留为 `.ai/local/hero-rain-2d-v2/`（63182），其原图、提示词和有效静态检查仍在原目录，不再作为现行人物／视角选择。

## 旧版检查点：雨天首屏 SVG 手动交互稿

- `.ai/local/hero-rain-svg-v1/` 的看报、点选、点击一次金色斩击再回到看报已完成；这是旧版交互，不再是现行目标。文件、服务和既有验证保留，不将其按钮行为套到新 2D 方案。
- 独立预览为 `http://127.0.0.1:63181/`，默认放在当前首页介绍与三个入口旁，可切换“只看场景”。支持播放一遍、暂停／恢复、回到待机、Esc 取消与减少动态效果；中等／窄屏重排，人物热区与原生技能按钮分别按 SVG 锚点定位，不整体缩放网页。运行与恢复见同目录 `README.md`；原结构稿 `63171` 独立保留。
- 固定 Node 26.13.0、Windows Edge 156.0.4314.58 的 `check.mjs` 通过：完整手动／单次演示、键盘焦点恢复、取消、播放中暂停／换布局／缩放、系统主题／减少动态效果切换及 320px 原生触摸。四种窗口×双主题无横向溢出，技能按钮保留 64px／56px；无页面错误、失败或第三方请求。报告与实际截图为该目录 `evidence/`；已查看待机、技能、中等／窄屏／低高度终态。
- V1 的本机稿与证据保留；不继续精修或迁入正式首页。新目标与当前交付见上方 2D 场景／角色段。

## 当前：网站结构稿评审

- 用户最初确认三段结构，现按追加要求改为首屏、交互体验、安装指南、常见问题四段，仍不保留顶部导航。首屏保留“体验阅读器”“安装指南”和带官方 Octicons 图标的 GitHub 按钮；安装指南滚到本页新增段落，完整步骤继续链接 README 的 Quick Start。
- 当前草稿为已忽略的 `.ai/local/website-structure-v2/index.html`，预览地址仍为 `http://127.0.0.1:63171/`。复用 `ReaderApp`、现有 CSS 与 HTTP transport；初次加载／刷新进入阅读器主页。顶部首页打开两轮固定示例对话，项目图标已移至三个点及分隔线下方，不再吸附侧栏底部；其余四个图标不可操作或聚焦。窄屏提供两个切换按钮，对话卡片和首屏入口也能返回阅读器，切换保留当前页面与位置。
- 第二部分标题为“阅读器示例”；项目名为主，常驻非官方／ChatGPT 场景示意说明。用户确认静态图标“先用这一版”：A 的兔耳与书页、空心菱形书脊及对称切光，呼应“未照耀的荣光”几何结构。独立 SVG 源为 v2 的 `icons/reader-rabbit-radiance.svg`，经 `sync-icon.mjs` 同步首屏 48px、侧栏 24px、对话卡片 30px。当前版本暂定采用；图标保持静态，正式图标清单未改。示例对话不调用模型，剧情查找 Tool 仍未实现。
- 演示复用现有 fixture 开发服务，固定 Node 26.13.0／原创样例来源，记录、设置与缓存仅写入 v2 的 `demo-state/`。立绘／CG 是原有 fixture 位置示意，可实际展开；没有访问 PRTS 或私人阅读记录。交互依赖本机服务，不把这个原型当作已经可发布到 Pages 的静态演示。恢复命令和复用范围见同目录 `README.md`。
- 新增本机 `demo-source/seed-demo.ts`，只为原创 fixture 预置四条记录；初始“雾中来信”40%、“灯火与归途”32%，百分比由现有字数规则计算。后续演示阅读不覆盖，重置恢复预设；最近阅读可恢复正文约 799px 的样例位置。演示构建需手动执行 `build-demo.mjs` 后刷新，未接入 Actions 自动构建。
- 用户批准两处最小源码调整：`ReaderApp.resumeOnStart` 默认 true，仅本机演示传 false；`Library` 分类跳转改为内部 `scrollTo`，沿用 CSS 滚动间距。已实测 iframe 外层位移从约 525px 变为 0。固定 Node 下正式构建／类型、演示构建与独立严格类型检查、三处源码／测试格式通过；Edge 两个定向浏览器回归通过，覆盖滚动宿主固定和正式入口刷新自动续读。未重跑无关全套测试或真实宿主／PRTS。
- 上轮默认主页／预置进度／续读、分类滚动、失败重试与双主题布局证据继续适用，见 v2 内既有报告和 `reader-source-check.log`。本次 `radiance-icon-check.json` 验证独立 SVG 可解码、六个路径／样式与内嵌符号一致、菱形居中及两道切光镜像、三处共用；检查深浅主题的 24px／48px／96px 实际图形、侧栏／对话入口及 320px 首屏，无裁切、溢出、浏览器错误或外部请求。已查看 `radiance-icon-sizes-*.png`、`radiance-sidebar-light.png` 和 `radiance-brand-dark-320.png`，未重建 iframe 或重复源码回归。
- 用户认可雾城 CG／记录员画风后，已用内置 image_gen 补齐其余四份，六张原始素材均在 v2 的 `art-study-v1/`：三张 1672×941 场景、记录员／旅人／匿名剪影三张 1024×1536 透明 PNG。没有覆盖首轮素材或修改原生成文件；完整提示词与画风参考关系见 `PROMPTS.md`、`PROMPTS-remaining.md`。
- 全组 `review.html` 已更新，`asset-manifest.json` 记录预定用途并明确尚未接入。全部 PNG 解码通过，三份人物均保留透明通道；浏览器六个唯一资源／九个图元素加载成功，1440px／320px 的浅深主题无横向溢出，键盘可查看原图。已查看三张场景与三份人物的深浅底效果，匿名剪影无五官或身份标识。证据为 `art-set-check.json`、`art-preview-check.json` 和 `scenes-*`／`characters-*` 截图。
- 用户认为原组六图缺少方舟辨识度后，已认可《孤星》线描试稿并确认扩成六张；按两批补齐《长夜临光》《巴别塔》，再完成《愚人号》《叙拉古人》《火山旅梦》。当前选择均为 1672×941 PNG，集中于 `cover-series-v1/`；《孤星》沿用原图，新五张由内置 image_gen 生成，仅把《孤星》作为画风参考，未输入官方图片。题材研究的历史观看快照与社区投票仍见 `art-study-line-v1/story-interest-check-2026-11-07.md`，不作为全网实时排名。
- 《巴别塔》首版舰体像海船，已定向修正为带履带的移动陆舰，并移除重复的竖直光柱；当前清单采用二版，首版保留为弃用试样。`manifest.json`、`PROMPTS.md` 与 `README.md` 记录选择及全部参考／修正关系。`review.html` 展示六张浅深底卡片；全部六个唯一图像／十二个图元素载入解码通过，四种窗口无横向溢出，键盘可打开当前二版原图，无页面错误、失败或外部请求。已查看原图、首批三张及整组六张的实际浅深底效果；截图与报告为 `first-batch-*`、`six-covers-*`、`preview-check.json`。
- 用户反馈新五张封面整体不错；计数为五张新增可用图加原有《孤星》，当前清单共六张，错误的《巴别塔》首版不计入，使用二版。封面未接入阅读器或正式网站，不把真实剧情封面套到原创 fixture 上。接下来改为讨论正文中的原创 CG 简单草图及原创角色草图／剪影，不采用仅写“CG 图片”的纯标签占位；目标只是一小段可演示交互的原创 demo，不再制作整套精细插画。用户要求新开会话继续，完整续聊 prompt 为本机 `CONTINUE-READER-ART.md`，只授权最小素材小样与独立预览，不自动接入或改共享源码。原素材与匿名点击／不猜身份规则保留，正式网站素材与许可边界不变。

## 上一轮：发布与首次上线摘要

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
