# 回家继续网站改版

当前集成分支：本地 main。网站功能提交 c29a113 已连同换机基线 e1a1c3e 快进合并，codex/website-scroll-demo 保留；远端 main 仍为 93446b9，网站与本地工具修复未推送或部署。用户已在本机预览认可效果。本机网站预览按要求运行在 http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/ 。

1.0.0 已从固定 cce87d6 归档发布到 npm next，实际下载 hash 与验收包一致，provenance 指向原工作流。首次发布因约四分钟同步延迟误报失败，单独重跑 publish 后整个运行 42251044304 已成功，回执和候选 draft Release 437560439 已核对。下一步是真实桌面验收，再提升稳定来源。用户明确本阶段不打 v1.0.1；新增唯一模型可见基础搜索后再准备 1.1.0。

本地发布工具已补仅对 404 的五分钟有限等待及 npm 输出，完整类型／132 项测试／格式通过；这项改动未用于旧标签的本次重跑，不改变已发布包。状态、实际 registry 归档、provenance 与附件核对在 .ai/local/release-1.0.0/published-1.0.0/。版本文件未升版，具体步骤见 .ai/PLAN.md 和 docs/releasing.md。

## 新电脑从正式源码运行

先检查并保留新电脑已有改动，再获取分支：

```sh
git fetch origin
git switch main
git merge --ff-only origin/main
npm ci
node scripts/build-site.mjs
node scripts/serve-site.mjs
```

当前 c29a113 尚未推送，另一台电脑暂时无法通过 fetch 取得本次合并；上述远端同步步骤在用户授权推送后使用。使用 .node-version 固定的 Node 26.13.0 与 npm 12.2.1；预览为 http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/ 。如果该电脑已有本地提交，先核对与远端的关系，不重置或覆盖工作。

网站自包含于 website/：无配图紧凑首屏、滚动流程、默认收起的真实 ReaderApp、独立占位数据、安装指南与 FAQ。构建不依赖公司电脑 .ai/local、旧 HTML、63171 服务或私人记录。六张封面原图与提示词在 docs/design/website-covers/；本轮动物兔子原图、编辑输入及完整提示词在 docs/design/website-demo-assets/，网页只加载已有封面 WebP 和 rabbit-portrait.webp。

## 当前图片与文案

用户明确本次针对“亲自试试”，不是滚动区；已接入六张封面和同图的原位场景，所有目录／篇目／简介／正文／选项／角色名改用占位符。已知角色与分支角色共用同一只可爱的卡通动物兔子；用户拒绝人形，动物四足坐姿、细项圈、蓝色小吊坠和银环是现行方向。匿名“？？？”保持中性占位，不推定身份。

网站数据位于 website/demo/data.ts，图片清单与按需加载在 assets.ts；原 src/data/fixture.ts 保持独立。新 v2 会话键保留旧 v1，不读取插件记录。共享可选 imagesAvailable／sourceLabel 仅让已有 UI 接收真实演示图片，不伪装成 PRTS。README 四张 demo-*.png 由实际静态网页生成，运行 scripts/capture-site-previews.mjs 可重建；只用隔离浏览器和自有 4331 静态服务。

滚动时间轴／430svh 节奏未改。测试用 DOMMatrix 比较等价几何，真实触摸等待原生 scrollend 后只 tap 一次。低高度实图发现固定体验框会遮住兔兔，已将窗口高度约束为随视口收缩；小浮层内部保留原生滚动。实际验收结果及命令见 STATUS 顶部与 .ai/local/website-demo-media/。

## Actions 的实际覆盖

- Check：所有分支 push 自动运行通用类型／格式／单元测试、打包验收和插件浏览器回归；新的网站数据单元测试也在 npm test 中。
- Deploy project website：main 上网站相关变更自动运行网站构建、专项浏览器测试，然后部署 Pages；工作分支 push 不触发它。
- 本次已本地提交／合并；推送 main 会触发网站部署，按用户后续指令执行，不手动运行会部署的 Pages 工作流。

后续命令与来源见 docs/website.md，项目状态见 .ai/STATUS.md。不恢复已弃用的玛恩纳／文字战场或人形兔子；角色与场景范围以本轮新要求和已接入素材为准。
