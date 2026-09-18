// Stream a stored recording: /api/log/audio/<session>/mic, /eleven_call, or /dictation-<n>.<ext>
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { adminGate, withAdminCookie } from "@/lib/log/auth";
import { audioDir } from "@/lib/log/db";
import { getAudio } from "@/lib/log/query";

const MIME: Record<string, string> = { webm: "audio/webm", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { deny, setCookie } = adminGate(req);
  if (deny) return deny;
  const { id, kind } = await params;
  let path: string | null = null;
  let mime = "application/octet-stream";
  const clip = /^dictation-\d+\.(webm|m4a|ogg|wav)$/.exec(kind);
  if (clip) {
    path = join(audioDir(id), kind);
    mime = MIME[clip[1]];
  } else {
    const a = getAudio(id, kind);
    if (a) {
      path = a.path;
      mime = a.mime;
    }
  }
  if (!path || !existsSync(/*turbopackIgnore: true*/ path)) return NextResponse.json({ error: "no such recording" }, { status: 404 });
  const body = readFileSync(/*turbopackIgnore: true*/ path);
  const res = new NextResponse(new Uint8Array(body), {
    headers: { "content-type": mime, "content-length": String(body.length), "cache-control": "private, no-store", "content-disposition": `inline; filename="${id}-${kind}${clip ? "" : mime.includes("mpeg") ? ".mp3" : ".webm"}"` },
  });
  return withAdminCookie(res, setCookie);
}
