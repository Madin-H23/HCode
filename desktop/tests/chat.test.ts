import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import {
  initialChatState,
  reduceChatEvent,
  summarizeToolArgs,
} from "../src/renderer/src/chat";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

const T0 = 1_000_000;

describe("summarizeToolArgs（7 内置工具参数摘要）", () => {
  it("覆盖 bash/read/write/edit/grep/find/ls 与未知工具降级", () => {
    expect(summarizeToolArgs("bash", { command: "npm\ntest" })).toBe("npm test");
    expect(summarizeToolArgs("read", { path: "src/a.ts", offset: 5 })).toBe("src/a.ts (offset 5)");
    expect(summarizeToolArgs("ls", { path: "." })).toBe(".");
    expect(summarizeToolArgs("write", { path: "n.txt", content: "12345" })).toBe("n.txt（5 字符）");
    expect(summarizeToolArgs("edit", { path: "a.js", oldText: "return a - b;", newText: "return a + b;" })).toBe(
      "a.js：return a - b; → return a + b;",
    );
    expect(summarizeToolArgs("grep", { pattern: "TODO", include: "*.ts" })).toBe("TODO · *.ts");
    expect(summarizeToolArgs("find", { pattern: "**/*.md" })).toBe("**/*.md");
    expect(summarizeToolArgs("mystery", { x: 1 })).toContain('"x":1');
  });

  it("超长输入截断", () => {
    expect(summarizeToolArgs("bash", { command: "x".repeat(100) })).toHaveLength(61);
  });
});

describe("reduceChatEvent（聊天流归约）", () => {
  it("user→assistant 全流程：start/update 定稿收口", () => {
    let s = initialChatState;
    s = reduceChatEvent(s, {
      type: "message_start",
      message: { role: "user", content: "你好" },
    } as unknown as AgentEvent);
    s = reduceChatEvent(s, {
      type: "message_start",
      message: fauxAssistantMessage(""),
    } as unknown as AgentEvent, T0);
    s = reduceChatEvent(s, {
      type: "message_update",
      message: fauxAssistantMessage("部分回"),
    } as unknown as AgentEvent, T0);
    s = reduceChatEvent(s, {
      type: "message_end",
      message: fauxAssistantMessage("部分回复完成"),
    } as unknown as AgentEvent, T0);

    expect(s.items).toHaveLength(2);
    const [user, assistant] = s.items as Extract<typeof s.items[number], { kind: "message" }>[];
    expect(user.role).toBe("user");
    expect(user.text).toBe("你好");
    expect(assistant.streaming).toBe(false);
    expect(assistant.text).toBe("部分回复完成");
  });

  it("工具卡片：start 插入、end 配对 ok/error、工具插入后 update 仍命中流式助手", () => {
    let s = initialChatState;
    s = reduceChatEvent(s, {
      type: "message_start",
      message: fauxAssistantMessage(""),
    } as unknown as AgentEvent, T0);
    s = reduceChatEvent(s, {
      type: "tool_execution_start",
      toolCallId: "tc1",
      toolName: "read",
      args: { path: "package.json" },
    } as unknown as AgentEvent, T0);
    // 工具卡片插入后，流式 update 仍应命中前面的助手气泡
    s = reduceChatEvent(s, {
      type: "message_update",
      message: fauxAssistantMessage("检查中"),
    } as unknown as AgentEvent, T0);
    s = reduceChatEvent(s, {
      type: "tool_execution_end",
      toolCallId: "tc1",
      isError: false,
      result: { content: [{ type: "text", text: '{"name":"fixture"}' }] },
    } as unknown as AgentEvent, T0 + 1500);

    const card = s.items.find((i) => i.kind === "tool") as Extract<
      typeof s.items[number],
      { kind: "tool" }
    >;
    expect(card.state).toBe("ok");
    expect(card.durationMs).toBe(1500);
    expect(card.detail).toBe('{"name":"fixture"}');
    const assistant = s.items[0] as Extract<typeof s.items[number], { kind: "message" }>;
    expect(assistant.text).toBe("检查中");

    // 错误路径
    s = reduceChatEvent(s, {
      type: "tool_execution_start",
      toolCallId: "tc2",
      toolName: "bash",
      args: { command: "rm -rf x" },
    } as unknown as AgentEvent, T0);
    s = reduceChatEvent(s, {
      type: "tool_execution_end",
      toolCallId: "tc2",
      isError: true,
      result: { content: [{ type: "text", text: "Permission denied" }] },
    } as unknown as AgentEvent, T0 + 10);
    const bad = s.items.at(-1) as Extract<typeof s.items[number], { kind: "tool" }>;
    expect(bad.state).toBe("error");
    expect(bad.detail).toContain("Permission denied");
  });

  it("agent_end 收口仍 running 的卡片为 stopped", () => {
    let s = initialChatState;
    s = reduceChatEvent(s, {
      type: "tool_execution_start",
      toolCallId: "tc1",
      toolName: "bash",
      args: { command: "sleep 100" },
    } as unknown as AgentEvent, T0);
    s = reduceChatEvent(s, { type: "agent_end" } as unknown as AgentEvent, T0 + 2000);
    const card = s.items[0] as Extract<typeof s.items[number], { kind: "tool" }>;
    expect(card.state).toBe("stopped");
    expect(card.durationMs).toBe(2000);
  });

  it("faux 工具脚本驱动（对齐 E2E 注入形状）", () => {
    const scripted = fauxAssistantMessage([fauxToolCall("read", { path: "package.json" })]);
    let s = initialChatState;
    s = reduceChatEvent(s, { type: "message_start", message: scripted } as unknown as AgentEvent, T0);
    s = reduceChatEvent(s, { type: "message_end", message: scripted } as unknown as AgentEvent, T0);
    const assistant = s.items[0] as Extract<typeof s.items[number], { kind: "message" }>;
    expect(assistant.role).toBe("assistant");
    expect(assistant.streaming).toBe(false);
  });
});
