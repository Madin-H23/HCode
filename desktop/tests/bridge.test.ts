import { describe, expect, it, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createHarnessBridge } from "../src/main/bridge";
import type { BridgeStatus, EventEnvelope } from "../src/main/bridge";

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
});
