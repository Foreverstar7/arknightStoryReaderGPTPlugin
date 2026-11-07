# 项目网站

当前本地新版沿用紧凑首屏，以滚动演示说明使用流程，下面可展开真实阅读器体验原创样例，再接安装指南与常见问题。公开网站仍为此前已部署版本：[剧情阅读器](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/)。本轮使用 codex/website-scroll-demo 分支同步代码，未合并 main 或部署。

## 构建后查看完整页面

使用固定 Node 26.13.0／npm 12.2.1，在仓库根目录运行：

```sh
node scripts/build-site.mjs
node scripts/serve-site.mjs
```

打开 http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/ 。修改源码后重新构建并刷新；网页不需要 fixture 开发服务、MCP、PRTS 或模型 API key。服务只绑定 127.0.0.1，Ctrl+C 停止自己的预览。

- **观看流程**：滚动进入“阅读器示例”，下滑推进，停下暂停，上滑倒放。打开窗口、侧栏选中、封面、横向交错篇目轴和正文共用一条时间轴。动画里的操作是示意，不是按钮。
- **亲自试试**：点击或用键盘展开下方区域，首次才加载真实 ReaderApp；可翻页、调整设置和续读。收起再展开不重置页面；“重置演示”恢复原预置样例。
- **数据范围**：交互内容来自现有原创 fixture，记录存在独立的浏览器 sessionStorage，不读取或同步安装后的插件数据。刷新进入主页，最近阅读可恢复位置；关闭标签页后的存储清理由浏览器会话机制管理。
- **减少动态效果／矮窗口**：显示静态正文和四步说明，保留自然网页滚动，不将整页缩小。

## 源码边界

- website/index.html、styles.css：沿用已认可 HTML 的布局、安装命令、常见问题与项目标识；已去除草稿工具栏和标注研究区。
- website/walkthrough.ts、walkthrough.css：独立 GSAP／ScrollTrigger 分镜和响应式样式，和可交互阅读器不共享阅读状态。
- website/app.ts：按需加载体验区、示意外壳切换及显式重置。
- website/demo/：复用 src/ui/ReaderApp、阅读器 CSS、FixtureSource 与字数规则。BrowserDemoTransport 仅适配原创样例的浏览器会话数据，沿用工具输入／输出验证，不连接本机 API，不依赖共享源码中的 HTTP transport。
- scripts/build-site.mjs：检查公开源目录／相对资源后，用已有 Vite／React 工具链构建两个静态入口至 build/site/；输出保持 Pages 项目子路径可用。不处理 npm 归档或私人阅读记录。

会话存储损坏或不可用时，体验区明确显示错误与重置入口，不静默改用另一份状态。缓存清理保留阅读记录；打包内不可变 fixture 不是可删除的网络缓存。样例预置锚点沿用“雾中来信”40% 和“灯火与归途”32% 的现有配置，百分比由实际字数权重计算；修改 fixture 后检查预置章节和测试。

## 检查实际行为与画面

先完成构建，再运行：

```sh
node node_modules/typescript/bin/tsc -p tsconfig.website.json --noEmit
node --import tsx --test tests/website-demo.test.ts
npm exec -- playwright test --config playwright.site.config.ts
```

Playwright 会自行启停 4330 预览。运行前应先关闭自己在该端口的手动预览，不接管其他进程；Windows 本机可设置 PLAYWRIGHT_CHANNEL=msedge 使用已安装 Edge。检查包括实际静态资源／子路径、完整滚动与同位置倒放、按需加载、设置／续读／重置、键盘、320px 原生触摸、320×760／768×900／1440×960／1024×400、双主题和媒体偏好切换。截图和失败 trace 写入 test-results/site/。

## 素材与维护

- assets/reader-mark.svg 为已认可的兔耳书页／菱形切光静态图标，仅更新网站，不改变插件清单。
- 六张 assets/cover-*.webp 是已有内置 image_gen 线描封面的等比网页副本（1000×563），合计约 308 KB；《巴别塔》使用二版，不重新生成、裁切或提取官方图片。它们只用于动画里的主题封面展示，篇目／正文另有“原创示意 · 非原作剧情”标记，不冒充原作目录或剧情。
- 六张原始 PNG、完整提示词、选择清单与弃用的巴别塔首版编辑输入已归档 docs/design/website-covers/ 并随 Git 同步；正式构建只依赖 website/ 中的文件，不读取 .ai/local 或全局工具。
- 主题封面的公开采用范围随部署决定确认，本轮仅是正式源码的本地候选；不加入玛恩纳、官方截图、游戏立绘、CG 或转载正文。
- GitHub 图标来自官方 Octicons，MIT 许可在 HTML 中保留。GSAP 3.15.1 为网站开发依赖，使用其标准许可，不将项目 MIT 扩展为素材或第三方库的许可。
- 原 library.png、chapters.png、reader.png 和 capture-site-previews.mjs 保留给 README 原创界面图，不再作为新版网页主展示。脚本更新原图仍使用隔离 fixture，不访问 PRTS。

## GitHub Actions 与发布

.github/workflows/pages.yml 继续使用原 GitHub Pages 构建／部署入口，增加复用 UI、fixture、字数规则和工具契约的变更触发，以及网站类型／样例数据检查。GSAP 通过项目锁文件安装，运行时没有 CDN 或第三方字体请求。

网页改版和 npm 发布保持独立。本轮按用户要求推送工作分支，触发通用 Check；网站专项仍只在 main 自动运行，不合并 main、部署或移动版本标签。用户要求节奏微调后不再本机测试，CI 问题等回家再处理。安装段沿用用户最新 HTML 的两条命令和稳定来源已就绪后的展示语境，未实际执行安装或确认新的发布状态。

## 首次上线记录

2026-11-07，网站主体提交 f6d4221 的 [Pages 构建／部署](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140503) 和 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140890) 通过。实际公开地址已验证 HTTP 200，线上桌面／320px 深色布局、三页预览切换、图片与说明展开正常，没有页面脚本错误或失败资源。README 复用相同原创建面图，并提供目录／篇目／正文的说明。
