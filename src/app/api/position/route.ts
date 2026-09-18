import { NextResponse } from "next/server";
import { actionSavePosition } from "@/lib/actions";

/** POST /api/position { segmentId, position, offset, mode }  saves the exact place and logs trip time */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    segmentId?: string;
    position?: string;
    offset?: number;
    mode?: string;
  };
  if (!body.segmentId) return NextResponse.json({ error: "segmentId required" }, { status: 400 });
  try {
    return NextResponse.json(
      actionSavePosition(
        body.segmentId,
        body.position === "checkpoint" ? "checkpoint" : "start",
        Number(body.offset ?? 0) || 0,
        body.mode === "voice" ? "voice" : "text",
      ),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
