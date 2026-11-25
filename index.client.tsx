import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { BtwPanel } from "./client/BtwPanel";
import { installBtwPills } from "./client/btwPills";
import { QuickTemplatesItem } from "./client/ComposerControls";
import { messages } from "./client/i18n";
import { SettingsScreen } from "./client/SettingsScreen";
import {
  BTW_PANEL_ID,
  clearClientStore,
  FALLBACK_SETTINGS,
  insertTemplateAndFocus,
  setBtwPrefill,
  SETTINGS_SCREEN_ID,
} from "./client/store";
import {
  exportMarkdownRpc,
  watchSettingsSubscription,
  type MgSettings,
} from "./shared/contracts";
import { CURATED_THEMES } from "./shared/themes";

export default function contribute(client: PluginClientContext) {
  const lifetime = new AbortController();
  let liveSettings: MgSettings = FALLBACK_SETTINGS;

  // Live cross-device host settings sync (no stale startup cache)
  const settingsSub = client.subscribe(
    watchSettingsSubscription,
    {},
    (event) => {
      liveSettings = event.values;
    },
    { signal: lifetime.signal },
  );
  void settingsSub.ready.catch(() => {});

  // Zero-chrome-when-idle conditional /btw composer pill
  const removeBtwPills = installBtwPills(client);

  // Silent curated appearance themes
  const themeCleanups = CURATED_THEMES.map((themeDef) => client.addTheme(themeDef));

  async function runExport(agentId: string) {
    const res = await client.rpc(exportMarkdownRpc, { agentId });
    if (res.turnCount === 0) {
      throw new Error(client.i18n.t(messages, "exportEmpty"));
    }
    await copyText(res.markdown);
  }

  const cleanups = [
    // 1 focused Agent panel: /btw side-question branches
    client.addAgentPanel({
      id: BTW_PANEL_ID,
      title: messages.message("btwTitle"),
      icon: "MessageSquarePlus",
      Component: BtwPanel,
    }),

    // 1 Settings screen: /btw model strategy + inline template management
    client.addSettingsScreen({
      id: SETTINGS_SCREEN_ID,
      title: messages.message("pluginTitle"),
      icon: "MessageSquarePlus",
      Component: SettingsScreen,
    }),

    // 1 toggleable Composer item: native searchable <Combobox> for templates
    client.addComposerItem({
      id: "mg-templates",
      Component: QuickTemplatesItem,
    }),

    // Slash commands: /btw, /tpl, /export
    client.addSlashCommand({
      name: "btw",
      context: "agent",
      description: messages.message("slashBtwDesc"),
      argumentHint: messages.message("slashBtwHint"),
      onSubmit({ agent, args, openPanel }) {
        const question = args.trim();
        setBtwPrefill(
          question
            ? { agentId: agent.id, question, autoSubmit: true }
            : { agentId: agent.id, focusInput: true },
        );
        openPanel(BTW_PANEL_ID);
      },
    }),
    client.addSlashCommand({
      name: "tpl",
      context: "agent",
      description: messages.message("slashTplDesc"),
      argumentHint: messages.message("slashTplHint"),
      async onSubmit({ agent, args, composers, openSettings }) {
        const query = args.trim().toLowerCase();
        const templates = liveSettings.templates;
        if (!query) {
          openSettings(SETTINGS_SCREEN_ID);
          return;
        }
        const match =
          templates.find((tpl) => tpl.id.toLowerCase() === query) ??
          templates.find((tpl) => tpl.title.toLowerCase().includes(query)) ??
          templates.find((tpl) => tpl.subtitle.toLowerCase().includes(query));
        if (!match) {
          throw new Error(client.i18n.t(messages, "templateNoMatch", { query: args.trim() }));
        }
        const composer = composers({ agentId: agent.id })[0];
        if (!composer) return;
        await insertTemplateAndFocus(composer, match.prompt);
      },
    }),
    client.addSlashCommand({
      name: "export",
      context: "agent",
      description: messages.message("slashExportDesc"),
      argumentHint: messages.message("slashExportHint"),
      async onSubmit({ agent }) {
        await runExport(agent.id);
      },
    }),

    // Command Center (Cmd+K): /btw + Export Markdown
    client.addCommandCenterItem({
      id: "mg-btw",
      title: messages.message("btwTitle"),
      icon: "MessageSquarePlus",
      keywords: ["btw", "side", "question", "旁路", "快问"],
      context: "agent",
      onSelect({ agent, openPanel }) {
        setBtwPrefill({ agentId: agent.id, focusInput: true });
        openPanel(BTW_PANEL_ID);
      },
    }),
    client.addCommandCenterItem({
      id: "mg-export",
      title: messages.message("exportCommandTitle"),
      icon: "Copy",
      keywords: ["export", "markdown", "copy", "导出"],
      context: "agent",
      async onSelect({ agent }) {
        await runExport(agent.id);
      },
    }),
  ];

  return () => {
    lifetime.abort();
    removeBtwPills();
    themeCleanups.forEach((remove) => void remove());
    cleanups.forEach((remove) => void remove());
    clearClientStore();
  };
}
