// /admin/sessions — every trip the app has logged, newest first. See README "Diagnostics".
import Link from "next/link";
import { listSessions } from "@/lib/log/query";
import { isInMemory, logDir } from "@/lib/log/db";
import { Denied, Frame, fmtDur, fmtTime, fmtUsd, gate } from "./shared";

export const dynamic = "force-dynamic";

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { ok, q } = await gate(searchParams);
  if (!ok) return <Denied />;
  const rows = listSessions(200);
  return (
    <Frame
      title="Sessions"
      sub={
        <>
          {rows.length} logged · store {isInMemory() ? "in memory (LOG_DIR not writable)" : logDir()} · <Link className="underline" href={`/api/log/sessions${q}`}>JSON</Link>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-muted">Nothing yet. Start a trip in Listen, Read or Study and come back.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-panel">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12px] uppercase tracking-wide text-muted">
              <tr>
                {["Trip", "Mode", "Started", "Length", "Plan", "Score", "Events", "Tools", "Errors", "Claude $", "11L credits", "Audio", "11L sync"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-rule/60 align-top">
                  <td className="px-3 py-2 font-mono">
                    <Link className="underline" href={`/admin/sessions/${r.id}${q}`}>
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.mode}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtTime(r.startedAt)}</td>
                  <td className="px-3 py-2">{fmtDur(r.startedAt, r.endedAt)}</td>
                  <td className="px-3 py-2">{r.minutesPlanned ?? "—"} min</td>
                  <td className="px-3 py-2">{r.total != null ? `${r.correct}/${r.total}` : "—"}</td>
                  <td className="px-3 py-2">{r.events}</td>
                  <td className="px-3 py-2">{r.toolCalls}</td>
                  <td className={`px-3 py-2 ${r.errors ? "font-semibold text-gold" : ""}`}>{r.errors}</td>
                  <td className="px-3 py-2">{fmtUsd(r.usd)}</td>
                  <td className="px-3 py-2">{r.credits ? Math.round(r.credits) : "—"}</td>
                  <td className="px-3 py-2">{r.audio.length ? r.audio.join(", ") : "—"}</td>
                  <td className="px-3 py-2">{r.convId ? (r.synced ? "done" : "pending") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Frame>
  );
}
