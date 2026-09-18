// Screen 3, Listen mode. Same place as Read mode, to the character.
import { redirect } from "next/navigation";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { courseFinished, currentLeg, sourceLine } from "@/lib/view";
import { ListenLeg } from "./ListenLeg";

export const dynamic = "force-dynamic";

export default function ListenPage() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  if (courseFinished(course, progress)) redirect("/progress");
  const leg = currentLeg(course, progress);
  const r = progress.resume;
  return (
    <ListenLeg
      segmentId={leg.segment.id}
      script={leg.segment.script}
      durationSec={leg.segment.durationSec}
      legNumber={leg.number}
      legTotal={leg.total}
      offset={r.position === "start" ? (r.offset ?? 0) : 0}
      atCheck={r.position === "checkpoint"}
      lastMode={r.mode ?? null}
      source={sourceLine(course, leg)}
      questions={leg.segment.checkpoint.map((x) => ({
        id: x.id,
        prompt: x.prompt,
        type: x.type,
        options: x.options ?? [],
        answer: x.type === "mcq" ? x.answer : null,
        why: x.type === "mcq" ? x.rubric : null,
      }))}
    />
  );
}
