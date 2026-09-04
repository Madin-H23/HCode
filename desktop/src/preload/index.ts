import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { BridgeStatus, EventEnvelope } from "../main/bridge";

/**
 * typed 桥（SPEC IPC 契约的 preload 面）。类型直接取自主进程桥定义，编译期同源。
 * T2 暴露 prompt/abort/status + 两条事件通道；workspace/session/permission 随 T3/T5/T6 扩充。
 */
const api = {
  version: "0.2.0-desktop",
  prompt: (text: string): Promise<void> => ipcRenderer.invoke("hcode/prompt", text),
  abort: (): Promise<void> => ipcRenderer.invoke("hcode/abort"),
  status: (): Promise<BridgeStatus | null> => ipcRenderer.invoke("hcode/status"),
  onAgentEvent: (cb: (payload: EventEnvelope) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: EventEnvelope): void => cb(payload);
    ipcRenderer.on("hcode:agent-event", listener);
    return () => ipcRenderer.removeListener("hcode:agent-event", listener);
  },
  onStatus: (cb: (payload: BridgeStatus) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: BridgeStatus): void => cb(payload);
    ipcRenderer.on("hcode:status", listener);
    return () => ipcRenderer.removeListener("hcode:status", listener);
  },
} as const;

contextBridge.exposeInMainWorld("hcode", api);

export type HcodeApi = typeof api;
