// ElevenLabs server-tool webhooks. The agent POSTs JSON here when it calls a tool.
// Same engine actions as the direct routes. Protected by a shared-secret header.
// Tool names + schemas: docs/ELEVENLABS.md
import { NextResponse } from "next/server";
import { actionCompleteSegment, actionEndTrip, actionGetSegment, actionGrade } from "@/lib/actions";

type Params = { params: Promise<{ tool: string }> };

function authorized(req: Request): boolean {
  const secret = process.env.TOOL_WEBHOOK_SECRET;
  if (!secret || secret === "change-me") return true; // dev: open
  return req.headers.get("x-tool-secret") === secret;
}

/** Flatten a segment into what a voice agent needs to read + ask. */
function segmentForAgent(segmentId?: string) {
  const r = actionGetSegment(segmentId);
  const s = r.segment;
  return {
    segmentId: s.id,
    title: s.title,
    position: r.position,
    indexInTrip: r.indexInTrip + 1,
    tripLength: r.tripLength,
    nextSegmentId: r.nextSegmentId,
    script: s.script,
    keyPoints: s.keyPoints,
    altExplanation: s.altExplanation,
    deeper: s.deeper,
    questions: s.checkpoint.map((q) => ({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      options: q.options ?? [],
    })),
  };
}

export async function POST(req: Request, { params }: Params) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tool } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (tool) {
      case "get_segment":
        return NextResponse.json(segmentForAgent(body.segmentId as string | undefined));
      case "grade_answer": {
        const r = await actionGrade(String(body.questionId), String(body.answer ?? ""), "voice");
        return NextResponse.json(r);
      }
      case "complete_segment":
        return NextResponse.json(actionCompleteSegment(String(body.segmentId)));
      case "end_trip": {
        const s = actionEndTrip();
        return NextResponse.json({
          ...s,
          spoken: `Trip done. ${s.segmentIds.length} segment${s.segmentIds.length === 1 ? "" : "s"}, ${s.correct} of ${s.total} correct. You are ${s.modulePct} percent through the chapter.`,
        });
      }
      default:
        return NextResponse.json({ error: `unknown tool ${tool}` }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { tool } = await params;
  return NextResponse.json({ ok: true, tool, hint: "POST JSON here" });
}
