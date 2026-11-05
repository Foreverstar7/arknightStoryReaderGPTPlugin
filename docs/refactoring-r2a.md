# R2a：共用正文取得，保留阅读提交边界

日期：2026-11-05。从干净的 `d5a0124` 接续；功能比较基线仍为 `7724df1`／0.1.24。版本、依赖、工具、磁盘格式及阅读规则不变。

## 改动

`server/chapter-content.ts` 集中原来准备／打开两条路径重复的缓存读取、本地 raw 重解析、已知统计修订核对、来源解码、篇目 ID／空正文检查和统计 CAS。请求只区分现有的 prepare 与 open 用例；open 携带原有显式刷新和预期修订，不增加任意阅读副作用开关。

服务仍拥有两种提交过程：准备取得正文与公共统计后缓存正文；实际打开先完成 historyToken／预期修订检查和记录迁移，成功后才写正文缓存、登记定位与图片索引、返回 token。取得模块没有 ReadingStore，也不能创建阅读索引。原始缓存作为迁移依据返回，v3→v4 同源分支锚点、上次／最远位置及完成状态规则不变。打开时复用已算好的定位结构，删除 remember 中的重复计算。

保留准备请求取源后的代次检查、正文缓存自身的提交检查、公共字数 CAS 和记录事务的独立职责；不以清理缓存替代迁移。两条路径原有错误码和文案、来源错误及 cause 不变。普通滚动保存仍只用本地定位，不因清缓存重新取正文。

## 验证

- `build`、`check` 通过，88/88、类型及格式通过。新增两条行为检查覆盖错误 ID／空正文不污染缓存、统计与记录，以及清历史使在途打开失败时不得提前覆盖旧正文。
- `audit:refactor` 对冻结输入零差异、0 网络尝试：1,756 篇完整结构和独立字数、169 立绘、122 CG 引用、207 组合、302 原图、固定身份样本 21 发言块。基线 SHA256 仍为 `07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e`。
- Edge fixture 定向 10/10：准备、阅读和历史三个文件，包含恢复位置、缓存清理、四窗口、双主题、键盘及减少动态效果。
- 真实正文首轮 6/7。trace 显示 SR-2 的 reader_chapter 在断言结束时仍为未响应，5 秒断言短于来源既有 20 秒请求期限；原始 trace／截图保留在 `r2a/prts-first-failure/`。只把该场景的正文可见等待改为最多 30 秒，产品及内容断言未改。受影响的整个文件复验 **7/7** 通过，见 `prts-recheck.log`。
- 当前 dist 的 fixture stdio 与双进程探针通过：十个 app-only 工具、正式 HTML、隔离保存、预取不写已读、统计与缓存／历史分离、旧修订拒绝和清理后滚动不补正文。

所有写入仅用 `.ai/local/` 隔离目录。没有布局／样式修改，没有安装、推送或发布。包重定位与完整浏览器回归留本批 R3a 稳定后执行；本片没有重新验证宿主桌面 UI 或其他平台，不能把 R1 的通过当作本片重验。

## 复跑

日志与报告在 `.ai/local/refactoring-0.1.24/r2a/`。

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run audit:refactor '--' --output .ai/local/refactoring-0.1.24/r2a/current.json --compare .ai/local/refactoring-0.1.24/baseline.json
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PORT = '4341'
./scripts/npm.ps1 run test:e2e '--' tests/browser/story-preparation.spec.ts tests/browser/history.spec.ts tests/browser/reader.spec.ts
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts '--' tests/browser/prts.spec.ts
$env:READER_SOURCE = 'fixture'
./scripts/npm.ps1 run probe:mcp '--' .
./scripts/npm.ps1 run probe:s4:installed '--' .
```

探针明确传当前项目路径，读取实际 mcp.json；脚本名称含 installed 不代表本轮安装。下一步直接 R3a，再接续 R2b／R3b／R4a／R5；可按本片提交回退，不需迁移记录或缓存。
