# S4 与封面集成交接

更新：2026-11-03。用户已授权先提交 S4、再合并封面，随后安装最新版并清理工作树。S4 单独提交 `23c7208`；封面单独提交 `87f3930`；共同基线 `b00b5b9`。合并提交 `1f4f33b` 已进入 main；0.1.19 已完成验证与本机安装，a155 临时工作树已归档，不进入 S5、不推送或发布。

先读 `.ai/STATUS.md`、`AGENTS.md`、`docs/requirements.md` 与 `docs/integration-0.1.19.md`；历史实现细节在 `docs/prts-s4.md`、`docs/prts-covers-0.1.19.md`。最终结果以集成记录及 Git 为准，不能混用两分支的独立验收。

保留 S4 的当前剧情正文准备、完整分母、修订迁移、SQLite 缓存与清理代次；保留封面来源、文字封面、20 MB 原字节预算及 MCP 分段重组。共 10 个 app-only 工具。内容缓存、公共字数、私人阅读记录分别保存；测试不得指向真实 `.runtime/` 或 `%LOCALAPPDATA%/ArknightsStoryReader`。

已安装插件及 4318 预览均为 0.1.19；安装包独立保存于插件缓存，marketplace 来自主仓库 `.local/marketplace`，不依赖已归档工作树。55 个 dist 文件及包内 Node 哈希一致，安装包 stdio、封面、S4 双进程和官方加载器通过。三个真实阅读记录文件安装前后 SHA256 不变。真实桌面 UI 等待用户重启客户端后体验，不由加载器、SDK 或浏览器结果替代。

最终组合 build/check 53/53、fixture 20/20、PRTS 14/14 及协议／双进程／SDK 联合验证通过。临时测试服务已关闭；证据在主项目 `.ai/local/integration-0.1.19/`、`.ai/local/install-0.1.19/` 和 `.ai/local/retired-worktree-a155/`。最初归档受主检出保护阻止；用户通过“移动到主检出”切回主仓库后，受支持的归档工具成功。目录已移除，Git 只剩主仓库检出并切回 main，两边实现提交均保留。旧 PID 文件只是线索，停止进程前必须核对路径与命令行。
