# Multigravity 交互套件

Multigravity 交互套件遵循 Paseo 原生极简哲学，不新增常驻顶栏按钮与冗余工作区 Tab，也不与 Paseo 内置的大纲、文件树、Diff 或现有插件（`better-paseo`、`antigravity-accounts`、`model-switch`、`skills`）重叠，只保留真正填补空白的轻量交互增强。

## 功能

- `/btw` 独立只读旁路快问：主会话运行时随时输入 `/btw <问题>` 或从 `⌘K` 打开，在隐藏后台会话中独立解答并支持一键回插主输入框。通过 `agent.open.before` 的 `appendSystemPrompt` 静默注入主会话近期上下文（不污染用户消息）、通过 `agent.permission.before` 强制只读安全边界防止并发改文件或隐藏弹窗卡死、通过插件订阅实时推送进度（零轮询），并在主会话或工作区归档时自动回收后台会话。平时零存在感，仅在某会话存在 `/btw` 分支时按需显示紧凑的 `/btw` 胶囊。
- 可搜索快捷提示词模板与占位符自动选中：通过 Paseo host settings 全端同步；在输入框使用原生可搜索 `<Combobox>` 或 `/tpl <关键词>` 插入模板后，自动高亮选中首个 `[占位符]` 以便直接键入替换。模板的新增、编辑、置顶与删除均收纳在「设置 -> Multigravity 交互套件」中，不占用工作区 Tab。
- 无面板一键导出 Markdown：运行 `/export` 或在 `⌘K` 中选择「导出当前对话为 Markdown」，按需拉取对话并直接复制为干净的 Markdown。
- 5 款精选配色主题：在「设置 -> 外观」中静默注册 Solarized Light、Nord、Tokyo Night、Catppuccin Macchiato 与 Everforest Dark。

## 准备与兼容

需要 Paseo 0.17.4 或更高版本。可在「设置 -> Multigravity 交互套件」中为 `/btw` 选择跟随主会话模型或指定轻量快答模型，以及开关输入框模板选择器和管理模板。

## 数据与权限

模板库与 `/btw` 模型策略保存在 Paseo 宿主设置中，`/btw` 分支索引保存在插件数据目录。`/btw` 后台会话受 `agent.permission.before` 钩子保护，仅允许只读操作并自动拒绝写入类权限请求。
