# 封面与图片状态实测（0.1.13）

这是 0.1.13 首片的历史记录。后续 JPEG 全链路、四月辑录来源、117 部覆盖及最终验收见 [0.1.14 修复记录](prts-covers-0.1.14.md)，以下“不支持 JPEG／资料页缺失／未提交”为当时状态。

核对：2026-11-02。本轮完成 S3 的封面资料与错误路径切片，不代表全目录封面／正文兼容或 S4 完成。基线仍为 `a33f99e`，本轮未提交。

## 真实来源

先复用 `.ai/local/prts/` 的公开目录、骑兵活动页与资料，再用项目 Node 公开 GET 核对少量页面；未使用登录状态或为封面预取未读正文。新原文与协议探针在忽略目录 `.ai/local/cover-20261102/`。

| 样本 | 实际证据 | 结果 |
| --- | --- | --- |
| 骑兵与猎人 | [活动页](https://prts.wiki/w/骑兵与猎人?action=raw)：`骑兵与猎人-预告公告.png` | 真实字段与图片通过 |
| 火蓝之心 | [活动页](https://prts.wiki/w/火蓝之心?action=raw)：`活动预告-火蓝之心活动.png` | 重新核对原文，沿用活动字段规则 |
| 集成战略 · 傀影与猩红孤钻 | [活动页](https://prts.wiki/w/傀影与猩红孤钻?action=raw)：`主题图 傀影与猩红孤钻.png` | 撤销目录分组前缀后复用同一规则，真实图片通过 |
| 生息演算 · 沙中之火 | [活动页](https://prts.wiki/w/沙中之火?action=raw)：`活动预告 沙中之火 01.png` | 同一规则，真实图片通过 |
| 黑暗时代·上 | 同名 raw 页 HTTP 404；[主题曲索引 EP00](https://prts.wiki/w/关卡一览/主题曲#EP00)对应介绍提供 `章节名称 序章.png` | 章节标识不冒充封面，保留 `unsupported` 与索引来源 |
| 四月辑录 · 断罪者的挑战状 | 同名候选资料页 HTTP 404 | 显示资料页缺失并可重试，不断言源站没有图片 |

解析只接受唯一 `活动信息` 模板内的唯一 `标题图文件名`。嵌套字段、链接和注释不会泄漏为标题图；模板未闭合、重复模板／字段或动态文件名报 `parse`。没有受支持模板或文件格式报 `unsupported`；已识别模板未填标题图报 `resource_missing`，含义仅限该明确字段未提供资源。图片地址仍查询 MediaWiki `imageinfo`，不拼文件 URL。返回值同时保留文件页及选择此图的活动页来源。

`类型 · 名称` 只撤销本仓库 `parsePrtsCatalog` 生成的展示组合，没有类别例外、逐剧情别名或图片表。候选页必须自行声明无歧义的活动标题图。目录仍为 117 部／1756 篇，ID、七类及类内顺序不变。

## 必要固定值与维护

新增来源入口固定值只有 `MAIN_STORY_INDEX = '关卡一览/主题曲'`。剧情导航只给章节标签与正文链接，没有主线资料页关联；同名查询实测 404，因此通用名称拼接不足。该值来自已核对的 PRTS 索引，仅供主线同名页缺失后的证据核对，**不生成任何图片名或图片 URL**。EP 锚点结构消失时报解析不兼容，标题不匹配则保留未支持，不回退其他图片。来源改版后重新核对索引原文并复跑 `tests/metadata.test.ts`、真实 `prts-covers.spec.ts` 主线样本；代码注释及 `.ai/DECISIONS.md` 已同步。

`活动信息`、`标题图文件名` 与 EP 语法是来源格式契约，依据[模板定义](https://prts.wiki/w/模板:活动信息?action=raw)及实取原文固定。任意图片链接不具有相同语义；扩展字段须先补来源证据与验证。`parserVersion: 2` 是本地缓存契约版本，用于拒绝旧 `{}`／无来源的旧正结果，后续解析语义改变时同步调整版本及兼容测试。未新增依赖、资源域名或图片格式策略。

## 状态、重试与缓存

- 分开 `idle`、`loading`、成功、`resource_missing`、`not_found`、`network`、`parse`、`unsupported` 和其他失败，封面不再全显示“暂无封面”。完整提示与来源保留在提示和重试按钮的可访问说明中。
- HTTP 保留 `code / error / sourceUrl`；MCP 使用自有 `_meta.readerError` 传递类型、提示及来源。它依据 [OpenAI 官方工具结果元数据契约](https://developers.openai.com/plugins/reference#tool-results)承载页面数据，不是 OpenAI 预定义的错误字段。无类型的宿主拒绝保留 unknown，两端都不按文案猜原因。
- 文件 API 明确返回 `missing` 或图片 HTTP 404 才判实际资源缺失；没有 imageinfo、地址不唯一／不受支持或结构改变报解析问题。人物条目不存在与条目结构不兼容也已分开。
- 主页整卡按钮与封面重试为同级原生控件，没有嵌套按钮。鼠标／键盘重试不会打开篇目或正文，手形 hover 与键盘焦点保留。
- 可选 refresh 重取当前图片需要的资料、映射和图层，包含解码失败后更换坏缓存的路径；不清全局缓存或阅读记录。旧封面缓存按新版本和来源要求惰性核验，失败不写长期空结果。
- URL 图片去重、跨重启缓存、按最后使用到期、断网已有缓存和内容／记录隔离沿用原有实现及回归。全部浏览器与写位置探针均在隔离目录，实际 `.runtime/reading/` 未清理。

## 验证

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
$env:PLAYWRIGHT_CHANNEL = 'msedge'
./scripts/npm.ps1 run test:e2e
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 run plugin:prepare
codex plugin add arknights-story-reader@arknights-reader-dev --json
./scripts/npm.ps1 run probe:mcp -- <实际安装目录>
./scripts/npm.ps1 run probe:http -- http://127.0.0.1:4321/mcp
./scripts/npm.ps1 run probe:host
```

| 层次 | 实际结果与边界 |
| --- | --- |
| build／check | 30 项测试、类型及格式通过；含旧空／旧正缓存、模板嵌套／重复、无字段、缺页、文件 missing 与格式失败、单图刷新、HTTP／MCP 类型与记录隔离 |
| Edge fixture | 13/13，52.7 秒；最近实际阅读、整卡／触摸／键盘、固定来源条和平面扫过回归通过 |
| Edge 真实 PRTS | 11/11，1.0 分钟；真实成功封面、主线未支持和资料页 404，显式注入网络／解析／资源缺失及解码失败，独立重试通过 |
| 尺寸／主题 | 320×760、768×900、1440×900、1024×400；浅深主题、减少动态效果、重试位于封面内、键盘焦点、无页面横溢出；原有正常动效检查也通过 |
| 安装包 stdio | 官方 CLI 成功安装新目录 0.1.13；包内 Node 26.13.0，9 个 app-only 工具、117 部、64 块首篇、1500×844 CG、隔离位置保存通过，UI 509961 字节 |
| 安装包／HTTP 封面 | 两端均实际返回三张 1560×500 封面及活动来源，主线 unsupported／资料页 not_found 保留类型与来源；封面探针前后隔离记录不变 |
| 官方加载器与一致性 | 发现 0.1.13、reader、9 工具与 global 入口；安装包 dist 的 39 个文件 SHA256 与源码构建逐一一致，命令仍为 `./runtime/node.exe` |

新封面场景限制额外请求到命名样本，其他封面是显式测试注入，不作为真实缺失证据。resource_missing 的留空字段／MediaWiki 缺失标志使用原创响应验证；真实 404 样本证明的是**资料页缺失**，没有宣称源站完全无图。输出仍分别为 `test-results/fixture`、`test-results/prts`。首次新测试在鼠标模式直接断言 focus-visible 失败，改为实际 Tab／Shift+Tab 操作后整套通过，未改变原生焦点规则。

最后对 0.1.13 的三个新增封面浏览器场景另行复跑，3/3 通过（11.0 秒），保留真实分组封面截图。源码／HTTP／安装包结果在 `.ai/local/cover-20261102/{http,installed-stdio}.json`。安装 0.1.12 曾两次报 `failed to back up plugin cache entry: 拒绝访问`；核对发现已存在目录的解析文件与最新构建不一致，因此未把“已注册”当成最终成功，改用从未存在的 0.1.13 目录安装后核对全部构建哈希。旧目录与实际阅读记录均保留，没有修改权限或清缓存。

已在真实浏览器打开仓库交互稿并点击进入篇目轴，对照正式集成战略篇目页；实看新错误界面的四种尺寸代表截图。保留三页、横向交错轴、封面迁移、正文揭幕、固定导航／来源条。新增差异为真实来源及错误／重试状态，参考稿外包装、示意封面与模拟百分比不复制。截图为 `.ai/local/screenshots/covers-error-*`、`covers-real-grouped.png`。4318 已核对进程路径后刷新为 0.1.13／prts，原 `.runtime/` 保留。

真实桌面宿主内的图片、视觉与完整阅读仍单独待验；[Computer Use 技能](C:/Users/Administrator/.codex/plugins/cache/openai-bundled/computer-use/26.1027.51404/skills/computer-use/SKILL.md)引用的 [guidance.md](C:/Users/Administrator/.codex/plugins/cache/openai-bundled/computer-use/26.1027.51404/docs/guidance.md)明确要求 “Do not automate the ChatGPT desktop app UI”，因此浏览器及加载器不替代该 UI 验收。全目录封面覆盖、新特殊正文、S4 分母／修订迁移／跨进程清理竞态及 S5 搜索不在本轮完成范围。没有提交、推送、发布或上架。
