# 桌面端把 Harness 内嵌在 Electron 主进程

桌面端是同一 Harness 的第三张面：Harness 内嵌在 Electron 主进程内，渲染进程只通过 typed IPC 消费事件流与提交动作（prompt / abort / 权限应答）。选择了与 TUI 同构的进程内形态，而非 agent-runner 式独立子进程——最小纵向切片优先；等「多会话并行」或崩溃隔离成为真实需求，再拆子进程（届时参照 miniclaw agent-runner 形态）。

## Considered Options

- **独立子进程 + RPC**（拒绝）：隔离好、可多开，但要自造一层 RPC 协议与生命周期管理，MVP 承担不起；上游 Harness 也从未按跨进程契约设计。
