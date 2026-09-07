import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionIndex } from "../src/main/session-index";
import { SessionManager } from "../../src/session/manager.js";
import type { SessionSummary } from "../../src/session/types";

let home: string;
let dbPath: string;

const summary = (id: string, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id,
  cwd: "D:/proj",
  model: "mock",
  createdAt: "2026-09-05T00:00:00.000Z",
  modifiedAt: "2026-09-05T01:00:00.000Z",
  messageCount: 2,
  ...overrides,
});

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "hcode-index-"));
  dbPath = path.join(home, "sessions", "index.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
});

describe("SessionIndex（SQLite 索引层）", () => {
  it("rebuild→list 往返一致（含 title 缺省）", () => {
    const index = new SessionIndex(dbPath);
    const source = [
      summary("a", { title: "第一轮对话", modifiedAt: "2026-09-05T02:00:00.000Z" }),
      summary("b"),
    ];
    index.rebuild(source);
    const rows = index.list();
    expect(index.count()).toBe(2);
    expect(rows[0]!.id).toBe("a"); // modified_at 倒序
    expect(rows[0]!.title).toBe("第一轮对话");
    expect(rows[1]!.title).toBeUndefined();
    index.close();
  });

  it("rebuild 幂等：连调两次不重复", () => {
    const index = new SessionIndex(dbPath);
    const source = [summary("a"), summary("b"), summary("c")];
    index.rebuild(source);
    index.rebuild(source);
    expect(index.count()).toBe(3);
    index.close();
  });

  it("drop 文件重建实例后为空，rebuild 后恢复一致", () => {
    let index = new SessionIndex(dbPath);
    index.rebuild([summary("a")]);
    index.close();
    fs.rmSync(dbPath);
    index = new SessionIndex(dbPath);
    expect(index.count()).toBe(0);
    index.rebuild([summary("a")]);
    expect(index.list().map((s) => s.id)).toEqual(["a"]);
    index.close();
  });

  it("list 输出即上游 SessionSummary 形状（渲染端契约不变）", () => {
    const index = new SessionIndex(dbPath);
    index.rebuild([summary("a", { title: "t" })]);
    const row = index.list()[0]!;
    expect(Object.keys(row).sort()).toEqual(
      ["createdAt", "cwd", "id", "messageCount", "model", "modifiedAt", "title"].sort(),
    );
    index.close();
  });
});

describe("SessionIndex.search（P2 会话全文搜索）", () => {
  it("rebuild 含文本 → LIKE 命中用户/助手文本、转义与无结果", () => {
    const index = new SessionIndex(dbPath);
    index.rebuild([summary("a", { title: "修复除零" }), summary("b")], (id) =>
      id === "a" ? ["修复 utils.py 的除零 bug", "已把 a - b 改成 a + b 并跑通测试"] : ["无关会话内容"],
    );

    expect(index.search("除零").map((h) => h.sessionId)).toEqual(["a"]);
    const hit = index.search("除零")[0]!;
    expect(hit.title).toBe("修复除零");
    expect(hit.snippet).toContain("除零");

    // 特殊字符转义：100% 作为字面量查询不炸且不误命中
    expect(index.search("100%")).toEqual([]);
    // 无结果
    expect(index.search("不存在的关键词xyz")).toEqual([]);
    index.close();
  });

  it("rebuild 未提供 loadTexts 时 messages 表为空、search 返回空", () => {
    const index = new SessionIndex(dbPath);
    index.rebuild([summary("a")]);
    expect(index.search("任意")).toEqual([]);
    index.close();
  });
});

it("撕裂行 JSONL 不污染索引（P2-T1 直测：经上游 load 的容忍）", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hcode-torn-"));
  const mgr = new SessionManager(path.join(home, "sessions"));
  const id = mgr.start(home, "mock");
  const good = JSON.stringify({ type: "message", message: { role: "user", content: "搜索关键词甲" } });
  const torn = '{"type":"message","message":{"role":"user","content":"被截断的半';
  fs.appendFileSync(path.join(home, "sessions", `${id}.jsonl`), good + "\n" + torn);

  const index = new SessionIndex(dbPath);
  const sessions = mgr.list();
  const texts = new Map<string, string[]>();
  for (const s of sessions) {
    texts.set(
      s.id,
      (mgr.load(s.id)?.messages ?? [])
        .filter((m: { role?: string }) => m.role === "user" || m.role === "assistant")
        .map((m) => JSON.stringify((m as { content?: unknown }).content ?? "")),
    );
  }
  index.rebuild(sessions, (sid) => texts.get(sid) ?? []);
  expect(index.count()).toBe(1);
  expect(index.search("搜索关键词甲").length).toBe(1);
  expect(index.search("被截断的半")).toEqual([]);
  index.close();
});
