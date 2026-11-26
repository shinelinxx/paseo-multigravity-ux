# Paseo Multigravity UX

English | [简体中文](README.zh-CN.md)

A focused, zero-conflict [Paseo](https://paseo.sh) plugin inspired by the best interactions of [Multigravity (`GHSaiMo/antigravity-mobile`)](https://github.com/GHSaiMo/antigravity-mobile), designed to fit Paseo's native minimalism without touching timeline rendering or duplicating existing plugins (`better-paseo`, `antigravity-accounts`, `model-switch`, `skills`).

## Features

- **`/btw` Isolated Read-Only Side-Question Branches**
  - Run `/btw <question>` (or `/btw` / `⌘K`) to ask tangential questions in a hidden background helper session without interrupting or polluting the main thread.
  - Injects recent main-thread context silently via `agent.open.before` (`appendSystemPrompt`), enforces read-only safety via `agent.permission.before`, streams updates live over plugin subscriptions (zero polling), auto-cleans helpers when the parent agent or workspace is archived, and supports one-click insertion back into the main composer.
  - Zero chrome when idle: a compact `/btw · N` composer pill appears only on agents that have `/btw` branches.
  - Configurable `/btw` model strategy in Settings (follow main conversation model or pick a dedicated fast model).
- **Searchable Prompt Templates with Auto-Selected `[Placeholders]`**
  - Host-synced reusable prompts across desktop, web, iOS, and Android.
  - Insert via the native searchable composer `<Combobox>` or `/tpl <keyword>`; automatically highlights the first `[placeholder]` using `composer.focus({ selection })` so you can type immediately.
  - Manage templates inline under **Settings → Multigravity UX** (no extra workspace tab).
- **One-Shot Markdown Export (`/export`)**
  - Run `/export` or pick **Export conversation as Markdown** in `⌘K` to copy the current conversation as clean Markdown with zero permanent UI chrome.
- **5 Curated Appearance Themes**
  - Silently registers `Solarized Light`, `Nord`, `Tokyo Night`, `Catppuccin Macchiato`, and `Everforest Dark` under **Settings → Appearance**.

## Install

Requires Paseo `>= 0.17.4` with plugins enabled:

```bash
paseo plugin install github:shinelinxx/paseo-multigravity-ux
```

## Development

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-multigravity-ux
paseo plugin reload multigravity-ux
```

## License

MIT
