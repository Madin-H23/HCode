export type { BridgeStatus } from "../../main/bridge";
export type { EventEnvelope as AgentEventEnvelope } from "../../main/bridge";
import type { BridgeStatus, EventEnvelope } from "../../main/bridge";

export interface HcodeApi {
  version: string;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  status(): Promise<BridgeStatus | null>;
  onAgentEvent(cb: (payload: EventEnvelope) => void): () => void;
  onStatus(cb: (payload: BridgeStatus) => void): () => void;
}

declare global {
  interface Window {
    hcode: HcodeApi;
  }
}

export {};
