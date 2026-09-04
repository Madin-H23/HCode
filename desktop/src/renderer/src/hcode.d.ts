export interface BridgeStatus {
  busy: boolean;
  model: string;
  sessionId?: string;
  projectRoot: string;
  permissionMode: string;
}

export interface AgentEventEnvelope {
  seq: number;
  event: { type: string } & Record<string, unknown>;
}

export interface HcodeApi {
  version: string;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  status(): Promise<BridgeStatus | null>;
  onAgentEvent(cb: (payload: AgentEventEnvelope) => void): () => void;
  onStatus(cb: (payload: BridgeStatus) => void): () => void;
}

declare global {
  interface Window {
    hcode: HcodeApi;
  }
}

export {};
