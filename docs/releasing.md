# npm 发布操作指南

发布前先完成[发行包验证](testing.md#发行包)。0.1.26 已首次本机发布，registry integrity 与已验收归档一致；next 与 latest 当前均指向 0.1.26，稳定目录仍为空。后续发行使用新版本号，不重发 0.1.26。

## 自动发布所需配置

1. 工作流仅引用 `npm-production` 一个 GitHub environment，用于 npm 发布审批。Required reviewers 使用 Foreverstar7，不启用 Prevent self-review，以便审批自己触发的工作流；关闭管理员绕过审批，保存 protection rules。环境只保存审批规则，不需要 npm token。
2. npm trusted publisher 对应 `Foreverstar7/arknightStoryReaderGPTPlugin`、工作流 `release.yml`、环境 `npm-production`，需要明确允许 npm publish。新配置须在 2 天内完成首次成功发布，因此先准备 GitHub 环境再创建 npm 配置；验证使用递增版本，不重发 0.1.26。工作流不使用长期 npm token，也不做 token 静默兜底。公开仓库与公开 npm 包是自动 provenance 的前提。
3. 稳定提升不绑定 environment，由 `workflow_dispatch` 和真实宿主验收确认控制。工作流需要向 main 提交目录的权限；若分支保护禁止直接写入，则通过 PR 合并。提交身份为 Foreverstar7 <foreverstar717@gmail.com>。

官方依据：[npm bundleDependencies](https://docs.npmjs.com/cli/v12/configuring-npm/package-json/#bundledependencies)、[trusted publishing](https://docs.npmjs.com/trusted-publishers/)、[Codex marketplace](https://developers.openai.com/plugins/build/plugins)。桌面 stdio 的[公共目录上架](https://developers.openai.com/plugins/deploy/desktop-only)是另外的准入流程。

## 候选到稳定

1. 运行 `npm run release:version -- X.Y.Z`，完成 check、pack 和实际包验收。由发布者提交源码并推送匹配的 `vX.Y.Z` 标签，不单独执行 `npm version`。
2. `release.yml` 在 Windows 固定 Node 26.13.0／npm 12.2.1，检查类型／测试／格式，构建 tgz，以一次全新 npm 安装完成全部离线协议／UI 和真实 PRTS 小样本验收，再执行源码 fixture 浏览器回归。
3. 同一 tgz 与 `release.json` 上传到 Actions artifact。经 `npm-production` 审批后，核对版本、标签提交、干净状态、run ID 及归档 integrity，OIDC 发布为 `next`；发布 job 不重新构建。
4. registry 返回同版本且 integrity 一致后，保存 `published.json` 和 draft Release。`next` 不是稳定安装入口。
5. 发布者在 Windows x64 的真实 Codex 桌面验证该明确 npm 版本：干净安装、侧栏入口、三页阅读与图片、保存／重开、升级和卸载保留记录。记录 CLI／桌面／Node 版本及可访问的 HTTPS 证据 URL；浏览器或 app-server 结果不替代桌面验收。
6. 从 main 手动运行 `promote.yml`，填写版本、证据 URL，并确认真实宿主通过。工作流核对标签内包名／版本、发布回执、源码提交和 registry integrity，更新 `.agents/plugins/marketplace.json` 及 `docs/releases/X.Y.Z.json`。推送成功才公开 Release。

marketplace 固定 npm 版本，不使用 latest 或版本范围。`check.yml` 在普通 push／PR 时使用 Ubuntu 执行类型／测试／格式检查、打包、离线包验证及源码 fixture 回归，不依赖 PRTS；结果见 [main 分支 Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/workflows/check.yml?query=branch%3Amain)。标签验收使用 Windows，发布 job 使用 Ubuntu 上传同一 tgz；未配置 macOS 或三平台验收矩阵。修复可先按 [Windows 本地预检](testing.md#windows-本地候选预检) 验证，再运行最终标签 CI。各平台的真实桌面支持仍需对应环境验收。Windows 验收、OIDC 发布与稳定提升分别以实际运行记录为准，当前结果见 [STATUS](../.ai/STATUS.md)。

## 失败恢复

- 构建／验收失败：修复再重跑，不发布或提升坏包。
- OIDC／npm 失败：稳定目录不动，核对包名权限和 publisher 的 repo／workflow／environment，不临时把 token 写入仓库。
- registry 只有 `0.0.0-stage`：这是新包暂存发布的公开占位版，不能当作目标版本发布成功。先用 `npm stage list <包名>`／`npm stage view <stage-id>` 核对待批准版本、标签与归档；确认正确后由发布者通过 `npm stage approve <stage-id>` 或 npm 网页批准并完成 2FA。若没有待批准记录，先核对原发布命令结果，不盲目重发。[官方暂存发布说明](https://docs.npmjs.com/staged-publishing/)
- npm 已成功但 Release 失败：重跑 publish job；只有 registry 同版本 integrity 与验收归档一致才跳过重复 publish。版本冲突立即失败，npm 版本不可覆盖。若验收 artifact 已过期，重新验收／打包；新归档不匹配已发布版本时发布新版本。
- 宿主验收失败：保留 draft 和 next，修复后发行新版本，不提升稳定来源。
- promotion 推送失败：远端目录保持原值，解决权限或以 PR 合并，不强推。若目录成功而 Release 编辑失败，可重跑 promotion 完成说明，不重发 npm。
- 回退：将稳定来源指向既有已验收版本；先确认数据兼容，正常关闭会话并备份外部 `reading/`。不删除旧 npm 包，不清理私人记录。
