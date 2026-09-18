// Screen 5, Progress (docs/DESIGN.md §4.5). Every figure is summed from ended trips.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { courseFinished, currentChapter, milestoneRows, routeState, tripRows } from "@/lib/view";
import { BackLink, Screen, TopBar } from "@/components/carry/Chrome";
import { RouteLine } from "@/components/carry/RouteLine";
import { Group } from "@/components/carry/Group";

export const dynamic = "force-dynamic";

export default function ProgressPage() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  const rows = tripRows(course, progress);
  const milestones = milestoneRows(progress);
  const minutes = rows.reduce((a, r) => a + r.minutes, 0);
  const chapter = currentChapter(course, progress);
  const route = routeState(chapter, progress, (n) => `Next: leg ${n}`);
  const done = route.done.filter(Boolean).length;
  const complete = courseFinished(course, progress);
  // position on the map: chapters finished and legs done, from segmentsCompleted (not from trips)
  const doneSet = new Set(progress.segmentsCompleted);
  const chaptersDone = course.chapters.filter((c) => c.segments.length > 0 && c.segments.every((s) => doneSet.has(s.id))).length;
  const legsDone = progress.segmentsCompleted.length;
  const position =
    legsDone === 0
      ? null
      : `${chaptersDone > 0 ? `${chaptersDone} chapter${chaptersDone === 1 ? "" : "s"} finished, ` : ""}${legsDone} leg${legsDone === 1 ? "" : "s"} done on the map`;

  return (
    <Screen gap="gap-[26px]">
      <TopBar
        left={<BackLink href="/" />}
        title="Your progress"
        right={
          <Link href="/settings" className="flex min-h-11 items-center px-1 text-[15px] font-semibold underline underline-offset-4">
            Settings
          </Link>
        }
      />

      {complete && (
        <div className="flex items-center gap-2.5 rounded-xl bg-panel px-4 py-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
          <span className="text-[17px] font-semibold">Course finished. Every leg is done.</span>
        </div>
      )}

      <Group label="Learned in transit" gap="gap-2">
        <div className="font-display text-[60px] leading-none font-semibold tracking-[-0.02em]">{minutes} min</div>
        <div className="text-[17px] text-muted">
          {rows.length === 0 ? "Your first finished trip will show up here." : `over ${rows.length} trip${rows.length === 1 ? "" : "s"}, without setting aside any extra time`}
        </div>
        {position && <div className="text-[17px] font-semibold">{position}</div>}
      </Group>

      <Group label={`Chapter ${chapter.number}: ${chapter.shortTitle}`} aside={`${done} of ${route.total} legs done`}>
        <RouteLine route={route} currentWord="next" />
        <Link href="/course" className="flex min-h-11 items-center self-start text-[15px] font-semibold underline underline-offset-4">
          All chapters
        </Link>
      </Group>

      {milestones.length > 0 && (
        <Group label={<h2>Milestones</h2>} gap="gap-1">
          <ul>
            {milestones.map((m) => (
              <li key={m.id} className="flex min-h-14 items-center gap-3 border-b border-rule py-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
                <span className="flex-1 text-base font-semibold">{m.label}</span>
                <span className="shrink-0 text-sm text-muted">{m.when}</span>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {rows.length > 0 && (
        <Group label={<h2>Your trips</h2>} gap="gap-1">
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center justify-between gap-4 border-b border-rule py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold">{r.when}</span>
                  <span className="text-sm text-muted">{r.what}</span>
                </div>
                <span className="shrink-0 text-base font-semibold">{r.minutes} min</span>
              </li>
            ))}
          </ul>
        </Group>
      )}

      <div className="mt-auto">
        <Link href="/" className="flex min-h-[60px] items-center justify-center rounded-2xl bg-ink px-5 text-lg font-bold text-ground">
          Back to the course
        </Link>
      </div>
    </Screen>
  );
}
