// Read side, shared by the admin pages, /api/log and scripts/sessions.ts.
import { getDb, type AudioRow, type EventRow, type LlmRow, type SessionRow } from "./db";

export interface SessionListItem {
  id: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  minutesPlanned: number | null;
  convId: string | null;
  synced: boolean;
  events: number;
  toolCalls: number;
  errors: number;
  usd: number;
  credits: number;
  audio: string[];
  correct: number | null;
  total: number | null;
}

export interface SessionEvent {
  id: number;
  ts: string;
  src: string;
  kind: string;
  data: unknown;
}

export interface LlmTotals {
  purpose: string;
  calls: number;
  inTokens: number;
  cacheRead: number;
  outTokens: number;
  chars: number;
  ms: number;
  usd: number;
  credits: number;
}

export interface SessionDetail {
  session: {
    id: string;
    userId: string;
    courseId: string;
    mode: string;
    startedAt: string;
    endedAt: string | null;
    minutesPlanned: number | null;
    convId: string | null;
    elevenSyncedAt: string | null;
    summary: unknown;
  };
  events: SessionEvent[];
  llm: (Omit<LlmRow, "meta_json"> & { meta: unknown })[];
  totals: LlmTotals[];
  audio: AudioRow[];
}

function parse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function listSessions(limit = 100): SessionListItem[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?").all(limit) as SessionRow[];
  const counts = db.prepare("SELECT count(*) AS n, sum(kind = 'tool_call') AS tools, sum(kind LIKE '%error%' OR (kind = 'tool_call' AND data_json LIKE '%\"ok\":false%')) AS errors FROM events WHERE session_id = ?");
  const money = db.prepare("SELECT coalesce(sum(usd), 0) AS usd, coalesce(sum(credits), 0) AS credits FROM llm_calls WHERE session_id = ?");
  const audio = db.prepare("SELECT kind FROM audio WHERE session_id = ? AND bytes > 0");
  return rows.map((r) => {
    const c = counts.get(r.id) as { n: number; tools: number | null; errors: number | null };
    const m = money.get(r.id) as { usd: number; credits: number };
    const summary = parse(r.summary_json) as { correct?: number; total?: number } | null;
    return {
      id: r.id,
      mode: r.mode,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      minutesPlanned: r.minutes_planned,
      convId: r.conv_id,
      synced: !!r.eleven_synced_at,
      events: c.n,
      toolCalls: c.tools ?? 0,
      errors: c.errors ?? 0,
      usd: m.usd,
      credits: m.credits,
      audio: (audio.all(r.id) as { kind: string }[]).map((a) => a.kind),
      correct: summary?.correct ?? null,
      total: summary?.total ?? null,
    };
  });
}

export function getSession(id: string): SessionDetail | null {
  const db = getDb();
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  if (!s) return null;
  const events = (db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY ts, id").all(id) as EventRow[]).map((e) => ({
    id: e.id,
    ts: e.ts,
    src: e.src,
    kind: e.kind,
    data: parse(e.data_json),
  }));
  const llm = (db.prepare("SELECT * FROM llm_calls WHERE session_id = ? ORDER BY ts, id").all(id) as LlmRow[]).map(({ meta_json, ...r }) => ({ ...r, meta: parse(meta_json) }));
  const totals = db
    .prepare(
      `SELECT purpose, count(*) AS calls, coalesce(sum(in_tokens),0) AS inTokens, coalesce(sum(cache_read),0) AS cacheRead,
              coalesce(sum(out_tokens),0) AS outTokens, coalesce(sum(chars),0) AS chars, coalesce(sum(ms),0) AS ms,
              coalesce(sum(usd),0) AS usd, coalesce(sum(credits),0) AS credits
       FROM llm_calls WHERE session_id = ? GROUP BY purpose ORDER BY purpose`,
    )
    .all(id) as unknown as LlmTotals[];
  const audio = db.prepare("SELECT * FROM audio WHERE session_id = ? ORDER BY kind").all(id) as AudioRow[];
  return {
    session: {
      id: s.id,
      userId: s.user_id,
      courseId: s.course_id,
      mode: s.mode,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      minutesPlanned: s.minutes_planned,
      convId: s.conv_id,
      elevenSyncedAt: s.eleven_synced_at,
      summary: parse(s.summary_json),
    },
    events,
    llm,
    totals,
    audio,
  };
}

export function getAudio(sessionId: string, kind: string): AudioRow | null {
  return (getDb().prepare("SELECT * FROM audio WHERE session_id = ? AND kind = ?").get(sessionId, kind) as AudioRow | undefined) ?? null;
}
