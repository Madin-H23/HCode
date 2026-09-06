import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, type AssistantMessage } from "@earendil-works/pi-ai";
import { buildHarnessFromCli } from "../../../src/cli/commands.js";
import type { Harness } from "../../../src/bootstrap.js";
import type { PromptOutcome, PermissionRequestView } from "../../../src/permissions/manager.js";

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
  /** 权限 ASK 推送；缺省时不装 setPrompt（上游无回调=deny 的安全默认）。 */
  onPermission?(request: PermissionRequestPayload): void;
}

export type PermissionRequestPayload = PermissionRequestView & { id: number };

export interface HarnessBridge {
  prompt(text: string): Promise<void>;
  abort(): void;
  status(): BridgeStatus;
  /** 应答一条权限 ASK；id 无效时抛错。 */
  respondPermission(id: number, outcome: PromptOutcome): void;
  /** 当前是否 mock 模型装配（调试脚本注入口的判据）。 */
  readonly isMock: boolean;
  /** mock 模式下注入一条脚本回复；非 mock 模型时抛错（绝不静默失效）。 */
  armMockScript(text: string): void;
  /** mock 模式下注入多段脚本（含 toolCall），驱动真实工具执行；非 mock 抛错。 */
  armMockMessages(messages: AssistantMessage[]): void;
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
  const model = harness.model as
    | { name?: string; id?: string; provider?: string; model?: string }
    | undefined;
  if (!model) return "unknown";
  return model.name ?? (model.model ? `${model.provider ?? ""}/${model.model}` : model.id) ?? "unknown";
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

  const armMock = (messages: AssistantMessage[]): void => {
    const handle = harness.models.mockHandle;
    if (!handle) throw new Error("当前不是 mock 模型，无法注入调试脚本");
    handle.setResponses(messages);
  };

  // 权限闸门上屏：ASK 经 sink 推给宿主面对话框；dispose 时未应答的一律 deny。
  const pendingPermissions = new Map<number, (outcome: PromptOutcome) => void>();
  let permissionSeq = 0;
  if (sink.onPermission) {
    const onPermission = sink.onPermission.bind(sink);
    harness.permissions.setPrompt(async (request) => {
      const id = ++permissionSeq;
      onPermission({ id, ...request });
      return new Promise<PromptOutcome>((resolve) => pendingPermissions.set(id, resolve));
    });
  }

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
      // 收口挂起权限（与 dispose 同语义）；上游在权限回调返回后与工具执行前各有
      // signal.aborted 检查，全量 deny 时序安全——对话框立即清空、无悬挂 Promise。
      for (const resolve of pendingPermissions.values()) resolve("deny");
      pendingPermissions.clear();
      harness.runtime.abort();
    },

    respondPermission(id: number, outcome: PromptOutcome): void {
      const resolve = pendingPermissions.get(id);
      if (!resolve) throw new Error(`无此权限请求：${id}`);
      pendingPermissions.delete(id);
      resolve(outcome);
    },

    status: currentStatus,

    armMockScript(text: string): void {
      armMock([fauxAssistantMessage(text)]);
    },

    armMockMessages(messages: AssistantMessage[]): void {
      armMock(messages);
    },

    dispose(): Promise<void> {
      for (const resolve of pendingPermissions.values()) resolve("deny");
      pendingPermissions.clear();
      return harness.shutdown();
    },
  };
}
