import { useEffect, useState } from "react"
import type { AgentEventEnvelope, BridgeStatus } from "./hcode.d"

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
    padding: 32,
    color: "#e6e6ea",
    backgroundColor: "#1b1b1f",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
  },
  h1: { fontSize: 32, margin: 0, letterSpacing: 2 },
  status: { color: "#9a9aa4", margin: 0 },
  row: { display: "flex", gap: 12 },
  button: {
    padding: "8px 20px",
    borderRadius: 6,
    border: "1px solid #3a3a44",
    backgroundColor: "#26262e",
    color: "#e6e6ea",
    cursor: "pointer",
  },
  log: {
    width: "min(860px, 90vw)",
    maxHeight: 320,
    overflowY: "auto" as const,
    fontSize: 12,
    color: "#b9b9c3",
    backgroundColor: "#111114",
    borderRadius: 8,
    padding: 12,
    listStyle: "none" as const,
    margin: 0,
  },
  error: { color: "#ff7b72", margin: 0 },
}

export default function App() {
  const [rows, setRows] = useState<AgentEventEnvelope[]>([])
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const offEvent = window.hcode.onAgentEvent((payload) =>
      setRows((prev) => [...prev.slice(-199), payload]),
    )
    const offStatus = window.hcode.onStatus(setStatus)
    void window.hcode.status().then((s) => s && setStatus(s))
    return () => {
      offEvent()
      offStatus()
    }
  }, [])

  const send = (): void => {
    setError(null)
    void window.hcode.prompt("桥路测试").catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }

  const stop = (): void => {
    void window.hcode.abort().catch(() => {})
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>HCode</h1>
      <p style={styles.status} data-testid="status">
        {status
          ? `${status.busy ? "busy" : "idle"} · ${status.model} · 权限 ${status.permissionMode} · ${
              status.sessionId ? `会话 ${status.sessionId}` : "会话未持久化（T3 接入）"
            }`
          : "桥未就绪…"}
      </p>
      <div style={styles.row}>
        <button style={styles.button} data-testid="send" disabled={status?.busy} onClick={send}>
          发送测试消息
        </button>
        <button style={styles.button} data-testid="stop" disabled={!status?.busy} onClick={stop}>
          停止
        </button>
      </div>
      {error && (
        <p style={styles.error} data-testid="error">
          {error}
        </p>
      )}
      <ul style={styles.log} data-testid="event-log">
        {rows.map((r) => (
          <li key={r.seq}>{`#${r.seq} ${r.event.type}`}</li>
        ))}
      </ul>
    </main>
  )
}
