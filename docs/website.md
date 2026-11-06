# 项目网站

项目地址：[剧情阅读器](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/)。中文静态介绍页提供阅读方式、三个实际界面示例、安装文档和发行入口，不提供在线游戏剧情阅读或资源代理。

## 源码与本地验证

- `website/`：公开页面、样式、少量标签切换脚本及原创素材。
- `scripts/build-site.mjs`：检查公开目录与相对资源，将网站准备到已忽略的 `build/site/`；不处理阅读记录或 npm 归档。
- `scripts/serve-site.mjs`：只在 127.0.0.1 启动静态预览，使用与项目 Pages 一致的子路径。
- `playwright.site.config.ts`、`tests/site/`：独立的网站浏览器验收，不改变阅读器原有 34 项回归。

使用项目固定 Node 26.13.0／npm 12.2.1：

```sh
node scripts/build-site.mjs
node scripts/serve-site.mjs
```

本机预览为 `http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/`。在另一个终端运行：

```sh
npm exec -- playwright test --config playwright.site.config.ts
```

测试覆盖项目子路径、实际资源加载、鼠标／键盘标签切换、安装链接、说明展开，以及 320×760、768×900、1440×900、1024×400 在浅／深主题与减少动态效果下的布局。页面只请求本站资源；截图和失败 trace 写入 `test-results/site/`。

## 素材来源与维护

- `website/assets/mark.svg` 与首页纸页图形为本项目原创，未使用游戏官方标识或角色图形。
- `library.png`、`chapters.png`、`reader.png` 来自本阅读器的真实界面，全部使用 `src/data/fixture.ts` 的原创正文与原创示意封面，不是游戏截图。页面已明确标注原创示例。
- `scripts/capture-site-previews.mjs` 启动独立 fixture 服务，固定浅色主题并关闭自动图片，仅允许本机来源请求。数据写入 `.ai/local/site-preview-state/`，不会读取私人记录或访问 PRTS。界面变化后先完成应用构建，再重新生成：

```sh
npm run build
node scripts/capture-site-previews.mjs
node scripts/build-site.mjs
```

网站不使用游戏截图、立绘、CG、官方素材、第三方字体服务或剧情转载。游戏素材使用规则与用途／地区有关，不能将某一地区的创作指南视为对本站的通用授权；例如 [Yostar 日本区指南](https://arknights.jp/fankit/guidelines)具有明确适用条件。本项目选用原创素材，不依赖对这些授权范围的推断。原创代码 MIT 与游戏／PRTS 内容的权利说明分别处理。

## GitHub Actions 与 Pages

仓库 Pages 的构建来源为 **GitHub Actions**，由 `.github/workflows/pages.yml` 执行：

1. 固定工具链，准备静态文件并运行网站浏览器验收。
2. 保存 `site-evidence`，上传 `build/site/` 为 Pages artifact。
3. 使用标准 `github-pages` 网站环境部署，等待实际部署成功。

工作流只在 main 的网站相关文件变化时或手动触发。`github-pages` 只用于网站；npm 发布继续绑定唯一的 `npm-production` 审批，网站部署不会发布 npm 或提升稳定目录。npm 候选 v1.0.0 保持指向已经验收的 cce87d6；后续网站／文档提交不移动该标签。

页面不写死“最新版已经发布”等临时状态，安装前引导访问稳定来源目录和当前验证范围；稳定来源未收录时明确指向源码开发副本。

## 首次上线记录

2026-11-07，网站主体提交 f6d4221 的 [Pages 构建／部署](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140503) 和 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140890) 通过。实际公开地址已验证 HTTP 200，线上桌面／320px 深色布局、三页预览切换、图片与说明展开正常，没有页面脚本错误或失败资源。README 复用相同原创建面图，并提供目录／篇目／正文的说明。
