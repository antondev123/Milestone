// Link the ElevenLabs conversation id to the running trip, so the post-call pull knows what to fetch.
import { NextResponse } from "next/server";
import { writerAllowed } from "@/lib/log/auth";
import { attachConversation } from "@/lib/log/log";

export async function POST(req: Request) {
  if (!writerAllowed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; convId?: string };
  if (typeof body.sessionId !== "string" || typeof body.convId !== "string") return NextResponse.json({ ok: false, error: "sessionId and convId required" }, { status: 400 });
  attachConversation(body.sessionId, body.convId);
  return NextResponse.json({ ok: true });
}
