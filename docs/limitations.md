# 已知局限（桌面端 MVP · T9 收口）

> 按总 Goal 约定：局限入仓库可见，不在聊天里。逐条注明归属层与去向。

## 上游 Harness 侧（fork 继承，修复走独立 issue / 上游通道）

- 无头 `-p` 模式无流式与 abort；SIGINT 中断逻辑仅在 TUI
- runtime 无订阅门面：事件订阅直挂 `runtime.agent`（桌面桥经 sink 注入已隔离，但多路分发需自行维护）
- `harness.shutdown()` 不取消进行中的 `prompt()`；桌面端以 busy 闸 + abort 规避
- 错误分类薄：除 `ModelNotConfiguredError` 外均为裸 Error，桌面端以文案直出
- 上游测试在 Windows 有一个固有失败（POSIX 路径断言），见 issue #11

## 桌面端已知取舍（P2 批次后余项）

- tool_execution_update 进度流**降级不立项**：探查实证自有工具集全部不发 update（仅 pi-agent-core harness 版 bash 发，本仓库 bootstrap 用自有工具集）；渲染通路已预留（bridge 全量转发），待上游 bash 转发 update 或自研工具需要时一并实现
- 子代理 E2E（P2-③）因 mock 队列 worker/主回合并发饥饿隔离（issue #26），本地 HCODE_E2E_SUBAGENT=1 可手动运行；面板功能已人工+截图验证
- 权限排队指示仅显示同时挂起数（「排队 N 项」）：顺序 toolCall 的权限逐个挂起，批次总数不可预知（P1-T5 实证修正）
- 子代理面板/状态行基于「最后非空快照」：上游 reports() 只含运行中 worker，完成即从管理器消失；桌面端按 id 合并保留派驻记录（P2-T3 事件驱动捕获）
- 模型热切换的差值断言在 mock 单模型装配下无差值（真实多模型切换需真凭据场景验证）
- attach 历史渲染依赖「workspace 重置事件先于 IPC resolve 抵达」的时序（Electron 当前有序保证；稳妥做法是 sessionId 比对）
- 会话列表为「一致性优先」：每次查询全量 rebuild 索引（JSONL 解析仍全量），搜索已用 messages 表 LIKE（中文 2 字词无 FTS5 限制）；性能/高亮定位留待后续
- `textOf` 主进程反向引用渲染层纯函数（P1+ 下沉 shared）；应用图标仍为 Electron 默认
- 索引层用 node:sqlite（Electron ≥35）；降级 Electron 版本会失去索引能力
- 界面本地化为展示层映射（reason 查表 + detail 模式替换），未覆盖全部上游英文输出

## P1 已清挂账（2026-09-07）

~~abort 时挂起的权限对话框不自动撤销~~（P1-T2：abort 全量 deny + 对话框清空）；~~多项 ASK 队列只显示首项~~（P1-T5：逐项审批+排队指示）；~~模型切换无 UI~~（P1-T4：顶栏热切换）；~~写盘无 diff 预览~~（P1-T1）；~~上下文用量不可见~~（P1-T3）。

## 明确不做（Out of Scope，见 SPEC #1）

写盘 diff 预览、上下文用量条、MCP/子代理面板、slash 命令 UI、会话删除/重命名/搜索 UI、auto 权限开关、自动更新、macOS/Linux 打包、多窗口多会话并行、golden transcript 对照（P1）、OS 级沙箱（权限是审批层不是安全边界）。

## 真模型手动冒烟清单（GLM，未自动化的验收）

1. 配置凭据：`TINYCODE_MODEL=<provider/model>` + 对应 key 环境变量（或 `.tinycode/config.json`）
2. 打包态启动 `HCode.exe` → 打开工作区 → 发起一个真实小任务（如修一个单测）
3. 核对：流式回复、工具卡片、（若有写盘）权限对话框三选一、会话出现在列表且 `~/.tinycode/sessions` 落盘
4. 终端 `hcode -c` 能接上桌面端刚创建的会话（跨面同源验证）
5. 截图/录屏归档至 `docs/evidence/`（待补）
