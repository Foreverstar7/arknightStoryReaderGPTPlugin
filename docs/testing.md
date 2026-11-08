# 验证指南

按变更选择检查，不把所有维护审计当作每次发布的前置步骤。以下 `npm` 使用项目固定工具链；PowerShell 可替换为 `./scripts/npm.ps1`，传参分隔符写作 `'--'`。

## 常规修改

```sh
npm run check
npm run build
```

check 覆盖类型、单元／协议测试和格式。UI 变化还需实际操作，不以构建成功代替界面验收。

搜索变更增加 `node --import tsx scripts/probe-search.ts`：使用全新隔离缓存访问真实 PRTS，验证批量名称、R8-1 编号、塔露拉出场、活动／主线导语及断网重开，并禁止正文或图片请求。报告位于 `.ai/local/story-search/live-*/report.json`，不读取私人记录。浏览器搜索入口可用 `/?search=记录员&by=character` 在 fixture 预览；这是开发验证入口，正式搜索由 MCP 调用渲染卡片。`tests/browser/search.spec.ts` 覆盖显式目录目标优先于续读、错误重试和四种窗口双主题。

涉及内嵌尺寸、宿主模式或侧栏跳转时运行 `npm run test:e2e:host`。此项自行将应用和测试宿主构建到 `.ai/local/search-card-check/run-*`，经真实 MCP 资源／工具与官方 SDK 协商 iframe 高度，不需要先执行 `npm run build`，不改仓库 dist／marketplace 或现有预览。默认端口 4349，可用 `READER_HOST_E2E_PORT` 隔离；Edge 仍可通过 `PLAYWRIGHT_CHANNEL=msedge` 选择。覆盖延迟结果、错误重试、连续更新／分页、fullscreen／返回、拒绝全屏、窄窗口与双主题，同时检查内容边界、尺寸稳定及页面异常；侧栏专项见[跳转说明](sidebar-reader-links.md)。报告为 `.ai/local/search-card-check/host-report.json`。它是 SDK 协议／布局验证，真实桌面复测仍需单独记录。

## 页面与真实来源

```sh
npm run test:e2e
npm run test:e2e:prts
```

先构建。fixture 测试使用原创数据；PRTS 测试联网访问真实来源。两套配置均使用独立测试数据目录。首次使用浏览器可运行 `npx playwright install chromium`；Windows 已有 Edge 时可设置 `PLAYWRIGHT_CHANNEL=msedge`。

手机原生触摸专项通过 CDP 输入真实 touch 事件，拖动在释放前减速，随后直接验证单次点击；同时断言正文确实滚动，避免只验证工具栏状态而漏掉无效手势。Chromium 156 的匀速拖动释放可保留滚动手势并吞掉下一次点击，固定等待不能可靠解决；本地排查该路径时使用 CI 的 Playwright Chromium，Edge 的成功不代替同内核复现。CDP 专项在 WebKit 跳过，其余布局与按钮仍分别验证。

按受影响路径检查总目录、篇目、正文、图片、续读和清理；界面覆盖 320×760、768×900、1440×900、1024×400，以及浅／深主题、键盘、触摸和减少动态效果。正文内容、进度和来源状态也要检查，不能只看页面能否打开。

设计预览由当前 UI 源码提供，入口见[界面预览](design/README.md)。

## 发行包

```sh
npm run package
npm run package:verify -- --prts
```

- 不带参数的 `npm run package:verify` 直接在源码外解包，验证 MIT 许可元数据与 LICENSE 文件、生产依赖、清单／bin、协议／HTML 与全新缓存的离线 npm 消费，不访问 PRTS，适用于普通 push／PR。
- `--prts` 先完成相同的全部离线检查，再增加真实目录、正文、图片、保存／重开、清缓存和移除程序后保留外部记录的检查。标签 Windows 验收只需执行这一条；同一隔离目录中的 npm 安装仅准备一次，后续重开使用同一产物。
- 真实样本必须包含 CG 并完成图片检查；清单入口、解包 bin 与 npm 安装后的 bin 须返回一致的完整工具契约。
- npm 在全新隔离缓存离线安装实际 tgz，不执行安装脚本并明确关闭 stdin，安装阶段独立上限 300 秒；其他 npm 命令仍为 120 秒。随后系统 Node 直接启动经包身份、bin 和缓存归属校验的安装产物，完成默认 60 秒内的 MCP 握手和后续完整验收；MCP 管道不经过 npm 包装进程。这与正式清单的 Node 启动方式一致，npm 包装层自身的 stdio 兼容性不计为已通过项。
- 安装命令启用 npm timing／verbose 日志，实时写入命令输出，并保存在临时目录外的 `.local/releases/npm-install-logs/`；失败后仍保留，Windows CI 的 `release-diagnostics` artifact 同时保存 npm 日志及 fixture 浏览器的截图／trace。计时用于区分 npm 阶段耗时，不以延长时限替代故障定位。
- 实际包的浏览器验证：将 `READER_E2E_PACKAGE_ROOT` 指向解包后的 `package` 目录，再运行相关 `test:e2e:prts` 场景。fixture 浏览器回归始终使用源码开发构建。

归档与报告位于 `.local/releases/`。报告只对应当次归档；修改后发布需重新打包、验收。

### Windows 本地候选预检

可以先在本地 Windows 使用与标签 CI 相同的检查脚本，无需提交或推标签。PowerShell 在仓库根目录逐条执行，前一条成功后再继续：

```powershell
./scripts/npm.ps1 run check
./scripts/npm.ps1 run package
./scripts/npm.ps1 run package:verify '--' --prts
./scripts/npm.ps1 run test:e2e
```

固定工具链为 Node 26.13.0／npm 12.2.1。首次缺少测试浏览器时，先执行 `./scripts/npm.ps1 exec '--' playwright install chromium`。这些命令只生成本地构建、归档和测试数据，不创建 Git 提交／标签或发布 npm；包验收使用源码外的隔离临时目录，不操作私人阅读记录。

已有 Edge 时，也可在浏览器测试前执行 `$env:PLAYWRIGHT_CHANNEL = 'msedge'`，无需另外下载 Chromium。记录实际使用的浏览器；最终 Windows CI 仍使用 Chromium。

修复包验收脚本时，可先对现有 tgz 运行 `./scripts/npm.ps1 run package:verify '--' '.local/releases/arknights-story-reader-X.Y.Z.tgz'`（X.Y.Z 替换为实际归档版本），定位问题后再做完整预检。日志显示解压、依赖检查、MCP 初始化与清理阶段及耗时；失败时保留原始错误，即使清理也失败。目录持续被占用仍判失败，不忽略错误。成功报告只在临时目录清理完成后写入。

本地预检能提前发现构建、实际包和浏览器回归问题；main 的 Check 先通过 Ubuntu `verify`，再调用草稿准备工作流，对同一提交 SHA 的干净源码执行 Windows 验收，最后冻结包和标签。发布阶段只消费已验收附件，不重建包。需要调查桌面问题时另外做实际宿主体验检查，结论与自动检查区分，不另设人工发布门槛。

## 桌面宿主

源码副本使用下面的准备命令和隔离加载器探针：

```sh
npm run plugin:prepare
npm run probe:host -- --isolated
```

加载器探针使用独立环境，不修改真实安装。可用 `--marketplace` 指定其他实际来源；不需要专门准备候选来源。加载成功只证明协议与加载器契约，不等于桌面 UI 已操作。其他平台按实际检查结果记录。

当前已取得的结果及剩余验收见 [STATUS](../.ai/STATUS.md)；发布门槛见[发布指南](releasing.md)。
