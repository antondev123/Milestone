// Stream a stored recording: /api/log/audio/<session>/mic or /api/log/audio/<session>/eleven_call
import { readFileSync, existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { adminGate, withAdminCookie } from "@/lib/log/auth";
import { getAudio } from "@/lib/log/query";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { deny, setCookie } = adminGate(req);
  if (deny) return deny;
  const { id, kind } = await params;
  const a = getAudio(id, kind);
  if (!a || !existsSync(a.path)) return NextResponse.json({ error: "no such recording" }, { status: 404 });
  const body = readFileSync(a.path);
  const res = new NextResponse(new Uint8Array(body), {
    headers: { "content-type": a.mime, "content-length": String(body.length), "cache-control": "private, no-store", "content-disposition": `inline; filename="${id}-${kind}.${a.mime.includes("mpeg") ? "mp3" : "webm"}"` },
  });
  return withAdminCookie(res, setCookie);
}
