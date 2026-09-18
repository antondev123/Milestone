// Speech tools. The ElevenLabs agent (via client tools in VoiceAgent.tsx) and the text UI both POST here.
// The server owns the learner's position; every reply is `{ kind, say, loc, more, ... }` (ToolReply).
// The voice client forwards only `{ t: say }` to the agent LLM.
// Tool names + schemas: docs/ELEVENLABS.md. The four legacy tools remain as adapters for one release.
import { NextResponse } from "next/server";
import {
  actionAnswer,
  actionAsk,
  actionCheck,
  actionMark,
  actionCompleteSegment,
  actionEndTripSpoken,
  actionExplain,
  actionGetSegment,
  actionGoto,
  actionGrade,
  actionInterrupted,
  actionNext,
  actionWhereAmI,
} from "@/lib/actions";
import type { Mode } from "@/types/lesson";

type Params = { params: Promise<{ tool: string }> };

function authorized(req: Request): boolean {
  const secret = process.env.TOOL_WEBHOOK_SECRET;
  if (!secret || secret === "change-me") return true; // dev: open
  return req.headers.get("x-tool-secret") === secret;
}

/** Legacy: flatten a segment into what the old agent prompt expected. */
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
    questions: s.checkpoint.map((q) => ({ questionId: q.id, prompt: q.prompt, type: q.type, options: q.options ?? [] })),
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export async function POST(req: Request, { params }: Params) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tool } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode: Mode = body.mode === "text" || body.mode === "study" ? body.mode : "voice";
  const t0 = Date.now();
  try {
    let out: unknown;
    switch (tool) {
      // ----- cursor tools -----
      case "next":
        out = actionNext({ peek: body.peek === true });
        break;
      case "explain":
        out = actionExplain(str(body.how ?? body.aspect));
        break;
      case "answer":
        out = await actionAnswer(str(body.text ?? body.a ?? body.answer), mode);
        break;
      case "ask":
        out = await actionAsk(str(body.question ?? body.q), { context: body.context ? str(body.context) : undefined, detour: mode !== "study" });
        break;
      case "goto":
        out = actionGoto(str(body.target ?? body.where));
        break;
      // ----- study mode -----
      case "mark":
        out = actionMark(str(body.segmentId), Number(body.blockIdx ?? 0));
        break;
      case "check":
        out = actionCheck(str(body.segmentId));
        break;
      case "where_am_i":
        out = actionWhereAmI();
        break;
      case "interrupted":
        out = actionInterrupted();
        break;
      case "end_trip":
      case "stop": {
        const r = actionEndTripSpoken();
        const { summary, ...reply } = r;
        out = { ...reply, ...summary, spoken: reply.say };
        break;
      }
      // ----- legacy tools -----
      case "get_segment":
        out = segmentForAgent(body.segmentId as string | undefined);
        break;
      case "grade_answer":
        out = await actionGrade(String(body.questionId), str(body.answer), mode);
        break;
      case "complete_segment":
        out = actionCompleteSegment(String(body.segmentId));
        break;
      default:
        return NextResponse.json({ error: `unknown tool ${tool}` }, { status: 404 });
    }
    const ms = Date.now() - t0;
    if (ms > 50 || tool === "ask" || tool === "answer") console.log(`[tool] ${tool} ${ms}ms`);
    return NextResponse.json(out);
  } catch (e) {
    console.error(`[tool] ${tool} error: ${(e as Error).message}`);
    return NextResponse.json({ error: (e as Error).message, kind: "say", say: "Something went wrong there. Say go to carry on.", loc: "", more: false }, { status: 400 });
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { tool } = await params;
  return NextResponse.json({ ok: true, tool, hint: "POST JSON here" });
}
