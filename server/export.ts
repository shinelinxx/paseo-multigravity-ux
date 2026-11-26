import type { PaseoApi } from "@getpaseo/client";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import type { exportMarkdownRpc } from "../shared/contracts";

interface TimelineRow {
  item: AgentTimelineItem;
  timestamp: string;
  seqStart: number;
}

interface MessageRow {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  seqStart: number;
}

const PAGE_LIMIT = 200;
const MAX_PAGES = 8;

function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export async function exportMarkdown(
  input: RpcInput<typeof exportMarkdownRpc>,
  paseo: PaseoApi,
): Promise<RpcOutput<typeof exportMarkdownRpc>> {
  const handle = paseo.agents.ref(input.agentId);
  const first = await handle.timeline.refetch({
    direction: "tail",
    limit: PAGE_LIMIT,
    projection: "projected",
  });

  const chunks: TimelineRow[][] = [first.entries as TimelineRow[]];
  let cursor = first.startCursor;
  let hasOlder = first.hasOlder;
  let pages = 1;

  while (hasOlder && cursor && pages < MAX_PAGES) {
    const prev = await handle.timeline.refetch({
      direction: "before",
      cursor,
      limit: PAGE_LIMIT,
      projection: "projected",
    });
    if (!prev.entries.length) break;
    chunks.push(prev.entries as TimelineRow[]);
    cursor = prev.startCursor;
    hasOlder = prev.hasOlder;
    pages += 1;
  }

  const seen = new Set<number>();
  const entries: MessageRow[] = [];
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const chunk = chunks[i];
    for (const row of chunk) {
      const { item } = row;
      if (item.type !== "user_message" && item.type !== "assistant_message") continue;
      const text = item.text.trim();
      if (!text) continue;
      if (seen.has(row.seqStart)) continue;
      seen.add(row.seqStart);
      entries.push({
        role: item.type === "user_message" ? "user" : "assistant",
        text,
        timestamp: row.timestamp,
        seqStart: row.seqStart,
      });
    }
  }
  entries.sort((a, b) => a.seqStart - b.seqStart);

  const turns: Array<{ timestamp: string; user: string; assistant: string[] }> = [];
  for (const entry of entries) {
    if (entry.role === "user") {
      turns.push({ timestamp: entry.timestamp, user: entry.text, assistant: [] });
    } else {
      const current = turns[turns.length - 1];
      if (current) current.assistant.push(entry.text);
      else turns.push({ timestamp: entry.timestamp, user: "(Initial)", assistant: [entry.text] });
    }
  }

  const title = first.agent?.title?.trim() || "Conversation Export";
  const modelLine = [first.agent?.provider, first.agent?.model].filter(Boolean).join(" / ");
  const lines: string[] = [
    `# ${title}`,
    "",
    ...(modelLine ? [`- **Model**: ${modelLine}`] : []),
    `- **Turns**: ${turns.length}`,
    "",
  ];

  turns.forEach((turn, idx) => {
    lines.push(`## Turn ${idx + 1} (${formatTimestamp(turn.timestamp)})`, "");
    lines.push("### User", "", turn.user, "");
    const reply = turn.assistant.join("\n\n").trim();
    if (reply) {
      lines.push("### Assistant", "", reply, "");
    }
  });

  return {
    turnCount: turns.length,
    markdown: lines.join("\n").trimEnd(),
  };
}
