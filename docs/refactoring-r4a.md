# R4a：单次脚本扫描与明确流程选择

日期：2026-11-05。从干净的 `fa531bb` 接续；功能比较基线仍为 `7724df1`／0.1.24。没有更改 parser v4、revision／block ID 算法、工具、磁盘格式、依赖或版本。

## 改动与边界

`prts-scanner.ts` 一次读取指令字段，保留正文相对行号、空行／注释和原始文字。Decision 在入口配对 label／value，Predicate 的条件只拆分一次；引号内的方括号、逗号、重复参数末值及已审查的 fadestyle 冒号规则不变。

`requiresComplexFlow` 在投影前选择流程：未结束的分支内再出现 Decision、重复／多余 values、孤立／重新开启／重复或未知条件使用原 source-order ScriptFlow。删除 ComplexFlow 异常与整个章节重新解析；简单分支仍用嵌入选项的原投影。简单路径把值、选项和场景保存在一起，删除按索引猜空标签、缺选项错误及缺场景回退。

扫描遇到第一条坏语法时保留该错误，投影到达该行才抛出，避免后面的参数错误掩盖前面的未知命令／控制流错误。扫描仍检查其后的原始行，以维持 Warp 的全源 Label 查找及 GotoPage 的末尾限制。这里只延后已分类的 ReaderError，不吞掉程序异常，也不展示未识别语法为正文。

人物／CG 状态、multiline、段落分组、共同后续、源诊断及两种输出结构均保留。R4b／Chevrotain 不采用：当前窄扫描器已分清字段和流程，统一两种输出还必须维持不同段落／ID 语义，没有已证实的进一步简化收益；换库不是本轮完成条件。

## 验证

- build、check **99/99**、类型及格式通过。受影响解析／兼容／图片共 **34/34**；新增四项覆盖流程选择、引号／分段／行号、最早错误和跨坏语法的源全文检查。
- 最终 `audit:refactor`：**1,756 篇完整结构与独立字数、169 立绘、122 CG 引用、207 组合、302 原图、固定身份样本 21 发言块零差异、零联网**。冻结报告 SHA256 仍为 `07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e`；不是全库身份或全部图片重新解码验收。
- 本机原创指令三元组合 **10,648** 个，包含嵌套／复用／重开条件、CG、未知命令、坏字段、Warp 和 GotoPage；旧实现成功 998 个、明确拒绝 9,650 个，新实现的完整输出或错误码／文案全部一致。
- 真实 Edge PRTS 完整 **20/20** 首轮通过，2.7 分钟；覆盖新增语法、视频、异常来源条件、正文准备、恢复、缓存、图片、封面以及四窗口／双主题。没有 UI／样式改动，未重复交互稿操作；完整 fixture 和最终包回归在 R5 收尾执行。当前桌面完整 UI 与其他平台未重验。

## 同输入耗时与内存

使用同一 1,756 篇 raw／metadata，输入总哈希 `1fde84f15ab539de9c39a13df4b9d200b4c654ff58959e7e12fb1a5517c63e9d`。旧 script／flow 源码在 `7724df1` 与 `fa531bb` 间没有变化；本机 before-dist 复制当前构建及依赖，仅替换这两个文件为冻结旧构建，不改基线目录。

Node 26.13.0；独立进程按旧／新／新／旧顺序，各组先预热一次再测三轮。输入预载，每轮前 GC，每篇结束采样 RSS／heap；耗时包括采样，不含读文件。以下为每实现六轮中位数，内存为各轮采样峰值的中位数，不能当作宿主启动内存或普遍提速承诺。

| 输入             |      旧耗时 |      新耗时 |         旧／新 RSS |        旧／新 heap |
| ---------------- | ----------: | ----------: | -----------------: | -----------------: |
| 全部 1,756 篇    | 1,777.20 ms | 1,779.36 ms | 231.56／228.76 MiB | 122.68／121.97 MiB |
| 其中 37 篇复杂流 |   105.03 ms |    81.60 ms | 221.70／217.01 MiB | 112.87／112.50 MiB |

全库耗时相近，复杂流少了被废弃的前半次投影。初次测量在旧进程额外导入了一份当前目录依赖，现改为从各自根目录导入，且在浏览器结束后独立重测；原始 `benchmark-first*` 保留，最终采用 `benchmark.json`，不混合两批数字。

## 命令与交付

证据在 `.ai/local/refactoring-0.1.24/r4a/`；所有写入均在隔离目录，不操作 `.runtime` 或实际安装记录。

```powershell
./scripts/npm.ps1 exec '--' tsx --test tests/prts-scanner.test.ts tests/prts.test.ts tests/prts-compat.test.ts tests/body-images.test.ts
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run audit:refactor '--' --output .ai/local/refactoring-0.1.24/r4a/current.json --compare .ai/local/refactoring-0.1.24/baseline.json
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe .ai/local/refactoring-0.1.24/r4a/differential.mjs
& ./.local/toolchain/node-v26.13.0-win-x64/node.exe .ai/local/refactoring-0.1.24/r4a/benchmark.mjs
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts
```

Edge／HTTP／真实网络按工具审批在沙箱外隔离运行。未安装、推送或发布。本片独立本地提交后继续 R5；回退不需要清缓存或迁移记录。
