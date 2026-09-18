// Listen: server shell that hands the client leg labels (Topic, Section, ring) and whether the
// learner arrives from reading.
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { hereId, lastMode, legIndex } from "@/lib/view";
import VoiceMode from "./VoiceMode";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ carry?: string }> }) {
  const { carry } = await searchParams;
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  return <VoiceMode legs={legIndex(course)} carriedFromReading={lastMode(progress) === "text"} startId={hereId(progress)} carrying={carry === "1"} />;
}
