// Screen 2, Read mode. Server loads the place; the client pages through the leg.
import { redirect } from "next/navigation";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { courseFinished, currentLeg } from "@/lib/view";
import { ReadLeg } from "./ReadLeg";

export const dynamic = "force-dynamic";

export default function ReadPage() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  if (courseFinished(course, progress)) redirect("/progress");
  const leg = currentLeg(course, progress);
  const r = progress.resume;
  return (
    <ReadLeg
      segmentId={leg.segment.id}
      title={leg.segment.title}
      script={leg.segment.script}
      legNumber={leg.number}
      legTotal={leg.total}
      offset={r.position === "start" ? (r.offset ?? 0) : 0}
      atCheck={r.position === "checkpoint"}
      lastMode={r.mode ?? null}
    />
  );
}
