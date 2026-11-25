import { randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type {
  PluginHookAgent,
  PluginSessionOpenRequest,
  PluginSettings,
  PluginSubscriptionContext,
} from "@getpaseo/plugin/server";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type {
  askBtwRpc,
  BtwBranch,
  BtwCountEntry,
  BtwMessage,
  deleteBtwRpc,
  listBtwRpc,
  mgSettingsSchema,
} from "../shared/contracts";
import { mutateBtwStore, readBtwStore, type StoredBtwBranch } from "./storage";

export const BTW_META_FLAG = "mg.btw";
export const BTW_META_PARENT = "mg.btwParentAgentId";

const READ_ONLY_TOOL_NAMES = new Set([
  "read_file",
  "read",
  "view_file",
  "view_file_outline",
  "view_code_item",
  "list_dir",
  "find_by_name",
  "grep_search",
  "grep",
  "glob",
  "search",
  "ls",
  "find",
]);

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isReadOnlyPermissionRequest(request: AgentPermissionRequest): boolean {
  if (request.kind !== "tool") return false;
  const detailType = request.detail?.type;
  if (detailType === "read" || detailType === "search") return true;
  const normalized = request.name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return READ_ONLY_TOOL_NAMES.has(normalized);
}

/**
 * Stateful manager for /btw side-question branches:
 * - Injects compact parent context via `agent.open.before` -> `appendSystemPrompt`
 * - Enforces read-only safety via `agent.permission.before`
 * - Cleans up orphan background helpers on parent/workspace archive
 * - Streams live updates via `defineSubscription` (zero polling)
 */
export function createBtwManager(settings: PluginSettings<typeof mgSettingsSchema>) {
  const parentWatchers = new Map<string, Set<() => void>>();
  const countWatchers = new Set<() => void>();
  const activeHelperStops = new Map<string, () => void>();
  const runningHelpers = new Map<string, boolean>();
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function notifyParent(parentAgentId: string, immediate = false) {
    const fire = () => {
      pendingTimers.delete(parentAgentId);
      const set = parentWatchers.get(parentAgentId);
      if (set) set.forEach((fn) => fn());
    };
    if (immediate) {
      const existing = pendingTimers.get(parentAgentId);
      if (existing) clearTimeout(existing);
      fire();
      return;
    }
    if (pendingTimers.has(parentAgentId)) return;
    pendingTimers.set(parentAgentId, setTimeout(fire, 140));
  }

  function notifyCounts() {
    countWatchers.forEach((fn) => fn());
  }

  function stopHelperWatcher(helperAgentId: string) {
    const stop = activeHelperStops.get(helperAgentId);
    if (stop) {
      activeHelperStops.delete(helperAgentId);
      stop();
    }
    runningHelpers.delete(helperAgentId);
  }

  function ensureHelperWatcher(paseo: PaseoApi, record: StoredBtwBranch) {
    if (activeHelperStops.has(record.helperAgentId)) return;
    const handle = paseo.agents.ref(record.helperAgentId);
    let stopped = false;

    const unsubAgent = handle.subscribe((update) => {
      if (stopped) return;
      if (update.kind === "remove") {
        stopHelperWatcher(record.helperAgentId);
        notifyParent(record.parentAgentId, true);
        notifyCounts();
        return;
      }
      const st = update.agent.status;
      const isRun = st === "running" || st === "initializing";
      const prevRun = runningHelpers.get(record.helperAgentId);
      runningHelpers.set(record.helperAgentId, isRun);
      if (prevRun !== isRun) notifyCounts();
      notifyParent(record.parentAgentId, !isRun);
      if (!isRun) {
        // Turn finished: release timeline stream to stay lightweight
        stopHelperWatcher(record.helperAgentId);
      }
    });

    const timelineSub = handle.timeline.subscribe((event) => {
      if (stopped) return;
      if (event.event.type === "error") return;
      notifyParent(record.parentAgentId, false);
    });
    void timelineSub.ready.catch(() => {});

    activeHelperStops.set(record.helperAgentId, () => {
      stopped = true;
      unsubAgent();
      timelineSub();
    });
  }

  async function hydrateBranch(paseo: PaseoApi, record: StoredBtwBranch): Promise<BtwBranch> {
    try {
      const handle = paseo.agents.ref(record.helperAgentId);
      const page = await handle.timeline.refetch({
        direction: "tail",
        limit: 80,
        projection: "projected",
      });
      const status = (page.agent?.status ?? "closed") as BtwBranch["status"];
      const isRun = status === "running" || status === "initializing";
      runningHelpers.set(record.helperAgentId, isRun);
      if (isRun) ensureHelperWatcher(paseo, record);

      const messages: BtwMessage[] = [];
      for (const entry of page.entries) {
        const item = entry.item;
        if (item.type === "user_message" && item.text.trim()) {
          messages.push({
            role: "user",
            text: item.text.trim(),
            timestamp: entry.timestamp,
          });
        } else if (item.type === "assistant_message" && item.text.trim()) {
          messages.push({
            role: "assistant",
            text: item.text.trim(),
            timestamp: entry.timestamp,
          });
        } else if (item.type === "error" && item.message.trim()) {
          messages.push({
            role: "error",
            text: item.message.trim(),
            timestamp: entry.timestamp,
          });
        }
      }
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      return {
        ...record,
        status,
        messages,
        lastAnswer: lastAssistant?.text ?? "",
      };
    } catch {
      runningHelpers.delete(record.helperAgentId);
      return {
        ...record,
        status: "closed",
        messages: [],
        lastAnswer: "",
      };
    }
  }

  async function computeCounts(): Promise<Record<string, BtwCountEntry>> {
    const all = await readBtwStore();
    const map: Record<string, BtwCountEntry> = {};
    for (const branch of all) {
      const cur = map[branch.parentAgentId] ?? { total: 0, running: 0 };
      cur.total += 1;
      if (runningHelpers.get(branch.helperAgentId)) cur.running += 1;
      map[branch.parentAgentId] = cur;
    }
    return map;
  }

  async function buildSystemContext(paseo: PaseoApi, parentAgentId: string): Promise<string> {
    const lines: string[] = [
      "You are a read-only /btw side-question helper answering a quick tangential question alongside the user's main conversation.",
      "Rules: answer concisely and directly; do NOT modify files, write code to disk, or run destructive commands.",
    ];
    try {
      const page = await paseo.agents.ref(parentAgentId).timeline.refetch({
        direction: "tail",
        limit: 30,
        projection: "projected",
      });
      if (page.agent?.title) {
        lines.push("", `Main conversation title: ${page.agent.title}`);
      }
      const excerpt: string[] = [];
      for (const entry of page.entries) {
        if (entry.item.type === "user_message" && entry.item.text.trim()) {
          excerpt.push(`User: ${clip(entry.item.text, 260)}`);
        } else if (entry.item.type === "assistant_message" && entry.item.text.trim()) {
          excerpt.push(`Assistant: ${clip(entry.item.text, 360)}`);
        }
      }
      if (excerpt.length > 0) {
        lines.push("", "[Recent Main Conversation Context]", ...excerpt.slice(-6));
      }
    } catch {
      // Context excerpt is best-effort.
    }
    return lines.join("\n");
  }

  // ---- Lifecycle hooks ------------------------------------------------------

  async function handleSessionOpen(
    request: PluginSessionOpenRequest,
    paseo: PaseoApi,
  ): Promise<PluginSessionOpenRequest | void> {
    if (request.metadata[BTW_META_FLAG] !== true) return;
    const parentAgentId =
      typeof request.metadata[BTW_META_PARENT] === "string"
        ? request.metadata[BTW_META_PARENT]
        : "";
    if (!parentAgentId) return;
    const instruction = await buildSystemContext(paseo, parentAgentId);
    return {
      ...request,
      appendSystemPrompt: [...(request.appendSystemPrompt ?? []), instruction],
    };
  }

  async function handlePermissionBefore(
    agent: PluginHookAgent,
    request: AgentPermissionRequest,
    paseo: PaseoApi,
  ): Promise<void> {
    if (agent.metadata[BTW_META_FLAG] !== true) return;
    const handle = paseo.agents.ref(agent.id);
    if (isReadOnlyPermissionRequest(request)) {
      await handle
        .respondToPermission({
          requestId: request.id,
          response: { behavior: "allow" },
        })
        .catch(() => {});
      return;
    }
    await handle
      .respondToPermission({
        requestId: request.id,
        response: {
          behavior: "deny",
          message:
            "This /btw side-question session is read-only. Answer directly without modifying files or executing mutating commands.",
        },
      })
      .catch(() => {});
  }

  async function cleanupByPredicate(
    predicate: (b: StoredBtwBranch) => boolean,
    paseo: PaseoApi,
  ): Promise<void> {
    let removed: StoredBtwBranch[] = [];
    await mutateBtwStore((branches) => {
      removed = branches.filter(predicate);
      return branches.filter((b) => !predicate(b));
    });
    if (removed.length === 0) return;
    const touchedParents = new Set<string>();
    for (const branch of removed) {
      touchedParents.add(branch.parentAgentId);
      stopHelperWatcher(branch.helperAgentId);
      await paseo.agents.ref(branch.helperAgentId).archive().catch(() => {});
    }
    touchedParents.forEach((pid) => notifyParent(pid, true));
    notifyCounts();
  }

  // ---- RPCs -----------------------------------------------------------------

  async function listBranches(
    input: RpcInput<typeof listBtwRpc>,
    paseo: PaseoApi,
  ): Promise<RpcOutput<typeof listBtwRpc>> {
    const all = await readBtwStore();
    const matching = all
      .filter((b) => b.parentAgentId === input.parentAgentId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const branches = await Promise.all(matching.map((b) => hydrateBranch(paseo, b)));
    return { branches };
  }

  async function ask(
    input: RpcInput<typeof askBtwRpc>,
    paseo: PaseoApi,
  ): Promise<RpcOutput<typeof askBtwRpc>> {
    const question = input.question.trim();
    if (!question) throw new Error("Question cannot be empty.");

    // Follow-up in an existing /btw branch
    if (input.branchId) {
      const all = await readBtwStore();
      const existing = all.find(
        (b) => b.id === input.branchId && b.parentAgentId === input.parentAgentId,
      );
      if (existing) {
        runningHelpers.set(existing.helperAgentId, true);
        ensureHelperWatcher(paseo, existing);
        notifyCounts();
        await paseo.agents.ref(existing.helperAgentId).send(question);
        notifyParent(input.parentAgentId, true);
        return { branch: await hydrateBranch(paseo, existing) };
      }
    }

    // Resolve model strategy from host settings (follow parent OR dedicated fast model)
    const settingsState = await settings.read().catch(() => null);
    const btwPolicy =
      settingsState?.status === "ready" ? settingsState.values.btwModel : undefined;

    let providerSpec: string;
    let thinkingOptionId: string | undefined;

    if (btwPolicy?.mode === "custom" && btwPolicy.provider && btwPolicy.model) {
      providerSpec = `${btwPolicy.provider}/${btwPolicy.model}`;
      thinkingOptionId = btwPolicy.thinking || undefined;
    } else {
      const parentHandle = paseo.agents.ref(input.parentAgentId);
      const parentInfo = await parentHandle.refresh().catch(() => null);
      const parentAgent = parentInfo?.agent ?? parentHandle.current();
      const provider = parentAgent?.provider || "antigravity";
      const model = parentAgent?.model;
      providerSpec = model ? `${provider}/${model}` : provider;
    }

    const helper = await paseo.workspaces.ref(input.workspaceId).agents.create({
      title: `/btw ${clip(question, 42)}`,
      config: {
        provider: providerSpec,
        ...(thinkingOptionId ? { thinkingOptionId } : {}),
      },
      background: true,
      prompt: question,
      labels: {
        "multigravity.btw": "true",
        "multigravity.parentAgentId": input.parentAgentId,
      },
      metadata: {
        [BTW_META_FLAG]: true,
        [BTW_META_PARENT]: input.parentAgentId,
      },
    });

    const record: StoredBtwBranch = {
      id: randomUUID(),
      parentAgentId: input.parentAgentId,
      workspaceId: input.workspaceId,
      helperAgentId: helper.id,
      title: clip(question, 72),
      createdAt: new Date().toISOString(),
    };

    await mutateBtwStore((branches) => [record, ...branches].slice(0, 120));
    runningHelpers.set(record.helperAgentId, true);
    ensureHelperWatcher(paseo, record);
    notifyCounts();
    notifyParent(input.parentAgentId, true);

    return { branch: await hydrateBranch(paseo, record) };
  }

  async function remove(
    input: RpcInput<typeof deleteBtwRpc>,
    paseo: PaseoApi,
  ): Promise<RpcOutput<typeof deleteBtwRpc>> {
    let target: StoredBtwBranch | undefined;
    await mutateBtwStore((branches) => {
      target = branches.find(
        (b) => b.id === input.branchId && b.parentAgentId === input.parentAgentId,
      );
      return branches.filter(
        (b) => !(b.id === input.branchId && b.parentAgentId === input.parentAgentId),
      );
    });
    if (!target) return { removed: false };
    stopHelperWatcher(target.helperAgentId);
    await paseo.agents.ref(target.helperAgentId).archive().catch(() => {});
    notifyParent(input.parentAgentId, true);
    notifyCounts();
    return { removed: true };
  }

  // ---- Subscriptions --------------------------------------------------------

  function watchBranches(
    input: { parentAgentId: string },
    ctx: PluginSubscriptionContext<{ branches: BtwBranch[] }>,
  ): void {
    const parentId = input.parentAgentId;
    let inFlight = false;
    let dirty = false;

    const pushLatest = async () => {
      if (ctx.signal.aborted) return;
      if (inFlight) {
        dirty = true;
        return;
      }
      inFlight = true;
      try {
        do {
          dirty = false;
          const res = await listBranches({ parentAgentId: parentId }, ctx.paseo);
          if (ctx.signal.aborted) return;
          await ctx.push(res);
        } while (dirty && !ctx.signal.aborted);
      } catch {
        // Subscription closed or transient error.
      } finally {
        inFlight = false;
      }
    };

    const listener = () => {
      void pushLatest();
    };
    let set = parentWatchers.get(parentId);
    if (!set) {
      set = new Set();
      parentWatchers.set(parentId, set);
    }
    set.add(listener);

    ctx.signal.addEventListener("abort", () => {
      const s = parentWatchers.get(parentId);
      if (s) {
        s.delete(listener);
        if (s.size === 0) parentWatchers.delete(parentId);
      }
    });

    void pushLatest();
  }

  function watchCounts(
    _input: Record<string, never>,
    ctx: PluginSubscriptionContext<{ counts: Record<string, BtwCountEntry> }>,
  ): void {
    const pushLatest = async () => {
      if (ctx.signal.aborted) return;
      try {
        const counts = await computeCounts();
        if (!ctx.signal.aborted) await ctx.push({ counts });
      } catch {
        // Ignore on close.
      }
    };

    const listener = () => {
      void pushLatest();
    };
    countWatchers.add(listener);
    ctx.signal.addEventListener("abort", () => {
      countWatchers.delete(listener);
    });

    void pushLatest();
  }

  function dispose() {
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    for (const stop of activeHelperStops.values()) stop();
    activeHelperStops.clear();
    parentWatchers.clear();
    countWatchers.clear();
    runningHelpers.clear();
  }

  return {
    handleSessionOpen,
    handlePermissionBefore,
    cleanupForParentAgent: (agentId: string, paseo: PaseoApi) =>
      cleanupByPredicate((b) => b.parentAgentId === agentId || b.helperAgentId === agentId, paseo),
    cleanupForWorkspace: (workspaceId: string, paseo: PaseoApi) =>
      cleanupByPredicate((b) => b.workspaceId === workspaceId, paseo),
    listBranches,
    ask,
    remove,
    watchBranches,
    watchCounts,
    dispose,
  };
}
