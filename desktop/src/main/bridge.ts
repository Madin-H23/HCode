import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { bootstrapHarness, type Harness } from "../../../src/bootstrap.js";

/**
 * 主进程桥——桌面端唯一 seam（SPEC #1 Testing Decisions）。
 * 刻意不 import 任何 Electron 模块：事件去哪儿（sink）由调用方注入，
 * vitest 直接驱动真 Harness + mock 模型，Electron 壳只做 IPC 转发。
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
  /** 仅供测试/装配层访问底层 Harness（如 mock 脚本注入、setPrompt）。 */
  readonly harness: Harness;
}

export interface DesktopHarnessOptions {
  projectRoot: string;
  mock?: boolean;
  session?: { mode: "new" } | { mode: "attach"; id: string };
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
  const harness = await bootstrapHarness({
    projectRoot: options.projectRoot,
    config: { permissionMode: "ask" },
    mock: options.mock ?? true,
    session: options.session,
  });

  let seq = 0;
  let busy = false;

  const emitStatus = (): void => {
    sink.onStatus({
      busy,
      model: modelLabel(harness),
      sessionId: harness.session?.id,
      projectRoot: harness.projectRoot,
      permissionMode: harness.config.permissionMode ?? "ask",
    });
  };

  // T5 将在此 Harness 上补装 permissions.setPrompt（ask 无回调=deny 的上游安全默认保持不变）。
  harness.runtime.agent.subscribe(async (event: AgentEvent) => {
    sink.onEvent({ seq: ++seq, event });
  });

  return {
    harness,
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
    status(): BridgeStatus {
      return {
        busy,
        model: modelLabel(harness),
        sessionId: harness.session?.id,
        projectRoot: harness.projectRoot,
        permissionMode: harness.config.permissionMode ?? "ask",
      };
    },
  };
}
