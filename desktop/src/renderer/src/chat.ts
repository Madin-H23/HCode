import type { AgentEvent } from "@earendil-works/pi-agent-core";

/**
 * 聊天流 reducer——纯函数，脱离渲染可测（desktop/tests/chat.test.ts）。
 * 事件语义对齐 TUI（src/tui/app.ts）：start/update/end 全量文本、toolCallId 配对、
 * agent_end 收口未完成卡片。
 */

export interface ChatMessage {
  kind: "message";
  id: number;
  role: "user" | "assistant";
  text: string;
  streaming: boolean;
}

export interface ToolCard {
  kind: "tool";
  id: number;
  toolCallId: string;
  name: string;
  argsSummary: string;
  state: "running" | "ok" | "error" | "stopped";
  detail?: string;
  durationMs?: number;
  startedAt: number;
}

export type ChatItem = ChatMessage | ToolCard;

export interface ChatState {
  items: ChatItem[];
  nextId: number;
}

export const initialChatState: ChatState = { items: [], nextId: 1 };

/** pi 的 message.content：字符串或分块数组；只取 text 块。 */
export function textOf(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" && block !== null && (block as { type?: string }).type === "text",
      )
      .map((block) => block.text)
      .join("")
  }
  return ""
}

export function shorten(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** 7 个内置工具的参数摘要（bash/read/write/edit/grep/find/ls），未知工具优雅降级为 JSON。 */
export function summarizeToolArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "bash":
      return shorten(String(args.command ?? ""))
    case "read":
    case "ls":
      return String(args.path ?? "") + (args.offset != null ? ` (offset ${String(args.offset)})` : "")
    case "write":
      return `${String(args.path ?? "")}（${String(args.content ?? "").length} 字符）`
    case "edit":
      return `${String(args.path ?? "")}：${shorten(String(args.oldText ?? ""), 24)} → ${shorten(
        String(args.newText ?? ""),
        24,
      )}`
    case "grep":
      return [args.pattern, args.include].filter((x) => x != null).map(String).join(" · ")
    case "find":
      return String(args.pattern ?? "")
    default:
      return shorten(JSON.stringify(args))
  }
}

export function extractToolText(result: unknown): string {
  const content = (result as { content?: unknown } | undefined)?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" && block !== null && (block as { type?: string }).type === "text",
      )
      .map((block) => block.text)
      .join("")
  }
  return ""
}

function lastStreamingAssistantIndex(items: ChatItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.kind === "message" && item.role === "assistant" && item.streaming) return i
  }
  return -1
}

/** 单事件归约；now 仅用于计时注入（测试确定性）。 */
export function reduceChatEvent(state: ChatState, event: AgentEvent, now: number = Date.now()): ChatState {
  switch (event.type) {
    case "message_start": {
      const role = event.message.role
      const text = textOf(event.message)
      if (role !== "user" && role !== "assistant") return state
      return {
        nextId: state.nextId + 1,
        items: [
          ...state.items,
          { kind: "message", id: state.nextId, role, text, streaming: role === "assistant" },
        ],
      }
    }
    case "message_update": {
      const idx = lastStreamingAssistantIndex(state.items)
      if (idx === -1) return state
      const items = state.items.slice()
      items[idx] = { ...(items[idx] as ChatMessage), text: textOf(event.message) }
      return { ...state, items }
    }
    case "message_end": {
      if (event.message.role !== "assistant") return state
      const idx = lastStreamingAssistantIndex(state.items)
      if (idx === -1) return state
      const items = state.items.slice()
      items[idx] = {
        ...(items[idx] as ChatMessage),
        text: textOf(event.message),
        streaming: false,
      }
      return { ...state, items }
    }
    case "tool_execution_start": {
      return {
        ...state,
        nextId: state.nextId + 1,
        items: [
          ...state.items,
          {
            kind: "tool",
            id: state.nextId,
            toolCallId: event.toolCallId,
            name: event.toolName,
            argsSummary: summarizeToolArgs(event.toolName, event.args as Record<string, unknown>),
            state: "running",
            startedAt: now,
          },
        ],
      }
    }
    case "tool_execution_end": {
      const items = state.items.map((item) =>
        item.kind === "tool" && item.toolCallId === event.toolCallId && item.state === "running"
          ? {
              ...item,
              state: event.isError ? ("error" as const) : ("ok" as const),
              detail: shorten(extractToolText(event.result), 200) || undefined,
              durationMs: now - item.startedAt,
            }
          : item,
      )
      return { ...state, items }
    }
    case "agent_end": {
      const hasRunning = state.items.some((item) => item.kind === "tool" && item.state === "running")
      if (!hasRunning) return state
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === "tool" && item.state === "running"
            ? { ...item, state: "stopped" as const, durationMs: now - item.startedAt }
            : item,
        ),
      }
    }
    default:
      return state
  }
}
