// Session log from the terminal. Reads the SQLite file directly (no server needed) except `sync`.
//   npm run sessions                    → list sessions, newest first
//   npm run sessions -- <tripId>        → timeline + usage for one session
//   npm run sessions -- <tripId> --json → the same as JSON (what /api/log/sessions/<id> returns)
//   npm run sessions -- sync <tripId>   → pull the ElevenLabs transcript + recording via the running
//                                         server (NEXT_PUBLIC_BASE_URL, default http://localhost:3000)
// Same LOG_DIR rule as the app: data/progress/logs unless the env says otherwise.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = process.env.LOG_DIR || join(process.cwd(), "data", "progress", "logs");
const file = join(dir, "milestone.db");
const [a, b, c] = process.argv.slice(2);

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { hour12: false }) : "—");
const short = (v: unknown, n = 160) => {
  const t = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

if (a === "sync") {
  if (!b) throw new Error("usage: npm run sessions -- sync <tripId>");
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const key = process.env.ADMIN_SECRET ? `&key=${encodeURIComponent(process.env.ADMIN_SECRET)}` : "";
  const r = await fetch(`${base}/api/log/sync?session=${encodeURIComponent(b)}${key}`, { method: "POST" });
  console.log(r.status, await r.text());
  process.exit(r.ok ? 0 : 1);
}

if (!existsSync(file)) {
  console.log(`no session log yet at ${file}`);
  process.exit(0);
}
const db = new DatabaseSync(file, { readOnly: true });

type S = { id: string; mode: string; started_at: string; ended_at: string | null; minutes_planned: number | null; conv_id: string | null; eleven_synced_at: string | null; summary_json: string | null };

if (!a) {
  const rows = db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 100").all() as unknown as S[];
  if (rows.length === 0) console.log("no sessions logged yet");
  for (const r of rows) {
    const n = (db.prepare("SELECT count(*) AS n, sum(kind='tool_call') AS t FROM events WHERE session_id = ?").get(r.id) as unknown as { n: number; t: number | null });
    const m = db.prepare("SELECT coalesce(sum(usd),0) AS usd, coalesce(sum(credits),0) AS cr FROM llm_calls WHERE session_id = ?").get(r.id) as unknown as { usd: number; cr: number };
    const sum = r.summary_json ? (JSON.parse(r.summary_json) as { correct?: number; total?: number }) : null;
    const dur = r.ended_at ? `${Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 60000)} min` : "open";
    console.log(
      `${r.id.padEnd(16)} ${r.mode.padEnd(6)} ${when(r.started_at)}  ${dur.padStart(7)}  ${n.n} ev / ${n.t ?? 0} tools  $${m.usd.toFixed(4)} ${m.cr ? `${Math.round(m.cr)} cr` : ""} ${sum ? `${sum.correct}/${sum.total}` : ""} ${r.conv_id ? (r.eleven_synced_at ? "11L✓" : "11L…") : ""}`,
    );
  }
  process.exit(0);
}

const sess = db.prepare("SELECT * FROM sessions WHERE id = ?").get(a) as unknown as S | undefined;
if (!sess) {
  console.error(`no session ${a}`);
  process.exit(1);
}
const events = db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY ts, id").all(a) as unknown as { ts: string; src: string; kind: string; data_json: string }[];
const llm = db.prepare("SELECT * FROM llm_calls WHERE session_id = ? ORDER BY ts, id").all(a) as unknown as Record<string, unknown>[];
const audio = db.prepare("SELECT * FROM audio WHERE session_id = ?").all(a) as unknown as Record<string, unknown>[];

if (b === "--json" || c === "--json") {
  console.log(
    JSON.stringify(
      {
        session: { ...sess, summary: sess.summary_json ? JSON.parse(sess.summary_json) : null, summary_json: undefined },
        events: events.map((e) => ({ ...e, data: JSON.parse(e.data_json), data_json: undefined })),
        llm,
        audio,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`${sess.id}  ${sess.mode}  ${when(sess.started_at)} → ${when(sess.ended_at)}  planned ${sess.minutes_planned ?? "—"} min`);
if (sess.conv_id) console.log(`ElevenLabs conversation ${sess.conv_id}  synced ${when(sess.eleven_synced_at)}`);
for (const r of audio) console.log(`audio: ${r.kind}  ${r.path}  ${Math.round(Number(r.bytes) / 1024)} KB`);
if (llm.length) {
  console.log("\nusage:");
  let usd = 0;
  for (const r of llm) {
    usd += Number(r.usd ?? 0);
    console.log(`  ${clock(String(r.ts))}  ${String(r.purpose).padEnd(6)} ${String(r.model ?? "").padEnd(18)} in=${r.in_tokens ?? "-"} cached=${r.cache_read ?? "-"} out=${r.out_tokens ?? "-"} ${r.chars ? `chars=${r.chars}` : ""} ${r.ms}ms $${Number(r.usd ?? 0).toFixed(4)} ${r.credits ? `${r.credits} cr` : ""}`);
  }
  console.log(`  total $${usd.toFixed(4)}`);
}
console.log(`\ntimeline (${events.length}):`);
for (const e of events) {
  const x = JSON.parse(e.data_json) as Record<string, unknown>;
  let line: string;
  switch (e.kind) {
    case "transcript":
      line = `${x.role === "user" ? "LEARNER" : "TUTOR  "} ${short(x.text, 300)}${x.interrupted ? " [interrupted]" : ""}`;
      break;
    case "tool_call": {
      const rep = (x.reply as Record<string, unknown> | undefined) ?? {};
      line = `tool ${x.tool} ${x.ms}ms${x.ok === false ? ` ERROR ${x.error}` : ""}${Object.keys((x.req as object) ?? {}).length ? ` in=${short(x.req, 120)}` : ""}${rep.say ? ` say="${short(rep.say, 160)}"` : ""}${rep.correct !== undefined ? (rep.correct ? " ✓" : " ✗") : ""}`;
      break;
    }
    default:
      line = `${e.kind} ${short(x, 200)}`;
  }
  console.log(`  ${clock(e.ts)} ${e.src.padEnd(6)} ${line}`);
}
