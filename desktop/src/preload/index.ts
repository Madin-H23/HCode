import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { BridgeStatus, EventEnvelope, WorkspacePickResult } from "../main/bridge";

/**
 * typed 桥（SPEC IPC 契约的 preload 面）。类型直接取自主进程桥定义，编译期同源。
 * T3 新增 workspace/pick、workspace/recent、workspace/open、session/new 与 hcode:workspace 推送。
 */

const api = {
  version: "0.3.0-desktop",
  prompt: (text: string): Promise<void> => ipcRenderer.invoke("hcode/prompt", text),
  abort: (): Promise<void> => ipcRenderer.invoke("hcode/abort"),
  status: (): Promise<BridgeStatus | null> => ipcRenderer.invoke("hcode/status"),
  pickWorkspace: (): Promise<WorkspacePickResult> => ipcRenderer.invoke("hcode/workspace/pick"),
  openWorkspace: (workspace: string): Promise<WorkspacePickResult> =>
    ipcRenderer.invoke("hcode/workspace/open", workspace),
  recentWorkspaces: (): Promise<{ recents: string[] }> =>
    ipcRenderer.invoke("hcode/workspace/recent"),
  newSession: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("hcode/session/new"),
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
  onWorkspace: (cb: (payload: { projectRoot: string }) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: { projectRoot: string }): void => cb(payload);
    ipcRenderer.on("hcode:workspace", listener);
    return () => ipcRenderer.removeListener("hcode:workspace", listener);
  },
} as const;

contextBridge.exposeInMainWorld("hcode", api);

export type HcodeApi = typeof api;
