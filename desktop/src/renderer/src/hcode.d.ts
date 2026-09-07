export type { BridgeStatus, WorkspacePickResult } from "../../main/bridge";
export type { EventEnvelope as AgentEventEnvelope } from "../../main/bridge";
export type { PermissionRequestPayload, ModelInfo, McpServerInfo, SubAgentSummary } from "../../main/bridge";
export type { PromptOutcome } from "../../../src/permissions/manager";
export type { SessionSummary } from "../../../src/session/types";
import type { BridgeStatus, EventEnvelope, PermissionRequestPayload, ModelInfo, McpServerInfo, SubAgentSummary } from "../../main/bridge";
import type { PromptOutcome } from "../../../src/permissions/manager";
import type { SessionSummary } from "../../../src/session/types";

export type { SearchHit } from "../../main/session-index";
import type { SearchHit } from "../../main/session-index";

export interface HcodeApi {
  version: string;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  status(): Promise<BridgeStatus | null>;
  pickWorkspace(): Promise<WorkspacePickResult>;
  openWorkspace(workspace: string): Promise<WorkspacePickResult>;
  recentWorkspaces(): Promise<{ recents: string[] }>;
  newSession(): Promise<{ ok: boolean }>;
  listSessions(): Promise<{ sessions: SessionSummary[]; currentSessionId: string | null }>;
  searchSessions(query: string): Promise<{ results: SearchHit[] }>;
  renameSession(id: string, title: string): Promise<{ ok: boolean }>;
  deleteSession(id: string): Promise<{ ok: boolean }>;
  attachSession(id: string): Promise<{
    ok: boolean;
    projectRoot: string;
    history: Array<{ role: 'user' | 'assistant'; text: string }>;
  }>;
  respondPermission(id: number, outcome: PromptOutcome): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  setModel(provider: string, id: string): Promise<{ ok: boolean }>;
  listMcp(): Promise<McpServerInfo[]>;
  listAgents(): Promise<{ running: number; max: number; workers: SubAgentSummary[] }>;
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
