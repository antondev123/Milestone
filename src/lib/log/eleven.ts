// Pull what ElevenLabs kept of a voice call: the server-side transcript (with tool calls and
// timings), the credit cost, and the full call recording. Runs after end_trip and on demand.
// Same endpoints scripts/ledger.ts already uses. Needs ELEVENLABS_API_KEY.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { audioDir, getDb, type SessionRow } from "./db";
import { logEvents, logLlm, upsertAudio } from "./log";

type Turn = {
  role: "user" | "agent";
  message: string | null;
  time_in_call_secs?: number;
  interrupted?: boolean;
  tool_calls?: { tool_name?: string; params_as_json?: string; request_id?: string }[];
  tool_results?: { tool_name?: string; result_value?: string; is_error?: boolean; tool_latency_secs?: number }[];
  llm_usage?: unknown;
  conversation_turn_metrics?: unknown;
};

type Detail = {
  status?: string;
  transcript?: Turn[];
  metadata?: { start_time_unix_secs?: number; call_duration_secs?: number; cost?: number; charging?: unknown; termination_reason?: string };
  has_audio?: boolean;
  has_user_audio?: boolean;
  analysis?: unknown;
};

export type SyncResult = { ok: true; turns: number; audio: boolean; credits: number } | { ok: false; error: string };

export async function syncConversation(sessionId: string): Promise<SyncResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, error: "ELEVENLABS_API_KEY not set" };
  const db = getDb();
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
  if (!s) return { ok: false, error: `unknown session ${sessionId}` };
  if (!s.conv_id) return { ok: false, error: "no ElevenLabs conversation attached (text/study session, or the call never connected)" };
  const H = { "xi-api-key": key };
  const base = `https://api.elevenlabs.io/v1/convai/conversations/${s.conv_id}`;

  const res = await fetch(base, { headers: H });
  if (!res.ok) return { ok: false, error: `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const d = (await res.json()) as Detail;
  if (d.status && d.status !== "done" && d.status !== "failed") return { ok: false, error: `conversation still ${d.status}; try again shortly` };

  // replace any earlier eleven-sourced rows so a re-sync is idempotent
  db.prepare("DELETE FROM events WHERE session_id = ? AND src = 'eleven'").run(sessionId);
  db.prepare("DELETE FROM llm_calls WHERE session_id = ? AND purpose = 'convai'").run(sessionId);

  const start = (d.metadata?.start_time_unix_secs ?? Math.floor(new Date(s.started_at).getTime() / 1000)) * 1000;
  const at = (secs?: number) => new Date(start + (secs ?? 0) * 1000).toISOString();
  const events: { ts: string; kind: string; data: unknown }[] = [];
  for (const t of d.transcript ?? []) {
    const ts = at(t.time_in_call_secs);
    if (t.message)
      events.push({ ts, kind: "transcript", data: { role: t.role, text: t.message, t: t.time_in_call_secs, interrupted: t.interrupted ?? false } });
    for (const tc of t.tool_calls ?? []) events.push({ ts, kind: "agent_tool_call", data: { tool: tc.tool_name, params: tc.params_as_json, requestId: tc.request_id } });
    for (const tr of t.tool_results ?? [])
      events.push({ ts, kind: "agent_tool_result", data: { tool: tr.tool_name, result: tr.result_value?.slice(0, 2000), error: tr.is_error ?? false, latencySecs: tr.tool_latency_secs } });
    if (t.llm_usage) events.push({ ts, kind: "agent_llm_usage", data: t.llm_usage });
  }
  events.push({ ts: at(d.metadata?.call_duration_secs), kind: "call_end", data: { durationSecs: d.metadata?.call_duration_secs, reason: d.metadata?.termination_reason, analysis: d.analysis } });
  logEvents(sessionId, "eleven", events);

  const credits = d.metadata?.cost ?? 0;
  logLlm({
    provider: "elevenlabs",
    purpose: "convai",
    sessionId,
    credits,
    ms: Math.round((d.metadata?.call_duration_secs ?? 0) * 1000),
    // creator tier list price, same as scripts/ledger.ts
    usd: (credits * 22) / 100_000,
    meta: { charging: d.metadata?.charging, turns: d.transcript?.length ?? 0 },
  });

  let audio = false;
  if (d.has_audio !== false) {
    const a = await fetch(`${base}/audio`, { headers: H });
    if (a.ok && (a.headers.get("content-type") ?? "").startsWith("audio/")) {
      const buf = Buffer.from(await a.arrayBuffer());
      // a text-only call yields a header-only mp3 (~45 bytes); not a recording
      if (buf.length > 1024) {
        const dir = audioDir(sessionId);
        mkdirSync(dir, { recursive: true });
        const p = join(dir, "eleven-call.mp3");
        writeFileSync(p, buf);
        upsertAudio(sessionId, "eleven_call", p, a.headers.get("content-type") || "audio/mpeg", buf.length, Math.round((d.metadata?.call_duration_secs ?? 0) * 1000));
        audio = true;
      }
    }
  }
  db.prepare("UPDATE sessions SET eleven_synced_at = ? WHERE id = ?").run(new Date().toISOString(), sessionId);
  return { ok: true, turns: d.transcript?.length ?? 0, audio, credits };
}

/** Fire-and-forget after a voice trip ends. ElevenLabs finalises a call 10–30 s after hang-up. */
export function scheduleSync(sessionId: string): void {
  if (!process.env.ELEVENLABS_API_KEY) return;
  const attempt = (n: number) => {
    syncConversation(sessionId)
      .then((r) => {
        if (r.ok) console.log(`[log] eleven sync ${sessionId}: ${r.turns} turns, ${r.credits} credits${r.audio ? ", audio" : ""}`);
        else if (n < 3 && /still/.test(r.error)) setTimeout(() => attempt(n + 1), 30_000).unref?.();
        else console.warn(`[log] eleven sync ${sessionId}: ${r.error}`);
      })
      .catch((e) => console.warn(`[log] eleven sync ${sessionId}: ${(e as Error).message}`));
  };
  setTimeout(() => attempt(0), 20_000).unref?.();
}
