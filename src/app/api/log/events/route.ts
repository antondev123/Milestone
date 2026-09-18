// Client-side timeline events (transcript lines, interruptions, mode changes, errors), batched.
import { NextResponse } from "next/server";
import { writerAllowed } from "@/lib/log/auth";
import { logEvents } from "@/lib/log/log";

type Body = { sessionId?: string; events?: { ts?: string; kind?: string; data?: unknown }[] };

export async function POST(req: Request) {
  if (!writerAllowed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Body;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const events = Array.isArray(body.events) ? body.events.filter((e) => e && typeof e.kind === "string") : [];
  if (!sessionId || events.length === 0) return NextResponse.json({ ok: false, error: "sessionId and events required" }, { status: 400 });
  logEvents(
    sessionId,
    "client",
    events.slice(0, 500).map((e) => ({ ts: typeof e.ts === "string" ? e.ts : undefined, kind: e.kind as string, data: e.data })),
  );
  return NextResponse.json({ ok: true, n: events.length });
}
