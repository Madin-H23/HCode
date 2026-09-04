import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createHarnessBridge, type HarnessBridge } from "./bridge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let bridge: HarnessBridge | null = null;
let win: BrowserWindow | null = null;

function send(channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

async function bootstrapBridge(): Promise<void> {
  // T2 以 mock 模型保底保证可启动；T3 接工作区选择后换成 buildHarnessFromCli 的模型选择链。
  bridge = await createHarnessBridge(
    { projectRoot: process.cwd(), mock: true },
    {
      onEvent: (envelope) => send("hcode:agent-event", envelope),
      onStatus: (status) => send("hcode:status", status),
    },
  );
}

function registerIpc(): void {
  ipcMain.handle("hcode/prompt", async (_e, text: unknown) => {
    if (typeof text !== "string" || text.length === 0) throw new Error("prompt 需要非空文本");
    if (!bridge) throw new Error("桥未就绪");
    // T2 调试脚本：每次注入一条 mock 回复驱动真实循环（T3 由模型选择链替换）。
    bridge.harness.models.mockHandle?.setResponses([
      fauxAssistantMessage(`HCode 桥路测试：已收到「${text}」`),
    ]);
    await bridge.prompt(text);
  });
  ipcMain.handle("hcode/abort", () => {
    bridge?.abort();
  });
  ipcMain.handle("hcode/status", () => bridge?.status() ?? null);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "HCode",
    show: false,
    backgroundColor: "#1b1b1f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on("ready-to-show", () => win?.show());
  win.on("closed", () => {
    win = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  try {
    await bootstrapBridge();
  } catch (err) {
    console.error("[hcode] Harness 装配失败:", err);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void bridge?.harness.shutdown();
  if (process.platform !== "darwin") app.quit();
});
