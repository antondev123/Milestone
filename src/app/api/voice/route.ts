import { NextResponse } from "next/server";
import { actionSetVoice, actionVoices } from "@/lib/actions";

/** GET /api/voice → { voices, current } */
export async function GET() {
  return NextResponse.json(actionVoices());
}

/** POST /api/voice { voiceId } → { voices, current } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { voiceId?: unknown };
  try {
    return NextResponse.json(actionSetVoice(body.voiceId));
  } catch (e) {
    return NextResponse.json({ reason: (e as Error).message }, { status: 400 });
  }
}
