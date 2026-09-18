import { NextResponse } from "next/server";
import { adminGate, withAdminCookie } from "@/lib/log/auth";
import { getSession } from "@/lib/log/query";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { deny, setCookie } = adminGate(req);
  if (deny) return deny;
  const { id } = await params;
  const s = getSession(id);
  if (!s) return NextResponse.json({ error: `no session ${id}` }, { status: 404 });
  return withAdminCookie(NextResponse.json(s), setCookie);
}
