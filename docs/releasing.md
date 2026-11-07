# 发布流程

发布者的操作只有：修改代码并更新版本号、推送 main、等待自动检查与草稿准备完成，然后点击一次 **Publish release**。后续 npm latest、正式插件清单和发布回执均由工作流完成。

## 发布一个版本

1. 修改代码，需要发行新包时统一更新版本：

   ```powershell
   ./scripts/npm.ps1 run release:version '--' X.Y.Z
   ```

   该命令同步 package、lock、plugin 和源码版本。纯网站、文档或工作流调整可以不升包版本。

2. 提交并推送 main。普通 push／PR 运行 Check；main 的 Prepare release draft 自动判断该版本是否已经有固定标签／完整草稿／公开发行。已有版本的普通提交、正式清单回写不会重复创建发行。
3. 新版本在 Windows 使用固定 Node 26.13.0／npm 12.2.1 执行类型／测试／格式、构建、实际包离线与真实 PRTS 验证、fixture 浏览器回归。全部通过后才创建固定的 `vX.Y.Z` 注释标签和 Release 草稿，将验收的同一份 tgz、release.json、verification-prts.json 上传。标签记录源码提交、integrity 和原验收运行，之后不移动。
4. 等待 Prepare release draft 成功，在 GitHub Releases 打开对应草稿，确认版本与说明，保持 **Set as a pre-release** 未选中，点击 **Publish release**。不要另建标签或手动上传替代包。
5. Publish release 工作流由 `release.published` 触发，只处理正式版本。它从该 Release 取附件，核对固定标签、源码提交、包版本、实际归档 integrity 和验证报告，使用 OIDC 将同一归档发布到 npm latest，不从最新 main 重新打包。
6. npm 确认后，工作流自动向 main 提交 `.agents/plugins/marketplace.json` 和 `docs/releases/X.Y.Z.json`。清单固定精确版本，回执保存归档身份、构建运行和发布运行。

**点击 Publish 只是开始发布。Publish release 工作流成功，并且 npm 版本、main 的正式清单与版本回执一致，才算全部完成。** 不要求先发 next、安装候选来源、填写宿主验收链接或另外运行 promote。

## 一次性网页配置

### GitHub

- 仓库 Settings → Environments → **npm-production** → Deployment protection rules：取消 **Required reviewers**，Wait timer 保持关闭，保存规则。保留环境名称，以匹配现有 npm OIDC 配置；否则发布 Release 后还会出现第二次审批。
- npm-production 的 Deployment branches and tags 允许版本标签；现有无分支限制配置可以保留。
- 仓库的 Actions／分支规则需允许工作流使用 `contents: write` 创建标签、草稿和向 main 回写发布元数据。工作流已显式声明权限，不需要长期 GitHub token，也不把每次人工合并 PR 作为发布步骤。

### npm

在 npm 的 `arknights-story-reader` 包 → Settings → Trusted Publisher 保留或配置：

| 字段                 | 值                                     |
| -------------------- | -------------------------------------- |
| Provider             | GitHub Actions                         |
| Organization or user | `Foreverstar7`                         |
| Repository           | `arknightStoryReaderGPTPlugin`         |
| Workflow filename    | `release.yml`                          |
| Environment name     | `npm-production`                       |
| Allow npm publish    | 开启                                   |
| Allow npm dist-tag   | 开启，用于已有版本的标签迁移／失败收尾 |

原配置若不能直接编辑，按 npm 提示重建相同来源。无需 promote.yml 的独立连接，不保存长期 npm token。固定 npm 12.2.1 满足 OIDC 发布与 dist-tag 的版本要求。

官方依据：[GitHub Release 事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)、[环境规则](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)。

## 首次安装与更新

首次安装：

```sh
codex plugin marketplace add Foreverstar7/arknightStoryReaderGPTPlugin --ref main
codex plugin marketplace upgrade arknights-reader
codex plugin add arknights-story-reader@arknights-reader --json
```

更新时正常关闭旧阅读器会话，再执行：

```sh
codex plugin marketplace upgrade arknights-reader
codex plugin add arknights-story-reader@arknights-reader --json
```

来源固定到最新一次成功完成发布的精确 npm 版本。`already added` 只表示来源已登记，不代表刷新；刷新再安装才能取得清单中的版本。已安装插件不会因仓库发布新版而后台自动升级，更新后重启客户端或新建会话使用新版。外部阅读记录保持独立，不放在插件版本目录内。

## 失败恢复

- 自动检查失败：修复后推送。没有固定标签时会再次构建；已完整准备的版本保持冻结，要发行改动应使用新版本号。
- 草稿保存中断：重跑原 Prepare release draft，或再次推送。已有固定标签记录原验收运行，工作流复用该次 artifact，只补缺失附件；同名不同内容立即报错，不覆盖包或移动标签。artifact 已过期且缺失的附件无法补齐时，发行新版本。
- npm 发布失败：修复配置后重跑原 Publish release，不需要再次点击 Publish。已有同版本且 integrity 一致时跳过上传；不一致报错，不覆盖 npm 版本。仅 registry 暂时缺失或旧标签回读最多等待五分钟，其他权限／JSON／hash 错误直接失败。
- npm 已成功、main 回写失败：npm 版本保留，处理权限或并发提交后重跑原发布工作流，继续清单和回执。工作流自身的提交不增加版本号，不触发重复发行；不自动回退已经公开的 npm 包。
- 已存在的旧版本只做 registry／integrity 核对和标签、清单、回执迁移，不重新上传包，也不移动旧标签。

本地发行物预检和按需开发探针见[验证指南](testing.md)。浏览器、协议和加载器检查的结论各自记录；它们不冒充真实桌面 UI 体验，也不构成额外的人工发布确认。
