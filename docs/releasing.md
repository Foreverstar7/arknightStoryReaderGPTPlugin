# npm 发布操作指南

发布前先完成[发行包验证](testing.md#发行包)。当前 0.1.26 未发布，稳定目录为空。

## 首次配置

1. 确认 npm 包名 `arknights-story-reader` 的可用性／所有权。若更名，同步 package 与 lock 根名称；插件 ID 不变。当前 `UNLICENSED` 未授予开源许可，公开分发前由所有者决定源码许可；剧情与图片不随包分发。
2. 由所有者授权公开 GitHub 仓库。当前工作流在 private 仓库只运行验收，跳过发布；公开仓库与公开 npm 包是这里自动 provenance 的前提。
3. 首包由发布者在本机交互登录 npm、完成 2FA 后发布已验收的归档。包创建后，在 npm 设置添加 trusted publisher：`Foreverstar7/arknightStoryReaderGPTPlugin`、工作流 `release.yml`、环境 `npm-production`，允许 npm publish，并按 npm 要求完成首次验证。
4. GitHub 配置 `npm-production`、`stable-marketplace` 环境与审批人。不要保存明文 npm token，工作流不做 token 静默兜底。
5. 配置稳定提升向 main 提交目录所需的权限；若分支保护禁止直接写入，则通过 PR 合并。工作流使用项目指定的个人 Git 身份。

官方依据：[npm bundleDependencies](https://docs.npmjs.com/cli/v12/configuring-npm/package-json/#bundledependencies)、[trusted publishing](https://docs.npmjs.com/trusted-publishers/)、[Codex marketplace](https://developers.openai.com/plugins/build/plugins)。桌面 stdio 的[公共目录上架](https://developers.openai.com/plugins/deploy/desktop-only)是另外的准入流程。

## 候选到稳定

1. 运行 `npm run release:version -- X.Y.Z`，完成 check、pack 和实际包验收。由发布者提交源码并推送匹配的 `vX.Y.Z` 标签，不单独执行 `npm version`。
2. `release.yml` 在 Windows 固定 Node 26.13.0／npm 12.2.1，检查类型／测试／格式，构建 tgz，执行离线协议／UI、真实 PRTS 小样本和源码 fixture 浏览器回归。
3. 同一 tgz 与 `release.json` 上传到 Actions artifact。经 `npm-production` 审批后，核对版本、标签提交、干净状态、run ID 及归档 integrity，OIDC 发布为 `next`；发布 job 不重新构建。
4. registry 返回同版本且 integrity 一致后，保存 `published.json` 和 draft Release。`next` 不是稳定安装入口。
5. 发布者在 Windows x64 的真实 Codex 桌面验证该明确 npm 版本：干净安装、侧栏入口、三页阅读与图片、保存／重开、升级和卸载保留记录。记录 CLI／桌面／Node 版本及可访问的 HTTPS 证据 URL；浏览器或 app-server 结果不替代桌面验收。
6. 从 main 手动运行 `promote.yml`，填写版本、证据 URL，并确认真实宿主通过。经 `stable-marketplace` 审批，核对标签内包名／版本、发布回执、源码提交和 registry integrity，更新 `.agents/plugins/marketplace.json` 及 `docs/releases/X.Y.Z.json`。推送成功才公开 Release。

marketplace 固定 npm 版本，不使用 latest 或版本范围。`check.yml` 在 Ubuntu 执行类型／测试／格式检查、打包、离线包验证及源码 fixture 回归，不依赖 PRTS。发布 job 使用 Linux 上传；各平台的真实桌面支持仍需对应环境验收。远程工作流尚未实跑。

## 失败恢复

- 构建／验收失败：修复再重跑，不发布或提升坏包。
- OIDC／npm 失败：稳定目录不动，核对包名权限和 publisher 的 repo／workflow／environment，不临时把 token 写入仓库。
- npm 已成功但 Release 失败：重跑 publish job；只有 registry 同版本 integrity 与验收归档一致才跳过重复 publish。版本冲突立即失败，npm 版本不可覆盖。若验收 artifact 已过期，重新验收／打包；新归档不匹配已发布版本时发布新版本。
- 宿主验收失败：保留 draft 和 next，修复后发行新版本，不提升稳定来源。
- promotion 推送失败：远端目录保持原值，解决权限或以 PR 合并，不强推。若目录成功而 Release 编辑失败，可重跑 promotion 完成说明，不重发 npm。
- 回退：将稳定来源指向既有已验收版本；先确认数据兼容，正常关闭会话并备份外部 `reading/`。不删除旧 npm 包，不清理私人记录。
