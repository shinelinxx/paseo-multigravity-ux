import type { PluginComposer } from "@getpaseo/plugin/client";
import { DEFAULT_PROMPT_TEMPLATES, type MgSettings } from "../shared/contracts";

export const BTW_PANEL_ID = "mg-btw";
export const SETTINGS_SCREEN_ID = "multigravity-ux";

const PLACEHOLDER_RE = /\[[^\[\]\n]{1,64}\]/;

export interface BtwPrefillRequest {
  agentId: string;
  question?: string;
  autoSubmit?: boolean;
  focusInput?: boolean;
  seq: number;
}

const agentListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<() => void>();
let prefillSeq = 0;
let pendingPrefill: BtwPrefillRequest | null = null;

function emitForAgent(agentId: string) {
  const scoped = agentListeners.get(agentId);
  if (scoped) {
    scoped.forEach((fn) => fn());
  }
  globalListeners.forEach((fn) => fn());
}

export function setBtwPrefill(req: Omit<BtwPrefillRequest, "seq">) {
  prefillSeq += 1;
  pendingPrefill = { ...req, seq: prefillSeq };
  emitForAgent(req.agentId);
}

export function consumeBtwPrefill(agentId: string): BtwPrefillRequest | null {
  if (!pendingPrefill || pendingPrefill.agentId !== agentId) return null;
  const hit = pendingPrefill;
  pendingPrefill = null;
  return hit;
}

export function subscribeBtwPrefill(listener: () => void, agentId?: string): () => void {
  if (agentId) {
    let set = agentListeners.get(agentId);
    if (!set) {
      set = new Set();
      agentListeners.set(agentId, set);
    }
    set.add(listener);
    return () => {
      const current = agentListeners.get(agentId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) agentListeners.delete(agentId);
    };
  }
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function clearClientStore() {
  pendingPrefill = null;
  agentListeners.clear();
  globalListeners.clear();
}

export const FALLBACK_SETTINGS: MgSettings = {
  showTemplateCombobox: true,
  btwModel: { mode: "follow-parent" },
  templates: DEFAULT_PROMPT_TEMPLATES,
};

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Inserts a prompt template into a Paseo composer and selects the first
 * `[placeholder]` range (matching Multigravity's placeholder auto-selection).
 */
export async function insertTemplateAndFocus(
  composer: PluginComposer,
  templatePrompt: string,
): Promise<void> {
  const existing = composer.prompt;
  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const nextPrompt = `${existing}${separator}${templatePrompt}`;
  const baseOffset = existing.length + separator.length;

  composer.setPrompt(nextPrompt);

  const match = PLACEHOLDER_RE.exec(templatePrompt);
  if (match && typeof match.index === "number") {
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    await composer.focus({ selection: { start, end } }).catch(() => {});
    return;
  }

  const endPos = nextPrompt.length;
  await composer.focus({ selection: { start: endPos, end: endPos } }).catch(() => {});
}
