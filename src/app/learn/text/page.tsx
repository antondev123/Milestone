// Read quietly: server shell that hands the client leg labels and the source name, so the
// top bar and feedback box need no extra requests.
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { lastMode, legIndex, sourceTitle } from "@/lib/view";
import TextModePage from "./TextMode";

export const dynamic = "force-dynamic";

export default function Page() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  return <TextModePage legs={legIndex(course)} source={sourceTitle(course)} carriedFromVoice={lastMode(actionProgress()) === "voice"} />;
}
