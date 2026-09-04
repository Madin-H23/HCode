# HCode

**H**earth **Code** —— 极简而完整的 Coding Agent Harness（fork 自 [helsome/tinycode](https://github.com/helsome/tinycode)，MIT），一个 Harness、三张面：**TUI、一次性 CLI、桌面端**。

覆盖：代理循环（Pi Runtime）、工具注册表与 7 个内置工具、三级权限闸门、会话持久化（JSONL）、上下文截断与压缩、Skills、MCP、只读子代理。构架地图见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 桌面端（原创改造）

Electron + React 的第三张面：选工作区 → 发任务 → 流式回复与工具卡片 → 权限 ASK 对话框（一次允许/总是允许/拒绝，Esc=拒绝）→ 会话列表新建/切换/attach（与 CLI 共享 `~/.tinycode`，跨面接力）。详见 [desktop/README.md](./desktop/README.md)。

```bash
cd desktop
npm install
npm run dev        # 开发窗口（TINYCODE_MODEL=mock 可零网络体验）
npm run dist       # 出 Windows NSIS 安装包（release/）
```

## 上游 CLI / TUI

```bash
npm install
npm run dev            # TUI
npm run build && npx hcode -p "…"   # 一次性模式（bin 名为 hcode）
npm test               # 离线 mock 全量测试
```

模型选择链：CLI flag > `TINYCODE_MODEL` > `.tinycode/config.json` > 首个已配置凭据的 provider；`TINYCODE_MODEL=mock` 全链路离线。

## 工程纪律

- 分支：`main` 仅稳定态；改造在 `develop`；大块改造走 `feature/<topic>` `--no-ff` 合回。
- 上游同步约束：品牌化只做产品面，内部模块/env/语义零改动，见 [docs/adr/0003](./docs/adr/0003-fork-sync-discipline.md)。
- 领域词汇：[CONTEXT.md](./CONTEXT.md)；关键决策：[docs/adr/](./docs/adr)；已知局限：[docs/limitations.md](./docs/limitations.md)。

## 归属

基于 [helsome/tinycode](https://github.com/helsome/tinycode)（MIT）深度改造；上游 LICENSE 保留。桌面端为本仓库原创改造，架构方法参照 Pi Runtime 与 pi-coding-agent skill（Core/Runtime 分离、SDK 挡在端口后、事件流为产品契约）。
