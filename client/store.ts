import type { PluginComposer } from "@getpaseo/plugin/client";
import { DEFAULT_PROMPT_TEMPLATES, type MgSettings } from "../shared/contracts";

export const BTW_PANEL_ID = "mg-btw";
export const SETTINGS_SCREEN_ID = "multigravity-ux";

export interface BtwPrefillRequest {
  agentId: string;
  question?: string;
  autoSubmit?: boolean;
  focusInput?: boolean;
  seq: number;
}

const listeners = new Set<() => void>();
let prefillSeq = 0;
let pendingPrefill: BtwPrefillRequest | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

export function setBtwPrefill(req: Omit<BtwPrefillRequest, "seq">) {
  prefillSeq += 1;
  pendingPrefill = { ...req, seq: prefillSeq };
  emit();
}

export function consumeBtwPrefill(agentId: string): BtwPrefillRequest | null {
  if (!pendingPrefill || pendingPrefill.agentId !== agentId) return null;
  const hit = pendingPrefill;
  pendingPrefill = null;
  emit();
  return hit;
}

export function subscribeBtwPrefill(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearClientStore() {
  pendingPrefill = null;
  listeners.clear();
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

  const match = /\[[^\[\]\n]{1,64}\]/.exec(templatePrompt);
  if (match && typeof match.index === "number") {
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    await composer.focus({ selection: { start, end } }).catch(() => {});
    return;
  }

  const endPos = nextPrompt.length;
  await composer.focus({ selection: { start: endPos, end: endPos } }).catch(() => {});
}
