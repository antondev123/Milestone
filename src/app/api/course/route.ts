import { NextResponse } from "next/server";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";

/** GET /api/course → the manifest without per-section objectives/key terms (~40 KB). Segment prose is never here. */
export async function GET() {
  const c = loadCourse(DEFAULT_COURSE_ID);
  return NextResponse.json({
    id: c.id,
    title: c.title,
    description: c.description,
    estimatedMinutes: c.estimatedMinutes,
    license: c.license,
    chapters: c.chapters.map((ch) => ({
      id: ch.id,
      number: ch.number,
      title: ch.title,
      shortTitle: ch.shortTitle,
      quizFile: ch.quizFile,
      sections: ch.sections.map((s) => ({
        id: s.id,
        number: s.number,
        title: s.title,
        kind: s.kind,
        words: s.words,
        status: s.status,
        segments: s.segments,
      })),
    })),
  });
}
