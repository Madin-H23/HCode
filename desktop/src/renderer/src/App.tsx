import { useEffect, useRef, useState } from "react"
import type { AgentEventEnvelope, BridgeStatus } from "./hcode.d"

interface ChatMessage {
  id: number
  role: "user" | "assistant"
  text: string
  streaming: boolean
}

/** pi 的 message.content：字符串或分块数组；只取 text 块（TUI 同款语义）。 */
function textOf(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          (block as { type?: string }).type === "text",
      )
      .map((block) => block.text)
      .join("")
  }
  return ""
}

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
  error: { color: "#ff7b72", fontSize: 12, padding: "0 16px 8px", margin: 0 },
}

export default function App() {
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [recents, setRecents] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef(1)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offEvent = window.hcode.onAgentEvent((payload: AgentEventEnvelope) => {
      const event = payload.event as { type: string; message?: unknown }
      if (event.type === "message_start" && event.message) {
        const role = (event.message as { role?: string }).role
        const text = textOf(event.message)
        if (role === "user") {
          setMessages((prev) => [
            ...prev,
            { id: nextId.current++, role: "user", text, streaming: false },
          ])
        } else if (role === "assistant") {
          setMessages((prev) => [
            ...prev,
            { id: nextId.current++, role: "assistant", text, streaming: true },
          ])
        }
      } else if (event.type === "message_update" && event.message) {
        const text = textOf(event.message)
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 && m.role === "assistant" && m.streaming ? { ...m, text } : m,
          ),
        )
      } else if (event.type === "message_end" && event.message) {
        const role = (event.message as { role?: string }).role
        if (role === "assistant") {
          const text = textOf(event.message)
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1 && m.role === "assistant" ? { ...m, text, streaming: false } : m,
            ),
          )
        }
      }
    })
    const offStatus = window.hcode.onStatus(setStatus)
    const offWorkspace = window.hcode.onWorkspace((p) => {
      setWorkspace(p.projectRoot)
      setMessages([])
    })
    void window.hcode.status().then((s) => s && setWorkspace(s.projectRoot))
    void window.hcode.recentWorkspaces().then((r) => setRecents(r.recents))
    return () => {
      offEvent()
      offStatus()
      offWorkspace()
    }
  }, [])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
  }, [messages])

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
    void window.hcode.pickWorkspace().then((r) => {
      if (r.ok && r.projectRoot) setRecents(r.recents)
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const openRecent = (ws: string): void => {
    setError(null)
    void window.hcode.openWorkspace(ws).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }

  const newSession = (): void => {
    setError(null)
    void window.hcode.newSession().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
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
            ? `${busy ? "busy" : "idle"} · ${status.model} · 权限 ${status.permissionMode}`
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
        {messages.length === 0 && (
          <p style={styles.placeholder}>
            {workspace ? "向 Agent 描述你的任务…" : "选择工作区后，Agent 在该项目内工作。"}
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            data-testid={`msg-${m.role}`}
            data-streaming={m.streaming ? "true" : "false"}
            style={{ ...styles.bubble, ...(m.role === "user" ? styles.user : styles.assistant) }}
          >
            {m.text || (m.streaming ? "▍" : "")}
            {m.streaming && m.text ? " ▍" : ""}
          </div>
        ))}
      </div>

      {error && (
        <p style={styles.error} data-testid="error">
          {error}
        </p>
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
