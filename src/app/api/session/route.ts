import { NextResponse } from "next/server";
import { actionStartSession } from "@/lib/actions";
import type { Mode } from "@/types/lesson";

export async function POST(req: Request) {
  const body = (await req.json()) as { minutes?: number; mode?: Mode };
  const minutes = Math.max(1, Math.min(120, Number(body.minutes ?? 10)));
  const mode: Mode = body.mode === "voice" ? "voice" : "text";
  return NextResponse.json(actionStartSession(minutes, mode));
}
