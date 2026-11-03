# S4 交付检查点

本页保留独立分支交付历史。S4 已提交为 23c7208，封面为 87f3930；合并后的 0.1.19 验证与当前 Git 状态见 docs/integration-0.1.19.md 和 .ai/STATUS.md。下文未提交／等待条件不再作为当前阻塞。

2026-11-03 后续授权：用户要求先提交 S4，再合并已验证的封面分支。S4 0.1.18 在 main 单独形成提交边界，随后于独立工作树集成 0.1.19；旧文中的“不提交／不处理剩余封面”是本轮授权之前的交付状态。不进入 S5，不推送或发布。提交前已重新通过 build 和 check（47/47）；最终组合另行验证。

更新：2026-11-03。**S4 及本轮首页圆环／字数反馈已完成实现、验证和本机交付，停下等待用户体验。** 正式验收及历史诊断见 `docs/prts-s4.md`。

## 工作区与安装

- 项目 `E:/codeProject/arknightStoryReaderGPTPlugin`，main 基线 `b00b5b9471345420ff8210e586275caa001b2daa`（0.1.15）；当前 0.1.18，全部改动未提交。
- 安装目录 `C:/Users/Administrator/.codex/plugins/cache/arknights-reader-dev/arknights-story-reader/0.1.18`。49 个 dist 文件逐一 SHA256 一致，UI 517423 字节，包内 Node 与项目 26.13.0 哈希一致。
- 4318 为最终 0.1.18/prts，保留原 `.runtime/`。插件数据位于 `%LOCALAPPDATA%/ArknightsStoryReader`，不随版本目录搬迁。没有清除真实阅读记录。
- 现有桌面会话可能仍保留 0.1.15–0.1.17 服务，用户体验前应重启客户端。安装版本和加载器检查不能证明现有宿主 UI 已更新。

## 最终实现

- 首页白底圆环、中心百分比和金色进度弧；未阅读为 0%，旧未知记录为短横线。该用户指令替代旧首页未知字数标签。
- 打开剧情以最多两篇并发准备该部全部正文，图片仍按阅读需要加载；预取不写阅读记录、不更新最近阅读、不迁移旧位置、不请求正文图片／映射。离开剧情停止排队；清全部内容同时阻止旧请求回填；失败支持重试。
- 独立公共字数索引跨清缓存／清历史保留；服务端比较源修订，UI 比较统计时间，避免迟到结果覆盖新分母。修订迁移只在实际打开正文时执行，完整分母就绪后按字数加权。
- 修订前后最后／最远锚点独立迁移，歧义保守退回；保存只使用本地索引，旧窗口不能覆盖新记录；缓存与阅读记录独立，原 S4 行为保持。
- 已复现 `images.put / begin / SQLITE_BUSY (5)` 与 `images.put / operation / EPERM rename`。独立 `cache/content.sqlite` 短事务统一 payload／访问时间／代次，进程复用 WAL 连接，旧 JSON 按需迁入、锁外删除。未加重试或延长 5000ms 等待；cause／操作／阶段可诊断。

## 最终验证

- check 47/47、类型／格式、build 通过；包含原缓存压力、迁移、离线、过期及隔离验证。
- Edge fixture 20/20，真实 PRTS 12/12。新增两项浏览器场景覆盖两请求上限、部分失败重试、无已读副作用、清理中止、圆环加权、四窗口／两主题／键盘／减少动态效果。
- 骑兵与猎人 16 篇／14,519 字在阅读前取得，预取无正文图片调用；本次不宣称全库脚本兼容。
- 实际安装包 stdio／HTTP、双进程 S4 探针通过：0.1.18、10 个 app-only 工具、117 部目录。六篇 fixture 预取不写记录，公共字数跨两种清理保留。
- 官方加载器发现 0.1.18／reader／global 入口及 10 个 app-only 工具。真实桌面宿主 UI 仍待用户体验；Computer Use 约束见正式验收文档。
- 手动隔离浏览器：初始 0% → 6 篇／4,002 字加载 → 阅读第一篇 → 首页 16%。截图在 `.ai/local/screenshots/story-ring-{theme}-{width}x{height}.png`。

## 命令、证据与保护边界

完整探针命令见 `docs/prts-s4.md`；其中历史命令的安装目录替换为 0.1.18，所有数据根必须隔离。不要对真实 `.runtime/` 或系统插件数据运行清理、写记录或迁移测试。

最新日志均在 `.ai/local/s4/`：`check-0.1.18.log`、`build-0.1.18.log`、`browser-fixture-0.1.18-final.log`、`browser-prts-0.1.18.log`、`stdio-0.1.18.log`、`http-0.1.18.log`、`host-0.1.18.log`、`installed-s4-0.1.18.log`、`installed-hashes-0.1.18.json` 和 `real-story-counts-0.1.18.json`。旧竞态原始原因在 `tests-diagnostic-2.log` 与 `tests-diagnostic.log`。

本次 0.1.18 交付前后真实预览数据库、系统插件数据库和旧 JSON 三份哈希一致，见 `reading-hashes-before-0.1.18.json`／`reading-hashes-after-0.1.18.json`。旧 0.1.17 保护检查有系统数据库变化，保留为历史证据，不与本轮混用，不回滚真实数据。

本轮进程线索：4318 预览 PID 8036，项目固定 Node 运行 `dist/server/main.js`，保留供体验；临时 4321／4323 分别为隔离 fixture／实际安装包 HTTP，收尾关闭。线索见 `processes-0.1.18.json` 和 `process-cleanup-0.1.18.json`。PID 随时可能变化，操作前必须重新核对路径、命令行和端口；不要结束宿主 stdio 进程。

固定 Node 26.13.0／npm 12.2.1，无依赖升级、模型调用或整库预取。停在 S4，不自动提交 Git、不推送／发布，不开始 S5 或剩余封面工作。
