// Listen: server shell that hands the client leg labels, the source name and whether the
// learner arrives from reading.
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { hereId, lastMode, legIndex, sourceTitle } from "@/lib/view";
import VoiceMode from "./VoiceMode";

export const dynamic = "force-dynamic";

export default function Page() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  return <VoiceMode legs={legIndex(course)} source={sourceTitle(course)} carriedFromReading={lastMode(progress) === "text"} startId={hereId(progress)} />;
}
