import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { buildHarnessFromCli } from "../../../src/cli/commands.js";
import type { Harness } from "../../../src/bootstrap.js";

/**
 * 主进程桥——桌面端唯一 seam（SPEC #1 Testing Decisions）。
 * 刻意不 import 任何 Electron 模块：事件去哪儿（sink）由调用方注入，
 * vitest 直接驱动真 Harness + mock 模型，Electron 装配层只做 IPC 转发。
 */

export interface EventEnvelope {
  seq: number;
  event: AgentEvent;
}

export interface BridgeStatus {
  busy: boolean;
  model: string;
  sessionId?: string;
  projectRoot: string;
  permissionMode: string;
}

export interface BridgeSink {
  onEvent(envelope: EventEnvelope): void;
  onStatus(status: BridgeStatus): void;
}

export interface HarnessBridge {
  prompt(text: string): Promise<void>;
  abort(): void;
  status(): BridgeStatus;
  /** 当前是否 mock 模型装配（调试脚本注入口的判据）。 */
  readonly isMock: boolean;
  /** mock 模式下注入一条脚本回复；非 mock 模型时抛错（绝不静默失效）。 */
  armMockScript(text: string): void;
  /** 释放 Harness（MCP/子代理等后台资源）。切换会话时必须先调用。 */
  dispose(): Promise<void>;
  /** 仅供测试/装配层访问底层 Harness（如 setPrompt、session 装配）。 */
  readonly harness: Harness;
}

export interface DesktopHarnessOptions {
  projectRoot: string;
  /** 直接指定 provider/model；缺省走 TINYCODE_MODEL 环境变量与工作区 config 选择链。 */
  modelFlag?: string;
  mock?: boolean;
  session?: { mode: "new" } | { mode: "attach"; id: string };
}

export interface WorkspacePickResult {
  ok: boolean;
  projectRoot?: string;
  recents: string[];
}

function modelLabel(harness: Harness): string {
  const model = harness.model as { provider?: string; model?: string } | undefined;
  if (model?.model) return model.provider ? `${model.provider}/${model.model}` : String(model.model);
  return "unknown";
}

export async function createHarnessBridge(
  options: DesktopHarnessOptions,
  sink: BridgeSink,
): Promise<HarnessBridge> {
  const harness = await buildHarnessFromCli({
    cwd: options.projectRoot,
    modelFlag: options.modelFlag,
    permissionMode: "ask",
    mock: options.mock ?? false,
    session: options.session,
  });

  let seq = 0;
  let busy = false;

  const currentStatus = (): BridgeStatus => ({
    busy,
    model: modelLabel(harness),
    sessionId: harness.session?.id,
    projectRoot: harness.projectRoot,
    permissionMode: harness.permissions.mode,
  });

  const emitStatus = (): void => {
    sink.onStatus(currentStatus());
  };

  // T5 将在此 Harness 上补装 permissions.setPrompt（ask 无回调=deny 的上游安全默认保持不变）。
  harness.runtime.agent.subscribe(async (event: AgentEvent) => {
    sink.onEvent({ seq: ++seq, event });
  });

  return {
    harness,

    get isMock(): boolean {
      return harness.models.mockHandle != null;
    },

    async prompt(text: string): Promise<void> {
      if (busy) throw new Error("Agent 正忙：请先停止当前任务");
      busy = true;
      emitStatus();
      try {
        await harness.runtime.prompt(text);
      } finally {
        busy = false;
        emitStatus();
      }
    },

    abort(): void {
      harness.runtime.abort();
    },

    status: currentStatus,

    armMockScript(text: string): void {
      const handle = harness.models.mockHandle;
      if (!handle) throw new Error("当前不是 mock 模型，无法注入调试脚本");
      handle.setResponses([fauxAssistantMessage(text)]);
    },

    dispose(): Promise<void> {
      return harness.shutdown();
    },
  };
}
