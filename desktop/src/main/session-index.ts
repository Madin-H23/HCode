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
  }

  /** 以真相源快照整体替换索引（幂等）。 */
  rebuild(sessions: readonly SessionSummary[]): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM sessions");
      const insert = this.db.prepare(
        "INSERT INTO sessions (id, cwd, model, title, created_at, modified_at, message_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const s of sessions) {
        insert.run(s.id, s.cwd, s.model, s.title ?? null, s.createdAt, s.modifiedAt, s.messageCount);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
