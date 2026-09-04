# HCode 桌面端（desktop/）

Harness 的第三张面：Electron 主进程内嵌 Harness（ADR-0001），渲染端零 Node 权限，仅经 typed IPC 桥通信。应用名 HCode，界面中文。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发窗口（electron-vite；`TINYCODE_MODEL=mock` 零网络） |
| `npm run typecheck` | 双 tsconfig（renderer / main+preload+e2e+tests） |
| `npm run test:unit` | vitest：桥测 + 聊天 reducer + 会话索引（全部 mock，零网络） |
| `npm run test:e2e` | 构建后跑 Playwright `_electron` 冒烟 #0/①②③④ |
| `npm run dist` | electron-builder 出 Windows NSIS 安装包（release/） |

## 结构

```
desktop/
├── src/main/        # 桥（bridge.ts，Electron 无关 seam）+ IPC 壳（index.ts）+ 索引 + 测试钩子
├── src/preload/     # contextBridge typed 面（类型同源自 bridge）
├── src/renderer/    # React 聊天 UI（chat.ts 纯 reducer 可独立测试）
├── tests/           # vitest（桥测/reducer/索引）
└── e2e/             # Playwright Electron 冒烟 #0/①②③④
```

## 测试注入口（仅测试环境变量生效）

- `HCODE_TEST_WORKSPACE`：工作区选择不出系统对话框，直接绑定该目录
- `HCODE_TEST_USERDATA`：应用配置（最近工作区）重定向，隔离真实用户数据
- `HCODE_TEST_MOCK_SCRIPT=tool|permission`：mock 脚本化真实工具执行 / 权限 ASK 往返

## 数据与权限

- 会话数据与 CLI 同源：`TINYCODE_HOME`（默认 `~/.tinycode`，ADR-0004）；SQLite 索引 `sessions/index.db` 为可重建衍生层（ADR-0002）
- 权限固定 ask（Q12）：每次 ASK 弹对话框三选一；关闭/Esc 视为拒绝；「总是允许」按工具+命令族记忆，仅本会话有效

## 打包

`npm run dist` 产出 `release/HCode Setup <ver>.exe`（NSIS x64，per-user，无自动更新）。`build.electronDist` 复用 node_modules 内 electron dist，规避杀软对临时目录 rename 的锁定。真模型（GLM 等）手动冒烟清单见 `docs/limitations.md` 附注。
