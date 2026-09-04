import { useEffect, useRef, useState } from "react"
import type { AgentEventEnvelope, BridgeStatus, PermissionRequestPayload, PromptOutcome, SessionSummary } from "./hcode.d"
import { initialChatState, reduceChatEvent, type ChatItem, type ChatState } from "./chat"

const styles = {
  app: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100vh",
    color: "#e6e6ea",
    backgroundColor: "#1b1b1f",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    borderBottom: "1px solid #2c2c34",
    flexWrap: "wrap" as const,
  },
  brand: { fontSize: 20, margin: 0, letterSpacing: 2 },
  workspace: { color: "#9a9aa4", fontSize: 12, margin: 0, wordBreak: "break-all" as const },
  status: { marginLeft: "auto", color: "#9a9aa4", fontSize: 12, margin: 0 },
  toolbar: { display: "flex", gap: 8, padding: "8px 16px", alignItems: "center", flexWrap: "wrap" as const },
  button: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #3a3a44",
    backgroundColor: "#26262e",
    color: "#e6e6ea",
    cursor: "pointer",
    fontSize: 13,
  },
  chip: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #3a3a44",
    backgroundColor: "transparent",
    color: "#b9b9c3",
    cursor: "pointer",
    fontSize: 11,
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  bubble: {
    maxWidth: "78%",
    padding: "8px 12px",
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  user: { alignSelf: "flex-end", backgroundColor: "#2f4a6e" },
  assistant: { alignSelf: "flex-start", backgroundColor: "#26262e" },
  placeholder: { alignSelf: "center", color: "#6d6d78", fontSize: 13 },
  toolCard: {
    alignSelf: "flex-start",
    maxWidth: "78%",
    border: "1px solid #33333d",
    borderRadius: 8,
    backgroundColor: "#202027",
    padding: "6px 10px",
    fontSize: 12,
    color: "#b9b9c3",
  },
  toolHeader: { display: "flex", gap: 8, alignItems: "baseline" },
  toolName: { color: "#e6e6ea", fontWeight: 600 },
  ok: { color: "#7ee787" },
  error: { color: "#ff7b72" },
  running: { color: "#d2a8ff" },
  stopped: { color: "#d29922" },
  toolDetail: { marginTop: 4, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  inputRow: { display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #2c2c34" },
  textarea: {
    flex: 1,
    resize: "none" as const,
    height: 64,
    borderRadius: 8,
    border: "1px solid #3a3a44",
    backgroundColor: "#111114",
    color: "#e6e6ea",
    padding: 10,
    fontSize: 14,
  },
  errorLine: { color: "#ff7b72", fontSize: 12, padding: "0 16px 8px", margin: 0 },
  overlay: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
  },
  dialog: {
    width: "min(520px, 92vw)",
    backgroundColor: "#232329",
    border: "1px solid #3a3a44",
    borderRadius: 12,
    padding: 20,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  dialogTitle: { margin: 0, fontSize: 16 },
  dialogTool: { color: "#e6e6ea", fontWeight: 600 },
  dialogBody: {
    margin: 0,
    fontSize: 13,
    color: "#b9b9c3",
    whiteSpace: "pre-wrap" as const,
    maxHeight: 200,
    overflowY: "auto" as const,
    backgroundColor: "#111114",
    borderRadius: 6,
    padding: 8,
  },
  dialogReason: { margin: 0, fontSize: 12, color: "#d29922" },
  dialogRow: { display: "flex", gap: 8, justifyContent: "flex-end" },
  permHint: { fontSize: 11, color: "#6d6d78", margin: 0 },
}

type CardState = "running" | "ok" | "error" | "stopped"

const stateStyle = (state: CardState): (typeof styles)["ok" | "error" | "running" | "stopped"] =>
  state === "ok" ? styles.ok : state === "error" ? styles.error : state === "stopped" ? styles.stopped : styles.running

const stateLabel = (state: CardState, durationMs?: number): string => {
  const suffix = durationMs != null ? ` · ${(durationMs / 1000).toFixed(1)}s` : ""
  switch (state) {
    case "ok":
      return `✓ 完成${suffix}`
    case "error":
      return `✗ 出错${suffix}`
    case "stopped":
      return "■ 已停止"
    default:
      return "● 运行中"
  }
}

export default function App() {
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [recents, setRecents] = useState<string[]>([])
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<PermissionRequestPayload[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const chatRef = useRef<ChatState>(initialChatState)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offEvent = window.hcode.onAgentEvent((payload: AgentEventEnvelope) => {
      chatRef.current = reduceChatEvent(chatRef.current, payload.event)
      setItems(chatRef.current.items)
    })
    const offStatus = window.hcode.onStatus(setStatus)
    const offWorkspace = window.hcode.onWorkspace((p) => {
      setWorkspace(p.projectRoot)
      chatRef.current = initialChatState
      setItems([])
      setPermissions([])
    })
    const offPermission = window.hcode.onPermission((request) =>
      setPermissions((prev) => [...prev, request]),
    )
    void window.hcode.status().then((s) => s && setWorkspace(s.projectRoot))
    void window.hcode.recentWorkspaces().then((r) => setRecents(r.recents))
    void loadSessions()
    return () => {
      offEvent()
      offStatus()
      offWorkspace()
      offPermission()
    }
  }, [])

  const loadSessions = (): void => {
    void window.hcode
      .listSessions()
      .then((r) => {
        setSessions(r.sessions)
        setCurrentSessionId(r.currentSessionId)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const respond = (request: PermissionRequestPayload, outcome: PromptOutcome): void => {
    setPermissions((prev) => prev.filter((p) => p.id !== request.id))
    void window.hcode.respondPermission(request.id, outcome).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }

  // 关闭对话框 = 拒绝：Escape 兜底走 deny（上游「ask 无应答=拒绝」的界面等价物）。
  useEffect(() => {
    if (permissions.length === 0) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        const first = permissions[0]
        if (first) respond(first, "deny")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [permissions])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
  }, [items])

  const send = (): void => {
    const text = input.trim()
    if (!text || !workspace) return
    setInput("")
    setError(null)
    void window.hcode.prompt(text).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }

  const openWorkspace = (): void => {
    setError(null)
    void window.hcode
      .pickWorkspace()
      .then((r) => {
        if (r.ok && r.projectRoot) setRecents(r.recents)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const openRecent = (ws: string): void => {
    setError(null)
    void window.hcode.openWorkspace(ws).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }

  const newSession = (): void => {
    setError(null)
    void window.hcode
      .newSession()
      .then(() => loadSessions())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const attachSession = (id: string): void => {
    if (!id) return
    setError(null)
    void window.hcode
      .attachSession(id)
      .then((r) => {
        setWorkspace(r.projectRoot)
        const historyItems: ChatItem[] = r.history.map((m, i) => ({
          kind: "message",
          id: i + 1,
          role: m.role,
          text: m.text,
          streaming: false,
        }))
        chatRef.current = { items: historyItems, nextId: historyItems.length + 1 }
        setItems(historyItems)
        loadSessions()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const busy = status?.busy ?? false

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.brand}>HCode</h1>
        <p style={styles.workspace} data-testid="workspace">
          {workspace ?? "未选择工作区 —— 打开文件夹开始"}
        </p>
        <p style={styles.status} data-testid="status">
          {status
            ? `${busy ? "busy" : "idle"} · ${status.model} · 权限 ${status.permissionMode} · ${
                currentSessionId ? `会话 ${currentSessionId.slice(0, 8)}` : "无会话"
              }`
            : "未装配"}
        </p>
      </header>

      <div style={styles.toolbar}>
        <button style={styles.button} data-testid="open-workspace" onClick={openWorkspace}>
          打开工作区
        </button>
        <button
          style={styles.button}
          data-testid="new-session"
          disabled={!workspace || busy}
          onClick={newSession}
        >
          新会话
        </button>
        <select
          style={{ ...styles.button, maxWidth: 300 }}
          data-testid="session-select"
          disabled={busy}
          value=""
          onChange={(e) => attachSession(e.target.value)}
        >
          <option value="">恢复会话…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.title ?? "(无标题)"} · ${new Date(s.modifiedAt).toLocaleString()} · ${s.cwd}`}
            </option>
          ))}
        </select>
        <button style={styles.button} data-testid="sessions-refresh" disabled={busy} onClick={loadSessions}>
          刷新
        </button>
        {recents.map((ws) => (
          <button
            key={ws}
            style={styles.chip}
            data-testid="recent"
            title={ws}
            disabled={busy}
            onClick={() => openRecent(ws)}
          >
            {ws}
          </button>
        ))}
      </div>

      <div style={styles.messages} data-testid="messages" ref={messagesRef}>
        {items.length === 0 && (
          <p style={styles.placeholder}>
            {workspace ? "向 Agent 描述你的任务…" : "选择工作区后，Agent 在该项目内工作。"}
          </p>
        )}
        {items.map((item) =>
          item.kind === "message" ? (
            <div
              key={item.id}
              data-testid={`msg-${item.role}`}
              data-streaming={item.streaming ? "true" : "false"}
              style={{ ...styles.bubble, ...(item.role === "user" ? styles.user : styles.assistant) }}
            >
              {item.text || (item.streaming ? "▍" : "")}
              {item.streaming && item.text ? " ▍" : ""}
            </div>
          ) : (
            <div key={item.id} style={styles.toolCard} data-testid="tool-card" data-state={item.state}>
              <div style={styles.toolHeader}>
                <span style={styles.toolName}>{item.name}</span>
                <span style={{ color: "#6d6d78" }}>{item.argsSummary}</span>
                <span style={stateStyle(item.state)}>{stateLabel(item.state, item.durationMs)}</span>
              </div>
              {item.detail && <div style={styles.toolDetail}>{item.detail}</div>}
            </div>
          ),
        )}
      </div>

      {error && (
        <p style={styles.errorLine} data-testid="error">
          {error}
        </p>
      )}

      {permissions.length > 0 && (
        <div style={styles.overlay} data-testid="perm-dialog">
          <div style={styles.dialog}>
            <p style={styles.dialogTitle}>权限确认 · {permissions.length > 1 ? `（${permissions.length} 项待确认）` : ""}</p>
            <p style={styles.dialogTool}>{permissions[0]!.toolName}</p>
            <p style={styles.dialogTool}>{permissions[0]!.title}</p>
            {permissions[0]!.detail && <pre style={styles.dialogBody}>{permissions[0]!.detail}</pre>}
            <p style={styles.dialogReason}>{permissions[0]!.reason}</p>
            <div style={styles.dialogRow}>
              <button
                style={styles.button}
                data-testid="perm-deny"
                onClick={() => respond(permissions[0]!, "deny")}
              >
                拒绝
              </button>
              <button
                style={styles.button}
                data-testid="perm-always"
                onClick={() => respond(permissions[0]!, "always")}
              >
                总是允许
              </button>
              <button
                style={styles.button}
                data-testid="perm-once"
                onClick={() => respond(permissions[0]!, "once")}
              >
                允许一次
              </button>
            </div>
            <p style={styles.permHint}>Esc 关闭视为拒绝 · 「总是允许」按工具+命令族记忆（仅本会话）</p>
          </div>
        </div>
      )}

      <div style={styles.inputRow}>
        <textarea
          style={styles.textarea}
          data-testid="input"
          placeholder={workspace ? "输入任务，Enter 发送" : "先打开工作区"}
          value={input}
          disabled={!workspace || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          style={styles.button}
          data-testid="send"
          disabled={!workspace || busy || input.trim().length === 0}
          onClick={send}
        >
          发送
        </button>
        <button
          style={styles.button}
          data-testid="stop"
          disabled={!busy}
          onClick={() => void window.hcode.abort().catch(() => {})}
        >
          停止
        </button>
      </div>
    </div>
  )
}
