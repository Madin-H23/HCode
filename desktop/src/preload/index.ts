import { contextBridge } from 'electron'

// T1 骨架占位：T2 起按 SPEC 的 IPC 契约扩充（prompt/abort/事件通道/权限应答）。
const api = {
  version: '0.1.0-desktop-skeleton'
} as const

contextBridge.exposeInMainWorld('hcode', api)

export type HcodeApi = typeof api
