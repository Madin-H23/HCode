import { useEffect, useRef, useState } from "react"
import type { AgentEventEnvelope, BridgeStatus, ModelInfo, PermissionRequestPayload, PromptOutcome, McpServerInfo, SearchHit, SessionSummary } from "./hcode.d"
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
  placeholder: { alignSelf: "center", color: "#6d6d78", fontSize: 13, margin: "auto 0" },
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
  diffAdd: { color: "#7ee787" },
  diffDel: { color: "#ff7b72" },
  diffView: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 1.5,
    backgroundColor: "#111114",
    borderRadius: 6,
    padding: 8,
    maxHeight: 260,
    overflowY: "auto" as const,
    whiteSpace: "pre" as const,
    fontFamily: "Consolas, monospace",
    margin: "6px 0 0",
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#58a6ff",
    cursor: "pointer",
    fontSize: 11,
    padding: 0,
  },
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
  searchPanel: {
    padding: "8px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    borderBottom: "1px solid #2c2c34",
    maxHeight: 200,
    overflowY: "auto" as const,
  },
  searchHit: {
    display: "flex",
    gap: 10,
    alignItems: "baseline",
    background: "transparent",
    border: "1px solid #33333d",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#b9b9c3",
    cursor: "pointer",
    fontSize: 12,
    textAlign: "left" as const,
  },
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
  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(new Set())
  const [models, setModels] = useState<ModelInfo[]>([])
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const [mcpOpen, setMcpOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null)
  const chatRef = useRef<ChatState>(initialChatState)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offEvent = window.hcode.onAgentEvent((payload: AgentEventEnvelope) => {
      chatRef.current = reduceChatEvent(chatRef.current, payload.event)
      setItems(chatRef.current.items)
    })
    const offStatus = window.hcode.onStatus((s) => {
      setStatus(s)
      // 空闲化（正常完成或停止收口）时权限对话框必然不该存在——abort 已在主进程侧全量 deny。
      if (!s.busy) setPermissions([])
    })
    const offWorkspace = window.hcode.onWorkspace((p) => {
      setWorkspace(p.projectRoot)
      chatRef.current = initialChatState
      setItems([])
      setPermissions([])
      setExpandedDiffs(new Set())
    })
    const offPermission = window.hcode.onPermission((request) =>
      setPermissions((prev) => [...prev, request]),
    )
    void window.hcode.status().then((s) => s && setWorkspace(s.projectRoot))
    void window.hcode.recentWorkspaces().then((r) => setRecents(r.recents))
    void loadSessions()
    void loadModels()
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
      .then((r) => setSessions(r.sessions))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const toggleMcp = (): void => {
    if (!mcpOpen) {
      void window.hcode
        .listMcp()
        .then(setMcpServers)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    }
    setMcpOpen((v) => !v)
  }

  const loadModels = (): void => {
    void window.hcode
      .listModels()
      .then(setModels)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const switchModel = (modelId: string): void => {
    const [provider, id] = modelId.split("/")
    if (!provider || !id) return
    setError(null)
    void window.hcode
      .setModel(provider, id)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const toggleDiff = (id: number): void => {
    setExpandedDiffs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
        if (r.ok && r.projectRoot) {
          setRecents(r.recents)
          loadSessions()
        }
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
    setSearchResults(null)
    setSearchQuery("")
    void window.hcode
      .newSession()
      .then(() => loadSessions())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const runSearch = (): void => {
    const q = searchQuery.trim()
    if (!q) return
    setError(null)
    void window.hcode
      .searchSessions(q)
      .then((r) => setSearchResults(r.results))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const openSearchHit = (hit: SearchHit): void => {
    setSearchResults(null)
    setSearchQuery("")
    attachSession(hit.sessionId)
  }

  const attachSession = (id: string): void => {
    if (!id) return
    setError(null)
    setSearchResults(null)
    setSearchQuery("")
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
                status.sessionId ? `会话 ${status.sessionId.slice(0, 8)}` : "无会话"
              } · ctx ~${Math.round(status.tokens / 1000)}k${
                status.contextWindow ? `/${Math.round(status.contextWindow / 1000)}k` : ""
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
          style={{ ...styles.button, maxWidth: 220 }}
          data-testid="model-select"
          disabled={busy}
          value={status?.modelId ?? ""}
          onChange={(e) => switchModel(e.target.value)}
        >
          {models.length === 0 && <option value={status?.modelId ?? ""}>{status?.model ?? "模型"}</option>}
          {models.map((m) => (
            <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          style={{ ...styles.button, width: 200 }}
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
        <button style={styles.button} data-testid="mcp-toggle" onClick={toggleMcp}>
          MCP
        </button>
        <input
          style={{ ...styles.button, width: 160 }}
          data-testid="search-input"
          placeholder="搜索会话内容…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) runSearch()
          }}
        />
        <button style={styles.button} data-testid="search-run" disabled={!searchQuery.trim()} onClick={runSearch}>
          搜索
        </button>
        {recents.slice(0, 5).map((ws) => {
          const base = ws.split(/[\\/]/).filter(Boolean).pop() ?? ws
          return (
            <button
              key={ws}
              style={styles.chip}
              data-testid="recent"
              title={ws}
              disabled={busy}
              onClick={() => openRecent(ws)}
            >
              {base}
            </button>
          )
        })}
      </div>

      {mcpOpen && (
        <div style={styles.searchPanel} data-testid="mcp-panel">
          {mcpServers.length === 0 && <p style={styles.placeholder}>未配置 MCP 服务器</p>}
          {mcpServers.map((server) => (
            <div key={server.name} style={styles.searchHit} data-testid="mcp-server">
              <span style={styles.toolName}>{server.name}</span>
              <span style={{ color: server.status === "connected" ? "#7ee787" : "#ff7b72" }}>
                {server.status}
              </span>
              <span style={{ color: "#6d6d78" }}>{server.toolCount} 个工具</span>
              {server.error && <span style={styles.errorLine}>{server.error}</span>}
              {server.tools.length > 0 && (
                <span style={{ color: "#6d6d78" }}>工具: {server.tools.join(", ")}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {searchResults !== null && (
        <div style={styles.searchPanel} data-testid="search-results">
          {searchResults.length === 0 && <p style={styles.placeholder}>无匹配会话</p>}
          {searchResults.map((hit) => (
            <button
              key={`${hit.sessionId}-${hit.snippet}-${searchResults.indexOf(hit)}`}
              style={styles.searchHit}
              data-testid="search-hit"
              onClick={() => openSearchHit(hit)}
            >
              <span style={styles.toolName}>{hit.title ?? "（无标题会话）"}</span>
              <span style={{ color: "#6d6d78" }}>{hit.snippet}</span>
            </button>
          ))}
        </div>
      )}

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
                {item.additions != null && (
                  <span>
                    <span style={styles.diffAdd}>+{item.additions}</span>{" "}
                    <span style={styles.diffDel}>-{item.deletions ?? 0}</span>
                  </span>
                )}
                <span style={stateStyle(item.state)}>{stateLabel(item.state, item.durationMs)}</span>
                {item.diff && (
                  <button style={styles.linkBtn} data-testid="diff-toggle" onClick={() => toggleDiff(item.id)}>
                    {expandedDiffs.has(item.id) ? "收起 diff" : "展开 diff"}
                  </button>
                )}
              </div>
              {item.detail && <div style={styles.toolDetail}>{item.detail}</div>}
              {item.diff && expandedDiffs.has(item.id) && (
                <pre style={styles.diffView} data-testid="diff-view">
                  {item.diff.split("\n").map((line, i) => (
                    <div
                      key={i}
                      style={{
                        color: line.startsWith("+")
                          ? "#7ee787"
                          : line.startsWith("-")
                            ? "#ff7b72"
                            : "#8b8b96",
                      }}
                    >
                      {line}
                    </div>
                  ))}
                </pre>
              )}
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
            <p style={styles.dialogTitle}>
              权限确认
              {permissions.length > 1 ? `（排队 ${permissions.length} 项）` : ""}
            </p>
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
          style={{ ...styles.button, position: "relative", zIndex: 50 }}
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
