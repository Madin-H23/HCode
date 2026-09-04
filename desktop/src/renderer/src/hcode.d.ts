export type { BridgeStatus, WorkspacePickResult } from "../../main/bridge";
export type { EventEnvelope as AgentEventEnvelope } from "../../main/bridge";
export type { PermissionRequestPayload } from "../../main/bridge";
export type { PromptOutcome } from "../../../src/permissions/manager";
import type { BridgeStatus, EventEnvelope, PermissionRequestPayload } from "../../main/bridge";
import type { PromptOutcome } from "../../../src/permissions/manager";

export interface HcodeApi {
  version: string;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  status(): Promise<BridgeStatus | null>;
  pickWorkspace(): Promise<WorkspacePickResult>;
  openWorkspace(workspace: string): Promise<WorkspacePickResult>;
  recentWorkspaces(): Promise<{ recents: string[] }>;
  newSession(): Promise<{ ok: boolean }>;
  respondPermission(id: number, outcome: PromptOutcome): Promise<void>;
  onAgentEvent(cb: (payload: EventEnvelope) => void): () => void;
  onStatus(cb: (payload: BridgeStatus) => void): () => void;
  onWorkspace(cb: (payload: { projectRoot: string }) => void): () => void;
  onPermission(cb: (payload: PermissionRequestPayload) => void): () => void;
}

declare global {
  interface Window {
    hcode: HcodeApi;
  }
}

export {};
