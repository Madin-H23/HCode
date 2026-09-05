# AGENTS.md

HCode — [helsome/tinycode](https://github.com/helsome/tinycode)（MIT）的 fork：极简而完整的 Coding Agent Harness（Pi Runtime，TypeScript ESM）。
当前主战场：为 Harness 加第三张面「桌面端」（Electron + React，规划中落 `desktop/`）。

## Agent skills

### Issue tracker

Issues 存放在 GitHub Issues（`gh` CLI 操作）。See `docs/agents/issue-tracker.md`.

### Triage labels

五个 canonical triage roles，label 字符串与 role 名相同。See `docs/agents/triage-labels.md`.

### Domain docs

Single-context：repo 根 `CONTEXT.md`（纯词汇表）+ `docs/adr/`。See `docs/agents/domain.md`.

## 必读

- `ARCHITECTURE.md` — 构架地图：哪些能力来自 Pi、哪些来自本仓库，先读它再动代码
- 分支纪律：`main` 仅稳定态；一切改造在 `develop`；大块改造走 `feature/<topic>`，`--no-ff` 合回 develop
- 上游同步约束见 `docs/adr/0003-fork-sync-discipline.md`
- OCR 代码审查（open-code-review）：规则在 `.opencodereview/rule.json`，用法 `ocr delegate preview --rule .opencodereview/rule.json --from main --to develop --format json`（delegation 模式，规则变更需实测验证）
