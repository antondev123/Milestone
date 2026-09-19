// One readable timeline out of the raw session events. Pure, no imports: scripts/sessions.ts loads it
// under plain Node as well as the admin page.
//
// Every spoken line is stored twice: the client logs `transcript` from the SDK's onMessage (real
// wall-clock time) and the ElevenLabs sync adds its own `transcript` rows (time reconstructed from
// the call's start + offset, but carrying `interrupted`). Tidying keeps the client row, folds the
// eleven copy's `interrupted`/`t` onto it and drops the copy. Unmatched eleven rows stay: the "..."
// silence turns and the synthetic "continue"/"say it" turns, which the client never logs.
// Runs of mode_change (2–4 a second between TTS chunks) collapse into one `mode_flap` row, and the
// per-turn LLM usage / VAD samples / tentative responses are hidden. `raw` returns the input as is.

export interface TimelineEvent {
  id: number;
  ts: string;
  src: string;
  kind: string;
  data: unknown;
}

const MATCH_WINDOW_MS = 20_000;
const FLAP_WINDOW_MS = 3_000;
const FLAP_MIN = 3;
const HIDDEN = new Set(["agent_llm_usage", "vad", "tentative"]);

type D = Record<string, unknown>;
const d = (e: TimelineEvent): D => (e.data && typeof e.data === "object" ? (e.data as D) : {});
const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/(\.\.\.|…)\s*$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function tidyTimeline(events: TimelineEvent[], opts: { raw?: boolean } = {}): TimelineEvent[] {
  if (opts.raw) return events;
  const drop = new Set<number>();
  const merged = new Map<number, D>();

  // 1. fold the eleven transcript copies onto the client rows
  const client = events.filter((e) => e.src === "client" && e.kind === "transcript");
  const taken = new Set<number>();
  for (const e of events) {
    if (e.src !== "eleven" || e.kind !== "transcript") continue;
    const x = d(e);
    const text = norm(x.text);
    if (!text) continue;
    const t = new Date(e.ts).getTime();
    let best: TimelineEvent | null = null;
    let bestGap = Infinity;
    for (const c of client) {
      if (taken.has(c.id) || d(c).role !== x.role) continue;
      const gap = Math.abs(new Date(c.ts).getTime() - t);
      if (gap > MATCH_WINDOW_MS || gap >= bestGap) continue;
      const ct = norm(d(c).text);
      // the eleven copy of an interrupted line is cut where the speech stopped
      if (ct === text || ct.startsWith(text) || text.startsWith(ct)) {
        best = c;
        bestGap = gap;
      }
    }
    if (!best) continue;
    taken.add(best.id);
    drop.add(e.id);
    const extra: D = {};
    if (x.interrupted === true) extra.interrupted = true;
    if (x.t !== undefined) extra.t = x.t;
    merged.set(best.id, { ...d(best), ...extra });
  }

  // 2. hide the noise, collapse mode flaps
  const out: TimelineEvent[] = [];
  let flap: { first: TimelineEvent; n: number; lastTs: number; last: unknown } | null = null;
  const flushFlap = () => {
    if (!flap) return;
    if (flap.n >= FLAP_MIN) out.push({ ...flap.first, kind: "mode_flap", data: { n: flap.n, ms: flap.lastTs - new Date(flap.first.ts).getTime(), last: flap.last } });
    else out.push(...flapRows);
    flap = null;
    flapRows.length = 0;
  };
  const flapRows: TimelineEvent[] = [];
  for (const e of events) {
    if (drop.has(e.id) || HIDDEN.has(e.kind)) continue;
    if (e.kind === "mode_change") {
      const t = new Date(e.ts).getTime();
      if (flap && t - flap.lastTs <= FLAP_WINDOW_MS) {
        flap.n += 1;
        flap.lastTs = t;
        flap.last = d(e).mode;
        flapRows.push(e);
        continue;
      }
      flushFlap();
      flap = { first: e, n: 1, lastTs: t, last: d(e).mode };
      flapRows.push(e);
      continue;
    }
    flushFlap();
    out.push(merged.has(e.id) ? { ...e, data: merged.get(e.id) } : e);
  }
  flushFlap();
  return out;
}
