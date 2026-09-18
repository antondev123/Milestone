// Screen 5, Progress (docs/DESIGN.md §4.5). Every figure is summed from ended trips.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { courseFinished, currentChapter, routeState, tripRows } from "@/lib/view";
import { BackLink, Screen, TopBar } from "@/components/carry/Chrome";
import { RouteLine } from "@/components/carry/RouteLine";

export const dynamic = "force-dynamic";

export default function ProgressPage() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  const rows = tripRows(course, progress);
  const minutes = rows.reduce((a, r) => a + r.minutes, 0);
  const chapter = currentChapter(course, progress);
  const route = routeState(chapter, progress, (n) => `Next: leg ${n}`);
  const done = route.done.filter(Boolean).length;
  const complete = courseFinished(course, progress);

  return (
    <Screen gap="gap-[26px]">
      <TopBar left={<BackLink href="/" />} title="Your progress" />

      {complete && (
        <div className="flex items-center gap-2.5 rounded-xl bg-panel px-4 py-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
          <span className="text-[17px] font-semibold">Course finished. Every leg is done.</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="text-[17px] text-muted">Learned in transit</div>
        <div className="font-display text-[60px] leading-none font-semibold tracking-[-0.02em]">{minutes} min</div>
        <div className="text-[17px] text-muted">
          {rows.length === 0 ? "Your first finished trip will show up here." : `over ${rows.length} trip${rows.length === 1 ? "" : "s"}, without setting aside any extra time`}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="font-display text-xl font-semibold">
            Chapter {chapter.number}: {chapter.shortTitle}
          </div>
          <div className="shrink-0 text-[15px] text-muted">
            {done} of {route.total} legs done
          </div>
        </div>
        <RouteLine route={route} currentWord="next" />
        <Link href="/course" className="flex min-h-11 items-center self-start text-[15px] font-semibold underline underline-offset-4">
          All chapters
        </Link>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-col">
          <h2 className="pb-2 text-[17px] font-semibold">Your trips</h2>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center justify-between gap-4 border-t border-rule py-2 last:border-b">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold">{r.when}</span>
                  <span className="text-sm text-muted">{r.what}</span>
                </div>
                <span className="shrink-0 text-base font-semibold">{r.minutes} min</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto">
        <Link href="/" className="flex min-h-[60px] items-center justify-center rounded-2xl bg-ink px-5 text-lg font-bold text-ground">
          Back to the course
        </Link>
      </div>
    </Screen>
  );
}
