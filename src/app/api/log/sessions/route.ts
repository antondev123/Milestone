import { NextResponse } from "next/server";
import { adminGate, withAdminCookie } from "@/lib/log/auth";
import { listSessions } from "@/lib/log/query";

export async function GET(req: Request) {
  const { deny, setCookie } = adminGate(req);
  if (deny) return deny;
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
  return withAdminCookie(NextResponse.json(listSessions(Math.max(1, Math.min(1000, limit)))), setCookie);
}
