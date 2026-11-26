import {
  useComposers,
  useRpc,
  useSubscription,
  useTranslation,
  type PluginAgentPanelProps,
  type PluginComposer,
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
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
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
  type BtwMessage,
} from "../shared/contracts";
import { messages } from "./i18n";
import {
  consumeBtwPrefill,
  errorText,
  subscribeBtwPrefill,
} from "./store";

const staticStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  titleText: {
    fontSize: 15,
    fontWeight: "700",
  },
  subtitleText: {
    fontSize: 12,
  },
  newBranchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  newBranchText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadingWrap: {
    padding: 28,
    alignItems: "center",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  toolbarTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  insertBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  insertBtnText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  deleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  msgCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  msgHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  msgRoleText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  msgBodyText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  runningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
  },
  runningText: {
    fontSize: 13,
  },
  branchList: {
    gap: 10,
  },
  emptyWrap: {
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  branchCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  branchCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  branchCardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  branchCardAnswer: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  inputBar: {
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputField: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13.5,
  },
  sendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalBody: {
    gap: 14,
  },
  modalText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCancelText: {
    fontSize: 13,
  },
  modalDeleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalDeleteText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});

type PanelTheme = PluginAgentPanelProps["theme"];

function createThemeStyles(theme: PanelTheme) {
  return {
    root: { backgroundColor: theme.colors.surface0 },
    header: {
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    fg: { color: theme.colors.foreground },
    fgMuted: { color: theme.colors.foregroundMuted },
    accentFg: { color: theme.colors.accentForeground },
    accentBg: { backgroundColor: theme.colors.accent },
    dangerBg: { backgroundColor: theme.colors.statusDanger },
    surface2Bg: { backgroundColor: theme.colors.surface2 },
    selectedPill: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    unselectedPill: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
    },
    surface1Border: {
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
    },
    surface2Border: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
    },
    errorBorder: {
      borderColor: theme.colors.statusDanger,
    },
    roleUser: { color: theme.colors.accent },
    roleError: { color: theme.colors.statusDanger },
    roleAssistant: { color: theme.colors.statusSuccess },
    inputBar: {
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    inputField: {
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      color: theme.colors.foreground,
    },
  };
}

type ThemeStyles = ReturnType<typeof createThemeStyles>;

/**
 * Isolates `useComposers({ agentId })` into a tiny leaf so main-composer
 * keystrokes never re-render BtwPanel or its Markdown message cards.
 */
const ComposerRefSync = memo(function ComposerRefSync({
  agentId,
  composerRef,
}: {
  agentId: string;
  composerRef: RefObject<PluginComposer | undefined>;
}) {
  const composers = useComposers({ agentId });
  composerRef.current = composers[0];
  useEffect(() => {
    return () => {
      composerRef.current = undefined;
    };
  }, [composerRef]);
  return null;
});

interface BtwMessageCardProps {
  msg: BtwMessage;
  theme: PanelTheme;
  themeStyles: ThemeStyles;
  onCopy: (text: string) => void;
}

const BtwMessageCard = memo(function BtwMessageCard({
  msg,
  theme,
  themeStyles,
  onCopy,
}: BtwMessageCardProps) {
  const handleCopy = useCallback(() => {
    onCopy(msg.text);
  }, [onCopy, msg.text]);

  return (
    <View
      style={[
        staticStyles.msgCard,
        msg.role === "user" ? themeStyles.surface2Border : themeStyles.surface1Border,
        msg.role === "error" ? themeStyles.errorBorder : null,
      ]}
    >
      <View style={staticStyles.msgHeader}>
        <Text
          style={[
            staticStyles.msgRoleText,
            msg.role === "user"
              ? themeStyles.roleUser
              : msg.role === "error"
                ? themeStyles.roleError
                : themeStyles.roleAssistant,
          ]}
        >
          {msg.role === "user"
            ? "You (/btw)"
            : msg.role === "error"
              ? "Error"
              : "Answer"}
        </Text>
        {msg.role === "assistant" ? (
          <Pressable onPress={handleCopy}>
            <Icon name="Copy" size={13} color={theme.colors.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>
      {msg.role === "assistant" ? (
        <Markdown>{msg.text}</Markdown>
      ) : (
        <Text
          style={[
            staticStyles.msgBodyText,
            msg.role === "error" ? themeStyles.roleError : themeStyles.fg,
          ]}
        >
          {msg.text}
        </Text>
      )}
    </View>
  );
});

interface BtwInputBarHandle {
  focus: (delayMs?: number) => void;
  setTextAndFocus: (text: string, delayMs?: number) => void;
  clear: () => void;
}

interface BtwInputBarProps {
  theme: PanelTheme;
  themeStyles: ThemeStyles;
  pad: number;
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  isPending: boolean;
  onSend: (question: string) => void;
}

const BtwInputBar = memo(
  forwardRef<BtwInputBarHandle, BtwInputBarProps>(function BtwInputBar(
    { theme, themeStyles, pad, placeholder, sendLabel, sendingLabel, isPending, onSend },
    ref,
  ) {
    const [questionText, setQuestionText] = useState("");
    const inputRef = useRef<NativeTextInput>(null);
    const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleFocus = useCallback((delayMs = 40) => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        inputRef.current?.focus();
      }, delayMs);
    }, []);

    useEffect(() => {
      return () => {
        if (focusTimerRef.current) {
          clearTimeout(focusTimerRef.current);
          focusTimerRef.current = null;
        }
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus(delayMs = 40) {
          scheduleFocus(delayMs);
        },
        setTextAndFocus(text: string, delayMs = 60) {
          setQuestionText(text);
          scheduleFocus(delayMs);
        },
        clear() {
          setQuestionText("");
        },
      }),
      [scheduleFocus],
    );

    const handleSend = useCallback(() => {
      const trimmed = questionText.trim();
      if (!trimmed || isPending) return;
      onSend(trimmed);
    }, [questionText, isPending, onSend]);

    const handleKeyPress = useCallback(
      (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
        if (Platform.OS !== "web") return;
        const native = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
        if (native.key === "Enter" && !native.shiftKey) {
          if (
            typeof (e as unknown as { preventDefault?: () => void }).preventDefault === "function"
          ) {
            (e as unknown as { preventDefault: () => void }).preventDefault();
          }
          handleSend();
        }
      },
      [handleSend],
    );

    const disabled = !questionText.trim() || isPending;

    return (
      <View style={[staticStyles.inputBar, themeStyles.inputBar, { padding: pad }]}>
        <View style={staticStyles.inputRow}>
          <TextInput
            ref={inputRef}
            value={questionText}
            onChangeText={setQuestionText}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
            returnKeyType="send"
            style={[staticStyles.inputField, themeStyles.inputField]}
          />
          <Pressable
            onPress={handleSend}
            disabled={disabled}
            style={[
              staticStyles.sendBtn,
              themeStyles.accentBg,
              disabled ? staticStyles.sendBtnDisabled : null,
            ]}
          >
            <Text style={[staticStyles.sendBtnText, themeStyles.accentFg]}>
              {isPending ? sendingLabel : sendLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }),
);

export function BtwPanel({ theme, layout, workspaceId, params }: PluginAgentPanelProps) {
  const agentId = params.agentId;
  const { t } = useTranslation(messages);
  const toast = useToast();

  const askBranch = useRpc(askBtwRpc);
  const removeBranch = useRpc(deleteBtwRpc);
  const composerRef = useRef<PluginComposer | undefined>(undefined);
  const inputBarRef = useRef<BtwInputBarHandle>(null);

  const [branches, setBranches] = useState<BtwBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BtwBranch | null>(null);

  const themeStyles = useMemo(() => createThemeStyles(theme), [theme]);

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
      inputBarRef.current?.clear();
    },
    onError: (err) => {
      toast.error(errorText(err));
    },
  });

  const askMutateRef = useRef(askMutation.mutate);
  askMutateRef.current = askMutation.mutate;

  const deleteMutation = useMutation({
    mutationFn: (branchId: string) =>
      removeBranch({ parentAgentId: agentId, branchId }),
    onSuccess: (_, branchId) => {
      setPendingDelete(null);
      setSelectedBranchId((cur) => (cur === branchId ? null : cur));
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
          askMutateRef.current({ question: req.question });
        } else {
          inputBarRef.current?.setTextAndFocus(req.question, 60);
        }
      } else if (req.focusInput) {
        setSelectedBranchId(null);
        inputBarRef.current?.focus(60);
      }
    };
    apply();
    return subscribeBtwPrefill(apply, agentId);
  }, [agentId]);

  const activeBranch: BtwBranch | null = useMemo(
    () => (selectedBranchId ? branches.find((b) => b.id === selectedBranchId) ?? null : null),
    [branches, selectedBranchId],
  );

  const activeBranchIdRef = useRef<string | undefined>(undefined);
  activeBranchIdRef.current = activeBranch?.id;

  const handleInsertBack = useCallback(
    async (branch: BtwBranch) => {
      const answer = branch.lastAnswer.trim();
      if (!answer) return;
      const block = `\n> [/btw] ${branch.title}\n>\n${answer
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
      const composer = composerRef.current;
      if (composer) {
        composer.insertText(block);
        await composer.focus().catch(() => {});
        toast.show(t("btwInsertedBack"), { durationMs: 2800 });
      } else {
        await copyText(answer).catch(() => {});
        toast.show(t("btwCopiedAnswer"), { durationMs: 2200 });
      }
    },
    [toast, t],
  );

  const handleCopyMessage = useCallback(
    (text: string) => {
      void copyText(text).catch(() => {});
      toast.show(t("btwCopiedAnswer"), { durationMs: 2000 });
    },
    [toast, t],
  );

  const handleSendQuestion = useCallback((question: string) => {
    askMutateRef.current({
      branchId: activeBranchIdRef.current,
      question,
    });
  }, []);

  const handleNewBranchPress = useCallback(() => {
    setSelectedBranchId(null);
    inputBarRef.current?.focus(40);
  }, []);

  const handleDeleteModalOpenChange = useCallback((open: boolean) => {
    if (!open) setPendingDelete(null);
  }, []);

  const pad = layout.compact ? 12 : 18;
  const scrollContentStyle = useMemo(
    () => ({ padding: pad, gap: 12, paddingBottom: 20 }),
    [pad],
  );
  const headerPadStyle = useMemo(
    () => ({ paddingHorizontal: pad, paddingTop: pad }),
    [pad],
  );

  return (
    <View style={[staticStyles.root, themeStyles.root]}>
      <ComposerRefSync agentId={agentId} composerRef={composerRef} />

      {/* Header */}
      <View style={[staticStyles.header, themeStyles.header, headerPadStyle]}>
        <View style={staticStyles.headerRow}>
          <View style={staticStyles.headerLeft}>
            <Icon name="MessageSquarePlus" size={18} color={theme.colors.accent} />
            <View style={staticStyles.flex1}>
              <Text style={[staticStyles.titleText, themeStyles.fg]}>
                {t("btwTitle")}
              </Text>
              <Text style={[staticStyles.subtitleText, themeStyles.fgMuted]} numberOfLines={1}>
                {t("btwSubtitle")}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleNewBranchPress}
            style={[
              staticStyles.newBranchBtn,
              selectedBranchId === null ? themeStyles.selectedPill : themeStyles.unselectedPill,
            ]}
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
              style={[
                staticStyles.newBranchText,
                selectedBranchId === null ? themeStyles.accentFg : themeStyles.fg,
              ]}
            >
              {t("btwNewBranch")}
            </Text>
          </Pressable>
        </View>

        {/* Branch Switcher Chips */}
        {branches.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={staticStyles.chipRow}>
              {branches.map((branch) => {
                const selected = branch.id === selectedBranchId;
                const running =
                  branch.status === "running" || branch.status === "initializing";
                return (
                  <Pressable
                    key={branch.id}
                    onPress={() => setSelectedBranchId(branch.id)}
                    style={[
                      staticStyles.chip,
                      selected ? themeStyles.selectedPill : themeStyles.unselectedPill,
                    ]}
                  >
                    {running ? (
                      <ActivityIndicator
                        size="small"
                        color={selected ? theme.colors.accentForeground : theme.colors.accent}
                      />
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={[
                        staticStyles.chipText,
                        selected ? themeStyles.accentFg : themeStyles.fg,
                      ]}
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
      <ScrollView style={staticStyles.flex1} contentContainerStyle={scrollContentStyle}>
        {sub.status === "connecting" && branches.length === 0 ? (
          <View style={staticStyles.loadingWrap}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : activeBranch ? (
          <>
            {/* Active Branch Toolbar */}
            <View style={[staticStyles.toolbar, themeStyles.surface1Border]}>
              <Text numberOfLines={1} style={[staticStyles.toolbarTitle, themeStyles.fg]}>
                {activeBranch.title}
              </Text>
              <View style={staticStyles.toolbarActions}>
                {activeBranch.lastAnswer ? (
                  <Pressable
                    onPress={() => void handleInsertBack(activeBranch)}
                    style={[staticStyles.insertBtn, themeStyles.accentBg]}
                  >
                    <Icon
                      name="CornerUpLeft"
                      size={12}
                      color={theme.colors.accentForeground}
                    />
                    <Text style={[staticStyles.insertBtnText, themeStyles.accentFg]}>
                      {t("btwInsertBack")}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setPendingDelete(activeBranch)}
                  style={[staticStyles.deleteBtn, themeStyles.surface2Border]}
                >
                  <Icon name="Trash2" size={13} color={theme.colors.statusDanger} />
                </Pressable>
              </View>
            </View>

            {/* Messages */}
            {activeBranch.messages.map((msg, idx) => (
              <BtwMessageCard
                key={`${idx}-${msg.timestamp}`}
                msg={msg}
                theme={theme}
                themeStyles={themeStyles}
                onCopy={handleCopyMessage}
              />
            ))}

            {activeBranch.status === "running" ||
            activeBranch.status === "initializing" ? (
              <View style={staticStyles.runningRow}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={[staticStyles.runningText, themeStyles.fgMuted]}>
                  {t("btwRunning")}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={staticStyles.branchList}>
            {branches.length === 0 ? (
              <View style={staticStyles.emptyWrap}>
                <Icon
                  name="MessageSquarePlus"
                  size={28}
                  color={theme.colors.foregroundMuted}
                />
                <Text style={[staticStyles.emptyText, themeStyles.fgMuted]}>
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
                    style={[staticStyles.branchCard, themeStyles.surface1Border]}
                  >
                    <View style={staticStyles.branchCardRow}>
                      <Text
                        numberOfLines={1}
                        style={[staticStyles.branchCardTitle, themeStyles.fg]}
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
                        style={[staticStyles.branchCardAnswer, themeStyles.fgMuted]}
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
      <BtwInputBar
        ref={inputBarRef}
        theme={theme}
        themeStyles={themeStyles}
        pad={pad}
        placeholder={activeBranch ? t("btwFollowUpPlaceholder") : t("btwPlaceholder")}
        sendLabel={t("btwSend")}
        sendingLabel={t("btwSending")}
        isPending={askMutation.isPending}
        onSend={handleSendQuestion}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        title={t("btwDeleteConfirmTitle")}
        open={Boolean(pendingDelete)}
        onOpenChange={handleDeleteModalOpenChange}
      >
        {pendingDelete ? (
          <Modal.Content>
            <View style={staticStyles.modalBody}>
              <Text style={[staticStyles.modalText, themeStyles.fgMuted]}>
                {t("btwDeleteConfirmBody")}
              </Text>
              <View style={staticStyles.modalActions}>
                <Pressable
                  onPress={() => setPendingDelete(null)}
                  style={[staticStyles.modalCancelBtn, themeStyles.surface2Bg]}
                >
                  <Text style={[staticStyles.modalCancelText, themeStyles.fg]}>
                    {t("btwCancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteMutation.mutate(pendingDelete.id)}
                  style={[staticStyles.modalDeleteBtn, themeStyles.dangerBg]}
                >
                  <Text style={staticStyles.modalDeleteText}>
                    {t("btwDelete")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Modal.Content>
        ) : null}
      </Modal>
    </View>
  );
}
