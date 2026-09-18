// Study mode: server shell. The client boots through the API (session, goto, progress, segment)
// so there is one code path with and without ?goto= from the course map.
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { lastMode, legIndex, sourceTitle } from "@/lib/view";
import StudyPage from "./StudyPage";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ goto?: string }> }) {
  const { goto } = await searchParams;
  const course = loadCourse(DEFAULT_COURSE_ID);
  const from = lastMode(actionProgress());
  return (
    <StudyPage
      legs={legIndex(course)}
      source={sourceTitle(course)}
      courseTitle={course.title}
      gotoTarget={goto ?? null}
      carriedFrom={from === "voice" || from === "text" ? from : null}
    />
  );
}
