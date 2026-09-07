import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarnessBridge, type HarnessBridge, type WorkspacePickResult } from "./bridge";
import { armDebugMockScript } from "./test-hooks";
import { SessionManager } from "../../../src/session/manager.js";
import { sessionsDir } from "../../../src/config/loader.js";
import { textOf } from "../renderer/src/chat";
import { SessionIndex } from "./session-index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// E2E 注入口：不出系统对话框、不写真实用户目录（仅测试环境变量存在时生效）。
const TEST_WORKSPACE = process.env.HCODE_TEST_WORKSPACE;
if (process.env.HCODE_TEST_USERDATA) app.setPath("userData", process.env.HCODE_TEST_USERDATA);

let bridge: HarnessBridge | null = null;
let win: BrowserWindow | null = null;
let index: SessionIndex | null = null;

function upstreamSessionList() {
  try {
    return new SessionManager(sessionsDir()).list();
  } catch {
    return []; // 首次运行 ~/.tinycode/sessions 尚不存在
  }
}

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
  if (bridge?.status().busy) throw new Error("Agent 正忙：请先停止当前任务");
  if (bridge) await bridge.dispose();
  const mock = process.env.TINYCODE_MODEL === "mock";
  bridge = await createHarnessBridge({ projectRoot, mock, session }, {
    onEvent: (envelope) => send("hcode:agent-event", envelope),
    onStatus: (status) => send("hcode:status", status),
    onPermission: (request) => send("hcode:permission", request),
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
  const finishOpen = async (projectRoot: string): Promise<WorkspacePickResult> => {
    await startSession(projectRoot, { mode: "new" });
    return { ok: true, projectRoot, recents: readRecents() };
  };

  ipcMain.handle("hcode/workspace/pick", async () => {
    let picked: string | null;
    if (TEST_WORKSPACE) {
      picked = TEST_WORKSPACE;
    } else {
      if (!win) throw new Error("窗口未就绪");
      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
        defaultPath: readRecents()[0],
      });
      picked = result.canceled ? null : (result.filePaths[0] ?? null);
    }
    if (!picked) return { ok: false, recents: readRecents() };
    return finishOpen(picked);
  });

  ipcMain.handle("hcode/workspace/recent", () => ({ recents: readRecents() }));

  ipcMain.handle("hcode/workspace/open", async (_e, workspace: unknown) => {
    if (typeof workspace !== "string" || workspace.length === 0) throw new Error("需要工作区路径");
    return finishOpen(workspace);
  });

  ipcMain.handle("hcode/session/new", async () => {
    const current = bridge?.status().projectRoot;
    if (!current) throw new Error("尚未选择工作区");
    await startSession(current, { mode: "new" });
    return { ok: true as const };
  });

  ipcMain.handle("hcode/session/search", (_e, query: unknown) => {
    if (typeof query !== "string" || query.trim().length === 0) return { results: [] };
    // 搜索前以真相源重建（含 messages 展开），保证新会话/新消息可被命中
    const truth = upstreamSessionList();
    index?.rebuild(truth, (id) => {
      const loaded = new SessionManager(sessionsDir()).load(id);
      const messages = loaded ? loaded.messages : [];
      return messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => textOf(m));
    });
    return { results: index?.search(query.trim()) ?? [] };
  });

  ipcMain.handle("hcode/session/rename", (_e, payload: unknown) => {
    const { id, title } = (payload ?? {}) as { id?: unknown; title?: unknown };
    if (typeof id !== "string" || id.length === 0) throw new Error("需要会话 id");
    if (typeof title !== "string" || title.trim().length === 0) throw new Error("需要非空标题");
    const sessionsDirPath = path.join(sessionsDir(), `${id}.jsonl`);
    if (!fs.existsSync(sessionsDirPath)) throw new Error(`找不到会话：${id}`);
    // 读全文改 header 行 title（保留 createdAt/model/cwd），写回；撕裂行原样保留
    const raw = fs.readFileSync(sessionsDirPath, "utf8");
    const lines = raw.split("\n");
    const header = JSON.parse(lines[0]!) as Record<string, unknown>;
    if (header.type !== "session") throw new Error("会话文件头异常");
    header.title = title.trim();
    lines[0] = JSON.stringify(header);
    fs.writeFileSync(sessionsDirPath, lines.join("\n"), "utf8");
    index?.rebuild(upstreamSessionList());
    return { ok: true as const };
  });

  ipcMain.handle("hcode/session/delete", (_e, id: unknown) => {
    if (typeof id !== "string" || id.length === 0) throw new Error("需要会话 id");
    if (bridge?.status().sessionId === id) {
      throw new Error("该会话正在使用中，请先切换到其他会话再删除");
    }
    // 防路径逃逸：id 只允许 uuid 安全字符（先于任何文件操作）
    if (!/^[0-9a-zA-Z-]+$/.test(id)) throw new Error("非法会话 id");
    const file = path.join(sessionsDir(), `${id}.jsonl`);
    if (!fs.existsSync(file)) throw new Error(`找不到会话：${id}`);
    fs.unlinkSync(file);
    index?.rebuild(upstreamSessionList());
    return { ok: true as const };
  });

  ipcMain.handle("hcode/session/list", () => {
    // ADR-0002：上游 list() 是唯一真相源；每次列表都经「rebuild→查询」保证与 JSONL 一致。
    // 注意：此处的 rebuild 不带 loadTexts（会清空 messages 文本表）——全文搜索在
    // hcode/session/search 里按需重建文本索引，避免列表查询全量重读所有 JSONL。
    const truth = upstreamSessionList();
    index?.rebuild(truth);
    return {
      sessions: index?.list() ?? truth,
      currentSessionId: bridge?.status().sessionId ?? null,
    };
  });

  ipcMain.handle("hcode/session/attach", async (_e, id: unknown) => {
    if (typeof id !== "string" || id.length === 0) throw new Error("需要会话 id");
    const summary = new SessionManager(sessionsDir())
      .list()
      .find((s) => s.id === id);
    if (!summary) throw new Error(`找不到会话：${id}`);
    await startSession(summary.cwd, { mode: "attach", id });
    const history = (bridge?.harness.runtime.agent.state.messages ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", text: textOf(m) }));
    return { ok: true as const, projectRoot: summary.cwd, history };
  });

  ipcMain.handle("hcode/permission/respond", async (_e, payload: unknown) => {
    const { id, outcome } = (payload ?? {}) as { id?: unknown; outcome?: unknown };
    if (typeof id !== "number") throw new Error("需要权限请求 id");
    if (outcome !== "once" && outcome !== "always" && outcome !== "deny") {
      throw new Error("需要 once|always|deny 应答");
    }
    requireBridge().respondPermission(id, outcome);
  });

  ipcMain.handle("hcode/mcp/list", () => (bridge ? bridge.listMcp() : []));

  ipcMain.handle("hcode/agents/list", () =>
    bridge ? bridge.subagentReports() : { running: 0, max: 3, workers: [] },
  );

  ipcMain.handle("hcode/model/list", () => (bridge ? bridge.listModels() : []));

  ipcMain.handle("hcode/model/set", async (_e, payload: unknown) => {
    const { provider, id } = (payload ?? {}) as { provider?: unknown; id?: unknown };
    if (typeof provider !== "string" || typeof id !== "string" || id.length === 0) {
      throw new Error("需要 provider 与 id");
    }
    await requireBridge().setModel(provider, id);
    return { ok: true as const };
  });

  ipcMain.handle("hcode/prompt", async (_e, text: unknown) => {
    if (typeof text !== "string" || text.trim().length === 0) throw new Error("prompt 需要非空文本");
    const current = requireBridge();
    armDebugMockScript(current, text);
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
  try {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    index = new SessionIndex(path.join(sessionsDir(), "index.db"));
  } catch (err) {
    console.error("[hcode] 索引层不可用，列表回退上游 list():", err);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void bridge?.dispose();
  index?.close();
  if (process.platform !== "darwin") app.quit();
});
