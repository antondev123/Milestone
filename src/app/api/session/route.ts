import { NextResponse } from "next/server";
import { actionCarryTrip, actionStartSession } from "@/lib/actions";
import type { Mode } from "@/types/lesson";

export async function POST(req: Request) {
  const body = (await req.json()) as { minutes?: number; mode?: Mode; carry?: boolean };
  const mode: Mode = body.mode === "voice" || body.mode === "study" ? body.mode : "text";
  // mode switch mid-trip: continue the running trip; 404 → no trip running, the client asks for minutes
  if (body.carry) {
    const plan = actionCarryTrip(mode);
    return plan ? NextResponse.json(plan) : NextResponse.json({ error: "no active trip" }, { status: 404 });
  }
  const minutes = Math.max(1, Math.min(120, Number(body.minutes ?? 10)));
  return NextResponse.json(actionStartSession(minutes, mode));
}
