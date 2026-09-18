// Emitters. Every function here swallows its own errors: logging must never break a tool call.
// Session id = the running trip id (progress.activeTrip.tripId), same as the client's Plan.tripId.
import { DEMO_USER_ID, type Mode, type Plan, type TripSummary } from "@/types/lesson";
import { DEFAULT_COURSE_ID } from "../course";
import { getProgress } from "../store";
import { getDb } from "./db";

export type EventSrc = "server" | "client" | "eleven";

export function currentSessionId(): string | null {
  try {
    return getProgress(DEMO_USER_ID, DEFAULT_COURSE_ID).activeTrip?.tripId ?? null;
  } catch {
    return null;
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    console.warn(`[log] ${(e as Error).message}`);
  }
}

export function logEvent(kind: string, data: unknown = {}, opts: { sessionId?: string | null; src?: EventSrc; ts?: string } = {}): void {
  safe(() => {
    const sessionId = opts.sessionId ?? currentSessionId();
    if (!sessionId) return;
    getDb()
      .prepare("INSERT INTO events (session_id, ts, src, kind, data_json) VALUES (?, ?, ?, ?, ?)")
      .run(sessionId, opts.ts ?? new Date().toISOString(), opts.src ?? "server", kind, JSON.stringify(data ?? {}));
  });
}

export function logEvents(sessionId: string, src: EventSrc, events: { ts?: string; kind: string; data?: unknown }[]): void {
  safe(() => {
    const db = getDb();
    const stmt = db.prepare("INSERT INTO events (session_id, ts, src, kind, data_json) VALUES (?, ?, ?, ?, ?)");
    db.exec("BEGIN");
    try {
      for (const e of events) stmt.run(sessionId, e.ts ?? new Date().toISOString(), src, String(e.kind).slice(0, 40), JSON.stringify(e.data ?? {}));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}

export interface LlmCall {
  provider: "anthropic" | "elevenlabs";
  purpose: "ask" | "grade" | "hint" | "tts" | "stt" | "convai";
  model?: string;
  in?: number;
  cacheRead?: number;
  cacheWrite?: number;
  out?: number;
  chars?: number;
  ms?: number;
  usd?: number;
  credits?: number;
  requestId?: string;
  meta?: unknown;
  sessionId?: string | null;
}

export function logLlm(c: LlmCall): void {
  safe(() => {
    getDb()
      .prepare(
        `INSERT INTO llm_calls (session_id, ts, provider, purpose, model, in_tokens, cache_read, cache_write, out_tokens, chars, ms, usd, credits, request_id, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.sessionId ?? currentSessionId(),
        new Date().toISOString(),
        c.provider,
        c.purpose,
        c.model ?? null,
        c.in ?? null,
        c.cacheRead ?? null,
        c.cacheWrite ?? null,
        c.out ?? null,
        c.chars ?? null,
        c.ms ?? null,
        c.usd ?? null,
        c.credits ?? null,
        c.requestId ?? null,
        c.meta === undefined ? null : JSON.stringify(c.meta),
      );
  });
}

export function openSession(plan: Plan, mode: Mode): void {
  safe(() => {
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO sessions (id, user_id, course_id, mode, started_at, minutes_planned)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(plan.tripId, DEMO_USER_ID, DEFAULT_COURSE_ID, mode, new Date().toISOString(), 0); // minutes_planned: 0 = open-ended
  });
  logEvent("session_start", { mode, startAt: plan.startAt, greeting: plan.greeting }, { sessionId: plan.tripId });
}

export function carrySession(plan: Plan, mode: Mode): void {
  safe(() => {
    getDb().prepare("UPDATE sessions SET mode = ? WHERE id = ?").run(mode, plan.tripId);
  });
  logEvent("session_carry", { mode }, { sessionId: plan.tripId });
}

/** Idempotent like endTrip: a second end (agent tool, then the button) updates nothing and logs nothing. */
export function closeSession(summary: TripSummary): void {
  safe(() => {
    const r = getDb()
      .prepare("UPDATE sessions SET ended_at = ?, summary_json = ? WHERE id = ? AND ended_at IS NULL")
      .run(new Date().toISOString(), JSON.stringify(summary), summary.tripId);
    if (r.changes > 0) logEvent("session_end", summary, { sessionId: summary.tripId });
  });
}

export function attachConversation(sessionId: string, convId: string): void {
  safe(() => {
    getDb().prepare("UPDATE sessions SET conv_id = ? WHERE id = ?").run(convId, sessionId);
  });
  logEvent("conversation", { convId }, { sessionId, src: "client" });
}

export function upsertAudio(sessionId: string, kind: "mic" | "eleven_call", path: string, mime: string, bytes: number, durationMs?: number): void {
  safe(() => {
    getDb()
      .prepare(
        `INSERT INTO audio (session_id, kind, path, mime, bytes, started_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id, kind) DO UPDATE SET bytes = excluded.bytes, duration_ms = COALESCE(excluded.duration_ms, audio.duration_ms)`,
      )
      .run(sessionId, kind, path, mime, bytes, new Date().toISOString(), durationMs ?? null);
  });
}
