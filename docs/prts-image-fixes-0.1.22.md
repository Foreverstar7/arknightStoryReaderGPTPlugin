# 0.1.22：正文 CG 与立绘修复

2026-11-04；基线 `f5df065`／0.1.21。当前版本为 0.1.22。用户追加“安装然后提交”后，已完成安装与实际包验证；修复和上轮未提交的审计成果一并纳入本次本地提交，不推送或发布。修复前事实仍见 [基线报告](prts-image-audit-2026-11-04.md) 和同名 JSON；不要用修复后的统计覆盖基线。

## 结果

| 问题 | 本次结果 |
| --- | --- |
| 映射键大小写：102 种／3,380 次加载 | 修复。映射与请求两侧统一大小写，大小写冲突明确报错。 |
| 引用多余空白：49 种／163 次加载 | 修复。只容忍末尾及 `#`／`@`／`$` 分隔符周围空白，不删除标识内部任意空格。 |
| 新映射遗漏：17 种／394 次加载 | 修复。按相同资源组及表情／造型匹配旧 Data_Link，再用 Data_Char 的显式 URL。仍是原始资源，不计为默认图。 |
| `$ill_amiya_normal`：1 种／3 次 | 修复。当前源站变量表显式对应 `char_002_amiya_1`；通过通用变量解析，不写该角色特例。匿名姓名不变。 |
| CGItem：116 种／202 处 | 接入。原位按钮注明“CG 图层”；按来源键、顺序、位置、缩放、旋转和透明度显示静态组合。 |
| largebg／verticalbg 的 cggroup：6 种／10 个图片引用 | 接入。5 个组合按 solid 尺寸分别横向／纵向完整拼接。 |
| 基线多人场景 71,915 发言块、无场景资源 15,915 块 | 同一引用仅尾部空白不同的 3 块规范化后显示原图；当前 71,912 个多人歧义块及 15,915 个无资源块明确中性占位，保留正文原名。它们不是已确认图片文件缺失。 |

169 种原失败引用／3,940 次人物加载均恢复为有来源的原始资源；实际姓名点击路径的 153 种／1,608 个失败发言块清零。`MT-6 告解/BEG` 另有 3 个同图不同尾部空白的场景不再误判为多人歧义。当前全库单一场景资源为 9,026 种／121,787 发言块，均可定位原图；当前样本没有需要默认立绘的引用。**默认图策略已经实现和测试，但不能把测试注入的默认图算作全库真实修复数量。**

静态 CG 全部 1,624 种／2,577 个引用进入正式解析。新增 207 个按钮／组合，覆盖原 122 种／212 个遗漏引用；数量不同是因为拼接的两张图片合为一个展示块。

## 来源与展示口径

本轮重新读取 [StoryPlayer 入口](https://prts.wiki/w/Widget:StoryPlayer?action=raw)、[当前播放器模块](https://static.prts.wiki/widgets/production/StoryPlayer.BQaRLFZ9.js) 和 [context 模块](https://static.prts.wiki/widgets/production/context.DG_3DzZj.js)，均与基线代码哈希相同。

- 人物主要来源是 [character.json](https://torappu.prts.wiki/assets/avg/character.json)。缺少条目或原始图片 HTTP 404 时，先尝试 [Data_Link](https://prts.wiki/w/Widget:Data_Link?action=raw) 与 [Data_Char](https://prts.wiki/w/Widget:Data_Char?action=raw) 的准确原图，再考虑可靠默认。没有逐角色 URL 表。
- [story_variables.json](https://torappu.prts.wiki/gamedata/latest/story/story_variables.json) 的 SHA-256 为 `62cc95a536c308c1fc1ee93afe0708583c0a830dd5998b51dca84a17535665cf`。只解析显式字符串条目，不猜缺失变量，不递归追逐循环变量。
- 默认图只接受同一资源组、同一 body 的显式 `index: 0`／旧表 `-1$body`，或适用的 `normal` 别名。数组第一项本身不是默认依据。无法确认时返回占位；网络、映射解析、图层格式、缓存错误仍保留错误类型和重试。
- 结果包含 `portrait.status`（original/default/placeholder）、原始请求、选择结果、原因及来源。中性占位在 UI 用统一 SVG 绘制，不冒充源站图片。默认图说明与“重试原立绘”、占位的“重新核验立绘”、网络错误的“重试图片”分开。
- 按用户最新调整，正常立绘浮层只显示图片和小号 PRTS 链接，去掉重复姓名、关闭按钮及通用说明；点击外部、再次点击姓名或按 Esc 关闭。保留无障碍名称、键盘访问链接与必要的异常状态说明。
- CG 仍由 [Data_Image](https://prts.wiki/w/Widget:Data_Image?action=raw) 定位。CGItem 源播放器使用 1280×720 坐标、居中锚点、向下的 y 和插入顺序，重复键替换后追加；其 `layer` 参数没有参与当前播放器排序。代码固定值仅用于这个有来源的坐标约定，不是逐剧情补丁。播放器实现改变时重新核对这些规则及回归样本。
- **CGItem 展示完整静态图层组合，不含常规舞台背景、人物舞台演出或动态特效。** 采用终态，淡出展示淡出前参数；静态画布包围全部图层，保留相对位置与旋转，不裁掉驶出舞台的图层。cggroup 显示完整拼接，不复刻镜头平移／缩放。普通 background／imagegroup 不新增正文 CG。这是静态阅读呈现，不宣称重现整段演出。
- 原始字节及透明通道保持。单原图仍限 20 MB，组合限制 32 层及 60M 个编码字符，沿用最多 64 个传输分段；这些是防御性传输预算，不代表源站恒定的图层上限，不能据此猜补或忽略超额内容。

## 正文、缓存和记录

从 `HEAD` 提取修复前 v3 解析器，对同一批 1,756 篇逐篇回放：所有正文字数、非 CG 叶块（含姓名、场景状态、分支中的文字）和既有段落 ID 均相同，新增 CG 207 块。比较结果保存在 `.ai/local/image-fixes-0.1.22/corpus-comparison.json`。

正文修订更新至 `prts-script-v4`。旧 raw 缓存按需离线重解析，不清缓存或阅读记录。相同源脚本哈希且总字数一致的 v3→v4 迁移，按既有 ID 和字数保持锚点，避免分支容器仅增加零字图片就导致已读位置／完成度回退；真正改动文本的修订继续走原有保守迁移。

准备正文、图片审计及资源探针不写真实阅读记录。测试与 MCP 写入只发生在 `.ai/local/` 隔离目录。按需图像、默认手动、自动图片可视区触发、设置和缓存清理代次均保留。没有新增依赖、模型工具或模型调用，没有开始 R0 重构或 S5 搜索。

## 验证

| 验证层次 | 实际结果与边界 |
| --- | --- |
| 当前来源修订 | 北京时间 20:13:56—20:14:03，1,756／1,756 篇源站 SHA-1 与审计样本一致；重新获取目录及新旧图片映射共 43 个公开请求。 |
| 全库解析／定位 | 117 部／1,756 篇无解析或扫描失败；人物及 CG 映射无失败。原有 13,390 URL 图片头证据全部覆盖当前地址，0 失败／0 未核验；本轮没有重复下载全库图片。 |
| 修复资源完整解码 | 169 种立绘＋122 种 CG，共 302 个不同原始图片 URL、105,635,218 字节，全部经 Edge `Image.decode` 与完整像素读取；207 个 SVG 静态组合均可解码且有可见像素。首次按需取得修复子集，最终离线复验 0 请求。 |
| 类型、构建、单元／协议检查 | `build`、`check` 通过，71／71；包括来源冲突、空白、旧版原图、同 body 默认、未知资源、变量、404／503、缓存复用、分支图层、拼接、位置迁移以及既有存储／多进程检查。 |
| fixture 浏览器 | Edge 26／26 通过，涵盖导航、连续操作、恢复位置、清记录／缓存、触摸、主题与减少动态效果。 |
| 真实 PRTS 浏览器 | 全量 Edge 19／19 通过（2.2 分钟）。实际打开空白引用、旧映射与变量引用篇目及三类遗漏 CG。UI 默认图／错误状态使用明确标记的注入，不能算成源站实际失败。 |
| UI 检查 | 320×760、768×900、1440×900、1024×400；浅／深主题、键盘、320px 占位重试触摸、减少动态效果均通过。实际操作交互稿篇目、立绘和 CG，对照桌面／窄屏截图；保持阅读宽度、姓名列、左栏和浮层语言。 |
| 用户追加的浮层精简 | 重新构建及格式检查通过；真实图片专项 6／6（56.9 秒）、fixture 阅读器 5／5（23.9 秒）通过。去掉姓名／关闭按钮／通用说明后，外部触摸、姓名切换、Esc 焦点返回、Tab 访问 PRTS、四窗口双主题和异常重试均正常；已检查新版窄屏／低高度截图。 |
| MCP | 当前 0.1.22 构建的实际 stdio 服务：10 个工具仍全部 app-only，正式 HTML 资源读取成功；变量原图、零图层中性占位、1600×1800 双图层 CG 及其分段重组成功，二进制只在 app 元数据。 |
| 实际安装包 | 官方 CLI 安装 0.1.22，installed/enabled 均 true；63 个 dist 文件与包内 Node 哈希一致。包内 stdio 返回 117 部、真实首篇 64 块、1500×844 CG、529,390 字节正式 UI，隔离保存成功；官方加载器识别 10 个 app-only 工具和 global 入口。三份真实阅读记录文件哈希不变。 |
| 真实桌面宿主 | 新包已安装，现有桌面仍有 0.1.21 驻留进程，需重启客户端加载新版本。未强行关闭会话，当前桌面 UI 独立未验；协议、加载器和浏览器通过不替代宿主验收。 |

检查期间发现并修正了两个可观察问题：CGItem 驶出舞台后截取终点会空白；浮层锚点滚出视口时，原定位算法可能产生负 top。前者改为完整静态图层边界，后者始终约束在来源提示条下方；修复后的专项 6／6 与完整真实浏览器 19／19 均通过。用户追加的浮层精简在此之后完成，按上表重跑受影响用例。

本轮没有逐篇验收说话者身份，没有把全部 13,390 个 URL 完整解码，也没有验证视频／动态特效的演出。验收结果是能确认的资源显示正确，无法确认的明确占位，图片错误仍可重试并继续阅读。

## 复跑与证据

安装使用现有本机 marketplace 与官方 CLI 0.166.0-alpha.5.1；本轮重新核对[官方打包文档](https://developers.openai.com/plugins/build/plugins)和本机 `codex plugin add --help`。实际执行 `plugin:prepare`、`codex plugin add arknights-story-reader@arknights-reader-dev --json`、`codex plugin list --json`，然后对返回的实际安装路径运行 `scripts/probe-mcp.ts`，并通过当前官方 CLI 运行 `scripts/probe-host.ts`。安装日志、哈希与记录保护证据保存在 `.ai/local/install-0.1.22/`，不提交本机安装目录、缓存或私人阅读数据。

- [修复后全库清单](prts-image-fixes-0.1.22.json)：当前源哈希、逐篇统计、每个人物引用的原图／默认／占位／错误状态。
- [完整解码结果](prts-image-decode-0.1.22.json)：302 个 URL 的尺寸、实际字节 SHA-256／透明度检查，169 个人物引用结果及 207 个组合结果；不含图片字节。
- 全量引用、原文、图像缓存、截图、MCP 探针和日志留在忽略目录 `.ai/local/body-image-audit/` 与 `.ai/local/image-fixes-0.1.22/`，不打包正文或图片。修复前本机 `report.json` 保留，新脚本输出 `report-fixed.json`。

```powershell
./scripts/npm.ps1 run audit:images
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe --import tsx scripts/audit-prts-images.ts --online --verify-revisions --refresh
./scripts/npm.ps1 run probe:images
./scripts/npm.ps1 run probe:images -- --offline
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
$env:PLAYWRIGHT_CHANNEL='msedge'
./scripts/npm.ps1 run test:e2e
./scripts/npm.ps1 run test:e2e:prts
# 浮层精简后的受影响用例（同一 Node 目录须在 PATH 中，供测试服务使用）
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe ./node_modules/@playwright/test/cli.js test -c playwright.config.ts tests/browser/reader.spec.ts
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe ./node_modules/@playwright/test/cli.js test -c playwright.prts.config.ts tests/browser/prts-images.spec.ts tests/browser/prts-body-images.spec.ts
```

`probe:images` 首次只下载基线失败／遗漏集合，不下载整库。离线复跑要求本机验证缓存已存在。源站修订变化时，先用正文审计脚本重新取公开样本，再比较来源和图片规则，不能将本报告当作永久覆盖承诺。
