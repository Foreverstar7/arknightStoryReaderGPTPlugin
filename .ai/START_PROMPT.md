# 封面分支集成交接

更新：2026-11-03。当前 `codex/remaining-covers` 从 `b00b5b9` 开始，0.1.19 为隔离封面候选，未包含主目录未提交的 S4。用户已授权实现、验证、本地提交、安全合并及合并后 worktree 归档；不推送、发布或进入 S5。

先读 `.ai/STATUS.md`、`docs/prts-covers-0.1.19.md`、`AGENTS.md`、`docs/requirements.md`。同时只读核对主目录的 Git、`.ai/STATUS.md`、`docs/prts-s4.md`，不要按本 worktree 历史 S4 状态判断主目录进展。

本分支已实现四月横幅、前五章完整方图、稳定 ID 文字封面、早期危机合约通用图及日暮原图的 20 MB 限制。元数据版本 4 按需重验旧来源，图片仍经 imageinfo；未变更源 ID、目录顺序、正文和阅读记录。MCP 大图分段继续使用现有 `reader_image`，小结果保持原契约；`hostTransport` 重组原字节，不能删掉分段支持或仅扩大探针接收缓冲。共享已加载封面引用保证新页首张快照完整，清缓存推进代次防止迟到请求恢复复用。

最后检查 main 仍是 `b00b5b9`，S4 和篇目准备相关文件未提交，与本分支多处重叠；主目录文档记录其 0.1.18 已本机交付。封面候选已改为 0.1.19 避免重号，最终集成时重新核对版本。不得替另一个聊天提交／stash／reset。先等待其独立提交；随后把届时已提交 main 合到封面分支，按职责保留两边逻辑，重新 build/check、fixture、真实 PRTS、默认缓冲 stdio／HTTP MCP 和 AppBridge 大图解码，特别覆盖 S4 SQLite 缓存与分段读取的组合。若 main 仍脏，保留已提交分支和 worktree，准确报告条件。

所有测试使用本 worktree 的 `.ai/local/`，端口通过 `READER_E2E_PORT=4329`、`READER_E2E_PRTS_PORT=4330` 隔离；额外预览曾使用 4338，验证后已关闭，`.ai/local/cover-http.pid` 是历史 PID，不可直接用它停止进程。不写主目录 `.runtime/`，不打断 4318，不覆盖正在使用的插件。工具链和依赖均本地固定；使用 `.local/toolchain/node-v26.13.0-win-x64/node.exe` 及项目脚本。

合并授权已具备，但必须核对最终提交进入 main、无独有未合并提交及未保存工作；保留必要证据、停止本 worktree 临时服务后，使用 Codex 支持的 worktree 归档工具清理，不能删除主目录。真实桌面宿主 UI 尚未验收；官方 SDK iframe／协议检查不是目标宿主 UI。
