import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionIndex } from "../src/main/session-index";
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
