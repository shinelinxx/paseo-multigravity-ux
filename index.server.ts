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
    const pushState = async () => {
      if (ctx.signal.aborted) return;
      const state = await settings.read().catch(() => null);
      if (state?.status === "ready" && !ctx.signal.aborted) {
        await ctx.push({ revision: state.revision, values: state.values }).catch(() => {});
      }
    };
    const unsub = settings.subscribe((state) => {
      if (state.status === "ready" && !ctx.signal.aborted) {
        void ctx.push({ revision: state.revision, values: state.values }).catch(() => {});
      }
    });
    ctx.signal.addEventListener("abort", () => {
      void unsub();
    });
    void pushState();
  });

  return () => {
    removeOpenHook();
    removePermHook();
    removeAgentArchiveHook();
    removeWorkspaceArchiveHook();
    btw.dispose();
  };
}
