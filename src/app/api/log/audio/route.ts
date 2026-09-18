// Mic chunks from the browser's MediaRecorder, appended in order to audio/<session>/mic.webm.
// Chunks of one recording concatenate into a valid WebM; seq is only checked for monotonicity.
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { writerAllowed } from "@/lib/log/auth";
import { audioDir } from "@/lib/log/db";
import { upsertAudio } from "@/lib/log/log";

const lastSeq = new Map<string, number>();

export async function POST(req: Request) {
  if (!writerAllowed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session") ?? "";
  const seq = Number(url.searchParams.get("seq") ?? 0);
  if (!/^[a-z0-9_-]+$/i.test(sessionId)) return NextResponse.json({ error: "bad session" }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ ok: true, skipped: true });
  const prev = lastSeq.get(sessionId) ?? -1;
  if (seq <= prev) return NextResponse.json({ ok: true, skipped: true, reason: "out of order" });
  lastSeq.set(sessionId, seq);
  try {
    const dir = audioDir(sessionId);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, "mic.webm");
    appendFileSync(p, buf);
    const bytes = statSync(p).size;
    const dur = Number(req.headers.get("x-duration-ms") ?? 0) || undefined;
    upsertAudio(sessionId, "mic", p, req.headers.get("content-type")?.split(";")[0] || "audio/webm", bytes, dur);
    return NextResponse.json({ ok: true, bytes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
