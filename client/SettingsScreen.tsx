import {
  usePaseo,
  useSettings,
  useTranslation,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import {
  Icon,
  Modal,
  ScrollView,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  DEFAULT_PROMPT_TEMPLATES,
  mgSettings,
  type MgSettings,
  type PromptTemplate,
} from "../shared/contracts";
import { messages } from "./i18n";
import { FALLBACK_SETTINGS } from "./store";

interface DraftTemplate {
  id: string | null;
  title: string;
  subtitle: string;
  prompt: string;
  pinned: boolean;
}

const EMPTY_DRAFT: DraftTemplate = {
  id: null,
  title: "",
  subtitle: "",
  prompt: "",
  pinned: true,
};

const EMPTY_MODELS: readonly never[] = [];

type SurfaceTheme = PluginSurfaceProps["theme"];

interface TemplateEditorModalProps {
  open: boolean;
  initialTemplate: PromptTemplate | null;
  theme: SurfaceTheme;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: DraftTemplate) => Promise<void>;
}

const TemplateEditorModal = memo(function TemplateEditorModal({
  open,
  initialTemplate,
  theme,
  onOpenChange,
  onSave,
}: TemplateEditorModalProps) {
  const { t } = useTranslation(messages);
  const [draft, setDraft] = useState<DraftTemplate>(EMPTY_DRAFT);

  useEffect(() => {
    if (!open) return;
    if (initialTemplate) {
      setDraft({
        id: initialTemplate.id,
        title: initialTemplate.title,
        subtitle: initialTemplate.subtitle,
        prompt: initialTemplate.prompt,
        pinned: initialTemplate.pinned,
      });
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }, [open, initialTemplate]);

  const canSave = Boolean(draft.title.trim() && draft.prompt.trim());

  return (
    <Modal
      title={draft.id ? t("settingsEditTemplate") : t("settingsNewTemplate")}
      open={open}
      onOpenChange={onOpenChange}
    >
      {open ? (
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontWeight: "600" }}>
                {t("tplTitleLabel")}
              </Text>
              <TextInput
                value={draft.title}
                onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
                placeholder={t("tplTitleLabel")}
                placeholderTextColor={theme.colors.foregroundMuted}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface0,
                  color: theme.colors.foreground,
                  fontSize: 14,
                }}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontWeight: "600" }}>
                {t("tplSubtitleLabel")}
              </Text>
              <TextInput
                value={draft.subtitle}
                onChangeText={(subtitle) => setDraft((d) => ({ ...d, subtitle }))}
                placeholder={t("tplSubtitleLabel")}
                placeholderTextColor={theme.colors.foregroundMuted}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface0,
                  color: theme.colors.foreground,
                  fontSize: 14,
                }}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontWeight: "600" }}>
                {t("tplPromptLabel")}
              </Text>
              <TextInput
                value={draft.prompt}
                onChangeText={(prompt) => setDraft((d) => ({ ...d, prompt }))}
                placeholder={t("tplPromptLabel")}
                placeholderTextColor={theme.colors.foregroundMuted}
                multiline
                style={{
                  minHeight: 110,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface0,
                  color: theme.colors.foreground,
                  fontSize: 13.5,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <Pressable
              onPress={() => setDraft((d) => ({ ...d, pinned: !d.pinned }))}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>
                {t("tplPinnedLabel")}
              </Text>
              <Icon
                name={draft.pinned ? "Pin" : "Plus"}
                size={15}
                color={draft.pinned ? theme.colors.accent : theme.colors.foregroundMuted}
              />
            </Pressable>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <Pressable
                onPress={() => onOpenChange(false)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 8,
                  backgroundColor: theme.colors.surface2,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>
                  {t("tplCancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onSave(draft)}
                disabled={!canSave}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 8,
                  backgroundColor: theme.colors.accent,
                  opacity: !canSave ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.accentForeground,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {t("tplSave")}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal.Content>
      ) : null}
    </Modal>
  );
});

export function SettingsScreen({ theme, layout, host }: PluginSurfaceProps) {
  const { t } = useTranslation(messages);
  const paseo = usePaseo();
  const settings = useSettings(mgSettings);
  const toast = useToast();

  const values = settings.status === "ready" ? settings.values : FALLBACK_SETTINGS;

  const providersQuery = useQuery({
    queryKey: ["mg-providers-snapshot", host.id],
    queryFn: () => paseo.providers.snapshot(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const availableProviders = useMemo(() => {
    const entries = providersQuery.data?.entries ?? [];
    return entries.filter((p) => p.enabled && (p.models?.length ?? 0) > 0);
  }, [providersQuery.data]);

  const selectedProvider =
    values.btwModel.provider &&
    availableProviders.some((p) => p.provider === values.btwModel.provider)
      ? values.btwModel.provider
      : availableProviders[0]?.provider ?? "";

  const activeProviderEntry = availableProviders.find(
    (p) => p.provider === selectedProvider,
  );
  const models = activeProviderEntry?.models ?? EMPTY_MODELS;
  const selectedModel =
    values.btwModel.model && models.some((m) => m.id === values.btwModel.model)
      ? values.btwModel.model
      : models[0]?.id ?? "";

  const thinkingOptions = useMemo(() => {
    const m = models.find((entry) => entry.id === selectedModel);
    return m?.thinkingOptions ?? [];
  }, [models, selectedModel]);

  const modeOptions = useMemo(
    () => [
      { value: "follow-parent", label: t("settingsBtwModeFollow") },
      { value: "custom", label: t("settingsBtwModeCustom") },
    ],
    [t],
  );

  const providerOptions = useMemo(
    () =>
      availableProviders.map((p) => ({
        value: p.provider,
        label: p.label || p.provider,
      })),
    [availableProviders],
  );

  const modelOptions = useMemo(
    () =>
      models.map((m) => ({
        value: m.id,
        label: m.label || m.id,
      })),
    [models],
  );

  const thinkingSelectOptions = useMemo(
    () => [
      { value: "", label: t("settingsDefaultThinking") },
      ...thinkingOptions.map((opt) => ({
        value: opt.id,
        label: opt.label || opt.id,
      })),
    ],
    [thinkingOptions, t],
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PromptTemplate | null>(null);

  const saveNext = useCallback(
    async (next: MgSettings, showNotice = true) => {
      if (settings.status !== "ready") return;
      const ok = await settings.save(next, settings.revision);
      if (ok) {
        if (showNotice) toast.show(t("settingsSaved"), { durationMs: 1800 });
      } else if (settings.saveError) {
        toast.error(settings.saveError);
      }
    },
    [settings, toast, t],
  );

  const openNewTemplate = useCallback(() => {
    setEditingTemplate(null);
    setEditorOpen(true);
  }, []);

  const openEditTemplate = useCallback((tpl: PromptTemplate) => {
    setEditingTemplate(tpl);
    setEditorOpen(true);
  }, []);

  const handleSaveTemplate = useCallback(
    async (draft: DraftTemplate) => {
      const title = draft.title.trim();
      const prompt = draft.prompt.trim();
      if (!title || !prompt) return;
      const record: PromptTemplate = {
        id: draft.id ?? `tpl-${Date.now()}`,
        title,
        subtitle: draft.subtitle.trim(),
        prompt,
        pinned: draft.pinned,
      };
      const nextTemplates = draft.id
        ? values.templates.map((item) => (item.id === draft.id ? record : item))
        : [record, ...values.templates];
      await saveNext({ ...values, templates: nextTemplates });
      setEditorOpen(false);
    },
    [values, saveNext],
  );

  async function handleConfirmDeleteTemplate() {
    if (!pendingDelete) return;
    const nextTemplates = values.templates.filter((item) => item.id !== pendingDelete.id);
    setPendingDelete(null);
    await saveNext({ ...values, templates: nextTemplates });
  }

  async function handleRestoreDefaults() {
    const existingIds = new Set(values.templates.map((item) => item.id));
    const merged = [
      ...values.templates,
      ...DEFAULT_PROMPT_TEMPLATES.filter((d) => !existingIds.has(d.id)),
    ];
    await saveNext({ ...values, templates: merged });
  }

  const pad = layout.compact ? 14 : 24;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: pad, gap: 20, paddingBottom: 40 }}
    >
      {/* 1. /btw Model Strategy */}
      <SettingsSection title={t("settingsBtwSection")}>
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12.5,
            lineHeight: 18,
            marginBottom: 8,
          }}
        >
          {t("settingsBtwHint")}
        </Text>
        <SettingsCard>
          <SettingsSelect
            label={t("settingsBtwModeLabel")}
            value={values.btwModel.mode}
            options={modeOptions}
            onValueChange={(mode) => {
              const nextPolicy =
                mode === "custom"
                  ? {
                      mode: "custom" as const,
                      provider: selectedProvider || undefined,
                      model: selectedModel || undefined,
                      thinking: values.btwModel.thinking,
                    }
                  : { mode: "follow-parent" as const };
              void saveNext({ ...values, btwModel: nextPolicy });
            }}
          />

          {values.btwModel.mode === "custom" && availableProviders.length > 0 ? (
            <>
              <SettingsSelect
                label={t("settingsBtwProvider")}
                value={selectedProvider}
                options={providerOptions}
                onValueChange={(provider) => {
                  const nextProv = availableProviders.find((p) => p.provider === provider);
                  const firstModel = nextProv?.models?.[0]?.id;
                  void saveNext({
                    ...values,
                    btwModel: {
                      mode: "custom",
                      provider,
                      model: firstModel,
                      thinking: undefined,
                    },
                  });
                }}
              />
              {models.length > 0 ? (
                <SettingsSelect
                  label={t("settingsBtwModel")}
                  value={selectedModel}
                  options={modelOptions}
                  onValueChange={(model) => {
                    void saveNext({
                      ...values,
                      btwModel: {
                        mode: "custom",
                        provider: selectedProvider,
                        model,
                        thinking: undefined,
                      },
                    });
                  }}
                />
              ) : null}
              {thinkingOptions.length > 0 ? (
                <SettingsSelect
                  label={t("settingsBtwThinking")}
                  value={values.btwModel.thinking ?? ""}
                  options={thinkingSelectOptions}
                  onValueChange={(thinking) => {
                    void saveNext({
                      ...values,
                      btwModel: {
                        mode: "custom",
                        provider: selectedProvider,
                        model: selectedModel,
                        thinking: thinking || undefined,
                      },
                    });
                  }}
                />
              ) : null}
            </>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      {/* 2. Prompt Templates (Inline Management, Zero Workspace Tab Clutter) */}
      <SettingsSection
        title={t("settingsTemplatesSection")}
        trailing={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              onPress={() => void handleRestoreDefaults()}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 7,
                backgroundColor: theme.colors.surface2,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {t("settingsRestoreDefaults")}
              </Text>
            </Pressable>
            <Pressable
              onPress={openNewTemplate}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 7,
                backgroundColor: theme.colors.accent,
              }}
            >
              <Icon name="Plus" size={12} color={theme.colors.accentForeground} />
              <Text
                style={{
                  color: theme.colors.accentForeground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {t("settingsNewTemplate")}
              </Text>
            </Pressable>
          </View>
        }
      >
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12.5,
            lineHeight: 18,
            marginBottom: 8,
          }}
        >
          {t("settingsTemplatesHint")}
        </Text>

        <SettingsCard>
          <SettingsSwitch
            label={t("settingsShowCombobox")}
            hint={t("settingsShowComboboxHint")}
            value={values.showTemplateCombobox}
            onValueChange={(showTemplateCombobox) =>
              void saveNext({ ...values, showTemplateCombobox })
            }
          />

          {values.templates.map((tpl) => (
            <SettingsRow
              key={tpl.id}
              label={tpl.pinned ? `★ ${tpl.title}` : tpl.title}
              hint={tpl.subtitle || tpl.prompt.slice(0, 72)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Pressable onPress={() => openEditTemplate(tpl)}>
                  <Icon name="Pencil" size={14} color={theme.colors.foregroundMuted} />
                </Pressable>
                <Pressable onPress={() => setPendingDelete(tpl)}>
                  <Icon name="Trash2" size={14} color={theme.colors.statusDanger} />
                </Pressable>
              </View>
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      {/* Template Create / Edit Modal */}
      <TemplateEditorModal
        open={editorOpen}
        initialTemplate={editingTemplate}
        theme={theme}
        onOpenChange={setEditorOpen}
        onSave={handleSaveTemplate}
      />

      {/* Template Delete Confirmation Modal */}
      <Modal
        title={t("settingsDeleteTemplateTitle")}
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        {pendingDelete ? (
          <Modal.Content>
            <View style={{ gap: 14 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13.5, lineHeight: 20 }}>
                {t("settingsDeleteTemplateBody", { title: pendingDelete.title })}
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                <Pressable
                  onPress={() => setPendingDelete(null)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: theme.colors.surface2,
                  }}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>
                    {t("tplCancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleConfirmDeleteTemplate()}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: theme.colors.statusDanger,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>
                    {t("tplDelete")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Modal.Content>
        ) : null}
      </Modal>
    </ScrollView>
  );
}
