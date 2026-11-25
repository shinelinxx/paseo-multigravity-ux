import {
  useComposer,
  useSettings,
  useTranslation,
} from "@getpaseo/plugin/client";
import { Combobox, useToast, type ComboboxItem } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { mgSettings } from "../shared/contracts";
import { messages } from "./i18n";
import { FALLBACK_SETTINGS, insertTemplateAndFocus } from "./store";

interface TemplateComboboxItem extends ComboboxItem {
  prompt: string;
}

/**
 * Searchable native <Combobox> for saved prompt templates inside Paseo's composer.
 * Auto-selects the first `[placeholder]` upon insertion.
 */
export function QuickTemplatesItem() {
  const composer = useComposer();
  const settings = useSettings(mgSettings);
  const { t } = useTranslation(messages);
  const toast = useToast();

  const values = settings.status === "ready" ? settings.values : FALLBACK_SETTINGS;
  const templates = values.templates;

  const search = useCallback(
    async ({ query }: { query: string }): Promise<readonly TemplateComboboxItem[]> => {
      const q = query.trim().toLowerCase();
      const sorted = [...templates].sort((a, b) => Number(b.pinned) - Number(a.pinned));
      const matched = q
        ? sorted.filter(
            (tpl) =>
              tpl.title.toLowerCase().includes(q) ||
              tpl.subtitle.toLowerCase().includes(q) ||
              tpl.prompt.toLowerCase().includes(q),
          )
        : sorted;
      return matched.map((tpl) => ({
        id: tpl.id,
        label: tpl.title,
        description: tpl.subtitle || undefined,
        prompt: tpl.prompt,
      }));
    },
    [templates],
  );

  if (!values.showTemplateCombobox || templates.length === 0) return null;

  return (
    <Combobox<TemplateComboboxItem>
      title={t("quickTemplateTitle")}
      icon="Zap"
      value={null}
      search={search}
      onSelect={async ({ item }) => {
        await insertTemplateAndFocus(composer, item.prompt);
        toast.show(t("templateInserted", { title: item.label }), { durationMs: 2200 });
      }}
    />
  );
}
