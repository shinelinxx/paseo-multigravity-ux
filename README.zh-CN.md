# Paseo Multigravity UX（简体中文）

[English](README.md) | 简体中文

一款聚焦高效交互、零冲突的 [Paseo](https://paseo.sh) 插件，灵感源自 [Multigravity (`GHSaiMo/antigravity-mobile`)](https://github.com/GHSaiMo/antigravity-mobile) 的核心体验，深度融入 Paseo 原生极简设计，不侵入主时间线渲染，也不与既有插件（`better-paseo`、`antigravity-accounts`、`model-switch`、`skills`）功能重叠。

## 核心特性

- **`/btw` 隔离式只读旁路提问分支**
  - 输入 `/btw <问题>`（或 `/btw` / `⌘K`），在隐藏的后台辅助会话中提出顺带问题，既不打断主对话，也不污染主线程上下文。
  - 通过 `agent.open.before`（`appendSystemPrompt`）静默注入主线程近期上下文，通过 `agent.permission.before` 强制只读安全隔离，基于插件订阅实时流式更新（零轮询），在父 Agent 或工作区归档时自动清理辅助会话，并支持一键将回答插回主输入框。
  - 空闲零占位：仅在存在 `/btw` 分支的会话中显示紧凑的 `/btw · N` 输入框胶囊。
  - 可在设置中自由选择 `/btw` 模型策略（跟随主会话模型，或指定专用轻量快速模型）。
- **可搜索提示词模板与 `[占位符]` 自动选中**
  - 跨桌面端、Web、iOS 与 Android 多端宿主同步复用提示词模板。
  - 支持通过原生可搜索输入框 `<Combobox>` 或 `/tpl <关键词>` 快速插入；插入后通过 `composer.focus({ selection })` 自动高亮选中第一个 `[placeholder]` 占位符，直接打字即可替换。
  - 在 **设置 → Multigravity UX** 中原地管理模板，不额外增加工作区标签页。
- **一键导出 Markdown（`/export`）**
  - 运行 `/export` 或在 `⌘K` 中选择 **导出会话为 Markdown**，一键复制整洁的 Markdown 对话文本，无常驻界面负担。
- **5 套精选外观主题**
  - 静默注册 `Solarized Light`、`Nord`、`Tokyo Night`、`Catppuccin Macchiato` 与 `Everforest Dark` 主题至 **设置 → 外观**。

## 安装

需要 Paseo `>= 0.17.4` 且已开启插件功能：

```bash
paseo plugin install github:shinelinxx/paseo-multigravity-ux
```

## 本地开发

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-multigravity-ux
paseo plugin reload multigravity-ux
```

## 许可证

MIT
