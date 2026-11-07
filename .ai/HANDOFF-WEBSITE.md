# 回家继续网站改版

工作分支：codex/website-scroll-demo。提交身份：Foreverstar7 <foreverstar717@gmail.com>。当前只同步代码，未合并 main、部署网站或发布 npm。

## 新电脑从正式源码运行

先检查并保留新电脑已有改动，再获取分支：

```sh
git fetch origin
git switch codex/website-scroll-demo
npm ci
node scripts/build-site.mjs
node scripts/serve-site.mjs
```

使用 .node-version 固定的 Node 26.13.0 与 npm 12.2.1；预览为 http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/ 。如果该电脑已存在同名分支，先核对其与远程的关系，不重置或覆盖本地工作。

网站现已自包含于 website/：无配图紧凑首屏、滚动流程、默认收起的真实 ReaderApp、浏览器原创 fixture、安装指南与 FAQ。六张优化封面、图标、构建脚本、锁文件和网站测试随 Git 保存；不依赖公司电脑 .ai/local、旧 HTML、63171 服务或私人阅读数据。六张原始 PNG、完整提示词与弃用的巴别塔首版编辑输入已归档 docs/design/website-covers/，一起同步；完整截图和旧 HTML 仅在公司电脑保留，不是运行依赖。

## 当前要继续的一个点

用户觉得切换过快，已经在 website/walkthrough.ts 用 cue() 加入稳定停留，并把滚动区改为 430svh；总时间轴 18 单位，有效滚动距离比初版约长一半，局部点击／封面迁移仍保留原节奏。测试分镜采样点已更新。

用户明确要求这次不再测试，先同步，有问题回家再处理。因此新节奏未构建或验收；公司电脑仍在运行的预览是微调前构建。初版的构建、类型、7 项数据测试与 5 项浏览器场景已经通过，不能将其表述为新节奏通过。

## Actions 的实际覆盖

- Check：所有分支 push 自动运行通用类型／格式／单元测试、打包验收和插件浏览器回归；新的网站数据单元测试也在 npm test 中。
- Deploy project website：main 上网站相关变更自动运行网站构建、专项浏览器测试，然后部署 Pages；工作分支 push 不触发它。
- 本次不等待或修复远程失败。回家后先看 Check 结果，再继续网页节奏评审；不要为测试分支手动运行会部署的 Pages 工作流。

后续需要的网站命令与来源见 docs/website.md，项目状态见 .ai/STATUS.md；不要重新推进已弃用的玛恩纳／文字战场方向，或重开 CG／立绘制作。
