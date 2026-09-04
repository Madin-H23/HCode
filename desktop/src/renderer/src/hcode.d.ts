export type { BridgeStatus } from "../../main/bridge";
export type { EventEnvelope as AgentEventEnvelope } from "../../main/bridge";
import type { BridgeStatus, EventEnvelope } from "../../main/bridge";

export interface HcodeApi {
  version: string;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  status(): Promise<BridgeStatus | null>;
  pickWorkspace(): Promise<{ ok: boolean; projectRoot?: string; recents: string[] }>;
  openWorkspace(workspace: string): Promise<{ ok: boolean; projectRoot?: string; recents: string[] }>;
  recentWorkspaces(): Promise<{ recents: string[] }>;
  newSession(): Promise<{ ok: boolean }>;
  onAgentEvent(cb: (payload: EventEnvelope) => void): () => void;
  onStatus(cb: (payload: BridgeStatus) => void): () => void;
  onWorkspace(cb: (payload: { projectRoot: string }) => void): () => void;
}

declare global {
  interface Window {
    hcode: HcodeApi;
  }
}

export {};
