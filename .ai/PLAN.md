# 下一步

项目现状及已有验证见 [STATUS](STATUS.md)。此处只保留尚未完成的工作。

## 真实桌面体验

使用修复版检查延迟搜索、连续查询、卡片点击、fullscreen／返回、窗口与主题变化，并记录实际宿主版本及可观察结果。复现入口见 [修复说明](../docs/search-card-height-fix.md)。

完成标准：结果在宿主分配的高度内可访问，目录与正文可滚动，返回和模式切换后布局稳定。该体验检查与自动验证分别记录，不新增人工发布审批。

## 发行交接

核对 1.1.3 main 推送的 Check：Ubuntu 检查成功后，同一提交须通过 Windows 发包验收并自动准备草稿。草稿成功后，由发行负责人点击一次 Publish release，随后核对工作流、npm latest、main 的精确 marketplace 与版本回执一致。既有 v1.1.2 标签和三个验收附件保持冻结；其 npm 发布进度以 [Publish 工作流](https://github.com/Foreverstar7/arknightStoryReaderGPTPlugin/actions/runs/42462147645)为准。

完成标准：发布工作流成功，包身份和各处版本一致；不移动固定标签或替换已有附件。已安装用户按 [安装与更新说明](../README.md#升级与卸载)主动刷新来源并安装。
