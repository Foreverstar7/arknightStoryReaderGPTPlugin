# R0／H1 首批重构记录

日期：2026-11-05。原功能基线 `7724df1`／0.1.24，启动时为干净的 `9b50a6b`（仅追加昨日计划文档）。R0 工具已独立提交为 `69dc592`；H1 与本记录一同本地保存。版本、依赖、磁盘及工具协议不变，未安装、推送或发布。

用户已授权连续完成整个重构计划；当前会话过长时，在一个部分完成验证后，新开同项目会话接续。下一部分从 R1 开始，再按计划完成 R2a／R3a／R2b／R3b／R4a／R5；候选库与 R4b 整体解析器替换仍须有可证实收益。官网及 S5 不在范围内。

## R0：可复跑的基线

`scripts/refactoring-baseline.ts` 读取已构建的指定 `--code-root`，用本机公开样本回放。`audit:refactor` 默认不具备在线下载路径，原生 fetch 被明确禁用；图片的注入请求只返回已有映射或只读 SQLite 缓存中的原字节，测试产生的新缓存位于独立临时目录，结束后关闭连接并清理。不会打开真实阅读数据库。

从 Git 导出 `7724df1` 到 `.ai/local/refactoring-0.1.24/baseline`，以项目 Node 26.13.0／npm 12.2.1、现有锁定依赖构建成功。报告保存源码、构建、既有测试、审计工具和每份输入的 SHA256。稳定 JSON 指纹忽略对象属性顺序，保留数组顺序和所有内容字段；不把 raw／私有 historyToken 混入文字输出，raw 单独按输入哈希比较。

| 范围       | 本轮结果                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 目录与正文 | 117 部／1,756 篇 raw 齐全，全部解析；完整 v4 正文、选项、共同后续、ID、scene、CG composition、视频、诊断、revision、字数指纹无差异         |
| 独立字数   | 1,756 篇均与源行统计一致；不调用生产 scanner／分支／字数函数进行源端计数                                                                   |
| 内容类型   | 1,746 文字、6 混合、4 纯视频，与基线一致                                                                                                   |
| 图片结果   | 169 个修复相关立绘引用、122 个 CG 引用、207 个 CG 组合；资源选择、状态、原因／证据、顺序、几何、透明度及字节指纹无差异，报告另存可读元数据 |
| 原图       | 复用 302 张、105,635,218 字节；字节哈希和实际 render 输出比较，不重新下载或声称重新完整解码全部图片                                        |
| 身份专项   | 固定 4-1 行动前及已有阿米娅／凯尔希资料，21 个多人发言块的唯一匹配结果无差异；不把它算作全库身份验收                                       |
| 默认／占位 | 独立原创输入冻结两种结果；真实 404 回退、歧义与网络错误由原有 body-images 用例覆盖                                                         |
| 比较器     | 基线重复回放自比无差异；原创正文、ID、scene、CG 坐标与分支顺序的等字数变更均可检出，新增／缺失条目也可检出                                 |
| 联网       | 全库回放为 0 次网络尝试；304 次映射／图片请求均由本地文件适配器回答，不计为网络成功                                                        |

源行统计单列了 29 篇已有源尾部异常（如多余 `]`、标点或“已改”）。首轮把这些诊断项误当作独立字数失败，但实际字数全部相同；逐项检查后，保持它们为可比较的源行发现，正文诊断仍在结构指纹中，没有改产品解析或扩大忽略范围。未知输入、样本缺失、解析失败和真正字数差异仍导致非零退出；输入变化和输出变化分别列出。

冻结报告：`.ai/local/refactoring-0.1.24/baseline.json`，SHA256 为 `07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e`。`self.json`、`current.json` 均与它比较通过。公开原文、图片、完整报告与 trace 只留在忽略目录，没有打包或提交。

## H1：已处理的重复知识

- 从生产目录移除“骑兵与猎人”样例常量，测试自己定义样例 ID；目录仍从来源解析。
- Wiki API 复用 `PRTS_ORIGIN`，人物映射、变量表和图片路径复用适配层资产 origin；原允许域名和路径校验保持。没有增加任意 URL 配置或逐角色地址。
- CGItem 只有一份 1280×720 来源画布，中心由尺寸计算。外部坐标得到确定的 x/y；拼接资源与尺寸在入口配对，布局不再使用缺项补零。保留真实缺省值和坏输入错误语义，没有断言／强转掩盖解析失败。
- 图像约束归入跨端实际共用的 `shared/image-limits.ts`，消除两个 schema 各自定义 32 层上限；保留 20 MB、60M 编码字符、1M 字符／段、64 段。边界测试核对原图／组合／分段关系，真实序列化仍独立检查最终大小。
- 版本采用最小改法：在 `check` 中校验源码、package、lock 根项目、plugin、Node 两份 pin 和 npm 元数据一致。现有打包检查继续负责运行时与产物；不增加生成器或浏览器对开发清单的运行时依赖。

七类顺序、封面比例、批准封面规则、历史解析迁移及异步／多进程保护均按定位清单保留。`PublicCache` 的 scope 限制、`cache.run` 的代次上下文等已经有实际职责，没有为了减少文件数直接删除。完整条目及下一步验证归属在 [重构计划的 R0 定位清单](refactoring-plan.md#r0-定位清单2026-11-05)。

## 验证与限制

- `run build`、`run check` 通过，84/84；维护报告最后补齐可读图片／身份元数据后，再次类型和格式检查通过。
- Edge 完整 fixture 31/31；覆盖目录初始化／刷新乱序、迟到保存和清理、导航转场、设置、按需图片、四窗口及浅深主题。
- 真实 PRTS 完整首轮 19/20：图片文件的一个 APIRequestContext POST 在本机接口返回 `ECONNRESET`，页面已经显示对应正文；其余 19 项通过。保留失败 trace 后复跑整个受影响文件，4/4 通过，20 个唯一真实场景已覆盖通过；不把这描述为首次整套 20/20。没有改变产品逻辑、断言或超时，首次连接重置的根因尚未证实。
- 重新检查本轮 320px 浅色和 1024×400 深色身份截图，图片与来源链接可操作；本轮未改 UI／样式，CG 结构和实际 render 指纹均无差异。没有宣称重新完成交互稿的全部人工验收。
- `plugin:prepare`、中文／空格目录重定位、65 个 dist 文件和包内 Node 哈希通过；无符号链接或私人状态。包内 stdio fixture／真实 PRTS 均通过，10 个 app-only 工具、正式 UI、真实 117 部目录／首篇 64 块／1500×844 CG 及隔离保存均成功；双进程与 HTTP MCP／正式 HTML 通过，临时 HTTP 服务已关闭。
- 沙箱回环请求实测 `EACCES`，已终止受阻的测试运行，改用经审批的沙箱外隔离 Edge／HTTP 检查；没有改本机网络设置。一次包检查启动早于复制完成，报告缺 runtime，复制完成后连同 stdio／双进程一起重新核验通过，没有把未完整包当作产物。
- 当前宿主加载器／桌面 UI 未在本部分重验，macOS／Linux／Windows ARM64 仍待真实环境。后续 R1 及最终集成继续负责相关接口／加载器验收；既有 0.1.23 安装记录不作为本轮新代码的宿主证明。

证据目录：`.ai/local/refactoring-0.1.24/`，含构建／check、三份全库报告、完整及定向浏览器日志、首次失败 trace、stdio／双进程／HTTP、包哈希与重定位包。所有写入探针使用隔离目录；没有修改、清理或迁移真实阅读记录，也不以运行中的用户数据库哈希不变作未经观察的保证。

## 继续执行与复跑

先构建当前代码，再和冻结基线比较；不能用新代码覆盖 `baseline.json`，也不能用更新源样本后重新生成基线掩盖不等价。需要回退时，R0 只撤维护工具；H1 撤对应模块即可，不需要删缓存或改记录格式。

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run audit:refactor '--' --output .ai/local/refactoring-0.1.24/current.json --compare .ai/local/refactoring-0.1.24/baseline.json
./scripts/npm.ps1 run audit:refactor '--' --code-root .ai/local/refactoring-0.1.24/baseline --output .ai/local/refactoring-0.1.24/self.json --compare .ai/local/refactoring-0.1.24/baseline.json
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PORT = '4341'
./scripts/npm.ps1 run test:e2e
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts
./scripts/npm.ps1 exec '--' playwright test -c playwright.prts.config.ts tests/browser/prts-body-images.spec.ts
./scripts/npm.ps1 run plugin:prepare
./scripts/npm.ps1 run probe:mcp '--' '.ai/local/refactoring-0.1.24/relocated 阅读器'
./scripts/npm.ps1 run probe:s4:installed '--' '.ai/local/refactoring-0.1.24/relocated 阅读器'
```

PowerShell 包装器的参数分隔符使用字面 `'--'`；首轮遗漏引号触发 npm 参数错误，修正后才执行成功。冻结构建来自 `git archive 7724df1`，在导出目录以仓库固定 Node／npm 执行 `run build`，不是复用历史 dist。新 checkout 缺少公开样本时应明确报告缺失；维护工具不会因此联网补齐整库。
