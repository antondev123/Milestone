// Session log store: one SQLite file under LOG_DIR (default data/progress/logs, a subdirectory of
// the progress volume so it survives demo-reset and lives on the Fly volume). Uses node:sqlite,
// built into Node 24, so there is no dependency. Read-only FS → in-memory DB, warned once.
// Append-only tables; the file is the source of truth across dev module instances.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function logDir(): string {
  return process.env.LOG_DIR || join(process.cwd(), "data", "progress", "logs");
}

export function audioDir(sessionId: string): string {
  return join(logDir(), "audio", sessionId.replace(/[^a-z0-9_-]+/gi, "_"));
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  minutes_planned INTEGER,
  conv_id TEXT,
  eleven_synced_at TEXT,
  summary_json TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  src TEXT NOT NULL,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_session_ts ON events(session_id, ts);
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  ts TEXT NOT NULL,
  provider TEXT NOT NULL,
  purpose TEXT NOT NULL,
  model TEXT,
  in_tokens INTEGER,
  cache_read INTEGER,
  cache_write INTEGER,
  out_tokens INTEGER,
  chars INTEGER,
  ms INTEGER,
  usd REAL,
  credits REAL,
  request_id TEXT,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS llm_calls_session ON llm_calls(session_id);
CREATE TABLE IF NOT EXISTS audio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  duration_ms INTEGER,
  UNIQUE(session_id, kind)
);
`;

let db: DatabaseSync | null = null;
let inMemory = false;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = logDir();
  try {
    mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    db = new DatabaseSync(join(dir, "milestone.db"));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;");
  } catch (e) {
    console.warn(`[log] ${dir} not writable (${(e as Error).message}); session log is in memory only`);
    db = new DatabaseSync(":memory:");
    inMemory = true;
  }
  db.exec(SCHEMA);
  return db;
}

export function isInMemory(): boolean {
  return inMemory;
}

export type SessionRow = {
  id: string;
  user_id: string;
  course_id: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  minutes_planned: number | null;
  conv_id: string | null;
  eleven_synced_at: string | null;
  summary_json: string | null;
};

export type EventRow = { id: number; session_id: string; ts: string; src: string; kind: string; data_json: string };

export type LlmRow = {
  id: number;
  session_id: string | null;
  ts: string;
  provider: string;
  purpose: string;
  model: string | null;
  in_tokens: number | null;
  cache_read: number | null;
  cache_write: number | null;
  out_tokens: number | null;
  chars: number | null;
  ms: number | null;
  usd: number | null;
  credits: number | null;
  request_id: string | null;
  meta_json: string | null;
};

export type AudioRow = {
  id: number;
  session_id: string;
  kind: string;
  path: string;
  mime: string;
  bytes: number;
  started_at: string | null;
  duration_ms: number | null;
};
