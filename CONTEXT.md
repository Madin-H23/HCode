# HCode

极简 Coding Agent Harness（TinyCode 架构的 fork）与其多张用户面。一个 Harness，三张面：TUI、一次性 CLI、桌面端。

## Language

**Harness**:
装配模型、工具、权限、上下文与会话策略的组合单元；所有用户面共用同一 Harness，面之间不复制策略。
_Avoid_: 引擎、后端、core

**面 (Surface)**:
同一 Harness 呈现给用户的界面形态。现有 TUI 与一次性 CLI（-p），桌面端是第三张面。
_Avoid_: 前端、客户端、壳（口语指桌面端时用「桌面端」）

**工作区 (Workspace)**:
Agent 被授权读写的项目根目录；所有取路径的工具调用都不得越出此边界。
_Avoid_: 项目（泛指仓库时可用）、cwd（仅指进程工作目录时可用）

**会话 (Session)**:
一次持续对话的完整落盘历史（头含 id/工作区/模型/标题），可被 attach 恢复继续。
_Avoid_: 聊天记录、对话、chat

**权限闸门 (Permission Gate)**:
对每次工具调用的三级判定 allow / ask / deny；ask 无人应答时一律拒绝。
_Avoid_: 审批流、授权、鉴权

**上下文卫生**:
对进入模型历史的工具结果做截断、超出预算做压缩的策略总称。
_Avoid_: 记忆管理、清理

**子代理 (Sub-agent)**:
由主 Agent 派生的只读工作者；数量受限，且不得再派生子代理。
_Avoid_: 多 agent、worker（代码标识符除外）

**Mock 模式**:
用脚本化假模型驱动真实循环的零网络运行方式，测试与演示的基座。
_Avoid_: 离线模式、测试模式
