# 已知局限（桌面端 MVP · T9 收口）

> 按总 Goal 约定：局限入仓库可见，不在聊天里。逐条注明归属层与去向。

## 上游 Harness 侧（fork 继承，修复走独立 issue / 上游通道）

- 无头 `-p` 模式无流式与 abort；SIGINT 中断逻辑仅在 TUI
- runtime 无订阅门面：事件订阅直挂 `runtime.agent`（桌面桥经 sink 注入已隔离，但多路分发需自行维护）
- `harness.shutdown()` 不取消进行中的 `prompt()`；桌面端以 busy 闸 + abort 规避
- 错误分类薄：除 `ModelNotConfiguredError` 外均为裸 Error，桌面端以文案直出
- 上游测试在 Windows 有一个固有失败（POSIX 路径断言），见 issue #11

## 桌面端已知取舍（P1 候选）

- attach 历史渲染依赖「workspace 重置事件先于 IPC resolve 抵达」的时序（Electron 当前有序保证；稳妥做法是 sessionId 比对）
- abort 时挂起的权限对话框不自动撤销；多项 ASK 队列只显示首项 + 计数
- IME 组合输入中按 Esc 会触发「关闭即拒绝」
- 会话列表为「一致性优先」：每次查询全量 rebuild 索引（JSONL 解析仍全量），性能/全文检索留待后续
- `modelFlag` 已穿线但无 UI（模型切换下拉属 P1）；模型选择沿用 config/env 链
- 索引层用 node:sqlite（Electron ≥35）；降级 Electron 版本会失去索引能力

## 明确不做（Out of Scope，见 SPEC #1）

写盘 diff 预览、上下文用量条、MCP/子代理面板、slash 命令 UI、会话删除/重命名/搜索 UI、auto 权限开关、自动更新、macOS/Linux 打包、多窗口多会话并行、golden transcript 对照（P1）、OS 级沙箱（权限是审批层不是安全边界）。

## 真模型手动冒烟清单（GLM，未自动化的验收）

1. 配置凭据：`TINYCODE_MODEL=<provider/model>` + 对应 key 环境变量（或 `.tinycode/config.json`）
2. 打包态启动 `HCode.exe` → 打开工作区 → 发起一个真实小任务（如修一个单测）
3. 核对：流式回复、工具卡片、（若有写盘）权限对话框三选一、会话出现在列表且 `~/.tinycode/sessions` 落盘
4. 终端 `hcode -c` 能接上桌面端刚创建的会话（跨面同源验证）
5. 截图/录屏归档至 `docs/evidence/`（待补）
