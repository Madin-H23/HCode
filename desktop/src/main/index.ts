import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarnessBridge, type HarnessBridge } from "./bridge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// E2E 注入口：不出系统对话框、不写真实用户目录（仅测试环境变量存在时生效）。
const TEST_WORKSPACE = process.env.HCODE_TEST_WORKSPACE;
if (process.env.HCODE_TEST_USERDATA) app.setPath("userData", process.env.HCODE_TEST_USERDATA);

let bridge: HarnessBridge | null = null;
let win: BrowserWindow | null = null;

function send(channel: string, payload: unknown): void {
  win?.webContents.send(channel, payload);
}

function recentsPath(): string {
  return path.join(app.getPath("userData"), "hcode-desktop.json");
}

function readRecents(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(recentsPath(), "utf8")) as {
      recentWorkspaces?: string[];
    };
    return parsed.recentWorkspaces ?? [];
  } catch {
    return [];
  }
}

function pushRecent(workspace: string): void {
  const list = [workspace, ...readRecents().filter((w) => w !== workspace)].slice(0, 10);
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(recentsPath(), JSON.stringify({ recentWorkspaces: list }));
}

async function startSession(
  projectRoot: string,
  session: { mode: "new" } | { mode: "attach"; id: string },
): Promise<void> {
  if (bridge) await bridge.dispose();
  const mock = process.env.TINYCODE_MODEL === "mock";
  bridge = await createHarnessBridge({ projectRoot, mock, session }, {
    onEvent: (envelope) => send("hcode:agent-event", envelope),
    onStatus: (status) => send("hcode:status", status),
  });
  pushRecent(projectRoot);
  send("hcode:workspace", { projectRoot });
  send("hcode:status", bridge.status());
}

function requireBridge(): HarnessBridge {
  if (!bridge) throw new Error("尚未选择工作区");
  return bridge;
}

function registerIpc(): void {
  ipcMain.handle("hcode/workspace/pick", async () => {
    let picked: string | null;
    if (TEST_WORKSPACE) {
      picked = TEST_WORKSPACE;
    } else {
      const result = await dialog.showOpenDialog(win!, {
        properties: ["openDirectory"],
        defaultPath: readRecents()[0],
      });
      picked = result.canceled ? null : (result.filePaths[0] ?? null);
    }
    if (!picked) return { ok: false as const, recents: readRecents() };
    await startSession(picked, { mode: "new" });
    return { ok: true as const, projectRoot: picked, recents: readRecents() };
  });

  ipcMain.handle("hcode/workspace/recent", () => ({ recents: readRecents() }));

  ipcMain.handle("hcode/workspace/open", async (_e, workspace: unknown) => {
    if (typeof workspace !== "string" || workspace.length === 0) throw new Error("需要工作区路径");
    await startSession(workspace, { mode: "new" });
    return { ok: true as const, projectRoot: workspace, recents: readRecents() };
  });

  ipcMain.handle("hcode/session/new", async () => {
    const current = bridge?.status().projectRoot;
    if (!current) throw new Error("尚未选择工作区");
    await startSession(current, { mode: "new" });
    return { ok: true as const };
  });

  ipcMain.handle("hcode/prompt", async (_e, text: unknown) => {
    if (typeof text !== "string" || text.trim().length === 0) throw new Error("prompt 需要非空文本");
    const current = requireBridge();
    if (current.harness.models.mockHandle) {
      current.armMockScript(`（mock）收到：「${text}」`);
    }
    await current.prompt(text);
  });

  ipcMain.handle("hcode/abort", () => {
    requireBridge().abort();
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

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void bridge?.dispose();
  if (process.platform !== "darwin") app.quit();
});
