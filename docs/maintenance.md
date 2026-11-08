# PRTS 规则维护

源站变化导致解析或图片失败时，先核对对应原始页面及播放器，再修改规则。保留失败来源和明确错误，不用相似名称、猜测 URL 或忽略未知指令来补结果。

## 目录与剧本

### 乐章曲谱

补充展示资料来自 [关卡一览/曲谱](https://prts.wiki/w/关卡一览/曲谱)。`prts-score.ts` 解析概览的代码／名称、各分区乐章成员及交点，嵌套样式模板不作为字段；主线按明确 EP 链接与现有章节编号对应。2026-11-08 实测 117 部目录中 87 部归入 14 个乐章，另有 29 个交点；其余 30 部保留在“其他”。这是当次核对结果，不是硬编码数量。

曲谱中的显式剧情名与乐章代号决定目标；个别装饰链接（如“破碎日冕”）指向错误 EP，不能直接依赖 href。名称歧义、归属冲突及模板变化必须显式报错；未匹配名称独立列出，不创建正文。更新时同时核对归属、排序、方向、未收录剧情、metadata 清理中的迟到请求与独立失败重试。`tests/prts-score.test.ts` 使用原创记录验证语法，不提交源站整页或临时下载。

### 剧情索引与正文

入口为 [剧情一览](https://prts.wiki/w/剧情一览?action=raw)及[剧情导航](https://prts.wiki/w/模板:剧情导航?action=raw)。正文读取对应页面的 `action=raw`，只解析唯一剧情模拟器内的文本数据，保留稳定 ID、顺序和来源。

`prts-scanner.ts` 负责源字段与参数；`prts-script.ts`、`prts-flow.ts` 负责可见正文与分支；`prts-cg.ts` 处理静态图层。与来源语义有关的规则包括：

- 重复参数按源播放器取最后一个值；多行字幕与可见动画文字保留，演出时序不计字数。
- Decision 的多个选项可指向同一后续。无法关联到选项的条件保留正文和来源说明，不猜选项或人物状态。
- 无匹配 Label 的 Warp 保留顺序并提示；需要真实跳转的形式报不兼容。`GotoPage(dest="home")` 只接受唯一参数且处于末尾。
- `prts-compat.ts` 的 sourceNoops 是经过来源核对的窄白名单。允许的名称／参数以代码为准，包含源拼写异常和不产生正文的演出标记；未知参数、额外文字或新控制流仍报错。

这些规则来自 [ScenarioSimulator](https://prts.wiki/w/Widget:ScenarioSimulator?action=raw)、[StoryPlayer](https://prts.wiki/w/Widget:StoryPlayer?action=raw)及其引用的播放器／参数解析器。源入口中的模块链接可能更新，维护时沿入口查证，不把旧资源文件名当成永久版本。

变更后运行 `tests/prts*.test.ts`、字数与迁移测试；涉及全库语法时再用 `audit:chapters` 或 `audit:refactor`。独立源字数统计与正式解析分开，避免用实现自身证明正确。

## 封面与资料

`prts-metadata.ts` 只接受明确字段与唯一关联：

- 活动封面：活动信息模板的“标题图文件名”。
- 主线封面：[关卡一览/主题曲](https://prts.wiki/w/关卡一览/主题曲?action=raw)中对应 EP 锚点、标题和文件引用。导航本身没有资料页关联，因此使用这个固定索引，而不是按剧情名猜文件。
- 四月辑录：[活动一览](https://prts.wiki/w/活动一览?action=raw)中明确的年份链接与横幅，关联目录的 APF-YYYY/NBT。
- 早期危机合约：固定目录 ID `prts:活动剧情/特殊 · 危机合约` 对应[活动关卡索引](https://prts.wiki/w/关卡一览/活动关卡?action=raw)的 `活动名称 危机合约.png`。不借用当前赛季海报。

文件地址均通过 MediaWiki imageinfo 取得。固定索引、模板、锚点或文件引用变化时，先修正来源关联，再运行 metadata／封面浏览器测试。无来源或重复字段报错，不缓存长期空结果。

`cover-policy.ts` 的 1560:500 外框、批准尺寸及两个特殊合集文字封面是当前展示规则，详见[封面要求](requirements.md#封面)。两个合集没有唯一封面且显示名相同，因此按稳定 ID 使用不同应用标题；源分组变化时核对 ID 与成员，而不是增加名称猜测。

## 立绘与 CG

主要来源为 [character.json](https://torappu.prts.wiki/assets/avg/character.json)、[story_variables.json](https://torappu.prts.wiki/gamedata/latest/story/story_variables.json)、[Data_Link](https://prts.wiki/w/Widget:Data_Link?action=raw)、[Data_Char](https://prts.wiki/w/Widget:Data_Char?action=raw) 和 [Data_Image](https://prts.wiki/w/Widget:Data_Image?action=raw)。

- 规范化映射键大小写与引用分隔符周围空白，不删除标识内部字符。变量只接受显式映射值。
- 缺少新映射或原图 HTTP 404 时，先查旧索引的准确原图；可靠默认必须属于同一资源组／body，并有明确默认序号或 normal 别名。
- 多人身份匹配优先使用同名资料页的 CharinfoV2：“干员名”精确相同，“干员id”与场景资源完整边界匹配。同角色同造型只有多个表情时允许映射中的明确默认，造型不唯一则不选择。
- 没有干员资料的剧情人物，可由 `prts-speaker.ts` 使用同篇同分支容器内的单资源发言建立唯一一致的姓名／资源组关联，且必须与当前场景资源相交。冲突、匿名、不同造型和不同分支不合并，不使用 focus 或姓名例外表。关联每次从当前已打开正文生成，不跨篇持久化；无需预下载整库。该依据沿用阅读器对单资源发言的源数据解释，并非官方干员身份声明。
- `node --import tsx scripts/audit-prts-speakers.ts` 显式执行全目录维护检查：复用本机公开正文样本、向 PRTS 核对各页当前 SHA-1，变化时补取；报告在 `.ai/local/prts-speaker-audit/report.json`，不打开私人记录，不下载全库图片。`corroborated` 只表示同篇证据可确认的发言数，包含原先干员资料已能确认的部分，不能宣称为净新增修复数；剩余项仍可能由资料匹配，不等于最终占位数。
- CGItem 的基准舞台为 **1280×720**，使用居中锚点、向下 y 轴和插入顺序；值来自源播放器坐标约定。静态画布容纳全部图层，淡出取淡出前状态。cggroup 按 solid 尺寸与资源顺序拼接；源坐标或渲染规则变化时重新核对与回归。

定向复验可用 `probe:images` 和 `tests/browser/prts-body-images.spec.ts`。固定样本放在 `tests/fixtures/prts-image-baseline.json`；它是回归输入，不是当前源站失败清单。

## 图片与传输预算

`src/shared/image-limits.ts` 是唯一参数来源：单张原图 **20,000,000 字节**，组合最多 **32 层**、共 **60,000,000 个 data URL 字符**；每段最多 **1,000,000 字符**，最多 **64 段**。

20 MB 上限用于保留大幅原图；组合与分段上限约束解析、传输及页面内存，不代表源站图片规格。每段连同元数据须满足 SDK 的实际序列化消息限制；调整时同时检查 schema、分段／重组及真实 stdio，不只改一个常量。

## 维护资料

探针与审计默认把结果写到 `.ai/local/`；不要自动更新回归样本，也不要提交原文缓存、游戏图片或私人记录。具体参数和联网范围见[脚本说明](../scripts/README.md)。
