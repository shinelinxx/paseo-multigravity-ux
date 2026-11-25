import {
  useComposers,
  useRpc,
  useSubscription,
  useTranslation,
  type PluginAgentPanelProps,
} from "@getpaseo/plugin/client";
import {
  copyText,
  Icon,
  Markdown,
  Modal,
  ScrollView,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInput as NativeTextInput,
  type TextInputKeyPressEventData,
} from "react-native";
import {
  askBtwRpc,
  deleteBtwRpc,
  watchBtwSubscription,
  type BtwBranch,
} from "../shared/contracts";
import { messages } from "./i18n";
import {
  consumeBtwPrefill,
  errorText,
  subscribeBtwPrefill,
} from "./store";

export function BtwPanel({ theme, layout, workspaceId, params }: PluginAgentPanelProps) {
  const agentId = params.agentId;
  const { t } = useTranslation(messages);
  const toast = useToast();

  const askBranch = useRpc(askBtwRpc);
  const removeBranch = useRpc(deleteBtwRpc);
  const composers = useComposers({ agentId });
  const inputRef = useRef<NativeTextInput>(null);

  const [branches, setBranches] = useState<BtwBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BtwBranch | null>(null);

  // Real-time push subscription (zero polling)
  const subInput = useMemo(() => ({ parentAgentId: agentId }), [agentId]);
  const handleBranchesEvent = useCallback((event: { branches: BtwBranch[] }) => {
    setBranches(event.branches);
  }, []);
  const sub = useSubscription(watchBtwSubscription, subInput, handleBranchesEvent);

  const askMutation = useMutation({
    mutationFn: (vars: { branchId?: string; question: string }) =>
      askBranch({
        parentAgentId: agentId,
        workspaceId,
        branchId: vars.branchId,
        question: vars.question,
      }),
    onSuccess: (res) => {
      setSelectedBranchId(res.branch.id);
      setQuestionText("");
    },
    onError: (err) => {
      toast.error(errorText(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (branchId: string) =>
      removeBranch({ parentAgentId: agentId, branchId }),
    onSuccess: (_, branchId) => {
      setPendingDelete(null);
      if (selectedBranchId === branchId) setSelectedBranchId(null);
    },
    onError: (err) => {
      setPendingDelete(null);
      toast.error(errorText(err));
    },
  });

  // Consume prefill from /btw slash command or auto-focus input on open
  useEffect(() => {
    const apply = () => {
      const req = consumeBtwPrefill(agentId);
      if (!req) return;
      if (req.question) {
        setSelectedBranchId(null);
        if (req.autoSubmit) {
          askMutation.mutate({ question: req.question });
        } else {
          setQuestionText(req.question);
          setTimeout(() => inputRef.current?.focus(), 60);
        }
      } else if (req.focusInput) {
        setSelectedBranchId(null);
        setTimeout(() => inputRef.current?.focus(), 60);
      }
    };
    apply();
    return subscribeBtwPrefill(apply);
  }, [agentId]);

  const activeBranch: BtwBranch | null = selectedBranchId
    ? branches.find((b) => b.id === selectedBranchId) ?? null
    : null;

  async function handleInsertBack(branch: BtwBranch) {
    const answer = branch.lastAnswer.trim();
    if (!answer) return;
    const block = `\n> [/btw] ${branch.title}\n>\n${answer
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}\n\n`;
    const composer = composers[0];
    if (composer) {
      composer.insertText(block);
      await composer.focus().catch(() => {});
      toast.show(t("btwInsertedBack"), { durationMs: 2800 });
    } else {
      await copyText(answer).catch(() => {});
      toast.show(t("btwCopiedAnswer"), { durationMs: 2200 });
    }
  }

  function handleSend() {
    const trimmed = questionText.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate({
      branchId: activeBranch?.id,
      question: trimmed,
    });
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (Platform.OS !== "web") return;
    const native = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (native.key === "Enter" && !native.shiftKey) {
      if (typeof (e as unknown as { preventDefault?: () => void }).preventDefault === "function") {
        (e as unknown as { preventDefault: () => void }).preventDefault();
      }
      handleSend();
    }
  }

  const pad = layout.compact ? 12 : 18;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: pad,
          paddingTop: pad,
          paddingBottom: 10,
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Icon name="MessageSquarePlus" size={18} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "700" }}>
                {t("btwTitle")}
              </Text>
              <Text
                style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}
                numberOfLines={1}
              >
                {t("btwSubtitle")}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              setSelectedBranchId(null);
              setTimeout(() => inputRef.current?.focus(), 40);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor:
                selectedBranchId === null ? theme.colors.accent : theme.colors.surface2,
              borderWidth: 1,
              borderColor:
                selectedBranchId === null ? theme.colors.accent : theme.colors.border,
            }}
          >
            <Icon
              name="Plus"
              size={13}
              color={
                selectedBranchId === null
                  ? theme.colors.accentForeground
                  : theme.colors.foreground
              }
            />
            <Text
              style={{
                color:
                  selectedBranchId === null
                    ? theme.colors.accentForeground
                    : theme.colors.foreground,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {t("btwNewBranch")}
            </Text>
          </Pressable>
        </View>

        {/* Branch Switcher Chips */}
        {branches.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6, paddingVertical: 2 }}>
              {branches.map((branch) => {
                const selected = branch.id === selectedBranchId;
                const running =
                  branch.status === "running" || branch.status === "initializing";
                return (
                  <Pressable
                    key={branch.id}
                    onPress={() => setSelectedBranchId(branch.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      maxWidth: 220,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: selected ? theme.colors.accent : theme.colors.surface2,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.accent : theme.colors.border,
                    }}
                  >
                    {running ? (
                      <ActivityIndicator
                        size="small"
                        color={selected ? theme.colors.accentForeground : theme.colors.accent}
                      />
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={{
                        color: selected ? theme.colors.accentForeground : theme.colors.foreground,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {branch.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : null}
      </View>

      {/* Body */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: pad, gap: 12, paddingBottom: 20 }}
      >
        {sub.status === "connecting" && branches.length === 0 ? (
          <View style={{ padding: 28, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : activeBranch ? (
          <>
            {/* Active Branch Toolbar */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: 10,
                borderRadius: 10,
                backgroundColor: theme.colors.surface1,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: theme.colors.foreground,
                  fontSize: 13.5,
                  fontWeight: "700",
                }}
              >
                {activeBranch.title}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {activeBranch.lastAnswer ? (
                  <Pressable
                    onPress={() => void handleInsertBack(activeBranch)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: theme.colors.accent,
                    }}
                  >
                    <Icon
                      name="CornerUpLeft"
                      size={12}
                      color={theme.colors.accentForeground}
                    />
                    <Text
                      style={{
                        color: theme.colors.accentForeground,
                        fontSize: 11.5,
                        fontWeight: "600",
                      }}
                    >
                      {t("btwInsertBack")}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setPendingDelete(activeBranch)}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: theme.colors.surface2,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Icon name="Trash2" size={13} color={theme.colors.statusDanger} />
                </Pressable>
              </View>
            </View>

            {/* Messages */}
            {activeBranch.messages.map((msg, idx) => (
              <View
                key={`${idx}-${msg.timestamp}`}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor:
                    msg.role === "user" ? theme.colors.surface2 : theme.colors.surface1,
                  borderWidth: 1,
                  borderColor:
                    msg.role === "error" ? theme.colors.statusDanger : theme.colors.border,
                  gap: 6,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color:
                        msg.role === "user"
                          ? theme.colors.accent
                          : msg.role === "error"
                            ? theme.colors.statusDanger
                            : theme.colors.statusSuccess,
                      fontSize: 11.5,
                      fontWeight: "700",
                    }}
                  >
                    {msg.role === "user"
                      ? "You (/btw)"
                      : msg.role === "error"
                        ? "Error"
                        : "Answer"}
                  </Text>
                  {msg.role === "assistant" ? (
                    <Pressable
                      onPress={async () => {
                        await copyText(msg.text).catch(() => {});
                        toast.show(t("btwCopiedAnswer"), { durationMs: 2000 });
                      }}
                    >
                      <Icon name="Copy" size={13} color={theme.colors.foregroundMuted} />
                    </Pressable>
                  ) : null}
                </View>
                {msg.role === "assistant" ? (
                  <Markdown>{msg.text}</Markdown>
                ) : (
                  <Text
                    style={{
                      color:
                        msg.role === "error"
                          ? theme.colors.statusDanger
                          : theme.colors.foreground,
                      fontSize: 13.5,
                      lineHeight: 20,
                    }}
                  >
                    {msg.text}
                  </Text>
                )}
              </View>
            ))}

            {activeBranch.status === "running" ||
            activeBranch.status === "initializing" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10 }}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
                  {t("btwRunning")}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={{ gap: 10 }}>
            {branches.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center", gap: 10 }}>
                <Icon
                  name="MessageSquarePlus"
                  size={28}
                  color={theme.colors.foregroundMuted}
                />
                <Text
                  style={{
                    color: theme.colors.foregroundMuted,
                    fontSize: 13,
                    textAlign: "center",
                    lineHeight: 19,
                  }}
                >
                  {t("btwEmpty")}
                </Text>
              </View>
            ) : (
              branches.map((branch) => {
                const running =
                  branch.status === "running" || branch.status === "initializing";
                return (
                  <Pressable
                    key={branch.id}
                    onPress={() => setSelectedBranchId(branch.id)}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: theme.colors.surface1,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          color: theme.colors.foreground,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        ↳ {branch.title}
                      </Text>
                      {running ? (
                        <ActivityIndicator size="small" color={theme.colors.accent} />
                      ) : null}
                    </View>
                    {branch.lastAnswer ? (
                      <Text
                        numberOfLines={2}
                        style={{
                          color: theme.colors.foregroundMuted,
                          fontSize: 12.5,
                          lineHeight: 18,
                        }}
                      >
                        {branch.lastAnswer}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom Input */}
      <View
        style={{
          padding: pad,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <TextInput
            ref={inputRef}
            value={questionText}
            onChangeText={setQuestionText}
            onKeyPress={handleKeyPress}
            placeholder={
              activeBranch ? t("btwFollowUpPlaceholder") : t("btwPlaceholder")
            }
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
            returnKeyType="send"
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 120,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 10,
              backgroundColor: theme.colors.surface0,
              borderWidth: 1,
              borderColor: theme.colors.border,
              color: theme.colors.foreground,
              fontSize: 13.5,
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={!questionText.trim() || askMutation.isPending}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: theme.colors.accent,
              opacity: !questionText.trim() || askMutation.isPending ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: theme.colors.accentForeground,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {askMutation.isPending ? t("btwSending") : t("btwSend")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Delete Confirmation Modal */}
      <Modal
        title={t("btwDeleteConfirmTitle")}
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <Modal.Content>
          <View style={{ gap: 14 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13.5, lineHeight: 20 }}>
              {t("btwDeleteConfirmBody")}
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
                  {t("btwCancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: theme.colors.statusDanger,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>
                  {t("btwDelete")}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );
}
