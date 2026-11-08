# 搜索卡片与侧栏阅读器

桌面搜索卡片通过官方 global entrypoint 深链进入当前安装来源的阅读器，目标为该剧情的篇目目录；卡片仍保留在对话中。正文阅读不调用模型，也不增加模型可见工具。

## 依据与契约

- [OpenAI Extensions](https://developers.openai.com/plugins/build/extensions) 提供 Sidebar apps 和 Deep Links；[官方规范](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#deep-links) 定义桌面 `codex://plugins/{plugin}@{marketplace}/app/{tool}?path=...` 及初始化／后续 `openai/deepLink` context 更新。
- [官方示例](https://github.com/openai/mcp-extensions/blob/main/plugins/bits-and-bolts/src/app/controller.ts) 使用标准 App.openLink 打开深链；读取字段及旧版 path/query 格式的兼容依据为[官方接收端](https://github.com/openai/mcp-extensions/blob/main/typescript/src/app/deep-link.ts)。
- 本应用只接受 `/` 或 `/stories/{编码后的剧情 ID}`，查询中的 `match` 为命中篇目，`activation` 为每次点击的 UUID。外部 URL、片段、未知路径或参数、坏编码和空 ID 保留明确错误，不用其请求任意正文。目标必须属于当前目录。
- reader_open 保留 global／thread 入口；深链只指向 global。初始化链接优先于自动续读；已打开实例通过同一导航流程应用新目标，连续到达时只提交最新目标。

## 安装来源

宿主 context 没有公开的当前 marketplace 身份字段，不能据此猜测目标，也不依赖某台电脑的插件缓存路径。

- 正式 mcp.json 显式设置 `READER_PLUGIN_TARGET=arknights-story-reader@arknights-reader`，与正式 marketplace 名称一致；协议服务只把校验后的值放入 HTML。
- scripts/prepare-plugin.ts 用 manifest.name 与其生成的 arknights-reader-dev 来源名称写入开发配置，防止开发版点击后打开旧的正式插件。
- 自建来源改变名称时须相应设置该环境变量；原始源码／无配置的其他宿主继续在当前容器中阅读。更名后复测正式及开发目标，tests/reader-links.test.ts 同时核对正式清单身份。

这些值是本仓库维护的发行标识，来源为 marketplace 和 plugin manifest，不是剧情数据或资源地址。字段维护入口为 mcp.json、scripts/marketplace.ts 和 scripts/prepare-plugin.ts。

## 失败与状态

离开正文前先排空位置保存队列；失败时保持当前正文和可重试错误，不重建实例。重复点击同一剧情使用不同激活标识，避免宿主合并相同 context 更新。浏览目录不改变最近阅读或最远进度。

已配置的桌面宿主经 openLinks 能力打开侧栏；明确拒绝后保留卡片，提供“重试打开”和显式“在当前窗口打开”。其他宿主、浏览器及网站预览沿用原有 fullscreen／当前容器流程。

## 验证

固定工具链运行 npm run check、npm run build、npm run test:e2e 和 npm run test:e2e:host；Windows 可以按验证指南选用 Edge。SDK fixture 使用实际 MCP HTML／工具、标准 open-link 和 context 通知验证两种来源、初次／重复跳转、慢初始化、保存排队／失败、最新目标、坏链接、宿主拒绝，以及四种窗口双主题。

此项证明协议和应用导航行为，不能代替真实 ChatGPT 桌面处理 URI 的体验；实际验收结论与剩余项记录在 [STATUS](../.ai/STATUS.md) 和 [PLAN](../.ai/PLAN.md)。截图、trace 和报告只保留在 `.ai/local/search-card-check/`。
