import {
  useComposer,
  useSettings,
  useTranslation,
} from "@getpaseo/plugin/client";
import { Combobox, useToast, type ComboboxItem } from "@getpaseo/plugin/client/ui";
import { memo, useCallback, useMemo, useRef } from "react";
import { mgSettings } from "../shared/contracts";
import { messages } from "./i18n";
import { FALLBACK_SETTINGS, insertTemplateAndFocus } from "./store";

interface TemplateComboboxItem extends ComboboxItem {
  prompt: string;
}

interface IndexedTemplate {
  item: TemplateComboboxItem;
  titleLower: string;
  subtitleLower: string;
  promptLower: string;
}

const MemoTemplateCombobox = memo(function MemoTemplateCombobox({
  title,
  search,
  onSelect,
}: {
  title: string;
  search: (input: { query: string }) => Promise<readonly TemplateComboboxItem[]>;
  onSelect: (input: { item: TemplateComboboxItem }) => Promise<void>;
}) {
  return (
    <Combobox<TemplateComboboxItem>
      title={title}
      icon="Zap"
      value={null}
      search={search}
      onSelect={onSelect}
    />
  );
});

/**
 * Searchable native <Combobox> for saved prompt templates inside Paseo's composer.
 * Auto-selects the first `[placeholder]` upon insertion.
 */
export function QuickTemplatesItem() {
  const composer = useComposer();
  const composerRef = useRef(composer);
  composerRef.current = composer;

  const settings = useSettings(mgSettings);
  const { t } = useTranslation(messages);
  const toast = useToast();

  const values = settings.status === "ready" ? settings.values : FALLBACK_SETTINGS;
  const templates = values.templates;

  const indexedTemplates = useMemo<IndexedTemplate[]>(
    () =>
      [...templates]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned))
        .map((tpl) => ({
          item: {
            id: tpl.id,
            label: tpl.title,
            description: tpl.subtitle || undefined,
            prompt: tpl.prompt,
          },
          titleLower: tpl.title.toLowerCase(),
          subtitleLower: tpl.subtitle.toLowerCase(),
          promptLower: tpl.prompt.toLowerCase(),
        })),
    [templates],
  );

  const allItems = useMemo<readonly TemplateComboboxItem[]>(
    () => indexedTemplates.map((entry) => entry.item),
    [indexedTemplates],
  );

  const search = useCallback(
    async ({ query }: { query: string }): Promise<readonly TemplateComboboxItem[]> => {
      const q = query.trim().toLowerCase();
      if (!q) return allItems;
      const matched: TemplateComboboxItem[] = [];
      for (const entry of indexedTemplates) {
        if (
          entry.titleLower.includes(q) ||
          entry.subtitleLower.includes(q) ||
          entry.promptLower.includes(q)
        ) {
          matched.push(entry.item);
        }
      }
      return matched;
    },
    [allItems, indexedTemplates],
  );

  const handleSelect = useCallback(
    async ({ item }: { item: TemplateComboboxItem }) => {
      await insertTemplateAndFocus(composerRef.current, item.prompt);
      toast.show(t("templateInserted", { title: item.label }), { durationMs: 2200 });
    },
    [toast, t],
  );

  if (!values.showTemplateCombobox || templates.length === 0) return null;

  return (
    <MemoTemplateCombobox
      title={t("quickTemplateTitle")}
      search={search}
      onSelect={handleSelect}
    />
  );
}
