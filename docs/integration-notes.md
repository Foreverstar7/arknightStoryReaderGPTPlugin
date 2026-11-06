# 结构、接口与存储

## 运行路径

```text
React 阅读器
  → MCP Apps callServerTool / 本机 HTTP 预览
  → ReaderService
  → PRTS 数据适配 + 阅读记录 / 内容缓存 / 公共字数
```

页面不直接访问 PRTS，也不调用模型。MCP UI 打包为单一 HTML；业务数据由本机 Node 服务管理，widget state 不承担持久阅读记录。

- `src/ui/`：页面、导航、位置观察、保存队列、图片状态与动画。
- `src/domain/`：字数、进度与正文修订迁移，独立于 DOM。
- `src/data/`：PRTS 请求、目录／脚本解析、资料与图片来源。
- `src/storage/`：SQLite 记录、字数与公共缓存，以及跨进程清理代次。
- `src/shared/`：数据 schema、工具契约、显示规则和版本。
- `src/server/`：共享业务服务及 MCP／HTTP 适配。

## 启动入口

- `src/server/main.ts`：开发入口。`READER_SOURCE` 默认为 `prts`，可显式设为 `fixture`。
- `src/server/production.ts`：正式入口，只使用 PRTS；不支持的来源配置直接报错。
- `src/server/cli.ts`：npm bin，默认带 `--stdio --installed`。
- `src/server/start.ts`：共用启动流程与数据根目录选择。

`mcp.json` 通过系统 `node` 启动 `dist/server/production.js`，参数／工作目录使用 `${PLUGIN_ROOT}`。正式 npm 包包含生产依赖，不包含 Node、源码开发入口或 fixture。

HTTP 开发服务只监听 `127.0.0.1`，端口默认 4318（可用 `PORT` 设置）：

- `/health`：服务状态、数据来源与版本。
- `POST /api/tools`：浏览器预览调用同一工具服务。
- `/mcp`：Streamable HTTP MCP。

Vite 默认使用 5173，并把 `/api` 代理到 4318。启动与来源切换见 [README](../README.md#本地运行)。

## MCP 与宿主

使用官方 MCP Apps SDK 注册 UI 资源及工具；生命周期处理器先注册再连接。`reader_open` 声明 global／thread 入口；十个工具均为 app-only：

- 打开／快照：`reader_open`、`reader_snapshot`。
- 正文／公共字数／简介：`reader_chapter`、`reader_prepare_chapter`、`reader_chapter_info`。
- 图片：`reader_image`。
- 记录与偏好：`reader_record`、`reader_settings`。
- 清理：`reader_clear_cache`、`reader_clear_history`。

输入、输出和返回篇目标识由 `src/shared/tools.ts` 校验。HTTP 传逻辑结果；MCP 把图片字节放在 app-only 的 `_meta.readerImage`，类型化错误放 `_meta.readerError`。大图分段传输并按原字节重组，UI 不需要外域 CSP。

正式版本发布后，其他 MCP Apps 宿主可使用以下 stdio 命令；这些宿主尚未验收：

```sh
npx --yes --ignore-scripts --package=arknights-story-reader@0.1.26 -- arknights-story-reader
```

源码外包检查、CLI 加载器检查和真实桌面操作分别验收，步骤见[验证指南](testing.md)。

## 本机数据

`READER_DATA_DIR` 优先；未设置时，开发使用项目 `.runtime/`，安装模式使用 [README 所列系统数据目录](../README.md#数据与内容来源)。插件版本目录只放程序文件。

- `reading/records.sqlite`：阅读位置、最远进度、偏好与清记录代次。
- `cache/content.sqlite`：正文、资料、映射、图片等公共内容。
- `index/word-counts.sqlite`：篇目修订和字数，不随内容缓存或阅读记录清理。

SQLite 事务处理多个宿主进程；清理代次阻止旧请求回填缓存，historyToken 阻止清除前的页面保存恢复已删除记录。保存队列按序完成，前一次失败不跳过后续已排队保存。

兼容仍在使用的 version-1 记录结构与旧 JSON 数据；按需迁入，保留源文件，迁移标记防止清理后重新导入旧数据。源正文缓存保留 Wiki 原文，解析版本变化时可以离线重解析。

当前修订为 `prts-script-v4`。来自 v3 且源哈希、字数一致的纯图片结构升级保留已有锚点；其他正文变化通过内容匹配保守迁移，不混用不同修订的进度。

## 查证入口

- [MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui)、[插件参考](https://developers.openai.com/plugins/reference)、[插件打包](https://developers.openai.com/plugins/build/plugins)。
- [PRTS 规则与维护来源](maintenance.md)。
- [发布与稳定目录](releasing.md)。
