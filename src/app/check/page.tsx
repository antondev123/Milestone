// Screen 4, Check. End-of-leg questions with grounded feedback.
import { redirect } from "next/navigation";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { courseFinished, currentLeg, sourceLine } from "@/lib/view";
import { CheckLeg } from "./CheckLeg";

export const dynamic = "force-dynamic";

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ from?: string; q?: string }> }) {
  const { from, q } = await searchParams;
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  if (courseFinished(course, progress)) redirect("/progress");
  const leg = currentLeg(course, progress);
  const questions = leg.segment.checkpoint.map((x) => ({
    id: x.id,
    prompt: x.prompt,
    type: x.type,
    options: x.options ?? [],
    // MCQ only: lets the screen mark the right option and explain it without another round trip
    answer: x.type === "mcq" ? x.answer : null,
    why: x.type === "mcq" ? x.rubric : null,
  }));
  const start = Math.min(questions.length - 1, Math.max(0, Number(q ?? 0) || 0));
  return (
    <CheckLeg
      segmentId={leg.segment.id}
      legNumber={leg.number}
      questions={questions}
      start={start}
      source={sourceLine(course, leg)}
      from={from === "listen" ? "listen" : "read"}
    />
  );
}
