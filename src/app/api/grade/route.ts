import { NextResponse } from "next/server";
import { actionGrade } from "@/lib/actions";
import type { GradeRequest } from "@/types/lesson";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<GradeRequest>;
  if (!body.questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });
  try {
    const result = await actionGrade(body.questionId, String(body.answer ?? ""), body.mode === "voice" ? "voice" : "text");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
