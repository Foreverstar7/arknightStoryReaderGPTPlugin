# 项目网站

网站沿用紧凑首屏和滚动流程，下方“亲自试试”复用真实阅读器展示占位文案、六张线描封面／场景图片，以及卡通动物兔子。公开地址：[剧情阅读器](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/)。

## 构建后查看完整页面

使用固定 Node 26.13.0／npm 12.2.1，在仓库根目录运行：

```sh
node scripts/build-site.mjs
node scripts/serve-site.mjs
```

打开 http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/ 。修改源码后重新构建并刷新；网页不需要 fixture 开发服务、MCP、PRTS 或模型 API key。服务只绑定 127.0.0.1，Ctrl+C 停止自己的预览。

- **观看流程**：同一个 ChatGPT 示意窗口先演示侧栏浏览：总目录 → 横向篇目轴 → 正文；再以“也可以在对话中，直接找想读的故事”过渡，演示输入“帮我找一下《孤星》”、结果卡片和进入篇章目录查看简介。保留原浏览路径的移动速度和五个停留，追加搜索输入、卡片、目录三个停留；18 单位时间映射为 570svh 动作和 262svh 停留，总区 932svh。停留只消耗原生滚动距离，上滑可倒放，不计时或锁输入。
- **亲自试试**：首次展开才加载真实 ReaderApp。侧栏入口保留自由浏览；首页提供预填“帮我找一下《孤星》”的输入和原生提交按钮，只支持明确标示的预设。提交通过同源 iframe 消息调用同一份目录匹配逻辑，返回不带简介的卡片；点击后保存原有样例位置，再进入《孤星》篇章目录，展示占位简介。侧栏与首页切换不重载阅读器；显式搜索跳转才切换目标。重置同时清理演示搜索结果。
- **数据范围**：《孤星》名称用于演示真实名称定位，其余目录标题、篇目、简介、正文与人物仍使用占位文案，常驻“占位演示／非原作剧情”说明，不表示这些内容对应《孤星》原作。图片为本地 AI 生成示意；独立 sessionStorage v2 不读取安装后的插件数据，刷新进入主页，最近阅读保留续读。网站不调用真实 MCP、PRTS 或模型服务。
- **减少动态效果／矮窗口**：显示静态正文及包含侧栏、对话入口的六步说明；可交互搜索仍可使用，保留自然滚动，不缩放页面。

## 源码边界

- website/index.html、styles.css：沿用已认可 HTML 的布局、安装命令、常见问题与项目标识；已去除草稿工具栏和标注研究区。
- website/walkthrough.ts、walkthrough.css：独立 GSAP／ScrollTrigger 分镜，不控制交互阅读器状态；walkthrough-timing.ts 是两段流程、原生滚动距离与停留的唯一参数来源。同一位置的倒放／缩放得到同一帧。
- website/app.ts：按需加载、侧栏／首页切换、预设搜索和卡片交互；验证同源 iframe、消息来源及工具结果结构，不插入不可信 HTML。
- website/demo/：复用 src/ui/ReaderApp、阅读器 CSS 与字数规则。data.ts 提供独立占位目录／正文，assets.ts 仅按请求读取打包图片；BrowserDemoTransport 适配浏览器会话数据，沿用工具输入／输出验证，不连接本机 API 或 PRTS。共享契约的可选 imagesAvailable 允许 fixture 正常走图片接口，sourceLabel 让本地素材正确标注来源；普通 fixture 和正式 PRTS 默认行为保留。
- scripts/build-site.mjs：检查公开源目录／相对资源后，用已有 Vite／React 工具链构建两个静态入口至 build/site/；输出保持 Pages 项目子路径可用。不处理 npm 归档或私人阅读记录。

会话存储损坏或不可用时明确显示错误与重置入口，不静默改用另一份状态。缓存清理保留阅读记录；打包内不可变样例不是可删除的网络缓存。预置锚点仍为 fixture-mist 前两篇完整／第三篇 45%，fixture-lights 首篇 65%；当前占位字数计算出的剧情进度为 40%／32%，修改内容后检查锚点和测试，不写死显示百分比。

## 检查实际行为与画面

先完成构建，再运行：

```sh
node node_modules/typescript/bin/tsc -p tsconfig.website.json --noEmit
node --import tsx --test tests/website-demo.test.ts
npm exec -- playwright test --config playwright.site.config.ts
```

Playwright 会自行启停 4330 预览。运行前应先关闭自己在该端口的手动预览，不接管其他进程；Windows 本机可设置 PLAYWRIGHT_CHANNEL=msedge 使用已安装 Edge。检查包括实际静态资源／子路径、完整滚动与同位置倒放、按需加载、设置／续读／重置、键盘、320px 原生触摸、320×760／768×900／1440×960／1024×400、双主题和媒体偏好切换。截图和失败 trace 写入 test-results/site/。

## 素材与维护

- assets/reader-mark.svg 为已认可的兔耳书页／菱形切光静态图标；1.0.1 将同一矢量图的明暗配色副本放入根 assets/，由插件清单的 logo／composerIcon 引用并打包。网站部署与插件更新分别生效，网站推送不会替换已安装插件的图标。
- 六张 assets/cover-*.webp 是已有内置 image_gen 线描意象图的等比网页副本（1000×563），合计约 308 KB；《巴别塔》使用二版。动画和点击体验共用这些图；体验区封面保留全图并填充深色背景，正文按 CG 交互原位展开全图，明确标注占位演示，不冒充原作目录或剧情。
- 六张原始 PNG、完整提示词、选择清单与弃用的巴别塔首版编辑输入已归档 docs/design/website-covers/ 并随 Git 同步；正式构建只依赖 website/ 中的文件，不读取 .ai/local 或全局工具。
- assets/rabbit-portrait.webp 为 768×768、52,462 字节的透明卡通动物兔子：四足坐姿、蓝色小吊坠和银色戒环，不采用人形。原始透明 PNG、动物体态编辑输入、设定核对与完整内置 image_gen 提示词见 [兔兔素材](design/website-demo-assets/PROMPTS.md)。已知角色和分支角色复用此示意图，匿名仍显示中性占位。
- 主题封面用于网站公开演示；不加入玛恩纳、官方截图、游戏立绘、CG 或转载正文。
- GitHub 图标来自官方 Octicons，MIT 许可在 HTML 中保留。GSAP 3.15.1 为网站开发依赖，使用其标准许可，不将项目 MIT 扩展为素材或第三方库的许可。
- README 使用 demo-library.png、demo-chapters.png、demo-reader.png、demo-portrait.png、demo-search.png 五张实际截图。重新截图先构建网站，再运行 `node scripts/capture-site-previews.mjs`；脚本自启独立 4331 服务、全新会话并禁止外部请求，Windows 可设 PLAYWRIGHT_CHANNEL=msedge。

## GitHub Actions 与发布

.github/workflows/pages.yml 继续使用原 GitHub Pages 构建／部署入口，增加复用 UI、fixture、字数规则和工具契约的变更触发，以及网站类型／样例数据检查。GSAP 通过项目锁文件安装，运行时没有 CDN 或第三方字体请求。

网页改版和 npm 发布保持独立。推送 main 的相关变更会触发网站专项检查与 Pages 部署；以对应提交的工作流结果确认线上版本。纯网站更新不需要 npm 发版，插件修正与后续搜索工具的版本安排见 [发布指南](releasing.md)。安装段与 README 统一按“添加来源 → 刷新来源 → 安装插件”展示三条命令。已安装插件不会因仓库发布而后台自动升级，用户需要主动刷新来源并安装。

## 首次上线记录

2026-11-07，网站主体提交 f6d4221 的 [Pages 构建／部署](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140503) 和 [Ubuntu Check](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42254140890) 通过。实际公开地址已验证 HTTP 200，线上桌面／320px 深色布局、三页预览切换、图片与说明展开正常，没有页面脚本错误或失败资源。README 复用相同原创建面图，并提供目录／篇目／正文的说明。
