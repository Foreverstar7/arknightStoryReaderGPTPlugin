# 多人场景中的可靠立绘匹配

2026-11-04；原修复基线 `5d74ea1`／0.1.22，独立提交 `90b03ac`。用户随后授权合并，现已与目录刷新提交 `4e1fb8b` 一并纳入 main／0.1.23；准备包已重建，未安装。下方原验证记录与本轮集成验证分列。

## 结果与来源

用户截图对应 [4-1 免费拥抱／行动前](https://prts.wiki/w/4-1%20免费拥抱/BEG) 的“我，我……”段落。原先因场景同时有阿米娅与凯尔希，就直接返回占位。现通过通用身份匹配恢复两人的剧情原立绘，这一处无需默认回退。

已核验[阿米娅资料](https://prts.wiki/w/阿米娅?action=raw)、[凯尔希资料](https://prts.wiki/w/凯尔希?action=raw)及[格拉尼资料](https://prts.wiki/w/格拉尼?action=raw)：CharinfoV2 提供明确的干员名和干员id。实现仅在显示名与资料一致、身份编号与当前场景唯一资源在完整边界上对应时采用该资源，并保留原表情／造型。图片失效后仍用现有同 body 默认规则。

没有新增角色专用姓名、别名或图片 URL 表。模板字段解析复用已有实现。匿名、错名、无资料、多个候选仍占位；不扩展无场景资源搜索或猜 NPC 身份。资料只在多资源立绘请求时按需读取，复用 mapping 缓存与刷新代次，支持离线复用；网络和格式错误不吞掉。

## 验证与边界

- `./scripts/npm.ps1 run check`：类型、73 项检查、格式通过。
- `./scripts/npm.ps1 run build`：最终构建通过。
- Edge 的 `prts-images.spec.ts` 和 `prts-body-images.spec.ts`：7/7 通过，含真实截图段落及原有图片交互。
- 收紧缓存／字段校验后，`body-images.test.ts` 与 `metadata.test.ts` 14/14 通过；最终构建的真实 4-1 专项 1/1 通过。
- 320×760、768×900、1440×900、1024×400；浅深主题、减少动态效果、触摸外部关闭和 Esc 焦点恢复通过，窄屏与低高度截图已检查。浮层保持图片与小号 PRTS 链接。

验证通过独立端口 4336 和 worktree 隔离数据目录运行，没有操作真实阅读记录。公开资料、截图和日志在 `.ai/local/portrait-identity/` 与 `.ai/local/screenshots/`，不提交原文或图片。本次没有重跑全库身份审计，旧 0.1.22 统计是历史基线；维护脚本将多资源场景标为身份匹配前未解决数，不当作最终缺图／占位数量。真实桌面宿主 UI 未验，现有安装仍是原 0.1.22。


## 合并后验证（0.1.23）

代码自动合并，三个协作文档冲突保留双方记录后整合。两项功能、通用身份规则和原姓名均保留，没有新增角色专用映射或依赖，独立分支／worktree 仍保留，并快进到与 main 相同的合并结果；本轮准备包位于主仓库 `E:/codeProject/arknightStoryReaderGPTPlugin/.local/marketplace/plugins/arknights-story-reader`。

- `./scripts/npm.ps1 run check` 与 `build`：76 项检查、类型、格式和正式构建通过；最后测试调整后类型与格式再次通过。
- Edge `catalog-refresh.spec.ts`＋`reader.spec.ts`：10/10；覆盖目录乱序／失败重试、记录和缓存清理、导航、触摸、键盘、四窗口／双主题。
- Edge `prts-images.spec.ts`＋`prts-body-images.spec.ts`：首轮 6/7，阿米娅和凯尔希原图通过。CG 用例在打开 MT-6 时触发默认 5 秒断言；trace 显示正文请求仍未响应、页面仍在加载，没有已完成的错误响应。既有网络超时为 20 秒，将章节可见断言改为最多 30 秒后，受影响的整个正文图片文件 4/4 通过；7 个唯一图片场景均覆盖通过。未用固定 sleep、跳过用例或改产品逻辑消除失败。
- 检查本轮 320px 目录失败反馈与低高度深色阿米娅截图，刷新按钮、状态换行、立绘与小号 PRTS 链接均可见。
- `plugin:prepare`＋`probe:mcp -- .local/marketplace/plugins/arknights-story-reader`：合并后的包内 Node／stdio 通过；0.1.23、10 app-only 工具、刷新参数及状态保持、117 部目录、531,526 字节 UI、64 块真实首篇、1500×844 CG、隔离保存均通过。63 个 dist 文件及 Node 的哈希与当前构建完全一致。

证据在 `.ai/local/merge-portrait-catalog/`，含首次失败 trace、复验日志和 `package-integrity.json`。所有验证使用隔离数据，未操作真实阅读记录。此次没有重跑全库身份审计、安装、推送、发布或删除工作树；真实桌面宿主 UI 仍未验。
