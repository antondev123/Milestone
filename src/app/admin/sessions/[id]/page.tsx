// /admin/sessions/<tripId> — one trip in depth: recordings, LLM usage, and the full timeline
// (server tool calls, client transcript and events, ElevenLabs' own transcript) merged by time.
import Link from "next/link";
import { getSession, type SessionEvent } from "@/lib/log/query";
import { Denied, Frame, fmtClock, fmtDur, fmtTime, fmtUsd, gate } from "../shared";

export const dynamic = "force-dynamic";

type D = Record<string, unknown>;
const d = (e: SessionEvent) => (e.data && typeof e.data === "object" ? (e.data as D) : {});
const s = (v: unknown, max = 400) => {
  const t = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
  return t.length > max ? t.slice(0, max) + "…" : t;
};

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[12px] text-muted">{label}</summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded bg-ground p-2 text-[12px] leading-snug whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

/** One timeline row. Transcript lines read as chat; everything else is a labelled marker. */
function Row({ e }: { e: SessionEvent }) {
  const x = d(e);
  const srcTag = <span className="rounded bg-ground px-1.5 py-0.5 font-mono text-[11px] text-muted">{e.src}</span>;
  let body: React.ReactNode;
  let tone = "";
  switch (e.kind) {
    case "transcript": {
      const user = x.role === "user";
      body = (
        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] ${user ? "ml-auto bg-ink text-ground" : "bg-ground"}`}>
          <span className="mr-2 text-[11px] uppercase tracking-wide opacity-60">{user ? "learner" : "tutor"}</span>
          {s(x.text, 2000)}
          {x.interrupted === true && <span className="ml-2 text-[11px] text-gold">interrupted</span>}
        </div>
      );
      break;
    }
    case "tool_call": {
      const ok = x.ok !== false;
      const reply = (x.reply as D | undefined) ?? {};
      tone = ok ? "" : "text-gold";
      body = (
        <div>
          <span className="font-mono font-semibold">{s(x.tool)}</span> <span className="text-muted">{s(x.mode)}</span> · <span className={Number(x.ms) > 1500 ? "text-gold" : ""}>{s(x.ms)} ms</span>
          {!ok && <span className="ml-2 font-semibold text-gold">error: {s(x.error)}</span>}
          {Object.keys((x.req as D) ?? {}).length > 0 && <div className="mt-1 text-[13px] text-muted">in: {s(x.req, 300)}</div>}
          {reply.say != null && (
            <div className="mt-1 text-[14px]">
              <span className="text-muted">say:</span> {s(reply.say, 600)}{" "}
              {reply.correct !== undefined && <span className={`ml-1 text-[12px] ${reply.correct ? "text-ink" : "text-gold"}`}>[{reply.correct ? "correct" : "wrong"}]</span>}
              {reply.loc ? <span className="ml-2 font-mono text-[11px] text-muted">{s(reply.loc)}</span> : null}
            </div>
          )}
          <Json label="raw" value={e.data} />
        </div>
      );
      break;
    }
    case "client_error":
      tone = "text-gold";
      body = (
        <div>
          <span className="font-semibold">client error</span> {s(x.message, 300)}
          <Json label="details" value={e.data} />
        </div>
      );
      break;
    case "session_start":
      body = (
        <div>
          <span className="font-semibold">session start</span> · {s(x.mode)} · {s(x.minutes)} min · {Array.isArray(x.segmentIds) ? x.segmentIds.length : 0} legs
          {x.greeting ? <div className="text-[13px] text-muted">“{s(x.greeting, 300)}”</div> : null}
          <Json label="plan" value={e.data} />
        </div>
      );
      break;
    case "session_end":
      body = (
        <div>
          <span className="font-semibold">session end</span> · {s(x.correct)}/{s(x.total)} correct · {s(x.minutes)} min · streak {s(x.streakDays)}
          <Json label="summary" value={e.data} />
        </div>
      );
      break;
    case "agent_llm_usage": {
      // ElevenLabs' per-turn passthrough LLM usage: { model_usage: { <model>: { input: {tokens, price}, output_total: {...} } } }
      const mu = (x.model_usage as Record<string, Record<string, { tokens?: number; price?: number }>> | undefined) ?? {};
      body = (
        <span className="text-[12px] text-muted">
          agent llm{" "}
          {Object.entries(mu).map(([model, u]) => {
            const price = Object.values(u).reduce((a, v) => a + (v?.price ?? 0), 0);
            return `${model}: in ${u.input?.tokens ?? "?"} out ${u.output_total?.tokens ?? "?"} $${price.toFixed(4)}`;
          }).join(" · ") || s(e.data, 200)}
        </span>
      );
      break;
    }
    case "tentative":
      body = <span className="text-[13px] text-muted italic">tentative: {s(x.text, 300)}</span>;
      break;
    case "agent_tool_call":
      body = (
        <span className="text-[13px] text-muted">
          agent → <span className="font-mono">{s(x.tool)}</span> {s(x.params, 200)}
        </span>
      );
      break;
    case "agent_tool_result":
      body = (
        <span className={`text-[13px] ${x.error ? "text-gold" : "text-muted"}`}>
          <span className="font-mono">{s(x.tool)}</span> ← {s(x.result, 200)} {x.latencySecs != null ? `(${Number(x.latencySecs).toFixed(2)} s)` : ""}
        </span>
      );
      break;
    default:
      body = (
        <div className="text-[13px]">
          <span className="font-semibold">{e.kind}</span> <span className="text-muted">{s(e.data, 240)}</span>
          {typeof e.data === "object" && JSON.stringify(e.data).length > 240 && <Json label="raw" value={e.data} />}
        </div>
      );
  }
  return (
    <li className={`grid grid-cols-[92px_60px_1fr] items-start gap-3 border-t border-rule/60 py-2 ${tone}`}>
      <span className="pt-0.5 font-mono text-[12px] text-muted">{fmtClock(e.ts)}</span>
      <span className="pt-0.5">{srcTag}</span>
      <div className="min-w-0">{body}</div>
    </li>
  );
}

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> }) {
  const { ok, q } = await gate(searchParams);
  if (!ok) return <Denied />;
  const { id } = await params;
  const sd = getSession(id);
  if (!sd)
    return (
      <Frame title="No such session">
        <Link className="underline" href={`/admin/sessions${q}`}>
          All sessions
        </Link>
      </Frame>
    );
  const { session, events, llm, totals, audio } = sd;
  const usd = totals.reduce((a, t) => a + t.usd, 0);
  const credits = totals.reduce((a, t) => a + t.credits, 0);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);

  return (
    <Frame
      title={session.id}
      sub={
        <>
          <Link className="underline" href={`/admin/sessions${q}`}>
            All sessions
          </Link>{" "}
          · {session.mode} · {fmtTime(session.startedAt)} → {fmtTime(session.endedAt)} ({fmtDur(session.startedAt, session.endedAt)}) · planned {session.minutesPlanned ?? "—"} min ·{" "}
          <Link className="underline" href={`/api/log/sessions/${session.id}${q}`}>
            JSON
          </Link>
        </>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-panel p-4">
          <h2 className="mb-2 text-[12px] uppercase tracking-wide text-muted">Recordings</h2>
          {audio.length === 0 && <p className="text-[14px] text-muted">None. Mic audio is recorded in Listen mode; the ElevenLabs call arrives with the sync below.</p>}
          {audio.map((a) => (
            <div key={a.kind} className="mb-3">
              <div className="text-[13px]">
                <span className="font-semibold">{a.kind === "mic" ? "Learner mic" : "ElevenLabs call (both sides)"}</span> · {(a.bytes / 1024).toFixed(0)} KB
                {a.duration_ms ? ` · ${Math.round(a.duration_ms / 1000)} s` : ""}
              </div>
              <audio controls preload="none" className="mt-1 w-full" src={`/api/log/audio/${session.id}/${a.kind}${q}`} />
            </div>
          ))}
        </div>
        <div className="min-w-0 rounded-xl bg-panel p-4">
          <h2 className="mb-2 text-[12px] uppercase tracking-wide text-muted">ElevenLabs</h2>
          {session.convId ? (
            <p className="text-[14px]">
              conversation <span className="font-mono">{session.convId}</span>
              <br />
              synced: {session.elevenSyncedAt ? fmtTime(session.elevenSyncedAt) : "not yet"} ·{" "}
              <Link className="underline" href={`/api/log/sync?session=${session.id}${q ? "&" + q.slice(1) : ""}`}>
                sync now
              </Link>
            </p>
          ) : (
            <p className="text-[14px] text-muted">No conversation attached (Read/Study session, or the call never connected).</p>
          )}
          <h2 className="mt-4 mb-2 text-[12px] uppercase tracking-wide text-muted">Summary</h2>
          {session.summary ? <pre className="max-h-40 overflow-auto text-[12px] leading-snug whitespace-pre-wrap break-all">{JSON.stringify(session.summary, null, 1)}</pre> : <p className="text-[14px] text-muted">Trip still open.</p>}
        </div>
      </section>

      <section className="min-w-0 rounded-xl bg-panel p-4">
        <h2 className="mb-2 text-[12px] uppercase tracking-wide text-muted">
          Usage · {fmtUsd(usd)} · {Math.round(credits)} credits
        </h2>
        {llm.length === 0 ? (
          <p className="text-[14px] text-muted">No model or TTS calls.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  {["Purpose", "Calls", "In", "Cached", "Out", "Chars", "Time", "$", "Credits"].map((h) => (
                    <th key={h} className="px-2 py-1 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.purpose} className="border-t border-rule/60">
                    <td className="px-2 py-1 font-semibold">{t.purpose}</td>
                    <td className="px-2 py-1">{t.calls}</td>
                    <td className="px-2 py-1">{t.inTokens || "—"}</td>
                    <td className="px-2 py-1">{t.cacheRead || "—"}</td>
                    <td className="px-2 py-1">{t.outTokens || "—"}</td>
                    <td className="px-2 py-1">{t.chars || "—"}</td>
                    <td className="px-2 py-1">{(t.ms / 1000).toFixed(1)} s</td>
                    <td className="px-2 py-1">{fmtUsd(t.usd)}</td>
                    <td className="px-2 py-1">{t.credits ? Math.round(t.credits) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] text-muted">every call ({llm.length})</summary>
              <table className="mt-1 w-full text-[12px]">
                <tbody>
                  {llm.map((c) => (
                    <tr key={c.id} className="border-t border-rule/60 align-top">
                      <td className="px-2 py-1 font-mono text-muted">{fmtClock(c.ts)}</td>
                      <td className="px-2 py-1 font-semibold">{c.purpose}</td>
                      <td className="px-2 py-1">{c.model}</td>
                      <td className="px-2 py-1">
                        {c.in_tokens != null ? `in ${c.in_tokens}` : ""} {c.cache_read ? `cached ${c.cache_read}` : ""} {c.out_tokens != null ? `out ${c.out_tokens}` : ""} {c.chars ? `${c.chars} chars` : ""}
                      </td>
                      <td className="px-2 py-1">{c.ms} ms</td>
                      <td className="px-2 py-1">{fmtUsd(c.usd ?? 0)}</td>
                      <td className="px-2 py-1 text-muted">{s(c.meta, 160)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-xl bg-panel p-4">
        <h2 className="mb-1 text-[12px] uppercase tracking-wide text-muted">Timeline · {events.length} events</h2>
        <p className="mb-2 text-[12px] text-muted">
          {[...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${k} ${n}`)
            .join(" · ")}
        </p>
        {events.length === 0 ? (
          <p className="text-[14px] text-muted">Nothing logged.</p>
        ) : (
          <ol>
            {events.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ol>
        )}
      </section>
    </Frame>
  );
}
