// Pull the ElevenLabs transcript + recording for a session now: /api/log/sync?session=<tripId>
import { NextResponse } from "next/server";
import { adminGate, withAdminCookie } from "@/lib/log/auth";
import { syncConversation } from "@/lib/log/eleven";

async function handle(req: Request) {
  const { deny, setCookie } = adminGate(req);
  if (deny) return deny;
  const id = new URL(req.url).searchParams.get("session") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "session required" }, { status: 400 });
  const r = await syncConversation(id);
  return withAdminCookie(NextResponse.json(r, { status: r.ok ? 200 : 409 }), setCookie);
}

export const GET = handle;
export const POST = handle;
