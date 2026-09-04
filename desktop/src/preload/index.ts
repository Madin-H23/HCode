import { contextBridge, ipcRenderer } from "electron";

/**
 * typed 桥（SPEC IPC 契约的 preload 面）。T2 暴露 prompt/abort/status + 两条事件通道；
 * workspace/session/permission 的 invoke 通道随 T3/T5/T6 扩充。
 */
const api = {
  version: "0.2.0-desktop",
  prompt: (text: string): Promise<void> => ipcRenderer.invoke("hcode/prompt", text),
  abort: (): Promise<void> => ipcRenderer.invoke("hcode/abort"),
  status: (): Promise<unknown> => ipcRenderer.invoke("hcode/status"),
  onAgentEvent: (cb: (payload: unknown) => void): (() => void) => {
    const listener = (_e: unknown, payload: unknown): void => cb(payload);
    ipcRenderer.on("hcode:agent-event", listener as never);
    return () => ipcRenderer.removeListener("hcode:agent-event", listener as never);
  },
  onStatus: (cb: (payload: unknown) => void): (() => void) => {
    const listener = (_e: unknown, payload: unknown): void => cb(payload);
    ipcRenderer.on("hcode:status", listener as never);
    return () => ipcRenderer.removeListener("hcode:status", listener as never);
  },
} as const;

contextBridge.exposeInMainWorld("hcode", api);

export type HcodeApi = typeof api;
