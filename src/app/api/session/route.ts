import { NextResponse } from "next/server";
import { actionCarryTrip, actionStartSession } from "@/lib/actions";
import type { Mode } from "@/types/lesson";

export async function POST(req: Request) {
  const body = (await req.json()) as { mode?: Mode; carry?: boolean };
  const mode: Mode = body.mode === "voice" || body.mode === "study" ? body.mode : "text";
  // mode switch mid-trip: continue the running trip; 404 → no trip running, the client starts one
  if (body.carry) {
    const plan = actionCarryTrip(mode);
    return plan ? NextResponse.json(plan) : NextResponse.json({ error: "no active trip" }, { status: 404 });
  }
  // trips are open-ended: no minutes, they run until the learner ends them
  return NextResponse.json(actionStartSession(mode));
}
