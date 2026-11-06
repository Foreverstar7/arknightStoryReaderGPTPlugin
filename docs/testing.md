# 验证指南

按变更选择检查，不把所有维护审计当作每次发布的前置步骤。以下 `npm` 使用项目固定工具链；PowerShell 可替换为 `./scripts/npm.ps1`，传参分隔符写作 `'--'`。

## 常规修改

```sh
npm run check
npm run build
```

check 覆盖类型、单元／协议测试和格式。UI 变化还需实际操作，不以构建成功代替界面验收。

## 页面与真实来源

```sh
npm run test:e2e
npm run test:e2e:prts
```

先构建。fixture 测试使用原创数据；PRTS 测试联网访问真实来源。两套配置均使用独立测试数据目录。首次使用浏览器可运行 `npx playwright install chromium`；Windows 已有 Edge 时可设置 `PLAYWRIGHT_CHANNEL=msedge`。

按受影响路径检查总目录、篇目、正文、图片、续读和清理；界面覆盖 320×760、768×900、1440×900、1024×400，以及浅／深主题、键盘、触摸和减少动态效果。正文内容、进度和来源状态也要检查，不能只看页面能否打开。

设计预览由当前 UI 源码提供，入口见[界面预览](design/README.md)。

## 发行包

```sh
npm run package
npm run package:verify
npm run package:verify -- --prts
```

- 默认检查直接在源码外解包，验证生产依赖、清单／bin、协议／HTML 与全新缓存的离线 npm 消费，不访问 PRTS。
- `--prts` 增加真实目录、正文、图片、保存／重开、清缓存和移除程序后保留外部记录的检查。
- 实际包的浏览器验证：将 `READER_E2E_PACKAGE_ROOT` 指向解包后的 `package` 目录，再运行相关 `test:e2e:prts` 场景。fixture 浏览器回归始终使用源码开发构建。

归档与报告位于 `.local/releases/`。报告只对应当次归档；修改后发布需重新打包、验收。

## 桌面宿主

```sh
npm run plugin:prepare
npm run probe:host -- --isolated
```

加载器探针使用独立环境，不修改真实安装。正式发布后仍须由发布者在真实桌面检查安装、入口、三页阅读、图片、保存／重开、升级及卸载保留记录。其他平台在对应环境验收。

当前已取得的结果及剩余验收见 [STATUS](../.ai/STATUS.md)；发布门槛见[发布指南](releasing.md)。
