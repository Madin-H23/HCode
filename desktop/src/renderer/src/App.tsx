import { useEffect, useRef, useState } from "react"
import type {
  AgentEventEnvelope,
  BridgeStatus,
  McpServerInfo,
  ModelInfo,
  PermissionRequestPayload,
  PromptOutcome,
  SearchHit,
  SessionSummary,
  SubAgentSummary,
} from "./hcode.d"
import { initialChatState, reduceChatEvent, type ChatItem, type ChatState } from "./chat"

type CardState = "running" | "ok" | "error" | "stopped"

/** 权限理由查表翻译（对照 src/permissions/rules.ts 英文清单；渲染层只读映射，不改上游数据）。 */
const reasonZh = (reason: string): string => {
  const table: Array<[RegExp, string]> = [
    [/read-only operation/i, "只读操作（工作区内）"],
    [/accesses? .*outside/i, "访问工作区外路径"],
    [/write outside/i, "写入工作区外路径"],
    [/write modifies project files/i, "写入将修改工作区文件"],
    [/modifies project files/i, "将修改工作区文件"],
    [/catastrophic command refused/i, "危险命令已被策略拒绝"],
    [/delete/i, "包含删除操作"],
    [/spawn/i, "派生子代理"],
  ]
  for (const [re, zh] of table) {
    if (re.test(reason)) return zh
  }
  return reason
}

/** 工具 detail 已知英文模式改写（read 头/bash 截断标记等；展示层只读替换）。 */
const localizeDetail = (detail: string): string =>
  detail
    .replace(/(\d+) lines, showing (\d+)-(\d+)/, "共 $1 行，显示 $2-$3")
    .replace(/\[output truncated: (\d+) characters omitted\]/, "[输出已截断：省略 $1 字符]")
    .replace(/✗ exit (\d+)/, "✗ 退出码 $1")
    .replace(/✓ exit (\d+)/, "✓ 退出码 $1")

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
  const [govTarget, setGovTarget] = useState<string | null>(null)
  const [govMode, setGovMode] = useState<"rename" | "delete" | null>(null)
  const [govTitle, setGovTitle] = useState("")
  const [models, setModels] = useState<ModelInfo[]>([])
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const [mcpOpen, setMcpOpen] = useState(false)
  const [agents, setAgents] = useState<{ running: number; max: number; workers: SubAgentSummary[] } | null>(null)
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null)
  const chatRef = useRef<ChatState>(initialChatState)
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offEvent = window.hcode.onAgentEvent((payload: AgentEventEnvelope) => {
      chatRef.current = reduceChatEvent(chatRef.current, payload.event)
      setItems(chatRef.current.items)
      // spawn_agent 结束事件携带 WorkerReport（details）——确定性捕获，轮询可能错过短生命周期
      const ev = payload.event as {
        type?: string
        toolName?: string
        result?: { details?: Record<string, unknown> }
      }
      if (ev.type === "tool_execution_end" && ev.toolName === "spawn_agent" && ev.result?.details) {
        const d = ev.result.details
        if (typeof d.id === "string") {
          setAgents((prev) => {
            const base = prev ?? { running: 1, max: 3, workers: [] }
            const worker = {
              id: String(d.id),
              name: String(d.name ?? d.id),
              task: String(d.task ?? ""),
              status: typeof d.status === "string" ? d.status : "running",
              durationMs: typeof d.durationMs === "number" ? d.durationMs : undefined,
            }
            return { ...base, workers: [...base.workers.filter((w) => w.id !== worker.id), worker] }
          })
        }
      }
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
      setMcpServers([])
      setMcpOpen(false)
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

  // 轮询仅在面板打开时运行（避免后台重渲染与 Playwright 可动性检查活锁）
  useEffect(() => {
    if (!workspace || !agentsOpen) return
    const fetchAgents = (): void => {
      void window.hcode
        .listAgents()
        .then((next) =>
          // 上游 reports() 只含运行中 worker；按 id 合并保留历史派驻记录
          setAgents((prev) => {
            const map = new Map((prev?.workers ?? []).map((w) => [w.id, w]))
            for (const w of next.workers) map.set(w.id, w)
            return { running: next.running, max: next.max, workers: [...map.values()] }
          }),
        )
        .catch(() => {})
    }
    fetchAgents()
    const t = setInterval(fetchAgents, 2000)
    return () => clearInterval(t)
  }, [workspace, agentsOpen])

  const toggleAgents = (): void => {
    setAgentsOpen((v) => !v)
    loadAgents()
  }

  const toggleMcp = (): void => {
    setError(null)
    if (!mcpOpen) {
      void window.hcode
        .listMcp()
        .then(setMcpServers)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    }
    setMcpOpen((v) => !v)
  }

  const loadAgents = (): void => {
    void window.hcode
      .listAgents()
      .then(setAgents)
      .catch(() => {})
  }

  const openGov = (mode: "rename" | "delete"): void => {
    const id = status?.sessionId
    if (!id) {
      setError("当前无活跃会话")
      return
    }
    setGovTarget(id)
    setGovMode(mode)
    setGovTitle(sessions.find((s) => s.id === id)?.title ?? "")
    setError(null)
  }

  const submitGov = (): void => {
    if (!govTarget || !govMode) return
    setError(null)
    const call =
      govMode === "rename"
        ? window.hcode.renameSession(govTarget, govTitle.trim())
        : window.hcode.deleteSession(govTarget)
    void call
      .then(() => {
        setGovTarget(null)
        setGovMode(null)
        loadSessions()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
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
      // IME 组合中的 Escape 是取消候选词（keyCode 229 兼容），不当作拒绝
      if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) {
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
    <div className="app">
      <header className="header">
        <h1 className="brand">HCode</h1>
        <p className="workspace" data-testid="workspace">
          {workspace ?? "未选择工作区 —— 打开文件夹开始"}
        </p>
        <p className="status" data-testid="status">
          {status ? (
            <>
              <span className={`dot ${busy ? "busy" : "idle"}`} />
              <span>
                {busy ? "busy" : "idle"} · {status.model} · 权限 {status.permissionMode} ·{" "}
                {status.sessionId ? `会话 ${status.sessionId.slice(0, 8)}` : "无会话"} ·{" "}
                {agents && agents.workers.length > 0 ? `子代理 ${agents.running}/${agents.max} · ` : ""}
                ctx ~{Math.round(status.tokens / 1000)}k
                {status.contextWindow ? `/${Math.round(status.contextWindow / 1000)}k` : ""}
              </span>
            </>
          ) : (
            <>
              <span className="dot idle-empty" />
              <span>未装配</span>
            </>
          )}
        </p>
      </header>

      <div className="toolbar">
        <button className="btn" data-testid="open-workspace" onClick={openWorkspace}>
          打开工作区
        </button>
        <button
          className="btn"
          data-testid="new-session"
          disabled={!workspace || busy}
          onClick={newSession}
        >
          新会话
        </button>
        <select
          className="select"
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
          className="select"
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
        <button className="btn" data-testid="mcp-toggle" onClick={toggleMcp}>
          MCP
        </button>
        <button className="btn" data-testid="agents-toggle" onClick={toggleAgents}>
          子代理
        </button>
        <input
          className="input search-input"
          data-testid="search-input"
          placeholder="搜索会话内容…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) runSearch()
          }}
        />
        <button className="btn" data-testid="search-run" disabled={!searchQuery.trim()} onClick={runSearch}>
          搜索
        </button>
        <button
          className="btn"
          data-testid="rename-session"
          disabled={!status?.sessionId || busy}
          onClick={() => openGov("rename")}
        >
          重命名
        </button>
        <button
          className="btn btn-danger"
          data-testid="delete-session"
          disabled={!status?.sessionId || busy}
          onClick={() => openGov("delete")}
        >
          删除
        </button>
        <button className="btn" data-testid="sessions-refresh" disabled={busy} onClick={loadSessions}>
          刷新
        </button>
        {recents.slice(0, 5).map((ws) => {
          const base = ws.split(/[\\/]/).filter(Boolean).pop() ?? ws
          return (
            <button
              key={ws}
              className="chip"
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

      {agentsOpen && (
        <div className="panel" data-testid="agents-panel">
          {(!agents || agents.workers.length === 0) && <p className="panel-empty">无子代理</p>}
          {agents?.workers.map((w) => (
            <div key={w.id} className="panel-static" data-testid="agent-row">
              <span className="panel-name">{w.name}</span>
              <span
                className={
                  w.status === "running" ? "run" : w.status === "completed" ? "ok" : w.status === "error" ? "err" : "warn"
                }
              >
                {w.status}
              </span>
              <span className="panel-snippet">{w.task}</span>
              {w.durationMs != null && <span className="panel-snippet">{(w.durationMs / 1000).toFixed(1)}s</span>}
              {w.report && <span className="panel-snippet">{w.report.slice(0, 120)}</span>}
            </div>
          ))}
        </div>
      )}

      {mcpOpen && (
        <div className="panel" data-testid="mcp-panel">
          {mcpServers.length === 0 && <p className="panel-empty">未配置 MCP 服务器</p>}
          {mcpServers.map((server) => (
            <div key={server.name} className="panel-static" data-testid="mcp-server">
              <span className="panel-name">{server.name}</span>
              <span className={server.status === "connected" ? "ok" : "err"}>{server.status}</span>
              <span className="panel-snippet">{server.toolCount} 个工具</span>
              {server.error && <span className="panel-snippet err">{server.error}</span>}
              {server.tools.length > 0 && (
                <span className="panel-tools">工具: {server.tools.join(", ")}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {searchResults !== null && (
        <div className="panel" data-testid="search-results">
          {searchResults.length === 0 && <p className="panel-empty">无匹配会话</p>}
          {searchResults.map((hit, i) => (
            <button
              key={`${hit.sessionId}-${hit.snippet}-${i}`}
              className="panel-row"
              data-testid="search-hit"
              onClick={() => openSearchHit(hit)}
            >
              <span className="panel-name">{hit.title ?? "（无标题会话）"}</span>
              <span className="panel-snippet">{hit.snippet}</span>
            </button>
          ))}
        </div>
      )}

      <div className="messages" data-testid="messages" ref={messagesRef}>
        <div className="msg-col">
          {items.length === 0 && (
            <p className="placeholder">
              {workspace ? "向 Agent 描述你的任务…" : "选择工作区后，Agent 在该项目内工作。"}
            </p>
          )}
          {items.map((item) =>
            item.kind === "message" ? (
              <div
                key={item.id}
                data-testid={`msg-${item.role}`}
                data-streaming={item.streaming ? "true" : "false"}
                className={`bubble ${item.role === "user" ? "bubble-user" : "bubble-assistant"}`}
              >
                {item.text}
              </div>
            ) : (
              <div key={item.id} className="tool-card" data-testid="tool-card" data-state={item.state}>
                <div className="tool-head">
                  <span className="tool-name">{item.name}</span>
                  <span className="tool-args">{item.argsSummary}</span>
                  {item.additions != null && (
                    <span>
                      <span className="diff-add">+{item.additions}</span>{" "}
                      <span className="diff-del">-{item.deletions ?? 0}</span>
                    </span>
                  )}
                  <span className={`card-state card-state-${item.state}`}>
                    {stateLabel(item.state, item.durationMs)}
                  </span>
                  {item.diff && (
                    <button className="link-btn" data-testid="diff-toggle" onClick={() => toggleDiff(item.id)}>
                      {expandedDiffs.has(item.id) ? "收起 diff" : "展开 diff"}
                    </button>
                  )}
                </div>
                {item.detail && <div className="tool-detail">{localizeDetail(item.detail)}</div>}
                {item.diff && expandedDiffs.has(item.id) && (
                  <pre className="diff-view" data-testid="diff-view">
                    {item.diff.split("\n").map((line, i) => (
                      <div key={i} className={line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : undefined}>
                        {line}
                      </div>
                    ))}
                  </pre>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {error && (
        <p className="error-line" data-testid="error">
          {error}
        </p>
      )}

      {govTarget && govMode && (
        <div className="overlay" data-testid="gov-dialog">
          <div className="dialog">
            <p className="dialog-title">{govMode === "rename" ? "重命名会话" : "删除会话"}</p>
            {govMode === "rename" && (
              <input
                className="input gov-input"
                data-testid="gov-input"
                value={govTitle}
                onChange={(e) => setGovTitle(e.target.value)}
              />
            )}
            {govMode === "delete" && (
              <p className="dialog-reason">将删除该会话的 JSONL 文件，不可恢复。确认删除？</p>
            )}
            <div className="dialog-row">
              <button
                className="btn"
                data-testid="gov-cancel"
                onClick={() => {
                  setGovTarget(null)
                  setGovMode(null)
                }}
              >
                取消
              </button>
              <button className="btn btn-danger" data-testid="gov-confirm" onClick={submitGov}>
                {govMode === "rename" ? "重命名" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {permissions.length > 0 && (
        <div className="overlay" data-testid="perm-dialog">
          <div className="dialog dialog-perm">
            <p className="dialog-title">
              权限确认
              {permissions.length > 1 ? `（排队 ${permissions.length} 项）` : ""}
            </p>
            <p className="dialog-tool">{permissions[0]!.toolName}</p>
            <p className="dialog-tool">{permissions[0]!.title}</p>
            {permissions[0]!.detail && <pre className="dialog-body">{permissions[0]!.detail}</pre>}
            <p className="dialog-reason">{reasonZh(permissions[0]!.reason)}</p>
            <div className="dialog-row">
              <button
                className="btn btn-danger"
                data-testid="perm-deny"
                onClick={() => respond(permissions[0]!, "deny")}
              >
                拒绝
              </button>
              <button className="btn" data-testid="perm-always" onClick={() => respond(permissions[0]!, "always")}>
                总是允许
              </button>
              <button className="btn" data-testid="perm-once" onClick={() => respond(permissions[0]!, "once")}>
                允许一次
              </button>
            </div>
            <p className="perm-hint">Esc 关闭视为拒绝 · 「总是允许」按工具+命令族记忆（仅本会话）</p>
          </div>
        </div>
      )}

      <div className="input-row">
        <textarea
          className="textarea"
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
          className="btn"
          data-testid="send"
          disabled={!workspace || busy || input.trim().length === 0}
          onClick={send}
        >
          发送
        </button>
        <button className="btn btn-danger btn-stop" data-testid="stop" disabled={!busy} onClick={() => void window.hcode.abort().catch(() => {})}>
          停止
        </button>
      </div>
    </div>
  )
}
