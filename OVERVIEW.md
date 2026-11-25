# Multigravity UX

Multigravity UX adds three focused, native-feeling capabilities to Paseo with zero workspace header clutter and zero overlap with Paseo's built-in outline, explorer, diffs, or existing plugins.

## Capabilities

- Isolated `/btw` side-question branches: ask quick tangential questions without interrupting or polluting the main conversation. Background helper sessions receive recent main-thread context via `appendSystemPrompt`, enforce a read-only permission guard so they never modify files concurrently or stall on hidden prompts, stream live updates over a plugin subscription, clean themselves up when the parent agent or workspace is archived, and offer one-click insertion back into the main composer. A compact `/btw` composer pill appears only on agents that have active or saved `/btw` branches.
- Searchable prompt templates with placeholder selection: store reusable prompts in Paseo host settings so they sync across desktop, web, iOS, and Android. Insert templates via the searchable composer combobox or `/tpl <keyword>`; the first `[placeholder]` in the template is highlighted automatically so you can type immediately. Manage templates inline in Settings -> Multigravity UX.
- One-shot Markdown export: run `/export` or pick "Export conversation as Markdown" in Command Center to copy the current conversation as clean Markdown with no permanent panel or background polling.
- Five curated themes: registers Solarized Light, Nord, Tokyo Night, Catppuccin Macchiato, and Everforest Dark under Settings -> Appearance.

## Setup and compatibility

Requires Paseo 0.17.4 or newer. In Settings -> Multigravity UX, you can configure `/btw` to follow the main agent's model or use a dedicated fast model, toggle the composer template combobox, and manage saved templates.

## Data and permissions

Prompt templates and `/btw` model preferences are stored in Paseo host settings. `/btw` branch indexes are stored in the plugin data directory on the daemon host. `/btw` background agents are guarded by an `agent.permission.before` hook that allows read-only inspection and denies mutating tool requests.
