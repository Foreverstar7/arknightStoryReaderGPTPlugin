# 项目网站

网站采用紧凑首屏和滚动流程，下方“亲自试试”复用真实阅读器展示占位文案、六张线描封面／场景图片，以及卡通动物兔子。公开地址：[项目介绍与演示](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/)、[真实网页阅读器](https://foreverstar7.github.io/arknightStoryReaderGPTPlugin/reader/)。

## 构建后查看完整页面

使用固定 Node 26.13.0／npm 12.2.1，在仓库根目录运行：

```sh
node scripts/build-site.mjs
node scripts/serve-site.mjs
```

打开 http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/ 。修改源码后重新构建并刷新；介绍页与占位演示不需要 fixture 开发服务、MCP、PRTS 或模型 API key；`reader/` 真实阅读入口需要浏览器能够访问 PRTS。服务只绑定 127.0.0.1，Ctrl+C 停止自己的预览。

- **观看流程**：同一个 ChatGPT 示意窗口先演示侧栏浏览：总目录 → 横向篇目轴 → 正文；再以“也可以在对话中，直接找想读的故事”过渡，演示输入“帮我找一下《孤星》”、结果卡片和进入篇章目录查看简介。保留原浏览路径的移动速度和五个停留，追加搜索输入、卡片、目录三个停留；18 单位时间映射为 570svh 动作和 262svh 停留，总区 932svh。停留只消耗原生滚动距离，上滑可倒放，不计时或锁输入。
- **亲自试试**：首次展开才加载真实 ReaderApp。侧栏入口保留自由浏览；首页提供预填“帮我找一下《孤星》”的输入和原生提交按钮，只支持明确标示的预设。输入区始终保留在示意窗口的对话区域底部，消息、状态和结果卡片在上方独立滚动；结果与错误出现后滚动到最新内容，输入区不随消息滚走，也不覆盖卡片。提交通过同源 iframe 消息调用同一份目录匹配逻辑，返回不带简介的卡片；点击后保存原有样例位置，再进入《孤星》篇章目录，展示占位简介。侧栏与首页切换不重载阅读器；显式搜索跳转才切换目标。重置同时清理演示搜索结果。
- **数据范围**：六部目录分别显示《孤星》《长夜临光》《巴别塔》《愚人号》《叙拉古人》《火山旅梦》；篇目、简介、正文与人物仍使用占位文案，常驻“占位演示／非原作剧情”说明，不表示这些内容对应《孤星》原作。图片为本地 AI 生成示意；独立 sessionStorage v2 不读取安装后的插件数据，刷新进入主页，最近阅读保留续读。介绍页和占位演示不调用真实 MCP、PRTS 或模型服务。
- **减少动态效果／矮窗口**：显示静态正文及包含侧栏、对话入口的六步说明；可交互搜索仍可使用，保留自然滚动，不缩放页面。

## 源码边界

- website/index.html、styles.css：页面布局、安装命令、常见问题与项目标识。
- website/walkthrough.ts、walkthrough.css：独立 GSAP／ScrollTrigger 分镜，不控制交互阅读器状态；walkthrough-timing.ts 是两段流程、原生滚动距离与停留的唯一参数来源。同一位置的倒放／缩放得到同一帧。
- website/app.ts：按需加载、侧栏／首页切换、预设搜索和卡片交互；验证同源 iframe、消息来源及工具结果结构，不插入不可信 HTML。
- website/demo/：复用 src/ui/ReaderApp、阅读器 CSS 与字数规则。data.ts 提供独立占位目录／正文，assets.ts 仅按请求读取打包图片；BrowserDemoTransport 适配浏览器会话数据，沿用工具输入／输出验证，不连接本机 API 或 PRTS。共享契约的可选 imagesAvailable 允许 fixture 正常走图片接口，sourceLabel 让本地素材正确标注来源；普通 fixture 和正式 PRTS 默认行为保留。
- scripts/build-site.mjs：检查公开源目录／相对资源后，用已有 Vite／React 工具链构建介绍与演示入口至 build/site/，再调用独立的 build-web.mjs 构建真实阅读入口；输出保持 Pages 项目子路径可用。不处理 npm 归档或私人阅读记录。

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

- assets/reader-mark.svg 为兔耳书页／菱形切光静态图标；根 assets/ 中的明暗配色副本由插件清单的 logo／composerIcon 引用并打包。网站部署与插件更新分别生效，网站推送不会替换已安装插件的图标。
- 六张 assets/cover-*.webp 是已有内置 image_gen 线描意象图的等比网页副本（1000×563），合计约 308 KB；《巴别塔》使用二版。动画和点击体验共用这些图；体验区封面保留全图并填充深色背景，正文按 CG 交互原位展开全图，明确标注占位演示，不冒充原作目录或剧情。
- 六张原始 PNG、完整提示词、选择清单与弃用的巴别塔首版编辑输入已归档 docs/design/website-covers/ 并随 Git 同步；正式构建只依赖 website/ 中的文件，不读取 .ai/local 或全局工具。
- assets/rabbit-portrait.webp 为 768×768、52,462 字节的透明卡通动物兔子：四足坐姿、蓝色小吊坠和银色戒环，不采用人形。原始透明 PNG、动物体态编辑输入、设定核对与完整内置 image_gen 提示词见 [兔兔素材](design/website-demo-assets/PROMPTS.md)。已知角色和分支角色复用此示意图，匿名仍显示中性占位。
- 主题封面用于网站公开演示；不加入玛恩纳、官方截图、游戏立绘、CG 或转载正文。
- GitHub 图标来自官方 Octicons，MIT 许可在 HTML 中保留。GSAP 3.15.1 为网站开发依赖，使用其标准许可，不将项目 MIT 扩展为素材或第三方库的许可。
- README 使用 demo-library.png、demo-chapters.png、demo-reader.png、demo-portrait.png、demo-search.png 五张实际截图。重新截图先构建网站，再运行 `node scripts/capture-site-previews.mjs`；脚本自启独立 4331 服务、全新会话并禁止外部请求，Windows 可设 PLAYWRIGHT_CHANNEL=msedge。

## GitHub Actions 与发布

.github/workflows/pages.yml 在网站及其复用的 UI、fixture、字数规则和工具契约变更时执行类型、样例数据、构建和浏览器检查，通过后部署 GitHub Pages。GSAP 通过项目锁文件安装，运行时没有 CDN 或第三方字体请求。

网页改版和 npm 发布保持独立。推送 main 的相关变更会触发网站专项检查与 Pages 部署；以对应提交的工作流结果确认线上版本。纯网站更新不需要 npm 发版，插件发行按 [发布指南](releasing.md)操作。安装段与 README 统一按“添加来源 → 刷新来源 → 安装插件”展示三条命令。已安装插件不会因仓库发布而后台自动升级，用户需要主动刷新来源并安装。

## 真实网页阅读入口

在上述静态预览地址后加 `reader/`，例如 `http://127.0.0.1:4330/arknightStoryReaderGPTPlugin/reader/`。也可从介绍页“打开网页版”进入。此入口独立构建，仍由同一静态站点托管，不与占位演示共用记录。

```sh
npm run build:web
npm run preview:web
npm run test:e2e:web
```

- 手机窄屏的篇章目录为纵向卡片列表，不显示浏览线；电脑宽屏保留横向交错篇目轴。网页专用样式约束 Grid 最小列宽，长目录只在轴内横向滚动，不撑宽整页。
- `web/transport.ts` 接入原 ReaderService、PrtsSource 和 ReaderApp；`scripts/build-web.mjs` 只为这个构建替换四个存储模块、SHA-256 和设置面板。未适配的 Node 内置模块会使构建失败，不能以空模块冒充实现。
- `web/prts-api.ts` 通过带 `origin=*` 的 MediaWiki revisions/imageinfo 接口读取公开内容。API 统一直连 `m.prts.wiki`，避免标准域名对手机 UA 的 302 没有 CORS 头而导致加载失败；已核对两类 UA 返回相同公开 JSON。请求不携带凭据，不使用代理；白名单只接受 PRTS 标准／移动 API、media、torappu 来源。网络、缺页、数据格式与资源缺失沿用原有错误区分。普通 PRTS 网页可访问与跨域 API 可读取分别检查。
- `web/database.ts` 使用 IndexedDB 事务持久保存 reading 和 counts 两种小量数据，解析后再进入领域模型。阅读记录包含锚点和哈希摘要，不包含正文或图片。清记录仍保留偏好与字数统计，并防止旧窗口保存恢复已删除记录。
- 封面滚动到可见范围附近才向 PRTS 请求，当前页面复用已加载图片，浏览器正常 HTTP 缓存由源站响应控制；不预取或长期保存全部封面。
- `web/storage.ts` 对正文、映射和图片只作当前页面的内存复用；不注册 Service Worker，也不建立持久图片／正文缓存。设置面板明确说明联网阅读和浏览器本地记录，隐藏不适用的缓存保留期和清理按钮。
- 网页开源组件许可统一保存在 `website/THIRD_PARTY_NOTICES.txt`，完整站点与单独网页构建均复制该文件；变更浏览器依赖时同步核对版本、版权和许可。
- 网页复用原始剧情解析与立绘逻辑。Buffer 使用维护中的浏览器兼容包；SHA-256 适配通过同一 UTF-8 输入与 Node 原实现对照，保持既有段落、修订和迁移标识。
- `web/public/manifest.webmanifest` 提供同子路径的独立窗口启动信息；图标由构建从现有原创标识复制生成。主屏幕安装体验需手机实测，不把 manifest 构建成功写成真机验证。
- `?story=<编码后的剧情ID>` 可以直接进入指定篇章目录。应用内部保留主页、篇章目录和相邻篇导航；项目介绍链接返回站点根路径。
- 仅网页变化不升 npm/插件版本；网页设置中的日期和提交标识表示本次构建。部署不会清除浏览器记录；未来记录格式变化需要独立的数据迁移。

使用 `PLAYWRIGHT_CHANNEL=msedge` 可复用本机 Edge 运行网页检查；CI 使用项目锁定的 Chromium。自动检查使用原创网络样本和真实 IndexedDB，不启动 MCP 或业务后端。真实 PRTS 验证另行记录，不以 mock 代替。
