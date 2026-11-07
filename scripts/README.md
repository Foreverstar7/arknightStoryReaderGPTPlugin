# 按用途选择脚本

日常开发先用 `dev`、`check`、`build`；检查发行物用 `package` 和 `package:verify`。PRTS 审计是遇到对应解析／资源问题时才运行的维护工具，不是每次发布的前置步骤。

发布只需推送 main 并在自动草稿准备成功后点击 Publish release。草稿与正式发布脚本只在对应 Actions 中执行，配置与失败恢复见[发布指南](../docs/releasing.md)。

从项目根目录执行。下文 `npm` 需要项目固定的工具链；Windows 可替换为 `./scripts/npm.ps1`，macOS／Linux 为 `sh scripts/npm.sh`。PowerShell 包装器传入脚本参数时引用分隔符，例如：

```powershell
./scripts/npm.ps1 run package:verify '--' --prts
```

## 日常开发与发布

- `setup-toolchain.ps1`／`.sh`：下载并核验项目固定的 Node／npm，存入 `.local/toolchain/`，不替换系统安装。
- `npm.ps1`／`.sh`：使用上述本机工具链运行 npm。`toolchain-unix.sh` 由 Unix 两个入口共享，不单独执行。
- `npm run dev`、`check`、`build`、`test:e2e`：开发、类型／单元／格式检查、构建和 fixture 浏览器回归。具体启动环境见[项目说明](../README.md#本地运行)。
- `npm run package` → `pack.ts`：构建并打包，归档与元数据放 `.local/releases/`。
- `npm run package:verify` → `verify-package.ts`：在源码外检查实际归档、生产依赖、协议、HTML 和离线 npm 消费；`--prts` 额外联网检查真实阅读与保存路径。
- `npm run plugin:prepare` → `prepare-plugin.ts`：制作新的独立开发副本及本机 marketplace，不自动安装。
- `npm run release:version -- X.Y.Z` → `set-version.ts`：同步项目版本，不提交、不推送。
- `release:plan`／`release:draft`：main 工作流判断新版本、复用中断的验收 artifact、创建固定标签及草稿并上传同一归档。普通提交不重复发行，固定标签和已有附件不被替换。
- `release:publish`：release.published 工作流核对标签、Release 附件和 integrity，发布 npm latest 后生成正式目录和发布回执；npm 同版本同 hash 已存在时只做收尾。

版本号、OIDC 和单次 Publish 确认按[发布指南](../docs/releasing.md)操作。

项目网站的静态构建、预览、原创界面截图与 Pages 工作流见[网站维护说明](../docs/website.md)，与 npm 正式发布流程分开。

## 协议与宿主探针

- `probe:mcp`：启动源码构建或指定包的 stdio 服务，检查工具、UI 资源、正文和图片。默认 PRTS；源码可显式选择 fixture。
- `probe:http`：连接已经运行的 HTTP MCP 服务，默认 `http://127.0.0.1:4318/mcp`；可将 URL 作为第一个参数。
- `probe:host -- --isolated`：用官方 CLI 在独立环境检查安装与加载器。需要已准备的开发来源，或通过 `--marketplace` 指定来源。去掉 `--isolated` 会读取当前客户端环境；两者都不替代桌面 UI 验收。
- `probe:s4:installed`：对开发副本做 fixture 双进程／存储检查。默认从本机开发目录定位，也可传入历史包目录；正式 npm 包不含 fixture，不是此探针的目标。
- `probe:covers`：检查封面元数据及图片分段协议。默认连接 `http://127.0.0.1:4321/mcp`；可显式传 HTTP URL 或包目录。例如 `npm run probe:covers -- http://127.0.0.1:4318/mcp`。

stdio／安装检查自行创建隔离目录；HTTP 探针连接所给服务，可能填充该服务的内容缓存，因此应连接测试服务，不要拿真实阅读实例做验证。

## PRTS 小样本与维护审计

按维护问题选择命令，无需依次执行。

- `probe:prts`：真实正文、独立字数、分支、离线缓存和记录保留的小样本回归。
- `probe:prts:s3`：封面／立绘／CG、目录源顺序、按需请求、缓存复用与清理的专项回归。
- `probe:prts:s4`：检查七个指定公开页面是否提供可用字数分母的研究探针；不是全库证明。
- `audit:covers`：维护封面来源与匹配规则。默认复用本机样本，`--online` 才获取缺失资料；报告在 `.ai/local/cover-audit/report.json`。
- `audit:chapters`：全库正文解析审计；默认会联网取得缺失样本，`--offline` 禁止联网，`--refresh` 重新获取。报告和样本在 `.ai/local/prts-chapter-audit/`。
- `audit:images`：基于上述正文样本核对全库图片引用。默认离线；`--online` 获取缺失映射，`--probe` 联网检查图片头，`--verify-revisions` 核对源站修订，`--refresh` 刷新来源。这后三个参数均要求 `--online`。完整结果与精简报告在 `.ai/local/body-image-audit/report-fixed.json`、`report-summary.json`。
- `probe:images`：完整解码固定回归样本中的 169 种立绘／122 种 CG 及静态组合，不下载整库；默认按需联网，`--offline` 需要已有缓存。使用 Edge（可用 `PLAYWRIGHT_CHANNEL` 改选），结果在 `.ai/local/image-fixes-0.1.22/` 的 `full-decode.json`、`decode-summary.json`、`ui-samples.json`。目录中的版本号标识样本集合，不代表本次被测代码版本。
- `audit:refactor`：使用已构建代码和已有样本进行离线回放／对比，必须提供 `--output`；可指定 `--code-root`、`--samples`、`--compare`。输出不能覆盖比较基线，建议放 `.ai/local/`。

前三个小样本探针输出到 `.ai/local/prts/`。全库审计与完整解码成本较高，只有维护需要时才运行，不会随正常阅读启动。

`tests/fixtures/prts-image-baseline.json` 提供图片探针、离线回放和浏览器测试共用的回归样本。审计结果留在 `.ai/local/`，不自动覆盖这些固定输入。

## 内部共用模块

这些文件由入口或测试导入，不需要手动运行：

- 打包与版本：`package-layout.ts`、`release-version.ts`、`npm-command.ts`。
- 发布核对与目录：`artifact-integrity.ts`、`marketplace.ts`。
- 实际包启动与宿主参数：`reader-launch.ts`、`host-options.ts`。
- 离线对比：`refactoring-fingerprint.ts`。
