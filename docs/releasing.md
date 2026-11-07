# npm 发布操作指南

发布前先完成[发行包验证](testing.md#发行包)。截至 2026-11-07，1.0.0 已发布，实际 registry 归档与验收包一致，用户已确认真实桌面验收通过；本轮只读检查发现 npm latest／next 均已为 1.0.0。本地正式目录已补入固定 1.0.0，验收确认见[记录](releases/1.0.0-host-acceptance.md)；远端目录仍为空、GitHub Release 仍为 draft，须推送并运行稳定提升收尾。后续发行使用新版本号，不重发已存在版本。

## 当前版本顺序（2026-11-07）

1. **1.0.0 完成稳定提升**：原运行 42251044304 的验收／发布已全部成功，registry、provenance、回执、候选 draft Release 及本机精确版本安装均已核对，用户确认桌面验收完成。补齐的工作流在验收校验后更新 npm latest、固定目录和公开 Release；本地代码调整不代表远端提升已经完成。
2. **当前不打 1.0.1 标签**：用户确认本阶段不独立发行 1.0.1；网站、兼容修正与发布工具同步等待修复保留在本地 main。网站可独立部署，不移动或覆盖 v1.0.0，不重复发布已有 npm 版本。
3. **1.1.0 加入基础搜索**：新增唯一一个模型可见的基础剧情搜索工具并保持现有契约兼容时，使用 1.1.0。完成对应实际包、阅读器和真实宿主验收再发布，不将工具实现计划当作已交付。

以上按[语义化版本规则](https://semver.org/lang/zh-CN/)区分兼容修正与功能新增；当前版本文件仍是 1.0.0，未创建后续标签或执行稳定提升。

## 自动发布所需配置

1. 工作流仅引用 `npm-production` 一个 GitHub environment，用于 npm 发布审批。Required reviewers 使用 Foreverstar7，不启用 Prevent self-review，以便审批自己触发的工作流；关闭管理员绕过审批，保存 protection rules。环境只保存审批规则，不需要 npm token。
2. npm 包的 Settings → Trusted Publisher 需要分别配置下表中的两个 GitHub Actions 来源。Organization or user 为 `Foreverstar7`，Repository 为 `arknightStoryReaderGPTPlugin`。工作流名称只填文件名，权限彼此独立；保留现有 release.yml 配置，另加 promote.yml。已有连接不能直接更改时按 npm 网页提示重建对应连接，不删除仍在使用的发布连接。

   | Workflow filename | Environment name | Allow npm publish | Allow npm dist-tag |
   | ----------------- | ---------------- | ----------------- | ------------------ |
   | `release.yml`     | `npm-production` | 开启              | 不需要             |
   | `promote.yml`     | 留空             | 不需要            | 开启               |

   新配置按 npm 提示在有效期内完成首次使用。两条工作流使用 OIDC，不保存长期 npm token；固定 npm 12.2.1 满足官方 OIDC dist-tag 最低版本要求，实际标签写权限由工作流验证。公开仓库与公开 npm 包是自动 provenance 的前提。

3. 稳定提升不绑定 environment，由 `workflow_dispatch` 和真实宿主验收确认控制，job 使用 `contents: write` 与 `id-token: write`。工作流需要向 main 提交目录的权限；若分支保护禁止直接写入，则通过 PR 合并。提交身份为 Foreverstar7 <foreverstar717@gmail.com>。

官方依据：[npm bundleDependencies](https://docs.npmjs.com/cli/v12/configuring-npm/package-json/#bundledependencies)、[trusted publishing](https://docs.npmjs.com/trusted-publishers/)、[Codex marketplace](https://developers.openai.com/plugins/build/plugins)。桌面 stdio 的[公共目录上架](https://developers.openai.com/plugins/deploy/desktop-only)是另外的准入流程。

## 候选到稳定

1. 运行 `npm run release:version -- X.Y.Z`，完成 check、pack 和实际包验收。由发布者提交源码并推送匹配的 `vX.Y.Z` 标签，不单独执行 `npm version`。
2. `release.yml` 在 Windows 固定 Node 26.13.0／npm 12.2.1，检查类型／测试／格式，构建 tgz，以一次全新 npm 安装完成全部离线协议／UI 和真实 PRTS 小样本验收，再执行源码 fixture 浏览器回归。
3. 同一 tgz 与 `release.json` 上传到 Actions artifact。经 `npm-production` 审批后，核对版本、标签提交、干净状态、run ID 及归档 integrity，OIDC 发布为 `next`；发布 job 不重新构建。npm 输出写入日志，发布后仅对 registry 404 最多等待五分钟；权限、格式或 hash 不符不按同步延迟重试。
4. registry 返回同版本且 integrity 一致后，保存 `published.json` 和 draft Release。`next` 不是稳定安装入口。
5. 按下节准备独立候选来源，发布者在 Windows x64 的真实 Codex 桌面验证这个明确 npm 版本：干净安装、侧栏入口、三页阅读与图片、保存／重开、升级和卸载保留记录。记录 CLI／桌面／Node 版本及可访问的 HTTPS 证据 URL；浏览器或 app-server 结果不替代桌面验收。
6. 从 main 手动运行 `promote.yml`，填写版本、证据 URL，并确认真实宿主通过。工作流核对标签内包名／版本、干净发布回执、源码提交、CI 地址和 registry integrity，先更新并回读验证 npm latest，再生成 `.agents/plugins/marketplace.json` 及 `docs/releases/X.Y.Z.json`。目录推送成功后将 GitHub Release 公开、取消 prerelease 并标为 Latest。next 可继续指向同一版本，无需删除。

## 安装候选版本验收

在仓库根目录执行，版本号替换为已发布的精确版本。Windows 使用固定工具链包装器：

```powershell
./scripts/npm.ps1 run marketplace:candidate '--' 1.0.0
codex plugin marketplace add ./.local/candidate-marketplace
codex plugin marketplace upgrade arknights-reader-candidate
codex plugin add arknights-story-reader@arknights-reader-candidate --json
```

准备命令只在忽略的 `.local/candidate-marketplace/` 写入清单，不改正式目录或本机已安装插件。实际安装仍由 Codex 从 npm 下载指定版本；候选来源与正式来源、源码 dev 副本独立。重启桌面或开启新会话后选择候选来源验收，防止把旧 dev 副本的体验记到新包上。

如果此前添加过位于其他临时目录的同名候选来源，先用 `codex plugin marketplace list` 核对根目录。迁移到本节固定路径时，先执行 `codex plugin marketplace remove arknights-reader-candidate` 移除旧登记，再执行本节 add／upgrade／add；否则已登记的旧目录可能仍被使用。

## 在网页执行稳定提升

先将工作流、正式清单和验收记录推送到 GitHub，再按上表配置 promote.yml 的 npm 标签权限。打开 Actions → Promote stable marketplace → Run workflow，选择 main，填写：

- version：`1.0.0`，不带 v。
- host_evidence：推送后可访问的 [1.0.0 验收确认记录](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/blob/main/docs/releases/1.0.0-host-acceptance.md)。后续版本使用自己的实际记录。
- host_accepted：发布者完成该精确版本的桌面验收后勾选。

成功后核对 npm latest、远端正式目录、`docs/releases/1.0.0.json` 和公开 GitHub Release 均为目标版本。已登记来源的用户先执行 `codex plugin marketplace upgrade arknights-reader`，再安装插件；再次 add 可能只显示 already added，不刷新旧目录。

marketplace 固定 npm 版本，不使用 latest 或版本范围。`check.yml` 在普通 push／PR 时使用 Ubuntu 执行类型／测试／格式检查、打包、离线包验证及源码 fixture 回归，不依赖 PRTS；结果见 [main 分支 Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/workflows/check.yml?query=branch%3Amain)。标签验收使用 Windows，发布 job 使用 Ubuntu 上传同一 tgz；未配置 macOS 或三平台验收矩阵。修复可先按 [Windows 本地预检](testing.md#windows-本地候选预检) 验证，再运行最终标签 CI。各平台的真实桌面支持仍需对应环境验收。Windows 验收、OIDC 发布与稳定提升分别以实际运行记录为准，当前结果见 [STATUS](../.ai/STATUS.md)。

## 失败恢复

- 构建／验收失败：修复再重跑，不发布或提升坏包。
- OIDC／npm 失败：稳定目录不动，核对包名权限和 publisher 的 repo／workflow／environment，不临时把 token 写入仓库。
- registry 只有 `0.0.0-stage`：这是新包暂存发布的公开占位版，不能当作目标版本发布成功。先用 `npm stage list <包名>`／`npm stage view <stage-id>` 核对待批准版本、标签与归档；确认正确后由发布者通过 `npm stage approve <stage-id>` 或 npm 网页批准并完成 2FA。若没有待批准记录，先核对原发布命令结果，不盲目重发。[官方暂存发布说明](https://docs.npmjs.com/staged-publishing/)
- npm 已成功但 Release 失败：重跑 publish job；只有 registry 同版本 integrity 与验收归档一致才跳过重复 publish。版本冲突立即失败，npm 版本不可覆盖。若验收 artifact 已过期，重新验收／打包；新归档不匹配已发布版本时发布新版本。
- 发布命令成功但立刻查询为 404：可能存在同步窗口。1.0.0 的首次实际上传结束后约四分钟才出现在 registry，旧脚本即时查询误报失败。先核对精确版本、next 和真实归档 hash，不能把退出码 0 当作已经公开，也不要立即重复上传。确认同一版本／归档已存在后，只重跑 publish 补回执与 draft；GitHub 可能再次要求环境审批。当前 main 已补有限等待，旧 v1.0.0 标签不移动；暂存与普通同步延迟分别核对。
- 宿主验收失败：保留 draft 和 next，修复后发行新版本，不提升稳定来源。
- npm 标签权限失败：确认为 promote.yml 单独开启 Allow npm dist-tag，并授予 job 的 id-token: write；release.yml 的发布权限不能代替它。脚本在 latest 验证前不写生成目录或公开 Release。权限／JSON／hash 错误立即失败，只有缺失或仍为旧版本的标签回读最多等待五分钟，不重复提交标签写入。
- promotion 推送失败：npm latest 可能已经更新，远端目录保持原值；解决权限或以 PR 合并，不强推。若目录成功而 Release 编辑失败，可重跑 promotion 完成说明。重跑会再次校验归档，latest 已正确时跳过标签写入；不重发 npm、不自动回退已更新的标签。
- 回退：将稳定来源指向既有已验收版本；先确认数据兼容，正常关闭会话并备份外部 `reading/`。不删除旧 npm 包，不清理私人记录。
