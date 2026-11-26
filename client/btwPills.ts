import type {
  PluginButton,
  PluginButtonRegistration,
  PluginClientContext,
  PluginText,
} from "@getpaseo/plugin/client";
import { watchBtwCountsSubscription, type BtwCountEntry } from "../shared/contracts";
import { messages } from "./i18n";
import { BTW_PANEL_ID } from "./store";

interface TrackedAgent {
  id: string;
  workspaceId: string;
}

interface PillState {
  reg: PluginButtonRegistration<PluginText>;
  workspaceId: string;
  total: number;
  running: number;
}

/**
 * Zero-chrome-when-idle composer pill:
 * - Mounted ONLY for agents that actually have >= 1 /btw branch.
 * - Removed immediately when an agent has 0 /btw branches or is archived.
 */
export function installBtwPills(client: PluginClientContext): () => void {
  const lifetime = new AbortController();
  const agents = new Map<string, TrackedAgent>();
  const pills = new Map<string, PillState>();
  let counts: Record<string, BtwCountEntry> = {};

  let agentsSubController: AbortController | null = null;
  let agentsSubCleanup: (() => void) | null = null;

  function removePill(agentId: string) {
    const existing = pills.get(agentId);
    if (!existing) return;
    existing.reg.remove();
    pills.delete(agentId);
  }

  function syncPill(agentId: string) {
    if (lifetime.signal.aborted) return;
    const agent = agents.get(agentId);
    const entry = counts[agentId];
    if (!agent || !entry || entry.total <= 0) {
      removePill(agentId);
      return;
    }

    const existing = pills.get(agentId);
    if (
      existing &&
      existing.workspaceId === agent.workspaceId &&
      existing.total === entry.total &&
      existing.running === entry.running
    ) {
      return;
    }

    const label =
      entry.running > 0
        ? messages.message("btwPillRunning", {
            running: entry.running,
            total: entry.total,
          })
        : messages.message("btwPillIdle", { total: entry.total });

    if (existing && existing.workspaceId === agent.workspaceId) {
      existing.reg.update({ label });
      existing.total = entry.total;
      existing.running = entry.running;
      return;
    }

    if (existing) {
      removePill(agentId);
    }

    const workspaceId = agent.workspaceId;
    const button: PluginButton<PluginText> = {
      icon: "MessageSquarePlus",
      title: messages.message("btwPillTitle"),
      label,
      behavior: {
        kind: "action",
        onPress: () => client.openPanel(BTW_PANEL_ID, { workspaceId, agentId }),
      },
    };
    const reg = client.addComposerPill({
      id: BTW_PANEL_ID,
      workspaceId,
      agentId,
      button,
    });
    pills.set(agentId, {
      reg,
      workspaceId,
      total: entry.total,
      running: entry.running,
    });
  }

  function syncAll() {
    const ids = new Set<string>([...Object.keys(counts), ...pills.keys()]);
    ids.forEach(syncPill);
  }

  function removeAgent(agentId: string) {
    agents.delete(agentId);
    removePill(agentId);
  }

  function upsertAgent(row: {
    id: string;
    workspaceId?: string | null;
    archivedAt?: unknown;
    background?: boolean;
  }) {
    if (row.archivedAt || row.background || !row.workspaceId) {
      removeAgent(row.id);
      return;
    }
    const prev = agents.get(row.id);
    if (prev && prev.workspaceId === row.workspaceId) {
      return;
    }
    if (prev && prev.workspaceId !== row.workspaceId) {
      removePill(row.id);
    }
    agents.set(row.id, { id: row.id, workspaceId: row.workspaceId });
    syncPill(row.id);
  }

  function stopAgentsSubscription() {
    if (agentsSubController) {
      agentsSubController.abort();
      agentsSubController = null;
    }
    if (agentsSubCleanup) {
      const cleanup = agentsSubCleanup;
      agentsSubCleanup = null;
      cleanup();
    }
    agents.clear();
  }

  function startAgentsSubscription() {
    if (lifetime.signal.aborted || agentsSubController) return;
    const ctrl = new AbortController();
    agentsSubController = ctrl;

    const onLifetimeAbort = () => ctrl.abort();
    lifetime.signal.addEventListener("abort", onLifetimeAbort, { once: true });

    void client.paseo.agents
      .list({ subscribe: {}, signal: ctrl.signal })
      .then(({ entries, subscription }) => {
        if (ctrl.signal.aborted || lifetime.signal.aborted) {
          lifetime.signal.removeEventListener("abort", onLifetimeAbort);
          void subscription?.release().catch(() => {});
          return;
        }
        const unsubEvents = subscription?.subscribe({
          snapshot: (snap) => {
            if (ctrl.signal.aborted || lifetime.signal.aborted) return;
            const live = new Set(snap.entries.map(({ agent }) => agent.id));
            for (const id of [...agents.keys()]) {
              if (!live.has(id)) removeAgent(id);
            }
            for (const { agent } of snap.entries) upsertAgent(agent);
          },
          update: (msg) => {
            if (ctrl.signal.aborted || lifetime.signal.aborted || msg.type !== "agent_update") {
              return;
            }
            const payload = msg.payload;
            if (payload.kind === "remove") removeAgent(payload.agentId);
            else upsertAgent(payload.agent);
          },
        });
        agentsSubCleanup = () => {
          lifetime.signal.removeEventListener("abort", onLifetimeAbort);
          unsubEvents?.();
          void subscription?.release().catch(() => {});
        };
        for (const { agent } of entries) upsertAgent(agent);
      })
      .catch(() => {
        lifetime.signal.removeEventListener("abort", onLifetimeAbort);
        if (agentsSubController === ctrl) {
          agentsSubController = null;
        }
      });
  }

  const countSub = client.subscribe(
    watchBtwCountsSubscription,
    {},
    (event) => {
      if (lifetime.signal.aborted) return;
      counts = event.counts;
      if (Object.keys(counts).length > 0) {
        startAgentsSubscription();
      } else {
        stopAgentsSubscription();
      }
      syncAll();
    },
    { signal: lifetime.signal },
  );
  void countSub.ready.catch(() => {});

  return () => {
    lifetime.abort();
    stopAgentsSubscription();
    for (const pill of pills.values()) pill.reg.remove();
    pills.clear();
    agents.clear();
  };
}
