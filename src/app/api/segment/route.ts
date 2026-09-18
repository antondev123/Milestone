import { NextResponse } from "next/server";
import { actionCompleteSegment, actionGetSegment } from "@/lib/actions";

/** GET /api/segment?id=<segmentId>  (omit id for the resume pointer) */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? undefined;
  try {
    return NextResponse.json(actionGetSegment(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

/** POST /api/segment { segmentId }  marks it complete, advances resume pointer */
export async function POST(req: Request) {
  const body = (await req.json()) as { segmentId?: string };
  if (!body.segmentId) return NextResponse.json({ error: "segmentId required" }, { status: 400 });
  try {
    return NextResponse.json(actionCompleteSegment(body.segmentId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
