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

/**
 * Zero-chrome-when-idle composer pill:
 * - Mounted ONLY for agents that actually have >= 1 /btw branch.
 * - Removed immediately when an agent has 0 /btw branches or is archived.
 */
export function installBtwPills(client: PluginClientContext): () => void {
  const lifetime = new AbortController();
  const agents = new Map<string, TrackedAgent>();
  const pills = new Map<string, PluginButtonRegistration<PluginText>>();
  let counts: Record<string, BtwCountEntry> = {};

  function syncPill(agentId: string) {
    if (lifetime.signal.aborted) return;
    const agent = agents.get(agentId);
    const entry = counts[agentId];
    if (!agent || !entry || entry.total <= 0) {
      pills.get(agentId)?.remove();
      pills.delete(agentId);
      return;
    }

    const label =
      entry.running > 0
        ? messages.message("btwPillRunning", {
            running: entry.running,
            total: entry.total,
          })
        : messages.message("btwPillIdle", { total: entry.total });

    const existing = pills.get(agentId);
    if (existing) {
      existing.update({ label });
      return;
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
    pills.set(
      agentId,
      client.addComposerPill({
        id: BTW_PANEL_ID,
        workspaceId,
        agentId,
        button,
      }),
    );
  }

  function syncAll() {
    const ids = new Set<string>([...agents.keys(), ...pills.keys()]);
    ids.forEach(syncPill);
  }

  function removeAgent(agentId: string) {
    agents.delete(agentId);
    pills.get(agentId)?.remove();
    pills.delete(agentId);
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
    if (prev && prev.workspaceId !== row.workspaceId) {
      pills.get(row.id)?.remove();
      pills.delete(row.id);
    }
    agents.set(row.id, { id: row.id, workspaceId: row.workspaceId });
    syncPill(row.id);
  }

  const countSub = client.subscribe(
    watchBtwCountsSubscription,
    {},
    (event) => {
      if (lifetime.signal.aborted) return;
      counts = event.counts;
      syncAll();
    },
    { signal: lifetime.signal },
  );
  void countSub.ready.catch(() => {});

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ entries, subscription }) => {
      if (lifetime.signal.aborted) {
        void subscription?.release();
        return;
      }
      for (const { agent } of entries) upsertAgent(agent);
      subscription?.subscribe({
        snapshot: (snap) => {
          if (lifetime.signal.aborted) return;
          const live = new Set(snap.entries.map(({ agent }) => agent.id));
          for (const id of [...agents.keys()]) {
            if (!live.has(id)) removeAgent(id);
          }
          for (const { agent } of snap.entries) upsertAgent(agent);
        },
        update: (msg) => {
          if (lifetime.signal.aborted || msg.type !== "agent_update") return;
          const payload = msg.payload;
          if (payload.kind === "remove") removeAgent(payload.agentId);
          else upsertAgent(payload.agent);
        },
      });
    })
    .catch(() => {});

  return () => {
    lifetime.abort();
    for (const pill of pills.values()) pill.remove();
    pills.clear();
    agents.clear();
  };
}
