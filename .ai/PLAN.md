# 下一步

## 完成自动发布与真实桌面验收

0.1.26 已完成首次本机 npm 发布，registry integrity 与验收归档一致，GitHub 仓库已公开，见 [STATUS](STATUS.md)。本地工作流仅 npm 发布 job 引用 `npm-production` environment；稳定提升保留手动触发和宿主验收确认，不绑定环境。普通检查使用 Ubuntu，标签验收使用 Windows，npm 上传使用 Ubuntu，无 macOS 验收矩阵。

正式版目标保持 1.0.0。`cce87d6` 的 Ubuntu Check 与第八次 Windows Release accept-package 全部通过；119 项、完整实际包／PRTS 和原 34 项 Chromium 回归均通过。候选 v1.0.0 固定该提交，发布等待 npm-production 网页审批，见 [STATUS](STATUS.md)。

服务器验收修复完成，沿用该次有效证据和实际 artifact，不重建或移动已验收的候选。当前未完成项：

1. 由用户醒后在 [Release 运行](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42251044304) 点击 Review deployments，选择 npm-production 并 Approve and deploy；助手不批准。该步骤才会启动实际 npm next 发布。
2. 审批后跟进 OIDC／registry integrity／发布回执，保留已验收的 cce87d6 标签和同一 tgz，不使用本地预检包、不覆盖 0.1.26。网站与文档变更正常提交 main，不重新打包或移动 v1.0.0。
3. `npm-production` 的 Foreverstar7 审核、允许自审与禁止管理员绕过已独立核验；npm 网页截图确认 publisher 字段及 `npm publish` 权限匹配，仍为 `Pending validation`，须在 2026-11-08 12:11 UTC（北京时间 20:11）前完成首次成功发布。npm 发布仍由用户网页审批，OIDC 待实际验证，助手不代为批准。
4. 1.0.0 候选发布后，验证该精确 npm 版本在真实 Windows Codex 桌面的安装、阅读、图片、续读、升级及卸载保留记录。
5. 稳定 marketplace 仍为空。发行完成后统一补充 STATUS 与 GitHub Release 的实际结果；README 在打包前定稿，不随临时阶段改写，文档同步不重发同版本 npm 包或移动标签。

其他系统、架构和宿主在实际环境验收后再列入支持范围。

## 本轮已完成：项目网站

用户已在 2026-11-07 明确授权：服务器 Release 验收通过后制作中文项目介绍／安装网站，部署到本仓库的 GitHub Actions → GitHub Pages。使用原创文字、图形与原创 fixture 界面，不使用游戏截图、立绘、CG 或转载剧情正文；只提供介绍、文档与发行入口，不提供在线阅读、正文代理或远端进度服务。默认使用项目 Pages 地址，不购买域名。完成全部验证、保存交接后按用户要求关机；npm 正式发布仍由用户次日在网页审批。

网站源码、三张实际原创示例截图和独立 Pages 工作流已提交／推送为 f6d4221，Pages 构建／部署与对应 Ubuntu Check 均通过。[公开网站](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/) 已实测 HTTP 200，桌面／窄屏、图片与交互正常；README 三张图片说明及最终交接随本次文档提交。细节与维护见 [网站说明](../docs/website.md)。

本轮结束前核对全部相关文件已推送、工作区干净、已验收 v1.0.0 仍指向 cce87d6、npm-production 仍等待用户审批，再按用户本轮要求正常关机。下次接续只推进上方人工 npm 审批、真实桌面与稳定提升，不重新移动已验收标签或把本轮关机指令当作后续默认规则。

## 后续功能

- **基础剧情搜索，未开始**：唯一一个模型可见工具，检索名称、别名、分类、有来源的简介及可靠关键词。结果卡片进入对应篇目列表，搜索本身不写进度；卡片字段在该任务开始时确认。
- **介绍与安装网站，已授权**：按上节在服务器 Release 验收完成后实施；不开展官方目录上架。

当前任务不启动剧情搜索，也不自动发布 npm。现有实现与验证结果见 [STATUS](STATUS.md)。
