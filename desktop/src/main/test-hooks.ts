import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { HarnessBridge } from "./bridge";

/**
 * E2E/开发调试注入口（仅 mock 装配下生效）。
 * 与生产 IPC 装配分离：registerIpc 保持场景无关。
 */
export function armDebugMockScript(bridge: HarnessBridge, text: string): void {
  if (!bridge.isMock) return;
  if (process.env.HCODE_TEST_MOCK_SCRIPT === "tool") {
    // 脚本化一次真实工具执行（read → 最终答复），驱动工具卡片渲染。
    bridge.armMockMessages([
      fauxAssistantMessage([fauxToolCall("read", { path: "package.json" })]),
      fauxAssistantMessage("读取完成：package.json 已检查。"),
    ]);
  } else if (process.env.HCODE_TEST_MOCK_SCRIPT === "edit") {
    // 脚本化一次 edit（工作区需预置目标文件），驱动 diff 卡片渲染。
    bridge.armMockMessages([
      fauxAssistantMessage([fauxToolCall("edit", { path: "calc.js", oldText: "a - b", newText: "a + b" })]),
      fauxAssistantMessage("已修复"),
    ]);
  } else if (process.env.HCODE_TEST_MOCK_SCRIPT === "permission") {
    // 脚本化一次写盘（write 走 ASK 闸门），路径随 prompt 文本变化 → 不同审批族。
    bridge.armMockMessages([
      fauxAssistantMessage([
        fauxToolCall("write", { path: `hcode-perm-${text.length}.txt`, content: text }),
      ]),
      fauxAssistantMessage("写入完成"),
    ]);
  } else {
    bridge.armMockScript(`（mock）收到：「${text}」`);
  }
}
