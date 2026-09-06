import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { createHarnessBridge } from "../src/main/bridge";
import type { BridgeStatus, EventEnvelope, PermissionRequestPayload } from "../src/main/bridge";

/**
 * 桥测第一例（SPEC Testing Decisions seam #1）：
 * 真 Harness + mock 模型驱动真实循环，桥只做事件转发与 busy 翻转。
 */

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), "hcode-bridge-"));
  process.env.TINYCODE_HOME = path.join(workdir, ".tinycode-home");
});

const cleanups: Array<Promise<void>> = [];
afterAll(async () => {
  await Promise.all(cleanups);
});

describe("HarnessBridge（主进程桥）", () => {
  it("prompt 驱动真循环：事件 seq 单调、agent_start 开场 agent_end 收尾、busy 翻转", async () => {
    const events: EventEnvelope[] = [];
    const statuses: BridgeStatus[] = [];
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s) },
    );
    const { harness } = bridge;
    cleanups.push(harness.shutdown());

    harness.models.mockHandle!.setResponses([fauxAssistantMessage("HCode 桥路测试：收到")]);
    await bridge.prompt("你好");

    const types = events.map((e) => e.event.type);
    expect(types[0]).toBe("agent_start");
    expect(types.at(-1)).toBe("agent_end");
    expect(types).toContain("message_end");

    const seqs = events.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);

    expect(statuses.some((s) => s.busy)).toBe(true);
    expect(statuses.at(-1)!.busy).toBe(false);
    expect(bridge.status().sessionId).toBeUndefined();
  }, 30000);

  it("status 暴露模型/权限/工作区且无事件时不误报 busy", async () => {
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: () => {}, onStatus: () => {} },
    );
    cleanups.push(bridge.harness.shutdown());

    const status = bridge.status();
    expect(status.busy).toBe(false);
    expect(status.permissionMode).toBe("ask");
    expect(status.projectRoot).toBe(workdir);
    expect(status.model).not.toBe("");
    expect(typeof status.tokens).toBe("number");
    expect(status.tokens).toBeGreaterThanOrEqual(0);
    expect(status.contextWindow).toBeGreaterThan(0);
  }, 30000);

  it("prompt 后 status.tokens 增长（上下文估算联动）", async () => {
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: () => {}, onStatus: () => {} },
    );
    const { harness } = bridge;
    cleanups.push(harness.shutdown());

    const before = bridge.status().tokens;
    bridge.armMockScript("这是一条足够长的回复内容用来推高上下文估算。");
    await bridge.prompt("请回复一段较长的话");
    const after = bridge.status().tokens;
    expect(after).toBeGreaterThan(before);
  }, 30000);

  it("abort 经桥可达：idle 安全调用；生成中调用循环照常收尾且 busy 归零", async () => {
    const events: EventEnvelope[] = [];
    const statuses: BridgeStatus[] = [];
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s) },
    );
    const { harness } = bridge;
    cleanups.push(harness.shutdown());

    expect(() => bridge.abort()).not.toThrow();

    harness.models.mockHandle!.setResponses([fauxAssistantMessage("会被尝试打断的一条")]);
    const run = bridge.prompt("打断我");
    bridge.abort();
    await expect(run).resolves.toBeUndefined();

    const types = events.map((e) => e.event.type);
    expect(types).toContain("agent_end");
    expect(statuses.at(-1)!.busy).toBe(false);
  }, 30000);

  it("权限 round-trip：ASK 推给 sink，once 应答放行写盘", async () => {
    const perms: PermissionRequestPayload[] = [];
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: () => {}, onStatus: () => {}, onPermission: (p) => perms.push(p) },
    );
    const { harness } = bridge;
    cleanups.push(harness.shutdown());

    harness.models.mockHandle!.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "once.txt", content: "ok" })]),
      fauxAssistantMessage("写入完成"),
    ]);
    const run = bridge.prompt("写文件");
    await vi.waitFor(() => expect(perms.length).toBe(1));
    expect(perms[0]!.toolName).toBe("write");

    bridge.respondPermission(perms[0]!.id, "once");
    await run;
    expect(fs.existsSync(path.join(workdir, "once.txt"))).toBe(true);
  }, 30000);

  it("deny：拒绝后工具结果为错误（模型收到拒绝理由）", async () => {
    const perms: PermissionRequestPayload[] = [];
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: () => {}, onStatus: () => {}, onPermission: (p) => perms.push(p) },
    );
    const { harness } = bridge;
    cleanups.push(harness.shutdown());

    harness.models.mockHandle!.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "denied.txt", content: "no" })]),
      fauxAssistantMessage("被拒绝了"),
    ]);
    const run = bridge.prompt("写文件");
    await vi.waitFor(() => expect(perms.length).toBe(1));
    bridge.respondPermission(perms[0]!.id, "deny");
    await run;

    // 被拒调用不产生 tool_execution_end 事件：错误直接以 toolResult 落入转录。
    const results = harness.runtime.agent.state.messages.filter(
      (m) => (m as { role?: string }).role === "toolResult",
    ) as Array<{ isError?: boolean; content?: unknown }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.isError).toBe(true);
    expect(JSON.stringify(results[0]!.content)).toMatch(/denied by user/);
    expect(fs.existsSync(path.join(workdir, "denied.txt"))).toBe(false);
  }, 30000);

  it("abort 收口：挂起权限全量 deny、pending 表清空、prompt 正常结束", async () => {
    const perms: PermissionRequestPayload[] = [];
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: () => {}, onStatus: () => {}, onPermission: (p) => perms.push(p) },
    );
    const { harness } = bridge;
    cleanups.push(harness.shutdown());

    harness.models.mockHandle!.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "abort.txt", content: "x" })]),
      fauxAssistantMessage("done"),
    ]);
    const run = bridge.prompt("写");
    await vi.waitFor(() => expect(perms.length).toBe(1));

    bridge.abort();
    await expect(run).resolves.toBeUndefined();

    // 挂起表已清：再次应答同一 id 必须抛错
    expect(() => bridge.respondPermission(perms[0]!.id, "once")).toThrow(/无此权限/);

    // 工具未落盘，结果为错误（denied 或被上游 aborted 检查顶掉）
    const results = harness.runtime.agent.state.messages.filter(
      (m) => (m as { role?: string }).role === "toolResult",
    ) as Array<{ isError?: boolean; content?: unknown }>;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.isError).toBe(true);
    expect(fs.existsSync(path.join(workdir, "abort.txt"))).toBe(false);
  }, 30000);

  it("attach：新桥恢复历史转录（桌面端会话面依赖）", async () => {
    const first = await createHarnessBridge(
      { projectRoot: workdir, mock: true, session: { mode: "new" } },
      { onEvent: () => {}, onStatus: () => {} },
    );
    first.armMockScript("第一轮");
    await first.prompt("第一轮对话");
    const sessionId = first.status().sessionId!;
    expect(sessionId).toBeTruthy();
    await first.dispose();

    const second = await createHarnessBridge(
      { projectRoot: workdir, mock: true, session: { mode: "attach", id: sessionId } },
      { onEvent: () => {}, onStatus: () => {} },
    );
    cleanups.push(second.harness.shutdown());
    const messages = second.harness.runtime.agent.state.messages;
    expect(messages.length).toBeGreaterThan(0);
    const userTexts = messages.filter((m) => m.role === "user").map((m) => JSON.stringify(m.content));
    expect(userTexts.some((t) => t.includes("第一轮对话"))).toBe(true);
  }, 30000);

  it("always：同族请求第二次不再弹对话框", async () => {
    const perms: PermissionRequestPayload[] = [];
    const bridge = await createHarnessBridge(
      { projectRoot: workdir, mock: true },
      { onEvent: () => {}, onStatus: () => {}, onPermission: (p) => perms.push(p) },
    );
    const { harness } = bridge;
    cleanups.push(harness.shutdown());

    const script = (): void => {
      harness.models.mockHandle!.setResponses([
        fauxAssistantMessage([fauxToolCall("write", { path: "always.txt", content: "x" })]),
        fauxAssistantMessage("done"),
      ]);
    };
    script();
    const first = bridge.prompt("写");
    await vi.waitFor(() => expect(perms.length).toBe(1));
    bridge.respondPermission(perms[0]!.id, "always");
    await first;

    script();
    await bridge.prompt("再写");
    expect(perms.length).toBe(1);
  }, 30000);
});
