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

function computeBranchesSignature(branches: BtwBranch[]): string {
  if (branches.length === 0) return "";
  return branches
    .map((b) => {
      const len = b.messages.length;
      const last = len > 0 ? b.messages[len - 1] : null;
      let lastError = "";
      for (let i = len - 1; i >= 0; i -= 1) {
        if (b.messages[i].role === "error") {
          lastError = b.messages[i].text;
          break;
        }
      }
      const lastPart = last ? `${last.role}:${last.text.length}:${last.text}` : "";
      return `${b.id}|${b.status}|${len}|${lastPart}|${lastError}`;
    })
    .join("\n");
}

function countsEqual(
  a: Record<string, BtwCountEntry> | null,
  b: Record<string, BtwCountEntry>,
): boolean {
  if (!a) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysB) {
    const prev = a[key];
    const next = b[key];
    if (!prev || prev.total !== next.total || prev.running !== next.running) {
      return false;
    }
  }
  return true;
}

interface HelperWatcherEntry {
  branchId: string;
  parentAgentId: string;
  helperAgentId: string;
  handle: ReturnType<PaseoApi["agents"]["ref"]>;
  unsubAgent: () => void;
  detachTimeline: (() => void) | null;
  stopped: boolean;
}

interface ParentWatcherListener {
  ctx: PluginSubscriptionContext<{ branches: BtwBranch[] }>;
  lastSignature: string | null;
}

interface ParentFanoutState {
  paseo: PaseoApi;
  inFlight: boolean;
  dirty: boolean;
}

interface CountWatcherEntry {
  ctx: PluginSubscriptionContext<{ counts: Record<string, BtwCountEntry> }>;
  lastCounts: Record<string, BtwCountEntry> | null;
}

/**
 * Stateful manager for /btw side-question branches:
 * - Injects compact parent context via `agent.open.before` -> `appendSystemPrompt`
 * - Enforces read-only safety via `agent.permission.before`
 * - Cleans up orphan background helpers on parent/workspace archive
 * - Streams live updates via `defineSubscription` (zero polling)
 */
export function createBtwManager(settings: PluginSettings<typeof mgSettingsSchema>) {
  const parentWatchers = new Map<string, Set<ParentWatcherListener>>();
  const parentFanouts = new Map<string, ParentFanoutState>();
  const countWatchers = new Set<CountWatcherEntry>();
  const activeHelperStops = new Map<string, HelperWatcherEntry>();
  const runningHelpers = new Set<string>();
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const branchCache = new Map<string, BtwBranch>();
  const dirtyBranches = new Set<string>();

  let countsInFlight = false;
  let countsDirty = false;

  async function flushParent(parentAgentId: string): Promise<void> {
    const watchers = parentWatchers.get(parentAgentId);
    const fanout = parentFanouts.get(parentAgentId);
    if (!watchers || watchers.size === 0 || !fanout) return;
    if (fanout.inFlight) {
      fanout.dirty = true;
      return;
    }
    fanout.inFlight = true;
    try {
      do {
        fanout.dirty = false;
        if (watchers.size === 0) break;
        const res = await listBranches({ parentAgentId }, fanout.paseo);
        if (watchers.size === 0) break;
        const sig = computeBranchesSignature(res.branches);
        const targets: ParentWatcherListener[] = [];
        for (const listener of watchers) {
          if (!listener.ctx.signal.aborted && listener.lastSignature !== sig) {
            targets.push(listener);
          }
        }
        if (targets.length > 0) {
          await Promise.allSettled(
            targets.map(async (listener) => {
              listener.lastSignature = sig;
              await listener.ctx.push(res);
            }),
          );
        }
      } while (fanout.dirty && watchers.size > 0);
    } catch {
      // Subscription closed or transient error.
    } finally {
      fanout.inFlight = false;
    }
  }

  function notifyParent(parentAgentId: string, immediate = false) {
    const watchers = parentWatchers.get(parentAgentId);
    if (!watchers || watchers.size === 0) return;

    const fire = () => {
      pendingTimers.delete(parentAgentId);
      void flushParent(parentAgentId);
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

  async function flushCounts(): Promise<void> {
    if (countWatchers.size === 0) return;
    if (countsInFlight) {
      countsDirty = true;
      return;
    }
    countsInFlight = true;
    try {
      do {
        countsDirty = false;
        if (countWatchers.size === 0) break;
        const counts = await computeCounts();
        if (countWatchers.size === 0) break;
        const targets: CountWatcherEntry[] = [];
        for (const watcher of countWatchers) {
          if (!watcher.ctx.signal.aborted && !countsEqual(watcher.lastCounts, counts)) {
            targets.push(watcher);
          }
        }
        if (targets.length > 0) {
          const payload = { counts };
          await Promise.allSettled(
            targets.map(async (watcher) => {
              watcher.lastCounts = counts;
              await watcher.ctx.push(payload);
            }),
          );
        }
      } while (countsDirty && countWatchers.size > 0);
    } catch {
      // Ignore on close.
    } finally {
      countsInFlight = false;
    }
  }

  function notifyCounts() {
    if (countWatchers.size === 0) return;
    void flushCounts();
  }

  function attachTimelineToHelper(entry: HelperWatcherEntry) {
    if (entry.stopped || entry.detachTimeline) return;
    let intentionallyDetached = false;
    const timelineSub = entry.handle.timeline.subscribe((event) => {
      if (entry.stopped || intentionallyDetached) return;
      if (event.event.type === "error") return;
      dirtyBranches.add(entry.branchId);
      notifyParent(entry.parentAgentId, false);
    });
    entry.detachTimeline = () => {
      intentionallyDetached = true;
      timelineSub();
    };
    void timelineSub.ready.catch(() => {
      if (intentionallyDetached || entry.stopped) return;
      if (activeHelperStops.get(entry.helperAgentId) === entry) {
        stopHelperWatcher(entry.helperAgentId);
        notifyCounts();
      }
    });
  }

  function detachTimelineFromHelper(entry: HelperWatcherEntry) {
    if (!entry.detachTimeline) return;
    const detach = entry.detachTimeline;
    entry.detachTimeline = null;
    detach();
  }

  function stopHelperWatcher(helperAgentId: string) {
    const entry = activeHelperStops.get(helperAgentId);
    if (entry) {
      activeHelperStops.delete(helperAgentId);
      entry.stopped = true;
      detachTimelineFromHelper(entry);
      entry.unsubAgent();
    }
    runningHelpers.delete(helperAgentId);
  }

  function ensureHelperWatcher(paseo: PaseoApi, record: StoredBtwBranch) {
    const existing = activeHelperStops.get(record.helperAgentId);
    if (existing) {
      if (parentWatchers.has(record.parentAgentId)) {
        attachTimelineToHelper(existing);
      }
      return;
    }

    const handle = paseo.agents.ref(record.helperAgentId);
    const entry: HelperWatcherEntry = {
      branchId: record.id,
      parentAgentId: record.parentAgentId,
      helperAgentId: record.helperAgentId,
      handle,
      unsubAgent: () => {},
      detachTimeline: null,
      stopped: false,
    };

    entry.unsubAgent = handle.subscribe((update) => {
      if (entry.stopped) return;
      if (update.kind === "remove") {
        dirtyBranches.add(record.id);
        stopHelperWatcher(record.helperAgentId);
        notifyParent(record.parentAgentId, true);
        notifyCounts();
        return;
      }
      const st = update.agent.status;
      const isRun = st === "running" || st === "initializing";
      const prevRun = runningHelpers.has(record.helperAgentId);
      if (isRun) runningHelpers.add(record.helperAgentId);
      else runningHelpers.delete(record.helperAgentId);
      dirtyBranches.add(record.id);
      if (prevRun !== isRun) notifyCounts();
      if (!isRun) {
        // Turn finished: release timeline stream to stay lightweight
        stopHelperWatcher(record.helperAgentId);
      }
      notifyParent(record.parentAgentId, !isRun);
    });

    activeHelperStops.set(record.helperAgentId, entry);
    if (parentWatchers.has(record.parentAgentId)) {
      attachTimelineToHelper(entry);
    }
  }

  async function hydrateBranch(
    paseo: PaseoApi,
    record: StoredBtwBranch,
    force = false,
  ): Promise<BtwBranch> {
    const helperWatcher = activeHelperStops.get(record.helperAgentId);
    const runningWithoutTimeline =
      runningHelpers.has(record.helperAgentId) && !helperWatcher?.detachTimeline;

    if (!force && !dirtyBranches.has(record.id) && !runningWithoutTimeline) {
      const cached = branchCache.get(record.id);
      if (cached) return cached;
    }

    dirtyBranches.delete(record.id);
    try {
      const handle = paseo.agents.ref(record.helperAgentId);
      const page = await handle.timeline.refetch({
        direction: "tail",
        limit: 80,
        projection: "projected",
      });
      const status = (page.agent?.status ?? "closed") as BtwBranch["status"];
      const isRun = status === "running" || status === "initializing";
      if (isRun) {
        runningHelpers.add(record.helperAgentId);
        ensureHelperWatcher(paseo, record);
      } else {
        runningHelpers.delete(record.helperAgentId);
      }

      const messages: BtwMessage[] = [];
      let lastAnswer = "";
      for (const entry of page.entries) {
        const item = entry.item;
        if (item.type === "user_message") {
          const text = item.text.trim();
          if (text) {
            messages.push({
              role: "user",
              text,
              timestamp: entry.timestamp,
            });
          }
        } else if (item.type === "assistant_message") {
          const text = item.text.trim();
          if (text) {
            messages.push({
              role: "assistant",
              text,
              timestamp: entry.timestamp,
            });
            lastAnswer = text;
          }
        } else if (item.type === "error") {
          const text = item.message.trim();
          if (text) {
            messages.push({
              role: "error",
              text,
              timestamp: entry.timestamp,
            });
          }
        }
      }

      const hydrated: BtwBranch = {
        ...record,
        status,
        messages,
        lastAnswer,
      };
      branchCache.set(record.id, hydrated);
      return hydrated;
    } catch {
      runningHelpers.delete(record.helperAgentId);
      const fallback: BtwBranch = {
        ...record,
        status: "closed",
        messages: [],
        lastAnswer: "",
      };
      branchCache.set(record.id, fallback);
      return fallback;
    }
  }

  async function computeCounts(): Promise<Record<string, BtwCountEntry>> {
    const all = await readBtwStore();
    const map: Record<string, BtwCountEntry> = {};
    for (const branch of all) {
      const cur = map[branch.parentAgentId] ?? { total: 0, running: 0 };
      cur.total += 1;
      if (runningHelpers.has(branch.helperAgentId)) cur.running += 1;
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
        if (entry.item.type === "user_message") {
          const text = entry.item.text.trim();
          if (text) excerpt.push(`User: ${clip(text, 260)}`);
        } else if (entry.item.type === "assistant_message") {
          const text = entry.item.text.trim();
          if (text) excerpt.push(`Assistant: ${clip(text, 360)}`);
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
    if (request.purpose === "history") return;
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
      const kept: StoredBtwBranch[] = [];
      removed = [];
      for (const b of branches) {
        if (predicate(b)) removed.push(b);
        else kept.push(b);
      }
      return removed.length === 0 ? branches : kept;
    });
    if (removed.length === 0) return;

    const touchedParents = new Set<string>();
    for (const branch of removed) {
      touchedParents.add(branch.parentAgentId);
      stopHelperWatcher(branch.helperAgentId);
      branchCache.delete(branch.id);
      dirtyBranches.delete(branch.id);
    }
    await Promise.allSettled(
      removed.map((b) => paseo.agents.ref(b.helperAgentId).archive()),
    );
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
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
        runningHelpers.add(existing.helperAgentId);
        dirtyBranches.add(existing.id);
        ensureHelperWatcher(paseo, existing);
        notifyCounts();
        await paseo.agents.ref(existing.helperAgentId).send(question);
        const branch = await hydrateBranch(paseo, existing, true);
        notifyParent(input.parentAgentId, true);
        return { branch };
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

    let evicted: StoredBtwBranch[] = [];
    await mutateBtwStore((branches) => {
      const next = [record, ...branches];
      if (next.length > 120) {
        evicted = next.slice(120);
        return next.slice(0, 120);
      }
      evicted = [];
      return next;
    });
    for (const old of evicted) {
      stopHelperWatcher(old.helperAgentId);
      branchCache.delete(old.id);
      dirtyBranches.delete(old.id);
    }

    runningHelpers.add(record.helperAgentId);
    dirtyBranches.add(record.id);
    ensureHelperWatcher(paseo, record);
    notifyCounts();
    const branch = await hydrateBranch(paseo, record, true);
    notifyParent(input.parentAgentId, true);

    return { branch };
  }

  async function remove(
    input: RpcInput<typeof deleteBtwRpc>,
    paseo: PaseoApi,
  ): Promise<RpcOutput<typeof deleteBtwRpc>> {
    let target: StoredBtwBranch | undefined;
    await mutateBtwStore((branches) => {
      const idx = branches.findIndex(
        (b) => b.id === input.branchId && b.parentAgentId === input.parentAgentId,
      );
      if (idx === -1) {
        target = undefined;
        return branches;
      }
      target = branches[idx];
      return [...branches.slice(0, idx), ...branches.slice(idx + 1)];
    });
    if (!target) return { removed: false };
    stopHelperWatcher(target.helperAgentId);
    branchCache.delete(target.id);
    dirtyBranches.delete(target.id);
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
    if (ctx.signal.aborted) return;
    const parentId = input.parentAgentId;
    const listener: ParentWatcherListener = { ctx, lastSignature: null };

    let set = parentWatchers.get(parentId);
    const isFirstWatcher = !set || set.size === 0;
    if (!set) {
      set = new Set();
      parentWatchers.set(parentId, set);
    }
    set.add(listener);

    const existingFanout = parentFanouts.get(parentId);
    if (existingFanout) {
      existingFanout.paseo = ctx.paseo;
    } else {
      parentFanouts.set(parentId, { paseo: ctx.paseo, inFlight: false, dirty: false });
    }

    if (isFirstWatcher) {
      for (const helper of activeHelperStops.values()) {
        if (helper.parentAgentId === parentId) {
          dirtyBranches.add(helper.branchId);
          attachTimelineToHelper(helper);
        }
      }
    }

    ctx.signal.addEventListener(
      "abort",
      () => {
        const s = parentWatchers.get(parentId);
        if (s) {
          s.delete(listener);
          if (s.size === 0) {
            parentWatchers.delete(parentId);
            parentFanouts.delete(parentId);
            const timer = pendingTimers.get(parentId);
            if (timer) {
              clearTimeout(timer);
              pendingTimers.delete(parentId);
            }
            for (const helper of activeHelperStops.values()) {
              if (helper.parentAgentId === parentId) {
                detachTimelineFromHelper(helper);
              }
            }
          }
        }
      },
      { once: true },
    );

    void flushParent(parentId);
  }

  function watchCounts(
    _input: Record<string, never>,
    ctx: PluginSubscriptionContext<{ counts: Record<string, BtwCountEntry> }>,
  ): void {
    if (ctx.signal.aborted) return;
    const entry: CountWatcherEntry = { ctx, lastCounts: null };
    countWatchers.add(entry);
    ctx.signal.addEventListener(
      "abort",
      () => {
        countWatchers.delete(entry);
      },
      { once: true },
    );

    void flushCounts();
  }

  function dispose() {
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    for (const entry of activeHelperStops.values()) {
      entry.stopped = true;
      detachTimelineFromHelper(entry);
      entry.unsubAgent();
    }
    activeHelperStops.clear();
    parentWatchers.clear();
    parentFanouts.clear();
    countWatchers.clear();
    runningHelpers.clear();
    branchCache.clear();
    dirtyBranches.clear();
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
