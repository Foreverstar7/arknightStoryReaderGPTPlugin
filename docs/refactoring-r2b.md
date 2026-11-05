# R2b：图片来源、选择与读取

日期：2026-11-05。从干净的 `3b48d6a` 接续。功能比较仍以 `7724df1`／0.1.24 为准，版本、依赖、工具及磁盘格式不变。

## 改动与保留依据

`prts-resource-source.ts` 负责公开请求、受限字节读取、图片索引、文件 URL 与映射 JSON 解码；两个人物字典共用取得方式和预算，保留各自错误文案与来源。`prts-image.ts` 负责原图格式检查与图层读取／几何组合，逐层检查总传输预算后才读取下一层。`PrtsResources` 保留缓存、代次、身份取得与回退编排，纯选择继续使用 `prts-portrait.ts`，CG 源语义继续使用 `prts-cg.ts`。

立绘结果明确带有 portrait 状态，删除 speakerPortrait 中“不含立绘状态”的不可达分支。现代准确选择失败后直接进入旧映射选择，删除重复的现代准确查找。没有新增资源注册器、角色表、URL 猜测或依赖；现有资源模块的导出仍供维护脚本和冻结基线使用。

保留 cache.run 建立／继承请求代次、同代次请求合并及磁盘解码；没有把它当作无意义转发。新旧准确原图、同 body 默认、占位及错误仍区分；只有原图 HTTP 404 允许继续回退，网络、格式、组合或存储错误仍走重试。资料身份仅对应场景唯一完整资源；显式刷新重新读取身份、变量、映射及图片。

核对现有目录解析、metadata 和 cover-policy 后，未找到能等价替换封面批准规则的通用字段。两组文字封面是用户命名，危机合约图是用户批准且仍需源索引明确引用，EP00–EP04 和三类尺寸是批准展示范围；故保留原窄策略和现有维护注释。没有通过标题猜测或放宽尺寸来消除必要常量。

## 验证

- build／check **92/92**，类型、格式通过。受影响的图片／metadata／跨进程缓存原有 24 项先通过；新增两个行为测试验证 503／坏图片不读旧来源、404 回退及证据顺序、无重复资源请求，以及身份／变量／图片刷新与普通缓存读取的区别。
- `audit:refactor`：1,756 篇结构与独立字数、169 立绘、122 CG 引用、207 组合、302 原图及固定身份样本 21 发言块均零差异，0 网络尝试。冻结 SHA256 仍为 `07b28e86f8cb7002ae07c0b6cad7181dc84def25f544bfe8f7d2e0d005373c1e`；不是全库身份或全部原图重新解码验收。
- 真实 Edge 图片／封面三文件 **13/13** 首轮通过，包含真实原图／身份／CG、封面来源、刷新、清理、无 hover 请求、键盘／触摸、四窗口与双主题。实看本轮 320px 浅色、低高度深色身份和 CGItem 截图，原图及来源入口保持。全部写入只使用 `.ai/local/`。本片不改 UI／样式，完整 fixture 与包回归在 R3b 后执行；当前宿主完整桌面 UI 和非 Windows x64 平台未重验。

日志和报告保存在 `.ai/local/refactoring-0.1.24/r2b/`。实际命令：

```powershell
./scripts/npm.ps1 run build
./scripts/npm.ps1 run check
./scripts/npm.ps1 run audit:refactor '--' --output .ai/local/refactoring-0.1.24/r2b/current.json --compare .ai/local/refactoring-0.1.24/baseline.json
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:READER_E2E_PRTS_PORT = '4342'
./scripts/npm.ps1 run test:e2e:prts '--' tests/browser/prts-images.spec.ts tests/browser/prts-body-images.spec.ts tests/browser/prts-covers.spec.ts
```

下一步直接 R3b→R4a→R5，条件项按已确认门槛判断。未安装、推送或发布，未操作真实阅读记录。回退本片不需要迁移或清理数据。
