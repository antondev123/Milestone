// Shared bits for the diagnostics pages. URL-only screens: nothing in the app links here
// (README lists the addresses). Wide layout, Carry tokens, no client JS.
import { headers } from "next/headers";
import { adminAllowedFrom } from "@/lib/log/auth";


/** True when this request may read the log; the key is threaded through links so it survives navigation. */
export async function gate(searchParams: Promise<{ key?: string }>): Promise<{ ok: boolean; q: string }> {
  const { key } = await searchParams;
  const ok = adminAllowedFrom(await headers(), key);
  return { ok, q: key ? `?key=${encodeURIComponent(key)}` : "" };
}

export function Denied() {
  return (
    <Frame title="Session log">
      <p className="text-muted">
        Off localhost this needs <code>?key=&lt;ADMIN_SECRET&gt;</code> on the URL (set <code>ADMIN_SECRET</code> in the environment). Add the key once to any <code>/api/log/…</code> URL and a cookie carries it from then on.
      </p>
    </Frame>
  );
}

export function Frame({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground text-ink">
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
          {sub && <div className="text-[14px] text-muted">{sub}</div>}
        </header>
        {children}
      </main>
    </div>
  );
}

export const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { hour12: false }) : "—");
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour12: false }) + "." + String(new Date(iso).getMilliseconds()).padStart(3, "0");
export const fmtUsd = (n: number) => (n ? `$${n.toFixed(4)}` : "—");
export const fmtDur = (a: string, b: string | null) => {
  if (!b) return "open";
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};
