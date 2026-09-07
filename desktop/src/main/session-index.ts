import { DatabaseSync } from "node:sqlite";
import type { SessionSummary } from "../../../src/session/types.js";

/**
 * SQLite 会话索引（ADR-0002：JSONL 唯一真相源，本层只是可随时 drop+rebuild 的衍生层）。
 * node:sqlite（Electron ≥35 / Node ≥22.13 内置）——零原生依赖，vitest 与 Electron 主进程同用。
 * 全部查询参数化；rebuild 以事务整体替换，消费上游 list()（撕裂行已在源头容忍）。
 */

interface SessionRow {
  id: string;
  cwd: string;
  model: string;
  title: string | null;
  created_at: string;
  modified_at: string;
  message_count: number;
}

interface SessionRow {
  id: string;
  cwd: string;
  model: string;
  title: string | null;
  created_at: string;
  modified_at: string;
  message_count: number;
}

export interface SearchHit {
  sessionId: string;
  title?: string;
  role: string;
  snippet: string;
}

export class SessionIndex {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      cwd TEXT NOT NULL,
      model TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      message_count INTEGER NOT NULL
    )`);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_modified ON sessions (modified_at DESC)");
    this.db.exec(`CREATE TABLE IF NOT EXISTS messages (
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL
    )`);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id)");
  }

  /**
   * 以真相源快照整体替换索引（幂等）。loadTexts 提供每个会话的可搜索文本
   * （user/assistant；工具结果噪声大不入索引），未提供则仅重建 sessions 表。
   */
  rebuild(
    sessions: readonly SessionSummary[],
    loadTexts?: (id: string) => string[],
  ): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM sessions");
      this.db.exec("DELETE FROM messages");
      const insertSession = this.db.prepare(
        "INSERT INTO sessions (id, cwd, model, title, created_at, modified_at, message_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const insertMessage = this.db.prepare(
        "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
      );
      for (const s of sessions) {
        insertSession.run(s.id, s.cwd, s.model, s.title ?? null, s.createdAt, s.modifiedAt, s.messageCount);
        if (loadTexts) {
          for (const text of loadTexts(s.id)) {
            insertMessage.run(s.id, "text", text);
          }
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** 参数化 LIKE 搜索（ESCAPE 转义 %_\），按会话新近度排序，返回命中片段。 */
  search(rawQuery: string): SearchHit[] {
    const escaped = rawQuery.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const rows = this.db
      .prepare(
        `SELECT m.session_id AS sessionId, s.title AS title, s.modified_at AS modifiedAt, m.content AS content
         FROM messages m JOIN sessions s ON s.id = m.session_id
         WHERE m.content LIKE ? ESCAPE '\\'
         ORDER BY s.modified_at DESC, m.rowid`,
      )
      .all(`%${escaped}%`) as unknown as Array<{
      sessionId: string;
      title: string | null;
      modifiedAt: string;
      content: string;
    }>;
    return rows.map((row) => ({
      sessionId: row.sessionId,
      title: row.title ?? undefined,
      role: "text",
      snippet: snippet(row.content, rawQuery),
    }));
  }

  list(): SessionSummary[] {
    const rows = this.db
      .prepare(
        "SELECT id, cwd, model, title, created_at, modified_at, message_count FROM sessions ORDER BY modified_at DESC",
      )
      .all() as unknown as SessionRow[];
    return rows.map((row) => ({
      id: row.id,
      cwd: row.cwd,
      model: row.model,
      title: row.title ?? undefined,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      messageCount: row.message_count,
    }));
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}

function snippet(content: string, query: string, radius = 40): string {
  const at = content.indexOf(query);
  if (at === -1) return content.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(content.length, at + query.length + radius);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}
