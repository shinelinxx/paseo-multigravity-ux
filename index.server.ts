import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createBtwManager } from "./server/btw";
import { exportMarkdown } from "./server/export";
import {
  askBtwRpc,
  deleteBtwRpc,
  exportMarkdownRpc,
  listBtwRpc,
  mgSettings,
  watchBtwCountsSubscription,
  watchBtwSubscription,
  watchSettingsSubscription,
  type MgSettings,
} from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(mgSettings);
  const btw = createBtwManager(settings);

  // /btw lifecycle hooks: clean system-prompt context, read-only guard, orphan cleanup
  const removeOpenHook = server.addHook("agent.open.before", ({ request }, { paseo }) =>
    btw.handleSessionOpen(request, paseo),
  );
  const removePermHook = server.addHook(
    "agent.permission.before",
    ({ agent, request }, { paseo }) => btw.handlePermissionBefore(agent, request, paseo),
  );
  const removeAgentArchiveHook = server.addHook(
    "agent.archive.after",
    ({ agent }, { paseo }) => btw.cleanupForParentAgent(agent.id, paseo),
  );
  const removeWorkspaceArchiveHook = server.addHook(
    "workspace.archive.after",
    ({ workspace }, { paseo }) => btw.cleanupForWorkspace(workspace.id, paseo),
  );

  // RPCs
  server.handle(listBtwRpc, (input, { paseo }) => btw.listBranches(input, paseo));
  server.handle(askBtwRpc, (input, { paseo }) => btw.ask(input, paseo));
  server.handle(deleteBtwRpc, (input, { paseo }) => btw.remove(input, paseo));
  server.handle(exportMarkdownRpc, (input, { paseo }) => exportMarkdown(input, paseo));

  // Real-time subscriptions (eliminates client polling)
  server.handle(watchBtwSubscription, (input, ctx) => btw.watchBranches(input, ctx));
  server.handle(watchBtwCountsSubscription, (input, ctx) => btw.watchCounts(input, ctx));
  server.handle(watchSettingsSubscription, (_input, ctx) => {
    if (ctx.signal.aborted) return;
    let lastRevision: string | null = null;

    const pushIfChanged = (revision: string, values: MgSettings) => {
      if (ctx.signal.aborted || revision === lastRevision) return;
      lastRevision = revision;
      void ctx.push({ revision, values }).catch(() => {});
    };

    const unsub = settings.subscribe((state) => {
      if (state.status === "ready") {
        pushIfChanged(state.revision, state.values);
      }
    });
    ctx.signal.addEventListener(
      "abort",
      () => {
        void unsub();
      },
      { once: true },
    );

    void settings
      .read()
      .then((state) => {
        if (state?.status === "ready") {
          pushIfChanged(state.revision, state.values);
        }
      })
      .catch(() => {});
  });

  return () => {
    removeOpenHook();
    removePermHook();
    removeAgentArchiveHook();
    removeWorkspaceArchiveHook();
    btw.dispose();
  };
}
