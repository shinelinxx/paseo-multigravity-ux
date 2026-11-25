import { defineRpc, defineSettings, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Prompt & Workflow Templates (synced via Paseo host settings)
// ---------------------------------------------------------------------------

export const promptTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  prompt: z.string().min(1),
  pinned: z.boolean(),
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "code-review",
    title: "并发代码审查",
    subtitle: "多维度审计安全、性能与类型规范，输出结构化修复建议",
    prompt:
      "请对 [模块/文件路径] 进行多维度深度代码审查（安全性、性能瓶颈、边界条件、类型规范），按严重程度分级列出问题并给出可直接落地的修复建议。",
    pinned: true,
  },
  {
    id: "test-and-fix",
    title: "单测定位与修复",
    subtitle: "运行相关单元测试，定位根因并生成最小化补丁",
    prompt:
      "请运行 [测试目标或路径] 相关的单元测试，汇总所有失败用例并定位根因，先说明修复思路再应用最小化改动并复跑验证。",
    pinned: true,
  },
  {
    id: "multi-research",
    title: "多角度技术调研",
    subtitle: "从实现细节、方案对比与最佳实践分头研究并归纳",
    prompt:
      "请围绕 [调研主题] 从核心原理、主流方案对比、潜在风险与当前项目落地路径四个角度开展调研，输出结构化结论与推荐方案。",
    pinned: true,
  },
  {
    id: "plan-architecture",
    title: "架构方案设计",
    subtitle: "先梳理现状与权衡，输出清晰实施清单再动手",
    prompt:
      "在修改代码前，请先阅读 [相关模块/目录] 并输出完整的架构设计方案（含数据流、文件改动清单、兼容性风险和验证计划），等我确认后再开始实现。",
    pinned: true,
  },
  {
    id: "git-pr-summary",
    title: "PR 变更摘要",
    subtitle: "基于当前分支 diff 生成清晰的 PR 描述与测试清单",
    prompt:
      "请检查当前分支相对 [主分支名称] 的所有 git 改动，生成一份结构化的 Pull Request 描述（背景动机、核心变更点、风险评估、验证步骤）。",
    pinned: false,
  },
];

// ---------------------------------------------------------------------------
// Host Settings (v2 — streamlined per Paseo design philosophy)
// ---------------------------------------------------------------------------

export const btwModelPolicySchema = z.object({
  mode: z.enum(["follow-parent", "custom"]).default("follow-parent"),
  provider: z.string().optional(),
  model: z.string().optional(),
  thinking: z.string().optional(),
});

export type BtwModelPolicy = z.infer<typeof btwModelPolicySchema>;

export const mgSettingsSchema = z.object({
  showTemplateCombobox: z.boolean().default(true),
  btwModel: btwModelPolicySchema.default({ mode: "follow-parent" }),
  templates: z.array(promptTemplateSchema).default(DEFAULT_PROMPT_TEMPLATES),
});

export type MgSettings = z.infer<typeof mgSettingsSchema>;

export const mgSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 2,
  schema: mgSettingsSchema,
  migrate(raw) {
    if (!raw || typeof raw !== "object") return {};
    const prev = raw as Record<string, unknown>;
    const prevModules =
      prev.modules && typeof prev.modules === "object"
        ? (prev.modules as Record<string, unknown>)
        : {};
    const showTemplateCombobox =
      typeof prev.showTemplateCombobox === "boolean"
        ? prev.showTemplateCombobox
        : typeof prevModules.quickTemplates === "boolean"
          ? prevModules.quickTemplates
          : true;

    const rawTemplates = Array.isArray(prev.templates) ? prev.templates : null;
    const templates = rawTemplates
      ? rawTemplates
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .map((item) => ({
            id: typeof item.id === "string" && item.id ? item.id : `tpl-${Date.now()}`,
            title: typeof item.title === "string" ? item.title : "Untitled",
            subtitle: typeof item.subtitle === "string" ? item.subtitle : "",
            prompt: typeof item.prompt === "string" ? item.prompt : "",
            pinned: Boolean(item.pinned),
          }))
          .filter((item) => item.title && item.prompt)
      : DEFAULT_PROMPT_TEMPLATES;

    return {
      showTemplateCombobox,
      btwModel:
        prev.btwModel && typeof prev.btwModel === "object"
          ? prev.btwModel
          : { mode: "follow-parent" },
      templates: templates.length > 0 ? templates : DEFAULT_PROMPT_TEMPLATES,
    };
  },
});

export const watchSettingsSubscription = defineSubscription({
  name: "mg.settings.watch",
  input: z.object({}),
  event: z.object({
    revision: z.string(),
    values: mgSettingsSchema,
  }),
});

// ---------------------------------------------------------------------------
// /btw Side-Question RPCs & Real-Time Subscriptions
// ---------------------------------------------------------------------------

export const btwMessageSchema = z.object({
  role: z.enum(["user", "assistant", "error"]),
  text: z.string(),
  timestamp: z.string(),
});

export type BtwMessage = z.infer<typeof btwMessageSchema>;

export const btwBranchSchema = z.object({
  id: z.string(),
  parentAgentId: z.string(),
  workspaceId: z.string(),
  helperAgentId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  status: z.enum(["initializing", "running", "idle", "error", "closed"]),
  messages: z.array(btwMessageSchema),
  lastAnswer: z.string(),
});

export type BtwBranch = z.infer<typeof btwBranchSchema>;

export const btwCountEntrySchema = z.object({
  total: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
});

export type BtwCountEntry = z.infer<typeof btwCountEntrySchema>;

export const listBtwRpc = defineRpc({
  name: "mg.btw.list",
  input: z.object({
    parentAgentId: z.string().min(1),
  }),
  output: z.object({
    branches: z.array(btwBranchSchema),
  }),
});

export const askBtwRpc = defineRpc({
  name: "mg.btw.ask",
  input: z.object({
    parentAgentId: z.string().min(1),
    workspaceId: z.string().min(1),
    branchId: z.string().optional(),
    question: z.string().min(1),
  }),
  output: z.object({
    branch: btwBranchSchema,
  }),
});

export const deleteBtwRpc = defineRpc({
  name: "mg.btw.delete",
  input: z.object({
    parentAgentId: z.string().min(1),
    branchId: z.string().min(1),
  }),
  output: z.object({
    removed: z.boolean(),
  }),
});

export const watchBtwSubscription = defineSubscription({
  name: "mg.btw.watch",
  input: z.object({
    parentAgentId: z.string().min(1),
  }),
  event: z.object({
    branches: z.array(btwBranchSchema),
  }),
});

export const watchBtwCountsSubscription = defineSubscription({
  name: "mg.btw.watch_counts",
  input: z.object({}),
  event: z.object({
    counts: z.record(z.string(), btwCountEntrySchema),
  }),
});

// ---------------------------------------------------------------------------
// Zero-Chrome Markdown Export RPC (/export)
// ---------------------------------------------------------------------------

export const exportMarkdownRpc = defineRpc({
  name: "mg.export.markdown",
  input: z.object({
    agentId: z.string().min(1),
  }),
  output: z.object({
    turnCount: z.number().int().nonnegative(),
    markdown: z.string(),
  }),
});
